import { MonthlyPackageDisclosure } from '@/components/MonthlyPackagePrices';
import { monthlyPackageSummary } from '@/lib/monthlyPackages';
import { localizeLessonCost } from '@/lib/listingForm';
import { MapPin, Clock, Calendar, ChevronRight } from 'lucide-react';
import { localizeScheduleDays } from '@/lib/scheduleDisplay';
import { isClassFull, isUnlimitedCapacity } from '@/lib/availability';
import type { ClassItem } from '@/lib/supabase';
import { CATEGORY_COLORS, CATEGORY_CB_BADGES } from '@/lib/constants';
import { useI18n } from '@/lib/i18n';

type Props = {
  cls: ClassItem;
  cover?: string;
  onSelect: (cls: ClassItem) => void;
  onTrial: (cls: ClassItem) => void;
  onEnroll: (cls: ClassItem) => void;
  onWaitlist: (cls: ClassItem) => void;
};

export function ClassCard({ cls, cover, onSelect, onTrial, onEnroll, onWaitlist }: Props) {
  const { t, tCat, tArea, lang } = useI18n();
  const imageUrl = cover ?? cls.image_url;
  const categoryColor = CATEGORY_COLORS[cls.category] ?? 'bg-stone-100 text-stone-700';
  const ageLabel = cls.age_max
    ? `${cls.age_min}–${cls.age_max} ${t('card.yrs')}`
    : `${cls.age_min}${t('card.yrsPlus')}`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(cls)}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect(cls);
        }
      }}
      className="group cursor-pointer text-left bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm hover:shadow-lg hover:border-teal-200 transition-all duration-200 flex flex-col"
    >
      {/* Image */}
      <div className="relative h-44 shrink-0 overflow-hidden bg-stone-100">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={cls.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-300">
            <Calendar className="w-10 h-10" />
          </div>
        )}
        <span
          className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-semibold ${categoryColor} ${CATEGORY_CB_BADGES[cls.category] ?? ''}`}
        >
          {tCat(cls.category)}
        </span>
      </div>

      {/* Body */}
      <div className="p-4 flex-1 flex flex-col">
        <p className="text-xs text-stone-400 font-medium mb-1">{cls.store?.name}</p>
        <h3 className="text-base font-bold text-stone-900 mb-2 group-hover:text-teal-600 transition-colors">
          {cls.title}
        </h3>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-stone-500 mb-3">
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" /> {tArea(cls.store?.area ?? '')}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> {cls.duration_minutes} {t('card.min')}
          </span>
        </div>

        <p className="text-sm text-stone-600 line-clamp-2 mb-3">
          {cls.description}
        </p>

        <dl className="space-y-1 border-t border-stone-100 pt-3 text-sm">
          <div className="flex flex-wrap justify-between gap-x-3">
            <dt className="text-stone-500">{t('detail.schedule')}</dt>
            <dd className="font-medium text-stone-800">{localizeScheduleDays(cls.weekly_schedule, t) || '\u2014'}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-x-3">
            <dt className="text-stone-500">{t('sched.ages')}</dt>
            <dd className="font-medium text-stone-800">{ageLabel}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-x-3">
            <dt className="text-stone-500">{t('sched.cost')}</dt>
            <dd className="font-medium text-stone-800">
              {monthlyPackageSummary(cls.monthly_packages, lang, t) ?? localizeLessonCost(cls.schedule_cost || String(cls.price_eur), t)}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-x-3">
            <dt className="text-stone-500">{t('sched.availability')}</dt>
            <dd className="font-medium text-stone-800">
              {isUnlimitedCapacity(cls.capacity) ? t('sched.unlimited') : cls.capacity}
            </dd>
          </div>
        </dl>
        <span className="mt-2 inline-flex items-center gap-0.5 self-end text-sm font-semibold text-teal-600">
          {t('card.view')} <ChevronRight className="h-4 w-4" />
        </span>
        <MonthlyPackageDisclosure packages={cls.monthly_packages} />
        <div className="mt-auto space-y-2 pt-4" onClick={(e) => e.stopPropagation()}>
          {isClassFull(cls) ? (
            <button
              type="button"
              onClick={() => onWaitlist(cls)}
              className="w-full py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 active:scale-[0.98] transition-all"
            >
              {t('card.waitlistAction')}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onTrial(cls)}
                className="w-full py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 active:scale-[0.98] transition-all"
              >
                {t('req.trialBtn')}
              </button>
              <button
                type="button"
                onClick={() => onEnroll(cls)}
                className="w-full py-2.5 rounded-xl border border-teal-600 text-teal-700 text-sm font-semibold hover:bg-teal-50 active:scale-[0.98] transition-all"
              >
                {t('card.bookAction')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
