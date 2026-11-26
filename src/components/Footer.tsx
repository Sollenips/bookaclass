import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { PrivacyPolicyDialog } from '@/components/PrivacyPolicyDialog';

export function Footer() {
  const { t } = useI18n();
  const [privacyOpen, setPrivacyOpen] = useState(false);

  return (
    <footer className="bg-stone-900 text-stone-300 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="inline-flex shrink-0 flex-col items-center">
            <img
              src={import.meta.env.BASE_URL + 'bookaclass-logo-footer.png'}
              width={100}
              height={100}
              alt="Book a Class"
              className="h-[100px] w-[100px] object-contain"
            />
            <span className="-mt-1.5 text-xs leading-tight text-stone-400">{t('footer.logoTagline')}</span>
          </div>
          <div className="min-w-0 space-y-2 text-sm leading-relaxed text-stone-400">
            <p>
              {t('footer.desc')}
            </p>
            <p>{t('footer.schoolInvitation')}</p>
          </div>
          <figure className="ml-auto hidden shrink-0 items-center gap-3 lg:flex">
            <img src={import.meta.env.BASE_URL + 'bookaclass-qr.png'} width={80} height={80}
              alt={t('hero.qrAlt')} className="h-20 w-20 rounded-lg bg-white" />
            <figcaption className="text-sm text-stone-300">{t('hero.qrCaption')}</figcaption>
          </figure>
        </div>

        <div className="border-t border-stone-800 mt-8 pt-6">
          <p className="text-sm text-stone-500 text-center">
            {t('footer.copyright')}
          </p>
          <div className="mt-2 text-center">
            <button
              type="button"
              onClick={() => setPrivacyOpen(true)}
              className="text-sm text-stone-300 underline underline-offset-4 hover:text-white"
            >
              {t('lf.privacyPolicy')}
            </button>
          </div>
        </div>
      </div>
      <PrivacyPolicyDialog open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </footer>
  );
}
