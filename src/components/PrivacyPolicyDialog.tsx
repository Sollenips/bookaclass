import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { PRIVACY_POLICY_HTML } from '@/lib/privacyPolicy';
import { SCHOOL_PRIVACY_HTML } from '@/lib/schoolPrivacy';

type Props = {
  open: boolean;
  forSchools?: boolean;
  onClose: () => void;
};

export function PrivacyPolicyDialog({ open, onClose, forSchools = false }: Props) {
  const { t, lang } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-title"
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-stone-400 hover:text-stone-700 transition-colors"
          aria-label={t('listing.close')}
        >
          <X className="w-5 h-5" />
        </button>
        <h2 id="privacy-title" className="text-xl font-bold text-stone-900 mb-4 pr-8">
          {t(forSchools ? 'lf.schoolPrivacy' : 'lf.privacyPolicy')}
        </h2>
        {/* Static policy text written by the site owner, not user input */}
        <div
          className="text-stone-600 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-stone-800 [&_h3]:mt-5 [&_h3]:mb-1.5 [&_a]:text-teal-700 [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: (forSchools ? SCHOOL_PRIVACY_HTML : PRIVACY_POLICY_HTML)[lang] }}
        />
      </div>
    </div>
  );
}
