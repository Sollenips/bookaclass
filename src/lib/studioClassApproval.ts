import { combineSchoolSchedules, type SchoolGroup } from '@/lib/schoolGroups';
import { DEFAULT_CAPACITY, planClasses, scheduledClassFields, type PlannedClass } from '@/lib/schoolPublish';
import { scheduleRowsForEditing } from '@/lib/scheduleDisplay';
import { supabase, type ClassItem, type Store } from '@/lib/supabase';

type ScheduleDraft = { key: string; store: Store; lesson: PlannedClass };

export function studioClassIds(schoolGroups: SchoolGroup[], classes: ClassItem[]) {
  const ids = new Set(classes.filter((cls) => cls.schedule_key).map((cls) => cls.id));
  for (const group of schoolGroups) {
    const lessons = planClasses(combineSchoolSchedules(group.stores).rows);
    const legacy = classes.filter((cls) => !cls.schedule_key && group.storeIds.has(cls.store_id));
    for (const cls of legacy) {
      const store = group.stores.find((item) => item.id === cls.store_id);
      if (store?.name !== cls.instructor) continue;
      const match = lessons.some((lesson) =>
        lesson.title.toLowerCase() === cls.title.trim().toLowerCase()
        && (lesson.weekly_schedule || '-') === cls.weekly_schedule
        && lesson.age_min === cls.age_min && lesson.age_max === cls.age_max
        && lesson.price_eur === Number(cls.price_eur)
        && (lesson.capacity === cls.capacity || (!lesson.submitted.availability && cls.capacity === DEFAULT_CAPACITY)));
      if (match) ids.add(cls.id);
    }
  }
  return ids;
}

export function studioScheduleDrafts(group: SchoolGroup, classes: ClassItem[]) {
    const records = classes.filter((cls) => group.storeIds.has(cls.store_id));
    const registeredTitles = new Set(records.filter((cls) => !cls.schedule_key?.startsWith('['))
      .map((cls) => cls.title.trim().normalize('NFC').toLowerCase()));
    const scheduleKeys = new Set(records.map((cls) => cls.schedule_key));
    return planClasses(combineSchoolSchedules(group.stores).rows).flatMap((lesson) => {
      const title = lesson.title.normalize('NFC').toLowerCase();
      if (registeredTitles.has(title)) return [];
      const sources = group.stores.filter((store) => scheduleRowsForEditing(store).rows.some((row) =>
        row.lesson.normalize('NFC').toLowerCase() === title && row.ages === lesson.submitted.ages
        && row.cost === lesson.submitted.cost && row.availability === lesson.submitted.availability));
      const store = sources.find((source) => source.published_at) ?? sources[0];
      if (!store) return [];
      const key = scheduledClassFields(store.id, lesson).schedule_key;
      return scheduleKeys.has(key) ? [] : [{ key, store, lesson }];
    });
}

export async function publishStudioClass(item: ClassItem | ScheduleDraft) {
  const publishedAt = new Date().toISOString();
  return 'id' in item
    ? await supabase.from('classes').update({ published_at: publishedAt }).eq('id', item.id).select('id')
    : await supabase.from('classes').upsert({
        store_id: item.store.id,
        ...scheduledClassFields(item.store.id, item.lesson),
        title: item.lesson.title,
        description: item.lesson.title,
        category: item.store.category,
        instructor: item.store.name,
        age_min: item.lesson.age_min,
        age_max: item.lesson.age_max,
        price_eur: item.lesson.price_eur,
        capacity: item.lesson.capacity,
        duration_minutes: item.lesson.duration_minutes,
        weekly_schedule: item.lesson.weekly_schedule || '-',
        published_at: publishedAt,
      }, { onConflict: 'store_id,schedule_key' }).select('id');

}
