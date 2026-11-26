// Reads a saved weekly schedule for DISPLAY only (nothing is written back to Supabase).
// Older schools saved the schedule as JSON text: [{ lesson, day, time, ages, cost, availability }, ...]
// Returns null when the value is not that kind of JSON, so plain-text schedules still show as before.
export type ScheduleDisplayRow = {
  lesson: string;
  day: string;
  time: string;
  ages: string;
  cost: string;
  availability: string;
  duration: string;
};

const asText = (v: unknown) => (v == null ? '' : String(v).trim());

export function parseScheduleRows(value: unknown): ScheduleDisplayRow[] | null {
  let data: unknown = value;
  // the value may be JSON text, or JSON text wrapped in JSON text
  for (let i = 0; i < 2 && typeof data === 'string'; i++) {
    const text = data.trim();
    if (!text.startsWith('[') && !text.startsWith('{') && !text.startsWith('"')) return null;
    try {
      data = JSON.parse(text);
    } catch {
      return null;
    }
  }
  if (data && typeof data === 'object' && 'rows' in data) data = data.rows;
  if (!Array.isArray(data)) return null;

  const rows = data
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r))
    .map((r) => ({
      lesson: asText(r.lesson),
      day: asText(r.day),
      time: asText(r.time),
      ages: asText(r.ages),
      cost: asText(r.cost),
      availability: asText(r.availability),
      duration: asText(r.duration),
    }))
    .filter((r) => Object.values(r).some(Boolean));

  return rows.length > 0 ? rows : null;
}

// ---- Reading a saved schedule for the Edit Studio table (display/editing only) ----

const DAY_NAMES: Record<string, string> = {
  'any-day': 'any-day', 'any day': 'any-day', 'οποιαδήποτε ημέρα': 'any-day',
  monday: 'monday', 'δευτέρα': 'monday',
  tuesday: 'tuesday', 'τρίτη': 'tuesday',
  wednesday: 'wednesday', 'τετάρτη': 'wednesday',
  thursday: 'thursday', 'πέμπτη': 'thursday',
  friday: 'friday', 'παρασκευή': 'friday',
  saturday: 'saturday', 'σάββατο': 'saturday',
  sunday: 'sunday', 'κυριακή': 'sunday',
};

const LABEL_NAMES: Record<string, 'ages' | 'cost' | 'availability'> = {
  'eligible ages': 'ages', ages: 'ages', 'ηλικίες συμμετοχής': 'ages', 'ηλικίες': 'ages', 'ηλικία': 'ages',
  cost: 'cost', 'κόστος': 'cost',
  availability: 'availability', 'διαθεσιμότητα': 'availability',
};

/** Reads the one-class-per-line text the forms produce, e.g.
 *  "Karate — Monday 18:00 — Ages: 6–12 — Cost: €20/class — Availability: 5 places".
 *  Returns null unless EVERY line can be read, so nothing is ever guessed or dropped. */
export function parseFormattedSchedule(text: string): ScheduleDisplayRow[] | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const rows: ScheduleDisplayRow[] = [];
  for (const line of lines) {
    const parts = line.split(' — ').map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    const row: ScheduleDisplayRow = { lesson: parts[0], day: '', time: '', ages: '', cost: '', availability: '', duration: '' };
    let dayTimeSeen = false;
    for (const part of parts.slice(1)) {
      const labelled = part.match(/^([^:]+):\s*(.*)$/);
      const labelKey = labelled ? LABEL_NAMES[labelled[1].trim().toLowerCase()] : undefined;
      if (labelled && labelKey) {
        row[labelKey] = labelled[2].trim();
        continue;
      }
      const dt = part.match(/^(.*?)\s*(\d{1,2}:\d{2}(?:\s*[-–—]\s*\d{1,2}:\d{2})?)?$/);
      const dayRaw = (dt?.[1] ?? '').trim().toLowerCase();
      const time = dt?.[2] ?? '';
      if ((!dayRaw && !time) || (dayRaw && !DAY_NAMES[dayRaw]) || dayTimeSeen) return null;
      dayTimeSeen = true;
      row.day = dayRaw ? DAY_NAMES[dayRaw] : '';
      row.time = time;
    }
    rows.push(row);
  }
  return rows;
}

/** What the Edit Studio table starts with. Looks in schedule_rows, then in JSON saved in
 *  weekly_schedule, then in the readable one-class-per-line text. `text` is whatever could
 *  not be turned into rows, so it can be kept instead of being lost. */
export function scheduleRowsForEditing(src: {
  schedule_rows?: unknown;
  weekly_schedule?: string | null;
}): { rows: ScheduleDisplayRow[]; text: string } {
  const hasLesson = (rows: ScheduleDisplayRow[] | null): rows is ScheduleDisplayRow[] =>
    !!rows && rows.some((r) => r.lesson);

  const fromRows = parseScheduleRows(src.schedule_rows);
  if (hasLesson(fromRows)) return { rows: fromRows, text: '' };
  const fromJson = parseScheduleRows(src.weekly_schedule);
  if (hasLesson(fromJson)) {
    let text = '';
    const weekly = src.weekly_schedule?.trim();
    if (weekly?.startsWith('{')) {
      const combined = JSON.parse(weekly);
      if (typeof combined.notes === 'string') text = combined.notes.trim();
    }
    return { rows: fromJson, text };
  }
  const text = (src.weekly_schedule ?? '').trim();
  const fromText = text ? parseFormattedSchedule(text) : null;
  if (hasLesson(fromText)) return { rows: fromText, text: '' };
  return { rows: [], text };
}

export function localizeScheduleDays(schedule: string, t: (key: string) => string) {
  const abbreviations: Record<string, string> = {
    mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday',
    fri: 'friday', sat: 'saturday', sun: 'sunday',
  };
  return schedule.replace(/\b(?:any-day|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/gi,
    (day) => t(`lf.${abbreviations[day.toLowerCase()] ?? day.toLowerCase()}`));
}
