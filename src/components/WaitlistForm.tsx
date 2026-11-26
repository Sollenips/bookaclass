import { useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, AlertCircle, CheckCircle2, Home, Info } from 'lucide-react';
import { supabase, type ClassItem } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { PrivacyPolicyDialog } from '@/components/PrivacyPolicyDialog';

type Props = {
  cls: ClassItem;
  onBack: () => void;
  onHome: () => void;
};

const inputClass =
  'w-full px-4 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-stone-800 placeholder:text-stone-400 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all text-sm';

export function WaitlistForm({ cls, onBack, onHome }: Props) {
  const { t, tArea } = useI18n();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!consent) return;

    setSubmitting(true);
    const { error: err } = await supabase.from('waitlist_entries').insert({
      class_id: cls.id,
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      privacy_accepted_at: new Date().toISOString(),
    });
    setSubmitting(false);

    // The same email can only join a class once. Showing the normal confirmation for a repeat
    // keeps other people's entries private (nobody can test whether an email is on a list).
    if (err && err.code !== '23505') {
      setError(err.message?.includes('class_not_full') ? t('waitlist.errNotFull') : t('req.errGeneric'));
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden text-center">
          <div className="bg-teal-50 px-6 pt-12 pb-8">
            <div className="w-20 h-20 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-12 h-12 text-teal-600" />
            </div>
            <h1 className="text-2xl font-bold text-stone-900 mb-2">{t('waitlist.doneTitle')}</h1>
            <p className="text-stone-600 max-w-md mx-auto">{t('waitlist.doneDesc', { class: cls.title })}</p>
          </div>
          <div className="p-6">
            <button
              onClick={onHome}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-colors"
            >
              <Home className="w-4 h-4" /> {t('success.back')}
            </button>
          </div>
        </div>
      </div>
    );
  }

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
          <h1 className="text-xl font-bold text-stone-900 mb-1">{t('waitlist.title')}</h1>
          <p className="text-sm text-stone-600">
            {cls.store?.name} &middot; {cls.title} &middot; {tArea(cls.store?.area ?? '')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-teal-50 border border-teal-100 text-teal-800 text-sm">
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>{t('waitlist.intro')}</p>
          </div>

          <Field label={t('waitlist.name')}>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} className={inputClass} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('req.email')}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} className={inputClass} />
            </Field>
            <Field label={t('req.phone')}>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required minLength={5} maxLength={40} className={inputClass} />
            </Field>
          </div>

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
            disabled={submitting}
            className="w-full py-3.5 rounded-xl bg-teal-600 text-white font-semibold text-base hover:bg-teal-700 active:scale-[0.98] transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> {t('booking.submitting')}
              </>
            ) : (
              <>
                {t('waitlist.btn')} <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>
      </div>
      <PrivacyPolicyDialog open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 mb-1.5">
        {label}
        <span className="text-rose-500 ml-0.5">*</span>
      </label>
      {children}
    </div>
  );
}
