import { ArrowRight, CalendarCheck, Clock3, Search, Sparkles, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { AREAS, INTEREST_OPTIONS } from '@/lib/constants';
import './HeroCollage.css';
import './HolidayTree.css';

type Props = {
  schoolsOnly: boolean;
  schoolAreas: string[];
  onSearch: (value: string) => void;
  onSearchSubmit: () => void;
  searchValue: string;
  filterArea: string;
  setFilterArea: (v: string) => void;
  filterCategory: string;
  setFilterCategory: (v: string) => void;
  filterAge: string;
  setFilterAge: (v: string) => void;
  activeFilterCount: number;
  onClear: () => void;
};

export function Hero({
  schoolsOnly,
  schoolAreas,
  onSearch,
  onSearchSubmit,
  searchValue,
  filterArea,
  setFilterArea,
  filterCategory,
  setFilterCategory,
  filterAge,
  setFilterAge,
  activeFilterCount,
  onClear,
}: Props) {
  const { t, tArea, tCat } = useI18n();
  const bookingSteps = [
    { label: t('hero.findClass'), Icon: Search },
    { label: t('hero.pickTime'), Icon: Clock3 },
    { label: t('hero.requestSpot'), Icon: CalendarCheck },
  ];

  const AGE_OPTIONS = [
    { value: 'all', label: t('filter.allAges') },
    { value: '4', label: t('filter.age.4-6') },
    { value: '7', label: t('filter.age.7-9') },
    { value: '10', label: t('filter.age.10-12') },
    { value: '13', label: t('filter.age.13-17') },
    { value: '18', label: t('filter.age.18plus') },
  ];

  const selectClass =
    'w-full appearance-none px-2.5 sm:px-4 py-3 rounded-xl bg-stone-50 border border-stone-200 text-sm font-medium text-stone-800 outline-none transition-all hover:border-teal-300 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/15 cursor-pointer';

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-500">
      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/3 translate-x-1/3" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-amber-300/20 rounded-full blur-3xl translate-y-1/3" />

      <div className="relative max-w-[90rem] mx-auto grid items-center gap-6 sm:gap-10 px-4 sm:px-6 lg:grid-cols-[1.08fr_1fr] lg:gap-8 lg:px-8 pb-6 pt-4 sm:pb-20 sm:pt-24 lg:pt-28">
        <div className="flex min-w-0 max-w-2xl flex-col">
          <div className="order-3 mt-3 flex w-fit items-center gap-3 sm:order-none sm:mb-3 sm:mt-5">
            <span className="holiday-tree" aria-hidden="true">
              <span className="holiday-tree__star">★</span>
              <span className="holiday-tree__light" />
              <span className="holiday-tree__light" />
              <span className="holiday-tree__light" />
              <span className="holiday-tree__light" />
              <span className="holiday-tree__light" />
            </span>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {t('hero.badge')}
            </div>
          </div>

          <h1 className="text-[clamp(1.65rem,6.8vw,2.5rem)] sm:text-5xl xl:text-6xl font-extrabold text-white leading-[1.1] tracking-tight mb-3 sm:mb-4">
            {t('hero.title1')}
            <span className="block text-teal-100">{t('hero.title2')}</span>
          </h1>

          <p className="order-4 mt-2 max-w-xl text-sm leading-relaxed text-teal-50/90 sm:order-none sm:mb-7 sm:mt-0 sm:text-lg">
            {t('hero.desc')}
          </p>

          {/* Parent search */}
          <div id="class-search" tabIndex={-1} className="relative max-w-xl scroll-mt-24 bg-white/95 backdrop-blur-sm rounded-3xl p-3 sm:p-4 shadow-xl shadow-teal-900/20">
            <span aria-hidden="true" className="pointer-events-none absolute -top-[30px] right-9 z-10 hidden h-[52px] w-[52px] select-none lg:block">
              <span className="absolute inset-x-0 top-0 text-center text-[30px] leading-none">&#x1F385;</span>
              <span className="absolute left-1 top-[27px] h-2.5 w-3 rotate-12 rounded-full border border-red-100 bg-red-600" />
              <span className="absolute right-1 top-[27px] h-2.5 w-3 -rotate-12 rounded-full border border-red-100 bg-red-600" />
            </span>
            <form className="flex items-stretch gap-2" onSubmit={(event) => {
              event.preventDefault();
              onSearchSubmit();
            }}>
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" aria-hidden="true" />
                <input
                  type="search"
                  value={searchValue}
                  onChange={(event) => onSearch(event.target.value)}
                  aria-label={t('hero.searchAction')}
                  placeholder={t(schoolsOnly ? 'hero.schoolSearchPlaceholder' : 'hero.searchPlaceholder')}
                  className="w-full rounded-2xl border border-stone-200 bg-white py-3.5 pl-10 pr-2 text-base text-stone-800 outline-none placeholder:text-stone-500 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 sm:pr-4"
                />
              </div>
              <button type="submit" className="shrink-0 rounded-xl bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 sm:px-4">
                {t('hero.searchAction')}
              </button>
            </form>

            <div className="grid grid-cols-2 gap-2 mt-3 sm:gap-3 sm:grid-cols-3">
              <label className="block min-w-0">
                <span className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-1 ml-1">
                  {t('hero.age')}
                </span>
                <select value={filterAge} onChange={(e) => setFilterAge(e.target.value)} className={selectClass}>
                  {AGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block min-w-0">
                <span className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-1 ml-1">
                  {t('hero.location')}
                </span>
                <select value={filterArea} onChange={(e) => setFilterArea(e.target.value)} className={selectClass}>
                  <option value="all">{t('filter.allAreas')}</option>
                  {[...new Set([...AREAS, ...schoolAreas])].map((area) => (
                    <option key={area} value={area}>
                      {tArea(area)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 block min-w-0 sm:col-span-1">
                <span className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-1 ml-1">
                  {t('hero.interest')}
                </span>
                <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className={selectClass}>
                  <option value="all">{t('filter.allCategories')}</option>
                  {INTEREST_OPTIONS.map((cat) => (
                    <option key={cat} value={cat}>
                      {tCat(cat)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {activeFilterCount > 0 && (
              <div className="flex items-center justify-between mt-3 px-1">
                <span className="text-xs font-semibold text-teal-700">
                  {activeFilterCount} {t('filter.active')}
                </span>
                <button
                  onClick={onClear}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-rose-600 transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> {t('filter.clear')}
                </button>
              </div>
            )}
          </div>

          <ol className="order-2 mt-3 grid max-w-xl sm:order-none sm:mt-5 grid-cols-3 gap-2 min-[430px]:gap-4">
            {bookingSteps.map(({ label, Icon }, index) => (
              <li key={label} className="relative flex flex-col items-center gap-1 rounded-xl border border-white/25 bg-white/10 px-1.5 py-2 text-center text-[11px] font-semibold text-white min-[430px]:flex-row min-[430px]:gap-2 min-[430px]:px-3 min-[430px]:py-2.5 min-[430px]:text-left min-[430px]:text-sm">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>{label}</span>
                {index < bookingSteps.length - 1 && (
                  <ArrowRight aria-hidden="true" className="absolute -right-4 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-teal-100 min-[430px]:block" />
                )}
              </li>
            ))}
          </ol>
        </div>
        <div className="w-full min-w-0 max-w-2xl justify-self-center">
          <div className="hero-collage" aria-hidden="true">
            {['dance', 'painting', 'swimming', 'boxing', 'guitar', 'yoga', 'robotics', 'languages', 'theater'].map((activity) => {
              const image = (
                <img className="hero-collage__tile" src={`${import.meta.env.BASE_URL}hero/${activity}.jpg`} alt="" decoding="async" />
              );
  
              return (
                <div key={activity} className={`hero-collage__frame hero-collage__tile--${activity}`}>
                  {image}
                  {activity === 'painting' && <img className="hero-collage__bow" src={import.meta.env.BASE_URL + 'hero/christmas-bow.png'} alt="" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Wave separator */}
      <div className="relative">
        <svg viewBox="0 0 1440 80" className="w-full h-12 sm:h-16 fill-stone-50" preserveAspectRatio="none">
          <path d="M0,32 C320,80 720,0 1080,32 C1260,48 1380,64 1440,48 L1440,80 L0,80 Z" />
        </svg>
      </div>
    </section>
  );
}
