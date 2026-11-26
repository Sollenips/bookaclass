import { ArrowLeft, ArrowRight, CalendarCheck, Check, Gift, Layers, Search, Store } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

const STEPS = [
  { icon: Search, word: 'CLICK', title: 'how.s1.title', desc: 'how.s1.desc' },
  { icon: Layers, word: 'BOOK', title: 'how.s2.title', desc: 'how.s2.desc' },
  { icon: CalendarCheck, word: 'KICK', title: 'how.s3.title', desc: 'how.s3.desc' },
] as const;

export function HowItWorks({ onListSchool, onBrowseSchools, onViewPlans, onJoin }: { onListSchool: () => void; onBrowseSchools: () => void; onViewPlans: () => void; onJoin?: () => void }) {
  const { t } = useI18n();

  return (
    <section id="how-it-works" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 scroll-mt-20">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-extrabold text-stone-900 mb-2">{t('how.title')}</h2>
        <p className="text-stone-500">{t('how.subtitle')}</p>
      </div>
      <div className={`grid grid-cols-1 gap-6 ${onJoin ? 'sm:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3'}`}>
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <article
              key={step.title}
              className="relative bg-white rounded-2xl border border-stone-200 p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="w-11 h-11 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </span>
                <span className="text-xs font-extrabold tracking-widest text-teal-700">{step.word}</span>
              </div>
              <h3 className="text-lg font-bold text-stone-900 mb-1.5">
                {index === 0 ? (
                  <a href="#class-search" className="after:absolute after:inset-0 after:rounded-2xl hover:text-teal-700 focus-visible:after:ring-2 focus-visible:after:ring-teal-600">
                    {t(step.title)}
                  </a>
                ) : index === 1 ? (
                  <button type="button" onClick={onBrowseSchools}
                    className="text-left after:absolute after:inset-0 after:rounded-2xl hover:text-teal-700 focus-visible:after:ring-2 focus-visible:after:ring-teal-600">
                    {t(step.title)}
                  </button>
                ) : t(step.title)}
              </h3>
              <p className="text-sm text-stone-600 leading-relaxed">{t(step.desc)}</p>
            </article>
          );
        })}
        {onJoin && (
          <article className="relative rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <Gift className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="mb-1.5 text-lg font-bold text-stone-900">
              <button type="button" onClick={onJoin}
                className="text-left after:absolute after:inset-0 after:rounded-2xl hover:text-teal-700 focus-visible:after:ring-2 focus-visible:after:ring-teal-600">
                {t('student.join')}
              </button>
            </h3>
            <p className="text-sm leading-relaxed text-stone-600">{t('student.benefits')}</p>
          </article>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-teal-100 bg-teal-50/70 px-6 py-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
            <Store className="h-7 w-7" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-xl font-bold text-stone-900">{t('how.owners.title')}</h3>
            <p className="mt-1 text-sm leading-relaxed text-stone-600">{t('how.owners.desc')}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onViewPlans}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-white px-4 py-3 text-sm font-semibold text-teal-800 hover:bg-teal-100"
          >
            {t('schoolPlans.view')}
          </button>
          <button
            type="button"
            onClick={onListSchool}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            {t('nav.listSchool')}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}

export function SchoolPlansPage({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();

  return (
    <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <button type="button" onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-teal-800 hover:underline">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {t('schoolPlans.back')}
      </button>
      <h1 className="mb-3 text-center text-3xl font-extrabold text-stone-900">{t('schoolPlans.title')}</h1>
      <div>
        <p className="mb-6 text-center text-stone-600">{t('schoolPlans.intro')}</p>
        <SchoolPlanCards />
      </div>
    </section>
  );
}

export function SchoolPlanCards() {
  const { t, lang } = useI18n();
  const formatPrice = new Intl.NumberFormat(lang === 'el' ? 'el-GR' : 'en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {([
        { title: 'schoolPlans.monthly', price: 10, unit: 'schoolPlans.month' },
        { title: 'schoolPlans.annual', price: 100, unit: 'schoolPlans.year' },
      ] as const).map(({ title, price, unit }) => (
        <article key={title} className="flex flex-col rounded-[3rem] border border-[#8c743f] bg-[#123528] p-7 text-[#f6df9f] shadow-sm sm:rounded-[4rem] sm:p-9">
          <h4 className="mb-3 text-center font-extrabold leading-tight">
            <span className="block text-xl tracking-wide">{t(title)}</span>
            <span className="mt-1 block text-xs tracking-widest">{t('schoolPlans.planLabel')}</span>
          </h4>
          <p className="mb-4 mt-1 text-sm">
            {unit === 'schoolPlans.year' && (
              <span className="mr-2 inline-block">
                {t('schoolPlans.from')} <s>{formatPrice.format(120)}</s> {t('schoolPlans.nowOnly')}
              </span>
            )}
            <strong className="mr-1 whitespace-nowrap text-4xl">{formatPrice.format(price)}</strong> {t(unit)}
          </p>
          <ul className="space-y-3 border-t border-[#b89a59]/50 pt-5 text-sm">
            {(['profile', 'schedule', 'requests'] as const).map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#e2bd69]" />
                {t(`schoolPlans.${feature}`)}
              </li>
            ))}
          </ul>
          {unit === 'schoolPlans.year' && (
            <p className="mt-4 text-sm font-semibold">{t('schoolPlans.saving')}</p>
          )}
        </article>
      ))}
    </div>
  );
}
