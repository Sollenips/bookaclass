import { CalendarCheck, Gift, Heart, Layers, School, UserRound } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { MapView } from '@/components/MapView';
import { AREAS, INTEREST_OPTIONS, matchesInterest, type Area } from '@/lib/constants';
import { isStrongPassword, MIN_PASSWORD_LENGTH, PROFILE_AVATARS, profileAvatar, useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { supabase, type ClassItem, type RequestKind, type RequestStatus, type Store } from '@/lib/supabase';

const NEARBY: Record<Area, readonly Area[]> = {
  Pagrati: ['Vironas', 'Kaisariani'],
  Ilioupoli: ['Vironas'],
  Zografou: ['Kaisariani'],
  Vironas: ['Kaisariani', 'Pagrati', 'Ilioupoli'],
  Kaisariani: ['Vironas', 'Pagrati', 'Zografou'],
};

const ACCOUNT_SECTIONS = [
  { key: 'requests', label: 'student.myClasses', Icon: CalendarCheck },
  { key: 'classes', label: 'student.recommendedClasses', Icon: Layers },
  { key: 'schools', label: 'nav.schools', Icon: School },
  { key: 'favorites', label: 'student.favorites', Icon: Heart },
  { key: 'details', label: 'student.details', Icon: UserRound },
] as const;

export type AccountSection = (typeof ACCOUNT_SECTIONS)[number]['key'];

type MemberRequest = {
  id: string;
  class_id: string;
  title: string;
  school: string | null;
  area: string | null;
  category: string;
  kind: RequestKind;
  status: RequestStatus;
  preferred_date: string | null;
  preferred_time: string | null;
};

type Props = {
  memberId: string;
  initialSection?: AccountSection;
  name?: string;
  email?: string;
  classes: ClassItem[];
  schools: { key: string; school: Store; mapStore: Store | undefined; storeIds: Set<string> }[];
  onClass: (lesson: ClassItem) => void;
  onSchool: (key: string, section: AccountSection) => void;
  onBack: () => void;
  onSignOut: () => void;
};

type FavoriteKind = 'classes' | 'schools';
type Favorites = Record<FavoriteKind, string[]>;

function readFavorites(key: string): Favorites {
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) ?? '{}');
    return {
      classes: Array.isArray(saved?.classes) ? saved.classes.filter((id: unknown) => typeof id === 'string') : [],
      schools: Array.isArray(saved?.schools) ? saved.schools.filter((id: unknown) => typeof id === 'string') : [],
    };
  } catch {
    return { classes: [], schools: [] };
  }
}

