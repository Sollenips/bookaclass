import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Store, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { SchoolListingFields } from '@/components/SchoolListingFields';
import { PrivacyPolicyDialog } from '@/components/PrivacyPolicyDialog';
import { emptyListingValues, expandScheduleDays, type ListingFormValues } from '@/lib/listingForm';

type Turnstile = {
  render: (container: HTMLElement, options: {
    sitekey: string;
    callback: (token: string) => void;
    'expired-callback': () => void;
    'error-callback': () => void;
  }) => string;
  reset: (widget: string) => void;
  remove: (widget: string) => void;
};

const browser = window as Window & { turnstile?: Turnstile };
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAAGB266OhWwsxsbbZ';
let widgetScript: Promise<Turnstile> | undefined;

function loadTurnstile() {
  if (browser.turnstile) return Promise.resolve(browser.turnstile);
  widgetScript ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    const fail = () => {
      script.remove();
      widgetScript = undefined;
      reject(new Error('Turnstile unavailable'));
    };
    script.onload = () => browser.turnstile ? resolve(browser.turnstile) : fail();
    script.onerror = fail;
    document.head.append(script);
  });
  return widgetScript;
}

const APPLICATION_CATEGORIES: Record<string, string> = {
  'Martial Arts': 'martial_arts',
  Music: 'music',
  Dance: 'dance',
  Art: 'painting',
  Languages: 'languages',
  Theater: 'theatre',
};

async function submitSchoolApplication(form: ListingFormValues, token: string) {
  const data = new FormData();
  const fields = {
    'cf-turnstile-response': token,
    studio_name: form.name.trim(),
    studio_description: form.description.trim(),
    email: form.email.trim().toLowerCase(),
    phone: form.phone.trim(),
    area: form.area,
    category: APPLICATION_CATEGORIES[form.category] ?? form.category,
    address: form.address.trim(),
    school_manager: form.school_manager.trim(),
    accessibility: form.accessibility_info.trim(),
    privacy_acknowledged: 'yes',
    weekly_schedule: JSON.stringify(expandScheduleDays(form.schedule)
      .filter((row) => row.lesson.trim())
      .map(({ lesson, day, time, ages, cost, availability }) => ({
        lesson: lesson.trim(), day, time, ages: ages.trim(), cost: cost.trim(), availability: availability.trim(),
      }))),
  };
  Object.entries(fields).forEach(([key, value]) => data.set(key, value));
  if (form.disability_access) data.set('wheelchair_access', 'yes');

  await Promise.all(Object.entries({
    cover_image: form.image_url,
    studio_photo_1: form.photo_url_1,
    studio_photo_2: form.photo_url_2,
  }).map(async ([field, url]) => {
    if (!url) return;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Photo unavailable');
    const image = await response.blob();
    const extension = image.type === 'image/webp' ? 'webp' : image.type === 'image/png' ? 'png' : 'jpg';
    data.set(field, image, `${field}.${extension}`);
  }));

  return fetch(new URL('/functions/v1/submit-school-application', import.meta.env.VITE_SUPABASE_URL), {
    method: 'POST',
    headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    body: data,
  });
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export function StudioListingModal({ open, onClose }: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState<ListingFormValues>(emptyListingValues);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const [token, setToken] = useState('');
  const [verification, setVerification] = useState<'loading' | 'ready' | 'error'>('loading');
  const [uploading, setUploading] = useState(false);
  const widgetHost = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const submitted = status === 'success';

  useEffect(() => {
    const host = widgetHost.current;
    if (!open || submitted || !host) return;
    let active = true;
    let widgetId: string | undefined;

    setToken('');
    setVerification('loading');
    void loadTurnstile().then((turnstile) => {
      if (!active) return;
      widgetId = turnstile.render(host, {
        sitekey: SITE_KEY,
        callback: (value) => {
          if (!active) return;
          setVerification('ready');
          setToken(value);
        },
        'expired-callback': () => { if (active) setToken(''); },
        'error-callback': () => {
          if (!active) return;
          setToken('');
          setVerification('error');
        },
      });
      widget.current = widgetId;
    }).catch(() => { if (active) setVerification('error'); });

    return () => {
      active = false;
      if (widgetId !== undefined) browser.turnstile?.remove(widgetId);
      widget.current = null;
    };
  }, [open, submitted]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'submitting' || uploading || !token || !form.privacy_acknowledged) return;
    if (form.schedule.some((row) => row.lesson.trim() && !row.day.trim())) {
      setStatus('error');
      setErrorMsg(t('sched.dayRequired'));
      return;
    }
    setStatus('submitting');
    setErrorMsg('');

    try {
      const response = await submitSchoolApplication(form, token);
      if (response.ok) {
        setStatus('success');
        return;
      }
      setErrorMsg(t(response.status === 409 ? 'listing.duplicate'
        : response.status === 403 ? 'listing.securityRequired' : 'listing.error'));
    } catch {
      setErrorMsg(t('listing.error'));
    }
    setStatus('error');
    setToken('');
    if (widget.current !== null) browser.turnstile?.reset(widget.current);
  };

  const handleClose = () => {
    if (status === 'submitting') return;
    setStatus('idle');
    setForm(emptyListingValues());
    setPrivacyOpen(false);
    setErrorMsg('');
    onClose();
  };

  return createPortal(
    <>
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 py-4 sm:py-8 bg-stone-900/50 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-full overflow-y-auto overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-500 px-6 py-6">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
            aria-label={t('listing.close')}
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <Store className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">{t('lf.list')}</h2>
          </div>
          <p className="text-teal-50/90 text-sm leading-relaxed">{t('lf.modalIntro')}</p>
        </div>

        {status === 'success' ? (
          <div className="px-6 py-10 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-lg font-bold text-stone-900 mb-2">{t('listing.successTitle')}</h3>
            <p className="text-stone-600 text-sm leading-relaxed mb-6">{t('listing.successDesc')}</p>
            <button
              onClick={handleClose}
              className="px-6 py-2.5 rounded-xl bg-teal-600 text-white font-semibold text-sm hover:bg-teal-700 transition-colors"
            >
              {t('listing.close')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
            <SchoolListingFields values={form} onChange={setForm} onImageUploadingChange={setUploading} onOpenPrivacy={() => setPrivacyOpen(true)} />

            <div ref={widgetHost} />
            {verification === 'loading' && <p role="status" className="text-sm text-stone-600">{t('listing.securityLoading')}</p>}
            {verification === 'error' && <p role="alert" className="text-sm text-rose-600">{t('listing.securityUnavailable')}</p>}

            {status === 'error' && (
              <p className="text-sm text-rose-600 font-medium">{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={status === 'submitting' || uploading || !token}
              className="w-full py-3.5 rounded-xl bg-teal-600 text-white font-semibold text-base hover:bg-teal-700 active:scale-[0.98] transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {status === 'submitting' && <Loader2 className="w-4 h-4 animate-spin" />}
              {status === 'submitting' ? t('listing.submitting') : t('lf.submit')}
            </button>

            <p className="text-xs text-stone-400 text-center">{t('listing.privacy')}</p>
          </form>
        )}
      </div>
    </div>
    <PrivacyPolicyDialog forSchools open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </>,
    document.body,
  );
}
