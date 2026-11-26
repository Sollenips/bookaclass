import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { PACKAGE_KEYS, packageKey, packagePrice, type MonthlyPackages } from '@/lib/monthlyPackages';

export function MonthlyPackagePrices({ packages }: { packages?: MonthlyPackages }) {
  const { lang, t } = useI18n();
  if (!packages || Object.keys(packages).length === 0) return null;

  const currencyPerMonth = t('sched.cost.month');
  const shared = PACKAGE_KEYS.filter((frequency) => packages[frequency] != null);
  const groups = (['kids', 'adults'] as const).map((group) => ({
    group,
    frequencies: PACKAGE_KEYS.filter((frequency) => packages[packageKey(group, frequency)] != null),
  }));

  return (
    <div className="my-3 space-y-3 rounded-xl border border-teal-100 bg-teal-50/60 px-3 py-3 text-sm">
      <p className="font-semibold text-teal-900">{t('package.title')}</p>
      {groups.map(({ group, frequencies }) => {
        const useShared = frequencies.length === 0;
        const visible = useShared ? shared : frequencies;
        if (!visible.length) return null;

        return (
          <div key={group}>
            <p className="font-semibold text-stone-800">{t(`package.${group}`)}</p>
            <dl className="mt-1 space-y-1">
              {visible.map((frequency) => {
                const price = packages[packageKey(useShared ? 'shared' : group, frequency)]!;
                return (
                  <div key={frequency} className="flex flex-wrap justify-between gap-x-2">
                    <dt className="text-stone-600">{t(`package.${frequency}`)}</dt>
                    <dd className="font-medium text-stone-900">{packagePrice(price, lang)} {currencyPerMonth}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        );
      })}
    </div>
  );
}

export function MonthlyPackageDisclosure({ packages }: { packages?: MonthlyPackages }) {
  const { t } = useI18n();
  if (!packages || Object.keys(packages).length === 0) return null;

  return (
    <details className="group/prices mt-3 cursor-default" onClick={(event) => event.stopPropagation()}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl border border-teal-200 px-3 py-2.5 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 [&::-webkit-details-marker]:hidden">
        {t('package.monthlyCharges')}
        <ChevronDown className="h-4 w-4 transition-transform group-open/prices:rotate-180" aria-hidden="true" />
      </summary>
      <MonthlyPackagePrices packages={packages} />
    </details>
  );
}
