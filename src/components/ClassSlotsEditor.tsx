import { ScheduleTimeInput } from '@/components/ScheduleInputs';
import { Plus, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export type SlotDraft = { weekday: number; time: string };

type Props = {
  slots: SlotDraft[];
  onChange: (slots: SlotDraft[]) => void;
};

const inputCls =
  'px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 text-stone-800 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all text-sm';

// Admin-only editor for the weekly times when a free trial can be booked
export function ClassSlotsEditor({ slots, onChange }: Props) {
  const { t } = useI18n();
  const update = (i: number, patch: Partial<SlotDraft>) =>
    onChange(slots.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  return (
    <div className="rounded-xl border border-stone-200 p-4 bg-stone-50/60">
      <p className="text-sm font-semibold text-stone-800">{t('admin.slotsTitle')}</p>
      <p className="text-xs text-stone-500 mb-3">{t('admin.slotsHint')}</p>
      {slots.length === 0 && <p className="text-xs text-amber-700 mb-3">{t('admin.slotsNone')}</p>}
      <div className="space-y-2">
        {slots.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <select value={s.weekday} onChange={(e) => update(i, { weekday: Number(e.target.value) })} className={`${inputCls} flex-1`}>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <option key={d} value={d}>
                  {t(`wd.${d}`)}
                </option>
              ))}
            </select>
            <ScheduleTimeInput value={s.time} onChange={(time) => update(i, { time })} required className={inputCls} />
            <button
              type="button"
              onClick={() => onChange(slots.filter((_, idx) => idx !== i))}
              className="text-stone-400 hover:text-rose-600 transition-colors"
              aria-label="Remove"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...slots, { weekday: 1, time: '17:00' }])}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-600 hover:text-teal-700"
      >
        <Plus className="w-4 h-4" /> {t('admin.slotsAdd')}
      </button>
    </div>
  );
}
