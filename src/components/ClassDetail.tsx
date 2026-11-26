import { MonthlyPackagePrices } from '@/components/MonthlyPackagePrices';
import { monthlyPackageSummary } from '@/lib/monthlyPackages';
import { localizeLessonCost } from '@/lib/listingForm';
import { localizeScheduleDays } from '@/lib/scheduleDisplay';
import { ArrowLeft, MapPin, Phone, Mail, Clock, Users, Euro, Calendar, User, Accessibility, ImageIcon } from 'lucide-react';
import type { ClassItem } from '@/lib/supabase';
import { CATEGORY_COLORS, CATEGORY_CB_BADGES } from '@/lib/constants';
import { useI18n } from '@/lib/i18n';
import { TeamSection } from '@/components/TeamSection';
import { isClassFull, isUnlimitedCapacity } from '@/lib/availability';

type Props = {
  cls: ClassItem;
  schoolCover?: string;
  onBack: () => void;
  onTrial: (cls: ClassItem) => void;
  onEnroll: (cls: ClassItem) => void;
  onWaitlist: (cls: ClassItem) => void;
};

export function ClassDetail({ cls, schoolCover, onBack, onTrial, onEnroll, onWaitlist }: Props) {
  const { t, tCat, tArea, lang } = useI18n();
  const store = cls.store;
  const cover = cls.image_url || schoolCover;
  const categoryColor = CATEGORY_COLORS[cls.category] ?? 'bg-stone-100 text-stone-700';
  const ageLabel = cls.age_max
    ? `${cls.age_min}–${cls.age_max} ${t('detail.years')}`
    : `${cls.age_min}${t('detail.yearsPlus')}`;

  const photos = [store?.photo_url_1, store?.photo_url_2].filter(Boolean) as string[];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-teal-600 transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> {t('detail.back')}
      </button>

      {/* Hero image */}
      <div className="relative h-56 sm:h-72 rounded-2xl overflow-hidden bg-stone-100 mb-6">
        {cover ? (
          <img
            src={cover}
            alt={cls.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-300">
            <Calendar className="w-12 h-12" />
          </div>
        )}
        <span
          className={`absolute top-4 left-4 px-3 py-1.5 rounded-full text-sm font-semibold ${categoryColor} ${CATEGORY_CB_BADGES[cls.category] ?? ''}`}
        >
          {tCat(cls.category)}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main info */}
        <div className="lg:col-span-2">
          <p className="text-sm text-stone-500 font-medium mb-1">{store?.name}</p>
          <h1 className="text-3xl font-bold text-stone-900 mb-4">{cls.title}</h1>

          <p className="text-stone-600 leading-relaxed mb-6">{cls.description}</p>

          {/* Key info grid */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <InfoCard icon={User} label={t('detail.instructor')} value={cls.instructor} />
            <InfoCard icon={Users} label={t('detail.ageRange')} value={ageLabel} />
            <InfoCard icon={Clock} label={t('detail.duration')} value={`${cls.duration_minutes} ${t('detail.minutes')}`} />
            <InfoCard icon={Users} label={t('detail.classSize')} value={isClassFull(cls) ? t('waitlist.full') : isUnlimitedCapacity(cls.capacity) ? t('sched.unlimited') : `${t('detail.upTo')} ${cls.capacity}`} />
            <InfoCard icon={Calendar} label={t('detail.schedule')} value={localizeScheduleDays(cls.weekly_schedule, t)} />
            <InfoCard icon={Euro} label={t('detail.price')} value={monthlyPackageSummary(cls.monthly_packages, lang, t) ?? localizeLessonCost(cls.schedule_cost || String(cls.price_eur), t)} />
          </div>

          <MonthlyPackagePrices packages={cls.monthly_packages} />
          {/* Studio info */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 mb-6">
            <h3 className="text-lg font-bold text-stone-900 mb-3">{t('detail.aboutStudio')}</h3>
            <p className="text-stone-600 text-sm leading-relaxed mb-4">{store?.description}</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-stone-600">
                <MapPin className="w-4 h-4 text-stone-400" /> {store?.address}
              </div>
              <div className="flex items-center gap-2 text-stone-600">
                <Phone className="w-4 h-4 text-stone-400" /> {store?.phone}
              </div>
              <div className="flex items-center gap-2 text-stone-600">
                <Mail className="w-4 h-4 text-stone-400" /> {store?.email}
              </div>
            </div>
          </div>

          {/* Studio photos */}
          {photos.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-bold text-stone-900 mb-3 flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-stone-400" />
                {t('detail.studioPhotos')}
              </h3>
              <div className={`grid gap-4 ${photos.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                {photos.map((url, i) => (
                  <div key={i} className="h-48 rounded-xl overflow-hidden bg-stone-100">
                    <img src={url} alt={`${store?.name} ${i + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}

          <TeamSection storeId={cls.store_id} />

          {/* Studio details: manager, accessibility, rates, schedule */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5">
            <h3 className="text-lg font-bold text-stone-900 mb-4">{t('detail.studioDetails')}</h3>
            <div className="space-y-3">
              {store?.school_manager && (
                <DetailRow icon={User} label={t('detail.schoolManager')} value={store.school_manager} />
              )}
              <DetailRow
                icon={Accessibility}
                label={t('detail.disabilityAccess')}
                value={store?.disability_access ? t('detail.accessible') : t('detail.notAccessible')}
                valueColor={store?.disability_access ? 'text-emerald-600' : 'text-stone-500'}
              />
              {store?.accessibility_info && (
                <DetailRow icon={MapPin} label={t('detail.accessibility')} value={store.accessibility_info} />
              )}
              {store?.rate_info && (
                <DetailRow icon={Euro} label={t('detail.rates')} value={store.rate_info} />
              )}
            </div>
          </div>
        </div>

        {/* Booking sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 lg:sticky lg:top-24">
            <div className="mb-4">
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-bold text-stone-900">
                  {monthlyPackageSummary(cls.monthly_packages, lang, t) ?? localizeLessonCost(cls.schedule_cost || String(cls.price_eur), t)}
                </span>
              </div>
              <p className="text-sm text-stone-500 mt-2">{localizeScheduleDays(cls.weekly_schedule, t)}</p>
            </div>

            <div className="space-y-2 mb-4 text-sm text-stone-600">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-stone-400" /> {tArea(store?.area ?? '')}
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-stone-400" /> {ageLabel}
              </div>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-stone-400" /> {cls.instructor}
              </div>
              {store?.disability_access && (
                <div className="flex items-center gap-2 text-emerald-600">
                  <Accessibility className="w-4 h-4" /> {t('detail.accessible')}
                </div>
              )}
            </div>

            <div className="space-y-2.5">
              {isClassFull(cls) ? (
                <button
                  onClick={() => onWaitlist(cls)}
                  className="w-full py-3.5 rounded-xl bg-amber-500 text-white font-semibold text-base hover:bg-amber-600 active:scale-[0.98] transition-all shadow-sm"
                >
                  {t('waitlist.btn')}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => onTrial(cls)}
                    className="w-full py-3.5 rounded-xl bg-teal-600 text-white font-semibold text-base hover:bg-teal-700 active:scale-[0.98] transition-all shadow-sm"
                  >
                    {t('req.trialBtn')}
                  </button>
                  <button
                    onClick={() => onEnroll(cls)}
                    className="w-full py-3.5 rounded-xl border-2 border-teal-600 text-teal-700 font-semibold text-base hover:bg-teal-50 active:scale-[0.98] transition-all"
                  >
                    {t('req.enrollBtn')}
                  </button>
                </>
              )}
            </div>
            <p className="text-xs text-stone-400 text-center mt-3">
              {t('detail.noPayment')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-stone-50 rounded-xl p-3.5 border border-stone-100">
      <div className="flex items-center gap-1.5 text-stone-400 text-xs font-medium uppercase tracking-wide mb-1">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <p className="text-sm font-semibold text-stone-800">{value}</p>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  valueColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-stone-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-xs text-stone-400 font-medium uppercase tracking-wide">{label}</p>
        <p className={`text-sm font-medium whitespace-pre-line ${valueColor ?? 'text-stone-800'}`}>{value}</p>
      </div>
    </div>
  );
}
