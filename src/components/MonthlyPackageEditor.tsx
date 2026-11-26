import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { PACKAGE_GROUPS, PACKAGE_KEYS, packageKey, type MonthlyPackages } from '@/lib/monthlyPackages';
import { supabase, type ClassItem } from '@/lib/supabase';

const visibleGroups = PACKAGE_GROUPS.filter((group) => group !== 'shared');
const fields = visibleGroups.flatMap((group) => PACKAGE_KEYS.map((frequency) => packageKey(group, frequency)));

export function MonthlyPackageEditor({ cls, onSaved }: { cls: ClassItem; onSaved: () => void }) {
  const { t } = useI18n();
  const [values, setValues] = useState(() => Object.fromEntries(
    fields.map((key) => [key, cls.monthly_packages?.[key]?.toString() ?? ''])
  ));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const save = async () => {
    const packages: MonthlyPackages = { ...cls.monthly_packages };
    for (const key of fields) {
      const raw = values[key].trim().replace(',', '.');
      if (raw === '') {
        delete packages[key];
        continue;
      }
      if (!/^\d{1,5}(?:\.\d{1,2})?$/.test(raw)) {
        setStatus('error');
        return;
      }
      packages[key] = Number(raw);
    }
    setStatus('saving');
    const { data, error } = await supabase.from('classes')
      .update({ monthly_packages: packages }).eq('id', cls.id).select('id').maybeSingle();
    setStatus(error || !data ? 'error' : 'saved');
    if (data && !error) onSaved();
  };

  return (
    <details className="w-full rounded-lg border border-stone-200 p-2">
      <summary className="cursor-pointer font-semibold text-teal-700">{t('package.title')}</summary>
      <p className="mt-2 text-xs text-stone-600">{t('package.help')}</p>
      {visibleGroups.map((group) => (
        <fieldset key={group} className="mt-3 rounded-lg border border-stone-200 px-2 pb-2">
          <legend className="px-1 text-xs font-semibold">{t(`package.${group}`)}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {PACKAGE_KEYS.map((frequency) => {
              const key = packageKey(group, frequency);
              return (
                <label key={key} className="grid gap-1 text-xs">
                  {t(`package.${frequency}`)}
                  <input type="text" inputMode="decimal" value={values[key]} placeholder="€"
                    disabled={status === 'saving'}
                    onChange={(event) => {
                      setValues({ ...values, [key]: event.target.value });
                      setStatus('idle');
                    }}
                    className="min-w-0 rounded-lg border border-stone-200 px-2 py-1.5" />
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <button type="button" onClick={() => void save()} disabled={status === 'saving'}
        className="mt-2 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
        {t('package.save')}
      </button>
      {status === 'saved' && <p role="status" className="mt-1 text-xs text-teal-700">{t('package.saved')}</p>}
      {status === 'error' && <p role="alert" className="mt-1 text-xs text-rose-700">{t('package.error')}</p>}
    </details>
  );
}
