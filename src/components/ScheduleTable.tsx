import { MonthlyPackagePrices } from '@/components/MonthlyPackagePrices';
import type { MonthlyPackages } from '@/lib/monthlyPackages';
import { localizeLessonCost } from '@/lib/listingForm';
import { isUnlimitedAvailability } from '@/lib/availability';
import { Calendar } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { ScheduleDisplayRow } from '@/lib/scheduleDisplay';

export function ScheduleTable({ rows }: { rows: (ScheduleDisplayRow & { monthlyPackages?: MonthlyPackages })[] }) {
  const { t } = useI18n();
  const dayLabel = (day: string) => {
    const key = `lf.${day.toLowerCase()}`;
    const label = t(key);
    return label === key ? day : label;
  };
  const cols = ['lesson', 'day', 'time', 'ages', 'cost', 'availability'] as const;

  return (
    <div className="flex items-start gap-3">
      <Calendar className="w-4 h-4 text-stone-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-stone-400 font-medium uppercase tracking-wide mb-2">{t('detail.studioSchedule')}</p>
        <div className="overflow-x-auto rounded-xl border border-stone-200">
          <table className="w-full min-w-[520px] text-left border-collapse">
            <thead>
              <tr className="bg-stone-100 text-xs font-semibold text-stone-600">
                {cols.map((c) => (
                  <th key={c} scope="col" className="px-2.5 py-2.5">{t(`sched.${c}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-stone-200 text-sm text-stone-800">
                  <td className="px-2.5 py-2 font-medium">{r.lesson || '—'}</td>
                  <td className="px-2.5 py-2">{r.day ? dayLabel(r.day) : '—'}</td>
                  <td className="px-2.5 py-2">{r.time || '—'}</td>
                  <td className="px-2.5 py-2">{r.ages || '—'}</td>
                  <td className="px-2.5 py-2 align-top">
                    {r.monthlyPackages && Object.keys(r.monthlyPackages).length ? (
                      <details>
                        <summary className="w-fit cursor-pointer rounded-lg border border-teal-200 px-2 py-1 font-semibold text-teal-800 hover:bg-teal-50">
                          {t('package.viewPrices')}
                        </summary>
                        <div className="min-w-[14rem] sm:min-w-[17rem]">
                          <MonthlyPackagePrices packages={r.monthlyPackages} />
                        </div>
                      </details>
                    ) : r.cost ? localizeLessonCost(r.cost, t) : '—'}
                  </td>
                  <td className="px-2.5 py-2">{!r.availability || isUnlimitedAvailability(r.availability) ? t('sched.unlimited') : r.availability}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
