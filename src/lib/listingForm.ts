// Values and helpers for the public "List Your School" form.
// Mirrors the form on the Coming Soon page (index.html).

// Labels come from the translations (lf.<key>); `value` is what gets stored,
// using the same names the rest of the site already uses.
export const LISTING_CATEGORIES = [
  { value: 'Martial Arts', key: 'martial' },
  { value: 'Languages', key: 'languages' },
  { value: 'Music', key: 'music' },
  { value: 'Dance', key: 'dance' },
  { value: 'Art', key: 'painting' },
  { value: 'Chess', key: 'chess' },
  { value: 'Robotics', key: 'robotics' },
  { value: 'Sports', key: 'sports' },
  { value: 'Theater', key: 'theatre' },
  { value: 'Other', key: 'other' },
] as const;

export const LISTING_AREAS = [
  { value: 'Pagrati', key: 'pagrati' },
  { value: 'Vironas', key: 'vyronas' },
  { value: 'Kaisariani', key: 'kaisariani' },
  { value: 'Ilioupoli', key: 'ilioupoli' },
  { value: 'Agios Dimitrios', key: 'agios' },
  { value: 'Glyfada', key: 'glyfada' },
  { value: 'Nea Smyrni', key: 'smyrni' },
  { value: 'Kallithea', key: 'kallithea' },
  { value: 'Athens Center', key: 'athens' },
  { value: 'Acharnes', key: 'acharnes' },
  { value: 'Kato Patisia', key: 'katoPatisia' },
  { value: 'Zografou', key: 'zografou' },
  { value: 'Ano Patisia', key: 'anoPatisia' },
  { value: 'Kypseli', key: 'kypseli' },
  { value: 'Galatsi', key: 'galatsi' },
  { value: 'Nea Ionia', key: 'neaIonia' },
  { value: 'Nea Filadelfeia', key: 'neaFiladelfeia' },
  { value: 'Peristeri', key: 'peristeri' },
  { value: 'Aigaleo', key: 'aigaleo' },
  { value: 'Petroupoli', key: 'petroupoli' },
  { value: 'Ilion', key: 'ilion' },
  { value: 'Marousi', key: 'marousi' },
  { value: 'Chalandri', key: 'chalandri' },
  { value: 'Kifisia', key: 'kifisia' },
  { value: 'Agia Paraskevi', key: 'agiaParaskevi' },
  { value: 'Cholargos', key: 'cholargos' },
  { value: 'Alimos', key: 'alimos' },
  { value: 'Elliniko', key: 'elliniko' },
  { value: 'Argyroupoli', key: 'argyroupoli' },
  { value: 'Palaio Faliro', key: 'palaioFaliro' },
  { value: 'Dafni', key: 'dafni' },
  { value: 'Ymittos', key: 'ymittos' },
  { value: 'Piraeus', key: 'piraeus' },
  { value: 'Neos Kosmos', key: 'neosKosmos' },
  { value: 'Koukaki', key: 'koukaki' },
  { value: 'Ampelokipoi', key: 'ampelokipoi' },
  { value: 'Exarchia', key: 'exarchia' },
  { value: 'Sepolia', key: 'sepolia' },
  { value: 'Other', key: 'otherArea' },
] as const;

export const ANY_DAY = 'any-day';

export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export function scheduleDays(value: string) {
  return [...new Set(value.split(',').map((day) => day.trim()).filter(Boolean))];
}

export function format24HourTime(value: string) {
  const time = value.trim();
  const match = time.match(/^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?(?:\s*(am|pm))?$/i);
  if (!match) return time;

  let hour = Number(match[1]);
  if (match[3]) {
    if (hour < 1 || hour > 12) return time;
    hour = hour % 12 + (match[3].toLowerCase() === 'pm' ? 12 : 0);
  }
  return hour < 24 ? `${String(hour).padStart(2, '0')}:${match[2]}` : time;
}

export function formatScheduleTime(value: string) {
  return value.split(/[-–—]/, 2).map(format24HourTime).join('-');
}

