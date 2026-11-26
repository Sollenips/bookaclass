import { isUnlimitedAvailability, UNLIMITED_CAPACITY } from '@/lib/availability';
// Turns the class table submitted in "List Your School" into real classes
// that can be published when an admin approves the application.
import type { SubmittedScheduleRow } from '@/lib/supabase';
import { parseScheduleRows } from '@/lib/scheduleDisplay';

export type PlannedClass = {
  title: string;
  weekly_schedule: string;
  age_min: number;
  age_max: number | null;
  price_eur: number;
  capacity: number;
  duration_minutes: number;
  /** values exactly as the school typed them, so the admin can compare */
  submitted: { ages: string; cost: string; availability: string };
  /** fields that could not be read from the text, so a default is used */
  guessed: Array<'ages' | 'cost' | 'capacity'>;
};

export const DEFAULT_AGE_MIN = 4;
export const DEFAULT_CAPACITY = 10;
export const DEFAULT_DURATION_MINUTES = 60;

const DAY_ABBR: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};
const DAY_ORDER = Object.keys(DAY_ABBR);

/** Only web links starting with https:// are ever shown or published. */
export function safeHttps(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export function parseAges(text: string): { min: number; max: number | null; ok: boolean } {
  const nums = (text.match(/\d{1,2}/g) ?? []).map(Number);
  if (nums.length === 0) return { min: DEFAULT_AGE_MIN, max: null, ok: false };
  if (nums.length === 1) return { min: nums[0], max: null, ok: true };
  const [a, b] = nums;
  return { min: Math.min(a, b), max: Math.max(a, b), ok: true };
}

export function parsePrice(text: string): { value: number; ok: boolean } {
  if (/free|δωρεάν|δωρεαν/i.test(text)) return { value: 0, ok: true };
  const m = text.match(/\d+(?:[.,]\d{1,2})?/);
  if (!m) return { value: 0, ok: false };
  const value = parseFloat(m[0].replace(',', '.'));
  return Number.isFinite(value) ? { value, ok: true } : { value: 0, ok: false };
}

export function parseCapacity(text: string): { value: number; ok: boolean } {
  if (!text.trim() || isUnlimitedAvailability(text)) return { value: UNLIMITED_CAPACITY, ok: true };
  const m = text.match(/\d+/);
  const value = m ? parseInt(m[0], 10) : NaN;
  if (Number.isFinite(value) && value >= 0 && value < UNLIMITED_CAPACITY) return { value, ok: true };
  // "full" / "sold out" / "πλήρες" / "γεμάτο" means no places left
  if (/full|sold\s*out|πλήρ|γεμάτ|γεματ/i.test(text)) return { value: 0, ok: true };
  return { value: DEFAULT_CAPACITY, ok: false };
}

/** "Mon & Wed 18:00, Sat 11:00" — same style as the existing classes. */
function scheduleText(sessions: Array<{ day: string; time: string }>): string {
  const byTime = new Map<string, string[]>();
  for (const s of sessions) {
    const time = s.time.trim();
    const day = DAY_ABBR[s.day] ?? s.day.trim();
    const days = byTime.get(time) ?? [];
    if (day && !days.includes(day)) days.push(day);
    byTime.set(time, days);
  }
  const abbrOrder = DAY_ORDER.map((d) => DAY_ABBR[d]);
  return [...byTime.entries()]
    .map(([time, days]) => {
      days.sort((a, b) => abbrOrder.indexOf(a) - abbrOrder.indexOf(b));
      return `${days.join(' & ')} ${time}`.trim();
    })
    .join(', ');
}

function rangeDuration(time: string): number | undefined {
  const match = time.match(/^(\d{1,2}):([0-5]\d)\s*[-–—]\s*(\d{1,2}):([0-5]\d)$/);
  if (!match) return;
  const [, startHour, startMinute, endHour, endMinute] = match.map(Number);
  if (startHour > 23 || endHour > 23) return;
  const length = (endHour * 60 + endMinute - startHour * 60 - startMinute + 1440) % 1440;
  return length || undefined;
}

/** One class per lesson. Rows with the same lesson, ages, cost and availability are merged
 *  into a single class that runs on several days. */
export function planClasses(rows: SubmittedScheduleRow[] | null | undefined): PlannedClass[] {
  const groups = new Map<string, { row: SubmittedScheduleRow; sessions: Array<{ day: string; time: string }> }>();
  for (const row of rows ?? []) {
    const lesson = (row.lesson ?? '').trim();
    if (!lesson) continue;
    const key = [lesson.toLowerCase(), (row.ages ?? '').trim(), (row.cost ?? '').trim(), (row.availability ?? '').trim()].join('|');
    const group = groups.get(key) ?? { row, sessions: [] };
    group.sessions.push({ day: row.day ?? '', time: row.time ?? '' });
    groups.set(key, group);
  }

  return [...groups.values()].map(({ row, sessions }) => {
    const ages = parseAges(row.ages ?? '');
    const price = parsePrice(row.cost ?? '');
    const capacity = parseCapacity(row.availability ?? '');
    const guessed: PlannedClass['guessed'] = [];
    if (!ages.ok) guessed.push('ages');
    if (!price.ok) guessed.push('cost');
    if (!capacity.ok) guessed.push('capacity');
    return {
      title: row.lesson.trim(),
      weekly_schedule: scheduleText(sessions),
      age_min: ages.min,
      age_max: ages.max,
      price_eur: price.value,
      capacity: capacity.value,
      duration_minutes: sessions.map(({ time }) => rangeDuration(time)).find((duration) => duration !== undefined) ?? DEFAULT_DURATION_MINUTES,
      submitted: {
        ages: (row.ages ?? '').trim(),
        cost: (row.cost ?? '').trim(),
        availability: (row.availability ?? '').trim(),
      },
      guessed,
    };
  });
}

export function scheduledClassFields(storeId: string, lesson: PlannedClass) {
  return {
    schedule_key: JSON.stringify([storeId, lesson.title.normalize('NFC').toLowerCase(), lesson.submitted]),
    schedule_ages: lesson.submitted.ages,
    schedule_cost: lesson.submitted.cost,
    schedule_availability: lesson.submitted.availability,
  };
}

/** The class table of an application. Newer applications keep it in schedule_rows;
 *  older ones saved the same table as JSON text in weekly_schedule. Nothing is changed or
 *  removed: this only reads whichever one holds the classes. */
export function requestScheduleRows(req: {
  schedule_rows?: unknown;
  weekly_schedule?: string | null;
}): SubmittedScheduleRow[] {
  const fromRows = parseScheduleRows(req.schedule_rows);
  if (fromRows?.some((r) => r.lesson)) return fromRows;
  const fromText = parseScheduleRows(req.weekly_schedule);
  if (fromText?.some((r) => r.lesson)) return fromText;
  return fromRows ?? [];
}
