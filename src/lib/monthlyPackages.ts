export const PACKAGE_KEYS = ['once', 'twice', 'three', 'four', 'unlimited'] as const;
export const PACKAGE_GROUPS = ['shared', 'kids', 'adults'] as const;
type Frequency = (typeof PACKAGE_KEYS)[number];
type AgeGroup = (typeof PACKAGE_GROUPS)[number];
export type PackageKey = Frequency | `${Exclude<AgeGroup, 'shared'>}_${Frequency}`;
export type MonthlyPackages = Partial<Record<PackageKey, number>>;

export function packageKey(group: AgeGroup, frequency: Frequency): PackageKey {
  return group === 'shared' ? frequency : `${group}_${frequency}`;
}

export function packageLabel(key: PackageKey, t: (key: string) => string) {
  const [group, frequency] = key.split('_');
  return frequency ? `${t(`package.${group}`)} · ${t(`package.${frequency}`)}` : t(`package.${group}`);
}

export function packagesForAge(packages: MonthlyPackages, age: number) {
  if (!Number.isFinite(age) || age < 0) return [];
  const group = age < 18 ? 'kids' : 'adults';
  const specific = PACKAGE_KEYS.map((frequency) => packageKey(group, frequency)).filter((key) => packages[key] != null);
  return specific.length ? specific : PACKAGE_KEYS.filter((key) => packages[key] != null);
}

export function packagePrice(price: number, lang: string) {
  return new Intl.NumberFormat(lang === 'el' ? 'el-GR' : 'en-IE', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 2, minimumFractionDigits: 0,
  }).format(price);
}

export function monthlyPackageSummary(packages: MonthlyPackages | undefined, lang: string, t: (key: string) => string) {
  const prices = Object.values(packages ?? {});
  if (prices.length === 0) return undefined;
  const min = Math.min(...prices);
  return `${min !== Math.max(...prices) ? t('package.from') + ' ' : ''}${packagePrice(min, lang)} ${t('sched.cost.month')}`;
}
