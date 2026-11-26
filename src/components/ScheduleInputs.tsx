import { useState } from 'react';
import { isUnlimitedAvailability, UNLIMITED_CAPACITY } from '@/lib/availability';
import { useI18n } from '@/lib/i18n';
import { ANY_DAY, format24HourTime, parseLessonCost, scheduleDays, WEEKDAYS, type ScheduleTiming } from '@/lib/listingForm';

type InputProps = { value: string; onChange: (value: string) => void; className: string };

export function ScheduleDaysInput({ value, onChange, className }: InputProps) {
  const { t } = useI18n();
  const selected = scheduleDays(value);
  const days = [...new Set([ANY_DAY, ...WEEKDAYS, ...selected])];
  const label = (day: string) => {
    const key = `lf.${day}`;
    const translated = t(key);
    return translated === key ? day : translated;
  };

  return (
    <details className={className}>
      <summary className="cursor-pointer break-words">
        {selected.length ? selected.map(label).join(', ') : t('sched.chooseDays')}
      </summary>
      <div className="mt-2 space-y-1">
        {days.map((day) => (
          <label key={day} className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={selected.includes(day)}
              onChange={(event) => onChange(days.filter((option) =>
                option === day ? event.target.checked : day !== ANY_DAY && option !== ANY_DAY && selected.includes(option)).join(','))} />
            {label(day)}
          </label>
        ))}
      </div>
    </details>
  );
}

export function ScheduleTimeInput({ value, onChange, className, required = false, label }: InputProps & { required?: boolean; label?: string }) {
  const { t } = useI18n();
  return (
    <input type="text" value={value} onChange={(event) => onChange(event.target.value)}
      onBlur={() => onChange(format24HourTime(value))}
      pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]"
      placeholder="HH:MM" title={t('sched.time24')} aria-label={label ?? t('sched.time24')}
      required={required} className={className} />
  );
}


export function ScheduleAvailabilityInput({ value, onChange, className, numeric = false }: InputProps & { numeric?: boolean }) {
  const { t } = useI18n();
  const unlimited = isUnlimitedAvailability(value);

  return (
    <div className="space-y-1">
      <input type={numeric ? 'number' : 'text'} min={numeric ? 0 : undefined}
        max={numeric ? UNLIMITED_CAPACITY - 1 : undefined} value={unlimited ? '' : value}
        onChange={(event) => onChange(event.target.value)} disabled={unlimited}
        placeholder={t('sched.unlimitedIfBlank')} aria-label={t('sched.availability')}
        className={`${className} disabled:opacity-60`} />
      <label className="flex items-center gap-1.5 text-xs text-stone-700">
        <input type="checkbox" checked={unlimited}
          onChange={(event) => onChange(event.target.checked ? 'unlimited' : '')} />
        {t('sched.unlimited')}
      </label>
    </div>
  );
}


export function ScheduleTimeRangeInput({ value, onChange, className, required = false }: InputProps & { required?: boolean }) {
  const { t } = useI18n();
  const [start = '', end = ''] = value.split(/[-–—]/, 2);

  return (
    <div className="grid grid-cols-2 gap-1">
      <label className="text-xs text-stone-600">
        {t('sched.startTime')}
        <ScheduleTimeInput value={start.trim()} onChange={(time) => onChange(end ? `${time}-${end.trim()}` : time)}
          required={required || Boolean(end)} className={className} label={t('sched.startTime')} />
      </label>
      <label className="text-xs text-stone-600">
        {t('sched.endTime')}
        <ScheduleTimeInput value={end.trim()} onChange={(time) => onChange(time ? `${start.trim()}-${time}` : start.trim())}
          className={className} label={t('sched.endTime')} />
      </label>
    </div>
  );
}

export function ScheduleDayTimesInput({ timing, onChange, className, required }: {
  timing: ScheduleTiming;
  onChange: (dayTimes: Record<string, string>) => void;
  className: string;
  required?: boolean;
}) {
  const { t } = useI18n();
  const days = scheduleDays(timing.day);
  if (days.includes(ANY_DAY)) return <p className="py-2 text-xs text-stone-600">{t('sched.flexibleTime')}</p>;
  if (days.length === 0) return <p className="py-2 text-xs text-stone-500">{t('sched.chooseDays')}</p>;

  return (
    <div className="space-y-3">
      {days.map((day) => {
        const key = `lf.${day}`;
        const label = t(key);
        return (
          <fieldset key={day} className="rounded-lg border border-stone-200 p-2">
            <legend className="px-1 text-xs font-semibold text-stone-700">{label === key ? day : label}</legend>
            <ScheduleTimeRangeInput value={timing.dayTimes?.[day] ?? timing.time}
              onChange={(time) => onChange({ ...timing.dayTimes, [day]: time })}
              className={className} required={required} />
          </fieldset>
        );
      })}
    </div>
  );
}

export function ScheduleCostInput({ value, onChange, className, required = false }: InputProps & { required?: boolean }) {
  const { t } = useI18n();
  const { amount, unit } = parseLessonCost(value);
  const [selected, setSelected] = useState(() => value.trim() ? unit : 'class');

  return (
    <div className="grid gap-1">
      <input type="text" inputMode="decimal" value={amount} required={required}
        onChange={(event) => {
          const next = event.target.value;
          const entered = parseLessonCost(next);
          if (next.trim() && entered.unit !== 'legacy') {
            const chosenUnit = selected === 'month' ? 'month' : entered.unit;
            setSelected(chosenUnit);
            onChange(`${entered.amount} € / ${chosenUnit}`);
          } else {
            onChange(next);
          }
        }}
        aria-label={t('sched.cost')} placeholder="40" className={className} />
      <select value={selected} aria-label={t('sched.billingUnit')} className={className}
        onChange={(event) => {
          const next = event.target.value;
          if (next !== 'class' && next !== 'month') return;
          setSelected(next);
          const amountValue = amount.match(/\d+(?:[.,]\d{1,2})?/)?.[0];
          if (amountValue) onChange(`${amountValue} € / ${next}`);
        }}>
        <option value="class">{t('sched.cost.class')}</option>
        <option value="month">{t('sched.cost.month')}</option>
        {selected === 'legacy' && <option value="legacy">{t('sched.cost.custom')}</option>}
      </select>
    </div>
  );
}
