import { packageLabel, packagePrice, packagesForAge } from '@/lib/monthlyPackages';
import { localizeLessonCost } from '@/lib/listingForm';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, AlertCircle, CheckCircle2, Home, Info } from 'lucide-react';
import { supabase, type ClassItem, type ClassSlot, type RequestKind } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { PrivacyPolicyDialog } from '@/components/PrivacyPolicyDialog';

type Props = {
  cls: ClassItem;
  kind: RequestKind;
  onBack: () => void;
  onDone: () => void;
  onOpenStudentAccount?: () => void;
};

const DAYS_AHEAD = 28;

type SlotOption = { value: string; label: string };

const pad = (n: number) => String(n).padStart(2, '0');

// Builds the real, bookable date+time options from the weekly slots the admin configured
function buildOptions(slots: ClassSlot[], locale: string): SlotOption[] {
  const out: SlotOption[] = [];
  const now = new Date();
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const isoDow = d.getDay() === 0 ? 7 : d.getDay();
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const dayLabel = d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
    slots
      .filter((s) => s.weekday === isoDow)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .forEach((s) => {
        const time = s.start_time.slice(0, 5);
        const [h, m] = time.split(':').map(Number);
        if (i === 0 && (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes()))) return;
        out.push({ value: `${date}|${time}`, label: `${dayLabel} — ${time}` });
      });
  }
  return out;
}