function FavoriteCard({ title, subtitle, saved, onOpen, onToggle }: {
  title: string;
  subtitle: string;
  saved: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  return (
    <li className="flex items-start rounded-xl border border-stone-200 hover:border-teal-400">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 break-words p-4 text-left">
        <span className="block font-bold">{title}</span>
        <span className="text-sm text-stone-600">{subtitle}</span>
      </button>
      <button type="button" onClick={onToggle} aria-pressed={saved}
        aria-label={`${t('student.favoriteToggle')} · ${title}`}
        className="m-2 rounded-lg p-2 text-rose-700 hover:bg-rose-50">
        <Heart aria-hidden="true" className={saved ? 'h-5 w-5 fill-current' : 'h-5 w-5'} />
      </button>
    </li>
  );
}

function AccountDetails({ name, email }: Pick<Props, 'name' | 'email'>) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [avatarFeedback, setAvatarFeedback] = useState<'saved' | 'error' | null>(null);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const currentAvatar = profileAvatar(user?.user_metadata.profile_avatar);

  const saveAvatar = async (id: string) => {
    if (savingAvatar || currentAvatar.id === id) return;
    setSavingAvatar(true);
    setAvatarFeedback(null);
    try {
      const { error } = await supabase.auth.updateUser({ data: { profile_avatar: id } });
      if (error) throw error;
      setAvatarFeedback('saved');
    } catch {
      setAvatarFeedback('error');
    } finally {
      setSavingAvatar(false);
    }
  };
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nonce, setNonce] = useState('');
  const [needsNonce, setNeedsNonce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<'saved' | 'error' | null>(null);
  const strong = isStrongPassword(password);
  const mismatch = Boolean(confirmPassword && password !== confirmPassword);
  const canSave = strong && password === confirmPassword && (!needsNonce || Boolean(nonce.trim()));

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const { error } = await supabase.auth.updateUser({ password, nonce: needsNonce ? nonce.trim() : undefined });
      if (error?.code === 'reauthentication_needed' && !needsNonce) {
        const result = await supabase.auth.reauthenticate();
        if (result.error) throw result.error;
        setNeedsNonce(true);
        return;
      }
      if (error) throw error;
      setPassword('');
      setConfirmPassword('');
      setNonce('');
      setNeedsNonce(false);
      setFeedback('saved');
    } catch {
      setFeedback('error');
    } finally {
      setBusy(false);
    }
  };

  const inputClass = 'mt-1 block w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5';

  return (
    <>
      <dl className="grid gap-3 rounded-xl bg-stone-50 p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-stone-600">{t('student.fullName')}</dt>
          <dd className="break-words font-semibold">{name || '—'}</dd>
        </div>
        <div>
          <dt className="text-stone-600">{t('auth.email')}</dt>
          <dd className="break-words font-semibold">{email || '—'}</dd>
        </div>
      </dl>
      <fieldset className="space-y-3 rounded-xl border border-stone-200 p-4" disabled={savingAvatar}>
        <legend className="px-1 text-sm font-semibold">{t('student.avatar')}</legend>
        <div className="flex flex-wrap gap-2">
          {PROFILE_AVATARS.map(({ id, label, Icon }) => (
            <button key={id} type="button" aria-label={t(label)} title={t(label)}
              aria-pressed={currentAvatar.id === id} onClick={() => void saveAvatar(id)}
              className={`grid h-11 w-11 place-items-center rounded-full border ${currentAvatar.id === id ? 'border-teal-700 bg-teal-700 text-white' : 'border-stone-200 bg-white text-teal-800 hover:bg-teal-50'}`}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </button>
          ))}
        </div>
        {avatarFeedback === 'saved' && <p role="status" className="text-sm text-teal-800">{t('student.avatarSaved')}</p>}
        {avatarFeedback === 'error' && <p role="alert" className="text-sm text-rose-700">{t('student.avatarError')}</p>}
      </fieldset>
      <form onSubmit={savePassword} className="space-y-4 border-t border-stone-200 pt-4">
        <h3 className="font-bold">{t('student.changePassword')}</h3>
        <label className="block text-sm font-medium">
          {t('student.newPassword')}
          <input className={inputClass} type="password" autoComplete="new-password"
            value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy}
            aria-describedby="member-password-rules member-password-strength" minLength={MIN_PASSWORD_LENGTH} required />
        </label>
        <p id="member-password-rules" className="text-xs text-stone-600">{t('auth.password.rules')}</p>
        <p id="member-password-strength" role="status" className={strong ? 'text-xs text-teal-700' : 'text-xs text-rose-700'}>
          {password && t(strong ? 'auth.password.strong' : 'auth.password.weak')}
        </p>
        <label className="block text-sm font-medium">
          {t('student.confirmPassword')}
          <input className={inputClass} type="password" autoComplete="new-password"
            value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={busy}
            minLength={MIN_PASSWORD_LENGTH} aria-invalid={mismatch} required />
        </label>
        {mismatch && <p role="status" className="text-sm text-rose-700">{t('auth.errorMismatch')}</p>}
        {needsNonce && (
          <>
            <p role="status" className="text-sm text-teal-800">{t('student.securityCodeSent')}</p>
            <label className="block text-sm font-medium">
              {t('student.securityCode')}
              <input className={inputClass} autoComplete="one-time-code" inputMode="numeric"
                value={nonce} onChange={(event) => setNonce(event.target.value)} disabled={busy} required />
            </label>
          </>
        )}
        {feedback === 'error' && <p role="alert" className="text-sm text-rose-700">{t('student.passwordError')}</p>}
        {feedback === 'saved' && <p role="status" className="text-sm text-teal-800">{t('student.passwordSaved')}</p>}
        <button type="submit" disabled={!canSave || busy} className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
          {t('student.savePassword')}
        </button>
      </form>
    </>
  );
}

