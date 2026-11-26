import type { Store } from '@/lib/supabase';
import { scheduleRowsForEditing, type ScheduleDisplayRow } from '@/lib/scheduleDisplay';

export type SchoolGroup = {
  school: Store;
  storeIds: Set<string>;
  stores: Store[];
};

function normalizeSchoolField(value: string | null | undefined) {
  return (value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function schoolGroupKey(school: Pick<Store, 'id' | 'name' | 'area' | 'address'>) {
  const name = normalizeSchoolField(school.name);
  const area = normalizeSchoolField(school.area);
  const address = normalizeSchoolField(school.address);
  return name && address ? JSON.stringify([name, area, address]) : school.id;
}

export function locatedSchool(stores: Store[]) {
  return stores.find((school) => school.geocoded_at
    && school.latitude != null && school.longitude != null
    && Number.isFinite(school.latitude) && Number.isFinite(school.longitude));
}

export function groupSchools(stores: Store[]) {
  const groups = new Map<string, SchoolGroup>();
  for (const school of stores) {
    const key = schoolGroupKey(school);
    const group = groups.get(key);

    if (group) {
      group.storeIds.add(school.id);
      group.stores.push(school);
      if (!group.school.image_url && school.image_url) group.school = school;
    } else {
      groups.set(key, { school, storeIds: new Set([school.id]), stores: [school] });
    }
  }
  return groups;
}

export function combineSchoolSchedules(stores: Store[]) {
  const rows = new Map<string, ScheduleDisplayRow>();
  const notes = new Set<string>();
  for (const store of stores) {
    const schedule = scheduleRowsForEditing(store);
    for (const row of schedule.rows) rows.set(JSON.stringify(row), row);
    if (schedule.text) notes.add(schedule.text);
  }
  return { rows: [...rows.values()], notes: [...notes] };
}

export function schoolPhotos(stores: Store[]) {
  const urls = [
    ...stores.map((store) => store.image_url),
    ...stores.flatMap((store) => [store.photo_url_1, store.photo_url_2]),
  ];
  return [...new Set(urls.map((url) => url?.trim()).filter((url): url is string => Boolean(url)))];
}