export function parseLessonCost(value: string) {
  const cost = value.trim();
  const match = cost.match(/^(?:€\s*)?(\d+(?:[.,]\d{1,2})?)(?:\s*€)?(?:\s*\/\s*(.+))?$/u);
  if (!match) return { amount: cost, unit: 'legacy' as const };
  const unit = match[2]?.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (!unit || /^(?:class|session|μαθημα)$/.test(unit)) {
    return { amount: match[1], unit: 'class' as const };
  }
  if (/^(?:month|μηνα)$/.test(unit)) return { amount: match[1], unit: 'month' as const };
  return { amount: cost, unit: 'legacy' as const };
}

export function localizeLessonCost(value: string, t: (key: string) => string) {
  const cost = parseLessonCost(value);
  return cost.unit === 'legacy' ? value : `${cost.amount} € ${t(`sched.cost.${cost.unit}`)}`;
}

export type ScheduleTiming = {
  day: string;
  time: string;
  dayTimes?: Record<string, string>;
};

export function expandScheduleDays<Row extends ScheduleTiming>(rows: Row[]) {
  return rows.flatMap(({ dayTimes, ...row }) => {
    const days = scheduleDays(row.day);
    return (days.length ? days : ['']).map((day) => ({
      ...row,
      day,
      time: day === ANY_DAY ? '' : formatScheduleTime(dayTimes?.[day] ?? row.time),
    }));
  });
}

export function combineScheduleDays<Row extends ScheduleTiming>(rows: Row[]) {
  const combined = new Map<string, (Row & ScheduleTiming)[]>();

  for (const { day, time, ...fields } of expandScheduleDays(rows)) {
    const key = JSON.stringify(fields);
    const group = combined.get(key) ?? [];
    const matching = day && day !== ANY_DAY && group.find((entry) => entry.day && entry.day !== ANY_DAY && entry.dayTimes?.[day] === undefined);
    if (matching) {
      matching.day += `,${day}`;
      matching.dayTimes = { ...matching.dayTimes, [day]: time };
    } else {
      group.push({ ...fields, day, time: day ? '' : time, dayTimes: day ? { [day]: time } : undefined } as Row & ScheduleTiming);
    }
    combined.set(key, group);
  }

  return [...combined.values()].flat();
}

export type ScheduleRow = ScheduleTiming & {
  id: string;
  lesson: string;
  ages: string;
  cost: string;
  availability: string;
};

export type ListingFormValues = {
  name: string;
  description: string;
  category: string;
  area: string;
  address: string;
  phone: string;
  email: string;
  image_url: string;
  photo_url_1: string;
  photo_url_2: string;
  school_manager: string;
  disability_access: boolean;
  accessibility_info: string;
  schedule: ScheduleRow[];
  privacy_acknowledged: boolean;
};

export function emptyScheduleRow(): ScheduleRow {
  return { id: crypto.randomUUID(), lesson: '', day: '', time: '', ages: '', cost: '', availability: '' };
}

export function emptyListingValues(): ListingFormValues {
  return {
    name: '',
    description: '',
    category: '',
    area: '',
    address: '',
    phone: '',
    email: '',
    image_url: '',
    photo_url_1: '',
    photo_url_2: '',
    school_manager: '',
    disability_access: false,
    accessibility_info: '',
    schedule: [emptyScheduleRow()],
    privacy_acknowledged: false,
  };
}

/**
 * Turns the class table into readable text, one class per line, so it shows up
 * correctly in emails and on the school page, e.g.
 * "Karate — Monday 18:00 — Ages: 6–12 — Cost: €20/class — Availability: 5 places"
 */
export function formatSchedule(
  rows: ScheduleRow[],
  labels: { day: (day: string) => string; ages: string; cost: string; availability: string }
): string {
  return expandScheduleDays(rows)
    .filter((r) => r.lesson.trim())
    .map((r) =>
      [
        r.lesson.trim(),
        `${r.day ? labels.day(r.day) : ''} ${r.time}`.trim(),
        r.ages.trim() && `${labels.ages}: ${r.ages.trim()}`,
        r.cost.trim() && `${labels.cost}: ${r.cost.trim()}`,
        r.availability.trim() && `${labels.availability}: ${r.availability.trim()}`,
      ]
        .filter(Boolean)
        .join(' — ')
    )
    .join('\n');
}
