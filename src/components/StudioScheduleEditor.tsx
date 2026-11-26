import type { ScheduleTiming } from '@/lib/listingForm';
import { Plus, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { ScheduleAvailabilityInput, ScheduleCostInput, ScheduleDaysInput, ScheduleDayTimesInput } from '@/components/ScheduleInputs';
import type { ScheduleDisplayRow } from '@/lib/scheduleDisplay';

export type StudioScheduleRow = ScheduleDisplayRow & ScheduleTiming & { id: string };

const newStudioScheduleRow = (): StudioScheduleRow => ({
  id: crypto.randomUUID(),
  lesson: '',
  day: '',
  time: '',
  ages: '',
  cost: '',
  availability: '',
  duration: '',
});

type Props = {
  rows: StudioScheduleRow[];
  onChange: (next: StudioScheduleRow[]) => void;
};

// Same look as the table in the "List Your School" form
const cellCls =
  'w-full min-w-0 px-2.5 py-2 rounded-lg bg-white border border-stone-200 text-stone-800 placeholder:text-stone-400 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 text-sm';

type EditableField = keyof Omit<StudioScheduleRow, 'id'>;

export function StudioScheduleEditor({ rows, onChange }: Props) {
  const { t } = useI18n();

  const setField = <Field extends EditableField,>(id: string, field: Field, value: StudioScheduleRow[Field]) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-stone-200">
        <table className="w-full min-w-[900px] text-left border-collapse">
          <thead>
            <tr className="bg-stone-100 text-xs font-semibold text-stone-600">
              <th className="px-2.5 py-2.5">{t('sched.lesson')}</th>
              <th className="px-2.5 py-2.5">{t('sched.day')}</th>
              <th className="px-2.5 py-2.5">{t('sched.time')}</th>
              <th className="px-2.5 py-2.5">{t('sched.ages')}</th>
              <th className="px-2.5 py-2.5">{t('sched.cost')}</th>
              <th className="px-2.5 py-2.5">{t('sched.availability')}</th>
              <th className="px-2.5 py-2.5">{t('sched.duration')}</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              return (
                <tr key={row.id} className="border-t border-stone-200">
                  <td className="p-1.5 w-[18%]">
                    <input value={row.lesson} onChange={(e) => setField(row.id, 'lesson', e.target.value)} placeholder={t('lf.lessonHint')} className={cellCls} />
                  </td>
                  <td className="p-1.5 align-top w-[14%]">
                    <ScheduleDaysInput value={row.day} onChange={(day) => setField(row.id, 'day', day)} className={cellCls} />
                  </td>
                  <td className="p-1.5 align-top min-w-[13rem] w-[21%]">
                    <ScheduleDayTimesInput timing={row} onChange={(times) => setField(row.id, 'dayTimes', times)} className={cellCls} />
                  </td>
                  <td className="p-1.5 w-[15%]">
                    <input value={row.ages} onChange={(e) => setField(row.id, 'ages', e.target.value)} placeholder={t('lf.ageHint')} className={cellCls} />
                  </td>
                  <td className="p-1.5 w-[15%]">
                    <ScheduleCostInput value={row.cost} onChange={(cost) => setField(row.id, 'cost', cost)} className={cellCls} />
                  </td>
                  <td className="p-1.5 w-[15%]">
                    <ScheduleAvailabilityInput value={row.availability} onChange={(value) => setField(row.id, 'availability', value)} className={cellCls} />
                  </td>
                  <td className="p-1.5 w-[9%]">
                    <input value={row.duration} onChange={(e) => setField(row.id, 'duration', e.target.value)} inputMode="numeric" placeholder="60" className={cellCls} />
                  </td>
                  <td className="p-1.5">
                    <button
                      type="button"
                      onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
                      className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                      aria-label={t('lf.removeLesson')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() => onChange([...rows, newStudioScheduleRow()])}
        className="mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-teal-600 bg-teal-50 text-teal-700 text-sm font-semibold hover:bg-teal-100 transition-colors"
      >
        <Plus className="w-4 h-4" /> {t('lf.addLesson').replace(/^\+\s*/, '')}
      </button>
    </div>
  );
}
