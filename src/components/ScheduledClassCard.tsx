import { MonthlyPackageDisclosure } from '@/components/MonthlyPackagePrices';
import { type MonthlyPackages } from '@/lib/monthlyPackages';
import { localizeLessonCost } from '@/lib/listingForm';
import { isUnlimitedCapacity } from '@/lib/availability';
import { useState } from 'react';
import { Calendar, MapPin } from 'lucide-react';
import { CATEGORY_COLORS } from '@/lib/constants';
import { useI18n } from '@/lib/i18n';
import { localizeScheduleDays } from '@/lib/scheduleDisplay';
import type { PlannedClass } from '@/lib/schoolPublish';
import type { Store } from '@/lib/supabase';

export function ScheduledClassCard({ school, cover, lesson, monthlyPackages, onAction, onTrial }: { school: Store; cover?: string; monthlyPackages?: MonthlyPackages; lesson: Pick<PlannedClass, 'title' | 'weekly_schedule' | 'capacity' | 'submitted'>; onAction: () => Promise<boolean>; onTrial: () => void }) {
  const { t, tArea, tCat } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const full = lesson.capacity <= 0;

  const handleAction = async () => {
    setBusy(true);
    setError(false);
    try {
      setError(!(await onAction()));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const categoryColor = CATEGORY_COLORS[school.category] ?? 'bg-stone-100 text-stone-700';
  const schedule = localizeScheduleDays(lesson.weekly_schedule, t);
  const hasMonthlyPackages = Object.keys(monthlyPackages ?? {}).length > 0;
  const details = [
    { label: t('detail.schedule'), value: schedule || '\u2014' },
    { label: t('sched.ages'), value: lesson.submitted.ages || '\u2014' },
    { label: t('sched.cost'), value: hasMonthlyPackages ? '' : localizeLessonCost(lesson.submitted.cost, t) },
    { label: t('sched.availability'), value: isUnlimitedCapacity(lesson.capacity) ? t('sched.unlimited') : lesson.submitted.availability || lesson.capacity.toString() },
  ];

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="relative flex h-44 shrink-0 items-center justify-center bg-stone-100">
        {cover
          ? <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
          : <Calendar aria-hidden="true" className="h-10 w-10 text-stone-300" />}
        <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold ${categoryColor}`}>
          {tCat(school.category)}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-medium text-stone-500">{school.name}</p>
        <h3 className="mt-1 font-bold text-stone-900">{lesson.title}</h3>
        <p className="mt-2 flex items-center gap-1 text-xs text-stone-500">
          <MapPin aria-hidden="true" className="h-3.5 w-3.5" />{tArea(school.area)}
        </p>
        <dl className="mt-3 space-y-1 border-t border-stone-100 pt-3 text-sm">
          {details.filter(({ value }) => value).map(({ label, value }) => (
            <div key={label} className="flex flex-wrap justify-between gap-x-3">
              <dt className="text-stone-500">{label}</dt>
              <dd className="font-medium text-stone-800">{value}</dd>
            </div>
          ))}
        </dl>
        <MonthlyPackageDisclosure packages={monthlyPackages} />
        <div className="mt-auto space-y-2 pt-4">
          <button type="button" onClick={handleAction} disabled={busy}
            aria-busy={busy}
            className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${full ? 'bg-amber-600 hover:bg-amber-700' : 'bg-teal-600 hover:bg-teal-700'}`}
          >
            {t(full ? 'card.waitlistAction' : 'card.bookAction')}
          </button>
          {!full && (
            <button type="button" onClick={onTrial} disabled={busy}
              className="w-full rounded-xl border border-teal-600 px-4 py-2.5 text-sm font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-60">
              {t('req.trialBtn')}
            </button>
          )}
          {error && <p role="alert" className="text-sm text-rose-700">{t('card.scheduleActionError')}</p>}
        </div>
      </div>
    </article>
  );
}