export function RequestForm({ cls, kind, onBack, onDone, onOpenStudentAccount }: Props) {
  const { t, lang, tArea } = useI18n();
  const isTrial = kind === 'trial';
  const [packageChoice, setPackageChoice] = useState('');
  const [studentName, setStudentName] = useState('');
  const [age, setAge] = useState('');
  const [guardian, setGuardian] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [slot, setSlot] = useState('');
  const [consent, setConsent] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [slots, setSlots] = useState<ClassSlot[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTrial) return;
    let cancelled = false;
    supabase
      .from('class_slots')
      .select('*')
      .eq('class_id', cls.id)
      .then(({ data }) => {
        if (!cancelled) setSlots((data as ClassSlot[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [cls.id, isTrial]);

  const options = useMemo(
    () => (slots ? buildOptions(slots, lang === 'el' ? 'el-GR' : 'en-GB') : []),
    [slots, lang]
  );

  const ageNum = parseInt(age, 10);
  const isMinor = !isNaN(ageNum) && ageNum < 18;
  const price = Number(cls.price_eur);
  const packages = cls.monthly_packages ?? {};
  const packageKeys = packagesForAge(packages, ageNum);
  const hasPackages = !isTrial && Object.keys(packages).length > 0;
  const selectedPackage = packageKeys.find((key) => key === packageChoice);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (studentName.trim().split(/\s+/).length < 2) return setError(t('req.errName'));
    if (isNaN(ageNum) || ageNum < 0) return setError(t('booking.errorAge'));
    if (ageNum < cls.age_min) return setError(`${t('booking.errorMinAge')} ${cls.age_min}.`);
    if (cls.age_max !== null && ageNum > cls.age_max) return setError(`${t('booking.errorMaxAge')} ${cls.age_max}.`);
    if (isMinor && guardian.trim().split(/\s+/).length < 2) return setError(t('req.errName'));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError(t('booking.errorEmail'));
    if (phone.replace(/\D/g, '').length < 6) return setError(t('req.errPhone'));
    if (isTrial && !options.some((o) => o.value === slot)) return setError(t('req.errSlot'));
    if (hasPackages && !selectedPackage) return setError(t('package.choose'));
    if (!consent) return setError(t('req.errConsent'));

    const [date, time] = isTrial ? slot.split('|') : [null, null];
    setSubmitting(true);
    const { error: err } = await supabase.from('bookings').insert({
      class_id: cls.id,
      kind,
      participant_name: studentName.trim(),
      participant_age: ageNum,
      guardian_name: isMinor ? guardian.trim() : null,
      booker_name: isMinor ? guardian.trim() : studentName.trim(),
      booker_email: email.trim(),
      booker_phone: phone.trim(),
      preferred_date: date,
      preferred_time: time,
      privacy_accepted_at: new Date().toISOString(),
      notes: null,
      ...(hasPackages ? { monthly_package: selectedPackage } : {}),
    });
    setSubmitting(false);

    if (err) {
      if (err.code === '23505') setError(t('req.errDuplicate'));
      else if (err.message?.includes('monthly_package_')) setError(t('package.changed'));
      else if (err.message?.includes('slot_')) setError(t('req.errSlotGone'));
      else setError(t('req.errGeneric'));
      return;
    }
    onDone();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-teal-600 transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> {t('booking.back')}
      </button>

      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="bg-teal-50 border-b border-teal-100 px-6 py-5">
          <h1 className="text-xl font-bold text-stone-900 mb-1">
            {isTrial ? t('req.trialTitle') : t('req.enrollTitle')}
          </h1>
          <p className="text-sm text-stone-600">
            {cls.store?.name} &middot; {cls.title} &middot; {tArea(cls.store?.area ?? '')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Selected school + class (read-only) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ReadOnly label={t('req.school')} value={cls.store?.name ?? ''} />
            <ReadOnly label={t('req.class')} value={cls.title} />
          </div>

          {hasPackages && (
            <Field label={t('package.select')} required>
              <select required disabled={!packageKeys.length} value={selectedPackage ?? ''} onChange={(event) => setPackageChoice(event.target.value)} className={inputClass}>
                <option value="">{t(Number.isNaN(ageNum) ? 'package.enterAge' : packageKeys.length ? 'package.choose' : 'package.noAgeOptions')}</option>
                {packageKeys.map((key) => (
                  <option key={key} value={key}>
                    {packageLabel(key, t)} · {packagePrice(packages[key]!, lang)} {t('sched.cost.month')}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-teal-50 border border-teal-100 text-teal-800 text-sm">
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                {isTrial ? t('req.trialPrice') : hasPackages ? (selectedPackage ? `${packagePrice(packages[selectedPackage]!, lang)} ${t('sched.cost.month')}` : t('package.choose')) : (cls.schedule_display_cost || cls.schedule_cost) ? localizeLessonCost(cls.schedule_display_cost || cls.schedule_cost || '', t) : `${t('req.firstMonth')}: €${price.toFixed(price % 1 === 0 ? 0 : 2)}`}
              </p>
              <p className="mt-0.5">{isTrial ? t('req.trialNote') : t('req.enrollNote')}</p>
              {!isTrial && onOpenStudentAccount && (
                <button type="button" onClick={onOpenStudentAccount} className="mt-2 text-left font-semibold underline underline-offset-2 hover:text-teal-950">
                  {t('req.firstClassDiscount')}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('req.studentName')} required>
              <input
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                required
                maxLength={120}
                className={inputClass}
              />
            </Field>
            <Field label={t('req.studentAge')} required>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                required
                min={0}
                max={120}
                className={inputClass}
              />
            </Field>
          </div>

          {isMinor && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-800 mb-3">{t('req.guardianNote')}</p>
              <Field label={t('req.guardianName')} required>
                <input
                  value={guardian}
                  onChange={(e) => setGuardian(e.target.value)}
                  required
                  maxLength={120}
                  className={inputClass}
                />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('req.email')} required>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={200}
                className={inputClass}
              />
            </Field>
            <Field label={t('req.phone')} required>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                maxLength={30}
                className={inputClass}
              />
            </Field>
          </div>

          {isTrial && (
            <Field label={t('req.slot')} required>
              {slots === null ? (
                <div className="flex items-center gap-2 text-sm text-stone-400">
                  <Loader2 className="w-4 h-4 animate-spin" /> {t('browse.loading')}
                </div>
              ) : options.length === 0 ? (
                <p className="text-sm text-stone-500 bg-stone-50 border border-stone-200 rounded-xl p-3.5">
                  {t('req.noSlots')}
                </p>
              ) : (
                <select value={slot} onChange={(e) => setSlot(e.target.value)} required className={inputClass}>
                  <option value="">{t('req.slotPick')}</option>
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}

          <label className="flex items-start gap-2.5 text-xs text-stone-600 leading-relaxed cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              required
              className="mt-0.5 w-4 h-4 rounded text-teal-600 focus:ring-teal-400"
            />
            <span>
              {t('req.consent')}{' '}
              <button type="button" onClick={() => setPrivacyOpen(true)} className="text-teal-700 underline font-medium">
                {t('req.consentLink')}
              </button>
              .
            </span>
          </label>

          {error && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || (isTrial && options.length === 0)}
            className="w-full py-3.5 rounded-xl bg-teal-600 text-white font-semibold text-base hover:bg-teal-700 active:scale-[0.98] transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> {t('booking.submitting')}
              </>
            ) : (
              <>
                {isTrial ? t('req.submitTrial') : t('req.submitEnroll')} <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>
      </div>
      <PrivacyPolicyDialog open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </div>
  );
}

export function RequestSuccess({ kind, className, onBack }: { kind: RequestKind; className: string; onBack: () => void }) {
  const { t } = useI18n();
  const isTrial = kind === 'trial';
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden text-center">
        <div className="bg-teal-50 px-6 pt-12 pb-8">
          <div className="w-20 h-20 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-12 h-12 text-teal-600" />
          </div>
          <h1 className="text-2xl font-bold text-stone-900 mb-2">
            {isTrial ? t('req.doneTrialTitle') : t('req.doneEnrollTitle')}
          </h1>
          <p className="text-stone-600 max-w-md mx-auto">
            {t(isTrial ? 'req.doneTrialDesc' : 'req.doneEnrollDesc', { class: className })}
          </p>
        </div>
        <div className="p-6">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-colors"
          >
            <Home className="w-4 h-4" /> {t('success.back')}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'w-full px-4 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-stone-800 placeholder:text-stone-400 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all text-sm';

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="block text-sm font-medium text-stone-700 mb-1.5">{label}</p>
      <p className="px-4 py-2.5 rounded-xl bg-stone-100 border border-stone-200 text-stone-700 text-sm">{value}</p>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 mb-1.5">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