export function StudentAccount({ memberId, initialSection = 'requests', name, email, classes, schools, onClass, onSchool, onBack, onSignOut }: Props) {
  const { t, tArea, tCat, lang } = useI18n();
  const [requests, setRequests] = useState<MemberRequest[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [preferredArea, setPreferredArea] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [activeSection, setActiveSection] = useState<AccountSection>(initialSection);
  const currentSection = ACCOUNT_SECTIONS.find(({ key }) => key === activeSection)!;
  const storageKey = `bookaclass:favorites:${memberId}`;
  const [favorites, setFavorites] = useState(() => readFavorites(storageKey));
  const [favoritesFailed, setFavoritesFailed] = useState(false);

  const toggleFavorite = (kind: FavoriteKind, id: string) => {
    const current = favorites[kind];
    const next = { ...favorites, [kind]: current.includes(id) ? current.filter((item) => item !== id) : [...current, id] };
    setFavorites(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setFavoritesFailed(false);
    } catch {
      setFavoritesFailed(true);
    }
  };

  useEffect(() => {
    let active = true;
    void Promise.resolve(supabase.rpc('my_booking_requests')).then(({ data, error }) => {
      if (!active) return;
      setFailed(Boolean(error));
      setRequests((data ?? []) as MemberRequest[]);
    }, () => {
      if (!active) return;
      setFailed(true);
      setRequests([]);
    });
    return () => { active = false; };
  }, []);

  const history = (requests ?? []).filter(({ status }) => status !== 'cancelled' && status !== 'rejected');
  const area = preferredArea || history.find((request) => request.area)?.area || '';
  const nearby = NEARBY[area as Area] ?? [];
  const categories = new Set(history.map((request) => request.category));
  const requested = new Set(history.map((request) => request.class_id));
  const locationScore = (location: string) =>
    area && location === area ? 6 : nearby.some((item) => item === location) ? 3 : 0;
  const ranked = classes.flatMap((lesson) => {
    if (!lesson.store || lesson.capacity <= 0 || requested.has(lesson.id)) return [];
    if (selectedCategory && !matchesInterest(selectedCategory, lesson.category, lesson.title) && !matchesInterest(selectedCategory, lesson.store.category)) return [];
    const score = locationScore(lesson.store.area) + (categories.has(lesson.category) ? 2 : 0);
    return selectedCategory || score > 0 ? [{ lesson, score }] : [];
  }).sort((a, b) => b.score - a.score);
  const visibleRecommendations = selectedCategory ? ranked : ranked.slice(0, 6);
  const orderedSchools = [...schools].sort((a, b) => {
    const score = ({ school }: (typeof schools)[number]) =>
      locationScore(school.area) + (categories.has(school.category) ? 2 : 0);
    return score(b) - score(a) || a.school.name.localeCompare(b.school.name, lang);
  });

  const classCard = (lesson: ClassItem) => (
    <FavoriteCard key={lesson.id} title={lesson.title}
      subtitle={[lesson.store?.name, tArea(lesson.store?.area ?? '')].filter(Boolean).join(' · ')}
      saved={favorites.classes.includes(lesson.id)} onOpen={() => onClass(lesson)}
      onToggle={() => toggleFavorite('classes', lesson.id)} />
  );
  const schoolCard = ({ key, school }: Props['schools'][number]) => (
    <FavoriteCard key={key} title={school.name} subtitle={tArea(school.area)}
      saved={favorites.schools.includes(key)} onOpen={() => onSchool(key, activeSection)}
      onToggle={() => toggleFavorite('schools', key)} />
  );
  const savedClasses = classes.filter(({ id }) => favorites.classes.includes(id));
  const savedSchools = orderedSchools.filter(({ key }) => favorites.schools.includes(key));

  return (
    <section className="mx-auto max-w-7xl space-y-8 px-4 py-10">
      <div className="rounded-2xl border border-teal-100 bg-teal-50 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t('student.account')}</h1>
            {name && <p className="mt-2 font-semibold">{name}</p>}
            <p className="text-sm text-teal-800">{email}</p>
          </div>
          <button type="button" onClick={onSignOut} className="rounded-xl border border-teal-200 bg-white px-4 py-2 text-sm font-semibold text-teal-800">
            {t('student.signOut')}
          </button>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-teal-200 bg-white px-4 py-3 text-teal-900">
        <Gift className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" aria-hidden="true" />
        <p className="text-sm font-semibold">{t('student.firstClassOffer')}</p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.42fr)]">
        <div className="min-w-0">
          <nav aria-label={t('student.account')} className="relative z-10 -mb-px flex gap-1 overflow-x-auto px-1 pt-1">
            {ACCOUNT_SECTIONS.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                aria-pressed={activeSection === key}
                aria-controls="member-section"
                onClick={() => setActiveSection(key)}
                className={`flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-xl border px-3 text-left text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-stone-500 xl:px-4 xl:text-sm ${activeSection === key ? 'border-stone-200 border-b-white bg-white text-stone-900' : 'border-stone-200 bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
              >
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                {t(label)}
              </button>
            ))}
          </nav>
          <section id="member-section" aria-labelledby="member-section-title" className="min-w-0 space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 id="member-section-title" className="text-xl font-bold">{t(currentSection.label)}</h2>
            {favoritesFailed && <p role="alert" className="text-sm text-rose-700">{t('student.favoriteError')}</p>}
            {activeSection === 'requests' ? (
              failed ? <p role="alert" className="text-sm text-rose-700">{t('student.requestsError')}</p>
                  : requests === null ? <p role="status" className="text-sm text-stone-600">{t('student.loading')}</p>
                  : requests.length === 0 ? <p className="text-sm text-stone-600">{t('student.empty')}</p>
                  : (
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {requests.map((request) => (
                        <li key={request.id} className="rounded-2xl border border-stone-200 bg-white p-4 text-sm">
                          <p className="font-bold">{request.title}</p>
                          <p className="text-stone-600">{request.school}</p>
                          <p className="mt-2">{t(request.kind === 'trial' ? 'req.trialTitle' : 'req.enrollTitle')} &middot; {t(`booking.status.${request.status}`)}</p>
                          {request.preferred_date && (
                            <p className="mt-1 text-stone-600">
                              {new Date(`${request.preferred_date}T00:00:00`).toLocaleDateString(lang === 'el' ? 'el-GR' : 'en-GB')}
                              {request.preferred_time && ` \u00b7 ${request.preferred_time.slice(0, 5)}`}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )
            ) : activeSection === 'details' ? (
              <AccountDetails name={name} email={email} />
            ) : activeSection === 'favorites' ? (
              savedClasses.length || savedSchools.length ? (
                <>
                  {savedClasses.length > 0 && (
                    <div>
                      <h3 className="mb-2 font-semibold">{t('nav.browse')}</h3>
                      <ul className="grid gap-3 sm:grid-cols-2">{savedClasses.map(classCard)}</ul>
                    </div>
                  )}
                  {savedSchools.length > 0 && (
                    <div>
                      <h3 className="mb-2 font-semibold">{t('nav.schools')}</h3>
                      <ul className="grid gap-3 sm:grid-cols-2">{savedSchools.map(schoolCard)}</ul>
                    </div>
                  )}
                </>
              ) : <p className="text-sm text-stone-600">{t('student.favoritesEmpty')}</p>
            ) : (
              <>
                <label className="block text-sm font-medium">
                  {t('student.area')}
                  <select value={preferredArea} onChange={(event) => setPreferredArea(event.target.value)} className="mt-1 block w-full max-w-xs rounded-xl border border-stone-200 bg-white p-2">
                    <option value="">{t('student.autoArea')}</option>
                    {AREAS.map((location) => <option key={location} value={location}>{tArea(location)}</option>)}
                  </select>
                </label>
                {activeSection === 'classes' && (
                  <label className="block text-sm font-medium">
                    {t('hero.interest')}
                    <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} className="mt-1 block w-full max-w-xs rounded-xl border border-stone-200 bg-white p-2">
                      <option value="">{t('filter.allCategories')}</option>
                      {INTEREST_OPTIONS.map((category) => <option key={category} value={category}>{tCat(category)}</option>)}
                    </select>
                  </label>
                )}
                {activeSection === 'classes' && (
                  visibleRecommendations.length ? (
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {visibleRecommendations.map(({ lesson }) => classCard(lesson))}
                    </ul>
                  ) : <p className="text-sm text-stone-600">{t(area || selectedCategory ? 'student.noSuggestions' : 'student.chooseArea')}</p>
                )}
                {activeSection === 'schools' && (
                  orderedSchools.length ? (
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {orderedSchools.map(schoolCard)}
                    </ul>
                  ) : <p className="text-sm text-stone-600">{t('student.schoolsEmpty')}</p>
                )}
              </>
            )}
          </section>
        </div>
        <aside className="isolate min-w-0 space-y-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm lg:mt-12">
          <h2 className="mb-2 text-lg font-bold">{t('browse.viewMap')}</h2>
          <p className="text-sm text-stone-600">{t('browse.mapHint')}</p>
          <MapView
            compact
            schools={schools.map(({ key, school, mapStore, storeIds }) => ({
              key,
              store: mapStore ?? school,
              classes: classes.filter((lesson) => storeIds.has(lesson.store_id)),
              located: Boolean(mapStore),
            }))}
            onSelectClass={onClass}
            onSelectSchool={(key) => onSchool(key, activeSection)}
          />
        </aside>
      </div>
      <button type="button" onClick={onBack} className="text-sm font-semibold text-teal-700 underline">{t('admin.backToSite')}</button>
    </section>
  );
}
