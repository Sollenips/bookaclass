import { CalendarCheck, LayoutDashboard, Eye, Store as StoreIcon } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useI18n } from '@/lib/i18n';
import { profileAvatar, useAuth } from '@/lib/auth';
import { useAccessibility } from '@/lib/accessibility';
import { GreekFlag, UkFlag } from '@/components/FlagIcons';

type Props = {
  onLogoClick: () => void;
  onAdminClick: () => void;
  onMemberClick: () => void;
  onHowItWorks: () => void;
  onListSchool: () => void;
  onBrowseClasses: () => void;
  onBrowseSchools: () => void;
};

export function Header({ onLogoClick, onAdminClick, onMemberClick, onHowItWorks, onListSchool, onBrowseClasses, onBrowseSchools }: Props) {
  const { t, lang, setLang } = useI18n();
  const { user, isAdmin, isMember } = useAuth();
  const fullName = user?.user_metadata.full_name;
  const nameParts = typeof fullName === 'string' ? fullName.trim().split(/\s+/).filter(Boolean) : [];
  const initials = nameParts.length > 1
    ? [...nameParts[0]][0] + [...nameParts[nameParts.length - 1]][0]
    : [...(nameParts[0] || user?.email || '')][0] ?? '';
  const ProfileIcon = profileAvatar(user?.user_metadata.profile_avatar).Icon;
  const { cbMode, setCbMode } = useAccessibility();
  const [accessibilityOpen, setAccessibilityOpen] = useState(false);
  const a11yMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (a11yMenuRef.current?.contains(target)) return;
      setAccessibilityOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const cbOptions = [
    { value: 'off' as const, label: lang === 'en' ? 'Off' : 'Ανενεργό' },
    { value: 'protanopia' as const, label: lang === 'en' ? 'Red-blind (Protanopia)' : 'Κόκκινο-τυφλός (Πρωτανοπία)' },
    { value: 'deuteranopia' as const, label: lang === 'en' ? 'Green-blind (Deuteranopia)' : 'Πράσινο-τυφλός (Δευτερανοπία)' },
    { value: 'tritanopia' as const, label: lang === 'en' ? 'Blue-blind (Tritanopia)' : 'Μπλε-τυφλός (Τριτανοπία)' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-stone-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-2 h-[4.25rem] sm:h-20">
          <button
            type="button"
            onClick={onLogoClick}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
            aria-label="Book@Class home"
          >
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-teal-600 text-white sm:h-9 sm:w-9">
              <CalendarCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="whitespace-nowrap text-base font-bold tracking-tight text-stone-900 sm:text-xl">
              Book<span className="text-teal-600">@Class</span>
            </span>
          </button>

          <div className="flex items-center gap-1 sm:gap-4">
            <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-stone-600">
              <button type="button" onClick={onBrowseClasses} className="hover:text-teal-600 transition-colors">
                {t('nav.browse')}
              </button>
              <button type="button" onClick={onBrowseSchools} className="hover:text-teal-600 transition-colors">
                {t('nav.schools')}
              </button>
              <a href="#how-it-works" onClick={(event) => { event.preventDefault(); onHowItWorks(); }} className="hover:text-teal-600 transition-colors">
                {t('nav.howItWorks')}
              </a>
              {!user && (
                <button type="button" onClick={onMemberClick}
                  className="whitespace-nowrap rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 font-semibold text-teal-800 hover:bg-teal-100">
                  {t('student.join')}
                </button>
              )}
              <button
                onClick={onListSchool}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-colors shadow-sm"
              >
                <StoreIcon className="w-4 h-4" />
                {t('nav.listSchool')}
              </button>
            </nav>

            {/* Colorblind accessibility toggle */}
            <div className="relative" ref={a11yMenuRef}>
              <button
                onClick={() => setAccessibilityOpen((open) => !open)}
                className={`inline-flex items-center gap-1.5 px-2 py-2 sm:px-3 sm:py-1.5 rounded-lg border text-sm font-semibold transition-colors ${
                  cbMode !== 'off'
                    ? 'border-teal-500 text-teal-700 bg-teal-50'
                    : 'border-stone-200 text-stone-600 hover:border-teal-300 hover:text-teal-600'
                }`}
                aria-label="Colorblind mode"
                aria-expanded={accessibilityOpen}
              >
                <Eye className="w-4 h-4" />
              </button>
              {accessibilityOpen && (
                <div className="absolute right-0 mt-2 w-60 bg-white rounded-xl border border-stone-200 shadow-lg py-2 z-50">
                  <p className="px-3 py-1.5 text-xs font-semibold text-stone-400 uppercase tracking-wide">
                    {t('nav.colorblindMode')}
                  </p>
                  {cbOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setCbMode(opt.value);
                        setAccessibilityOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        cbMode === opt.value
                          ? 'bg-teal-50 text-teal-700 font-semibold'
                          : 'text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {(!user || isAdmin) && (
              <button
                onClick={onAdminClick}
                aria-label={user ? t('admin.title') : t('auth.signIn')}
                title={user ? t('admin.title') : t('auth.signIn')}
                className="inline-flex items-center gap-1.5 px-2 py-2 sm:px-3 sm:py-1.5 rounded-lg border border-stone-200 text-sm font-semibold text-stone-600 hover:border-teal-300 hover:text-teal-600 transition-colors"
              >
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              </button>
            )}

            <div className="flex items-center gap-1.5" role="group" aria-label="Language">
              {(['en', 'el'] as const).map((code) => {
                const active = lang === code;
                return (
                  <button
                    key={code}
                    onClick={() => setLang(code)}
                    aria-pressed={active}
                    aria-label={code === 'en' ? 'English' : 'Ελληνικά'}
                    title={code === 'en' ? 'English' : 'Ελληνικά'}
                    className={`w-7 h-6 sm:w-8 rounded-md overflow-hidden border-2 transition-all hover:scale-105 ${
                      active ? 'border-teal-600 shadow-sm' : 'border-stone-200 opacity-60 hover:opacity-100'
                    }`}
                  >
                    {code === 'en' ? <UkFlag className="w-full h-full" /> : <GreekFlag className="w-full h-full" />}
                  </button>
                );
              })}
            </div>
            {isMember && (
              <button type="button" onClick={onMemberClick} aria-label={t('student.profile')} title={t('student.profile')}
                className="relative ml-1.5 flex shrink-0 items-center gap-1 rounded-full text-teal-800 sm:ml-2 min-[1440px]:left-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 sm:gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-full border border-teal-200 bg-teal-50 hover:bg-teal-100 sm:h-9 sm:w-9">
                  <ProfileIcon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="text-xs font-bold sm:text-sm" aria-hidden="true">{initials.toLocaleUpperCase(lang)}</span>
              </button>
            )}
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-2 text-xs min-[375px]:text-sm font-semibold text-stone-600 lg:hidden">
          <button type="button" onClick={onBrowseClasses} className="hover:text-teal-600">
            {t('nav.browse')}
          </button>
          <button type="button" onClick={onBrowseSchools} className="hover:text-teal-600">
            {t('nav.schools')}
          </button>
          <a href="#how-it-works" onClick={(event) => { event.preventDefault(); onHowItWorks(); }} className="hover:text-teal-600">{t('nav.howItWorks')}</a>
          {!user && (
            <button type="button" onClick={onMemberClick}
              className="whitespace-nowrap rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 font-semibold text-teal-800 hover:bg-teal-100">
              {t('student.join')}
            </button>
          )}
          <button type="button" onClick={onListSchool}
            className="ml-auto rounded-lg bg-teal-700 px-2.5 py-2 font-semibold text-white hover:bg-teal-800">
            {t('nav.listSchool')}
          </button>
        </nav>
      </div>
    </header>
  );
}
