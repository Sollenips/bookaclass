import { SchoolReviewForm, SchoolReviewRating, SchoolReviews, useSchoolReviews } from '@/components/SchoolReviews';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, AlertCircle, ArrowLeft, LayoutList, Map as MapIcon, MapPin, Info, ChevronDown, X, Swords, Footprints, Music2, Palette, Languages, Dumbbell, Drama, BookOpen, Shapes, ArrowRight } from 'lucide-react';
import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { ScheduleTable } from '@/components/ScheduleTable';
import { ScheduledClassCard } from '@/components/ScheduledClassCard';
import { groupSchools, schoolPhotos, combineSchoolSchedules, locatedSchool } from '@/lib/schoolGroups';
import { ClassCard } from '@/components/ClassCard';
import { ClassDetail } from '@/components/ClassDetail';
import { RequestForm, RequestSuccess } from '@/components/RequestForm';
import { WaitlistForm } from '@/components/WaitlistForm';
import { MapView, SchoolLocationMap } from '@/components/MapView';
import { StudentAccount, type AccountSection } from '@/components/StudentAccount';
import { HowItWorks } from '@/components/HowItWorks';
import { Footer } from '@/components/Footer';
import { StudioListingModal } from '@/components/StudioListingModal';
import { AuthPage } from '@/components/AuthPage';
import { AdminDashboard } from '@/components/AdminDashboard';
import { StudioOwnerDashboard } from '@/components/StudioOwnerDashboard';
import { CATEGORY_COLORS, matchesInterest } from '@/lib/constants';
import { AccessibilityProvider } from '@/lib/accessibility';
import { AuthProvider, useAuth } from '@/lib/auth';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { signupReturn, supabase, type ClassItem, type RequestKind, type Store } from '@/lib/supabase';

type BrowseMode = 'home' | 'classes' | 'schools' | 'categories';

type View = 'student-return' | 'student-auth' | 'student-account' | 'browse' | 'detail' | 'request' | 'waitlist' | 'success' | 'auth' | 'dashboard';

const AGE_RANGES: Record<string, [number, number]> = {
  '4': [4, 6],
  '7': [7, 9],
  '10': [10, 12],
  '13': [13, 17],
  '18': [18, 99],
};

function matchesAge(cls: Pick<ClassItem, 'age_min' | 'age_max'>, ageKey: string) {
  const range = AGE_RANGES[ageKey];
  if (!range) return true;
  const [lo, hi] = range;
  return cls.age_min <= hi && (cls.age_max ?? 99) >= lo;
}

function normalizeSearch(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ς/g, 'σ').trim();
}

function includesSearch(query: string, ...values: (string | null | undefined)[]) {
  return !query || values.some((value) => value != null && normalizeSearch(value).includes(query));
}

const CLASS_GROUPS = [
  { key: 'groupMartial', icon: Swords, categories: ['Martial Arts', 'Kick Boxing'] },
  { key: 'groupDance', icon: Footprints, categories: ['Dance'] },
  { key: 'groupMusic', icon: Music2, categories: ['Music'] },
  { key: 'groupArt', icon: Palette, categories: ['Art', 'Ceramics', 'Painting', 'Crafts'] },
  { key: 'groupLanguages', icon: Languages, categories: ['Languages', 'Foreign Languages'] },
  { key: 'groupSports', icon: Dumbbell, categories: ['Sports', 'Yoga', 'Swimming', 'Tennis', 'Basketball', 'Gym', 'Football', 'Cross Training', 'Pilates'] },
  { key: 'groupTheater', icon: Drama, categories: ['Theater', 'Theatre'] },
  { key: 'groupStudy', icon: BookOpen, categories: ['Study', 'Tutoring', 'School Support'] },
  { key: 'groupOther', icon: Shapes, categories: [] },
] as const;

type ClassGroup = (typeof CLASS_GROUPS)[number]['key'];

function classGroup(lesson: ClassItem): ClassGroup {
  const activity = normalizeSearch(`${lesson.category} ${lesson.title}`);
  if (/μελετη|σχολικη υποστηριξη|ενισχυτικη διδασκαλια|\b(?:study|tutoring|school support)\b/u.test(activity)) return 'groupStudy';
  if (/κεραμικ|πηλο|\b(?:ceramics?|pottery|clay)\b/u.test(activity)) return 'groupArt';
  if (matchesInterest('Cross Training', lesson.category, lesson.title)) return 'groupSports';
  return CLASS_GROUPS.find(({ categories }) =>
    categories.some((category) => matchesInterest(category, lesson.category)))?.key ?? 'groupOther';
}

function AppContent() {
  const { t, tCat, tArea } = useI18n();
  const { user, isAdmin, ownedStoreId, roleLoading, roleError, isMember, signOut, loading: authLoading } = useAuth();
  const { reviews, setReviews, failed: reviewsFailed } = useSchoolReviews(isAdmin);
  const reviewCode = new URLSearchParams(window.location.hash.slice(1)).get('school-review');

  const moderateReview = async (id: string, hidden: boolean) => {
    const { data, error } = await supabase.from('school_reviews').update({ hidden }).eq('id', id).select('id').maybeSingle();
    if (error || !data) return false;
    setReviews((previous) => previous.map((review) => review.id === id ? { ...review, hidden } : review));
    return true;
  };

  const [view, setView] = useState<View>(() => signupReturn.memberDestination || signupReturn.signupSession ? 'student-return' : 'browse');
  const [browseMode, setBrowseMode] = useState<BrowseMode>('home');
  const [scrollToResults, setScrollToResults] = useState<boolean | 'how-it-works' | 'category-results'>(false);

  useEffect(() => {
    if (view !== 'browse' || !scrollToResults) return;
    document.getElementById(scrollToResults === true ? browseMode : scrollToResults)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setScrollToResults(false);
  }, [view, browseMode, scrollToResults]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [schools, setSchools] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [requestKind, setRequestKind] = useState<RequestKind>('trial');
  const [listingOpen, setListingOpen] = useState(false);
  const openListing = () => setListingOpen(true);
  const [layout, setLayout] = useState<'list' | 'map'>('list');
  const [schoolLayout, setSchoolLayout] = useState<'list' | 'map'>('list');

  const [search, setSearch] = useState('');
  const showSearchResults = browseMode === 'home' && Boolean(normalizeSearch(search));
  const [filterArea, setFilterArea] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [selectedClassGroup, setSelectedClassGroup] = useState<ClassGroup | null>(null);
  const [filterAge, setFilterAge] = useState('all');
  const [filterSchool, setFilterSchool] = useState<string | null>(null);

  const goTo = useCallback((next: View) => {
    setView(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const fetchClasses = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setLoadError(false);
    }
    const [classesRes, storesRes] = await Promise.all([
      supabase.from('classes').select('*, store:stores!inner(*)').not('published_at', 'is', null).not('store.published_at', 'is', null).order('created_at', { ascending: false }),
      supabase.from('stores').select('*').not('published_at', 'is', null).order('name', { ascending: true }),
    ]);
    if (classesRes.error || !Array.isArray(classesRes.data) || storesRes.error || !Array.isArray(storesRes.data)) {
      if (!silent) setLoadError(true);
    } else {
      setClasses(classesRes.data as ClassItem[]);
      setSchools(storesRes.data as Store[]);
    }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  // Live updates: refresh the map when a school is added or its address/details change
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel('stores-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => fetchClasses(true), 800);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'classes' }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => fetchClasses(true), 800);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [fetchClasses]);

  useEffect(() => {
    if (isAdmin && view === 'auth') goTo('dashboard');
    if ((view === 'student-auth' || view === 'student-account') && (isAdmin || ownedStoreId)) goTo('dashboard');
    if (view !== 'student-return' || authLoading || roleLoading) return;

    const url = new URL(window.location.href);
    url.searchParams.delete('account');
    window.history.replaceState(window.history.state, '', url);
    if ((isAdmin || ownedStoreId) && !signupReturn.failed) {
      goTo('dashboard');
    } else if (isMember && !signupReturn.failed && (signupReturn.memberDestination || typeof user?.user_metadata.full_name === 'string')) {
      goTo('student-account');
    } else {
      goTo(signupReturn.memberDestination ? 'student-auth' : 'browse');
    }
  }, [user, view, goTo, authLoading, roleLoading, isMember, isAdmin, ownedStoreId]);

  const schoolGroups = useMemo(() => groupSchools(schools), [schools]);
  const selectedSchool = filterSchool === null ? undefined : schoolGroups.get(filterSchool);
  const selectedLocation = selectedSchool ? locatedSchool(selectedSchool.stores) : undefined;
  const schoolDescription = selectedSchool?.school.description?.trim()
    || selectedSchool?.stores.find((store) => store.description?.trim())?.description?.trim();
  const schoolPhotoLists = useMemo(
    () => new Map([...schoolGroups].map(([key, group]) => [key, schoolPhotos(group.stores)])),
    [schoolGroups]
  );
  const classSchoolCovers = useMemo(() => {
    const covers = new Map<string, string>();
    for (const [key, group] of schoolGroups) {
      const cover = schoolPhotoLists.get(key)?.[0];
      if (cover) group.storeIds.forEach((id) => covers.set(id, cover));
    }
    return covers;
  }, [schoolGroups, schoolPhotoLists]);
  const selectedPhotos = (filterSchool && schoolPhotoLists.get(filterSchool)) || [];
  const approvedScheduleRows = useMemo(() => {
    if (!selectedSchool) return [];
    const approved = classes.filter((cls) => selectedSchool.storeIds.has(cls.store_id));
    return combineSchoolSchedules(selectedSchool.stores).rows.flatMap((row) => {
      const match = approved.find((cls) => cls.title.normalize('NFC').trim().toLowerCase() === row.lesson.normalize('NFC').toLowerCase()
        && (cls.schedule_ages == null || cls.schedule_ages === row.ages)
        && (cls.schedule_cost == null || cls.schedule_cost === row.cost)
        && (cls.schedule_availability == null || cls.schedule_availability === row.availability));
      return match ? [{ ...row, monthlyPackages: match.monthly_packages }] : [];
    });
  }, [classes, selectedSchool]);

  const filteredClasses = useMemo(() => {
    const q = normalizeSearch(search);
    return classes.filter((cls) => {
      if (selectedSchool && !selectedSchool.storeIds.has(cls.store_id)) return false;
      if (filterArea !== 'all' && cls.store?.area !== filterArea) return false;
      if (selectedClassGroup && classGroup(cls) !== selectedClassGroup) return false;
      if (!matchesInterest(filterCategory, cls.category, cls.title)) return false;
      if (!matchesAge(cls, filterAge)) return false;
      return includesSearch(q, cls.title, cls.instructor, cls.category, cls.store?.name,
        tCat(cls.category, 'el'), tCat(cls.category, 'en'), cls.store?.area,
        cls.store ? tArea(cls.store.area) : undefined);
    });
  }, [classes, search, selectedSchool, selectedClassGroup, filterArea, filterCategory, filterAge, tCat, tArea]);

  const filteredScheduledClasses = filteredClasses.flatMap((cls) => {
    if (!cls.schedule_key || !cls.store) return [];
    return [{
      cls,
      lesson: {
        title: cls.title,
        weekly_schedule: cls.weekly_schedule,
        capacity: cls.capacity,
        submitted: {
          ages: cls.schedule_ages || (cls.age_max == null ? `${cls.age_min}+` : `${cls.age_min}–${cls.age_max}`),
          cost: cls.schedule_cost ?? `€${cls.price_eur}`,
          availability: cls.schedule_availability || String(cls.capacity),
        },
      },
      school: cls.store,
    }];
  });

  const scheduledCards = new Map(filteredScheduledClasses.map((card) => [card.cls.id, card]));
  const visibleClassCount = filteredClasses.length;
  const availableClassCount = filteredClasses.filter((cls) => cls.capacity > 0).length;
  const schoolQuery = normalizeSearch(search);
  const filteredSchools = [...schoolGroups].filter(([, { school, stores, storeIds }]) => {
    const schoolArea = school.area === 'Vyronas' ? 'Vironas' : school.area;
    if (filterArea !== 'all' && schoolArea !== filterArea) return false;
    const matchesSchoolQuery = includesSearch(schoolQuery, school.name, tArea(school.area), school.address);
    if (filterAge === 'all' && stores.some((entry) => matchesInterest(filterCategory, entry.category)
      && (matchesSchoolQuery || includesSearch(schoolQuery, entry.category, tCat(entry.category, 'el'), tCat(entry.category, 'en'))))) return true;

    return classes.some((cls) => storeIds.has(cls.store_id)
      && matchesAge(cls, filterAge)
      && matchesInterest(filterCategory, cls.category, cls.title)
      && (matchesSchoolQuery || includesSearch(schoolQuery, cls.title, cls.category, tCat(cls.category, 'el'), tCat(cls.category, 'en'))));
  });

  const mapSchools = [...schoolGroups].flatMap(([key, group]) => {
    if (filterSchool && key !== filterSchool) return [];
    if (filterArea !== 'all' && group.school.area !== filterArea) return [];

    const matchingClasses = filteredClasses.filter((cls) => group.storeIds.has(cls.store_id));
    const matchesSchool = filterAge === 'all'
      && matchesInterest(filterCategory, group.school.category)
      && includesSearch(schoolQuery, group.school.name, group.school.address, tArea(group.school.area),
        group.school.category, tCat(group.school.category, 'el'), tCat(group.school.category, 'en'));
    if (!filterSchool && !matchesSchool && !matchingClasses.length) return [];

    const store = locatedSchool(group.stores);
    return [{ key, store: store ?? group.school, classes: matchingClasses, located: Boolean(store) }];
  });

  // A school picked from the school list that has no classes yet: show the school itself
  // instead of an empty "No classes found" page.
  const selectedSchoolWithoutClasses = useMemo(() => {
    if (!selectedSchool || classes.some((cls) => selectedSchool.storeIds.has(cls.store_id))) return null;
    return selectedSchool.school;
  }, [selectedSchool, classes]);

  const activeFilterCount =
    (search.trim() ? 1 : 0) +
    (filterSchool ? 1 : 0) +
    (filterArea !== 'all' ? 1 : 0) +
    (filterCategory !== 'all' ? 1 : 0) +
    (filterAge !== 'all' ? 1 : 0);

  const clearFilters = () => {
    setSelectedClassGroup(null);
    setSearch('');
    setFilterSchool(null);
    setFilterArea('all');
    setFilterCategory('all');
    setFilterAge('all');
  };

  const handleSelectClass = (cls: ClassItem) => {
    setSelectedClass(cls);
    goTo('detail');
  };

  const browseResults = (mode: Exclude<BrowseMode, 'home'>) => {
    setBrowseMode(mode);
    setView('browse');
    setScrollToResults(true);
  };

  const schoolAccountOrigin = useRef<{ memberId: string; section: AccountSection } | null>(null);
  const [accountSection, setAccountSection] = useState<{ memberId: string; section: AccountSection } | null>(null);
  const returningToAccount = Boolean(user && schoolAccountOrigin.current?.memberId === user.id);

  const schoolListFilters = useRef<{ search: string; area: string; category: string; age: string } | null>(null);
  const handleBackToSchools = () => {
    const origin = schoolAccountOrigin.current;
    schoolAccountOrigin.current = null;
    if (origin && origin.memberId === user?.id) {
      schoolListFilters.current = null;
      clearFilters();
      setBrowseMode('home');
      setAccountSection(origin);
      goTo('student-account');
      return;
    }
    const previous = schoolListFilters.current;
    clearFilters();
    if (previous) {
      setSearch(previous.search);
      setFilterArea(previous.area);
      setFilterCategory(previous.category);
      setFilterAge(previous.age);
    }
    schoolListFilters.current = null;
    browseResults('schools');
  };

  const handleSelectSchool = (schoolKey: string) => {
    schoolAccountOrigin.current = null;
    if (!filterSchool) {
      schoolListFilters.current = { search, area: filterArea, category: filterCategory, age: filterAge };
    }
    clearFilters();
    setFilterSchool(schoolKey);
    setLayout('list');
    browseResults('classes');
  };

  const handleStartRequest = (cls: ClassItem, kind: RequestKind) => {
    setSelectedClass(cls);
    setRequestKind(kind);
    goTo('request');
  };

  const handleStartWaitlist = (cls: ClassItem) => {
    setSelectedClass(cls);
    goTo('waitlist');
  };

  const handleAccountClick = () => {
    goTo(isAdmin ? 'dashboard' : 'auth');
  };

  const renderLayoutSwitch = (layout: 'list' | 'map', setLayout: (value: 'list' | 'map') => void) => (
    <div className="inline-flex rounded-xl border border-stone-200 bg-white p-1 shadow-sm">
      <button
        onClick={() => setLayout('list')}
        aria-pressed={layout === 'list'}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
          layout === 'list' ? 'bg-teal-600 text-white' : 'text-stone-600 hover:text-teal-600'
        }`}
      >
        <LayoutList className="w-4 h-4" />
        {t('browse.viewList')}
      </button>
      <button
        onClick={() => setLayout('map')}
        aria-pressed={layout === 'map'}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
          layout === 'map' ? 'bg-teal-600 text-white' : 'text-stone-600 hover:text-teal-600'
        }`}
      >
        <MapIcon className="w-4 h-4" />
        {t('browse.viewMap')}
      </button>
    </div>
  );

  const handleBrowseSchools = () => {
    schoolAccountOrigin.current = null;
    setSelectedClassGroup(null);
    setFilterSchool(null);
    browseResults('schools');
  };

  const renderClassCard = (cls: ClassItem) => {
    const scheduled = scheduledCards.get(cls.id);
    if (scheduled) {
      const { school, lesson } = scheduled;
      return (
      <ScheduledClassCard
        key={cls.id}
        school={school}
        cover={classSchoolCovers.get(cls.store_id)}
        lesson={lesson}
        monthlyPackages={cls.monthly_packages}
        onTrial={() => handleStartRequest(cls, 'trial')}
        onAction={async () => {
          const selected = { ...cls, schedule_display_cost: cls.schedule_cost ?? undefined };
          if (cls.capacity <= 0) handleStartWaitlist(selected);
          else handleStartRequest(selected, 'enrollment');
          return true;
        }}
      />
      );
    }

    return (
      <ClassCard
        key={cls.id}
        cls={cls}
        cover={classSchoolCovers.get(cls.store_id)}
        onSelect={handleSelectClass}
        onTrial={(c) => handleStartRequest(c, 'trial')}
        onEnroll={(c) => handleStartRequest(c, 'enrollment')}
        onWaitlist={handleStartWaitlist}
      />
    );
  };

  const renderHome = () => (
    <>
      {browseMode !== 'categories' && <Hero
        schoolsOnly={browseMode === 'schools'}
        schoolAreas={schools.map(({ area }) => area).filter((area) => area && area !== 'Other')}
        onSearch={setSearch}
        onSearchSubmit={() => {
          if (!normalizeSearch(search)) return;
          const target = browseMode === 'schools' || (showSearchResults && filteredSchools.length > 0) ? 'schools' : 'classes';
          document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
        searchValue={search}
        filterArea={filterArea}
        setFilterArea={setFilterArea}
        filterCategory={filterCategory}
        setFilterCategory={(category) => {
          setFilterCategory(category);
          if (category !== 'all') {
            setFilterSchool(null);
            browseResults('schools');
          }
        }}
        filterAge={filterAge}
        setFilterAge={(age) => {
          setFilterSchool(null);
          setFilterAge(age);
        }}
        activeFilterCount={activeFilterCount - Number(browseMode === 'schools' && Boolean(filterSchool))}
        onClear={clearFilters}
      />}

      {browseMode === 'categories' && (
        <section id="categories" className="mx-auto max-w-7xl px-4 py-12 scroll-mt-36 sm:px-6 lg:px-8 lg:scroll-mt-24">
          <h1 className="mb-6 text-2xl font-bold sm:text-3xl">{t('browse.groups')}</h1>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {CLASS_GROUPS.map(({ key, icon: Icon }) => (
              <li key={key}>
                <button type="button" aria-pressed={selectedClassGroup === key}
                  onClick={() => {
                    setSelectedClassGroup(key);
                    setScrollToResults('category-results');
                  }}
                  className={`flex h-full min-h-20 w-full items-center gap-2 rounded-full border px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 sm:gap-3 sm:px-4 ${selectedClassGroup === key ? 'border-teal-700 bg-teal-100 text-teal-900' : 'border-teal-200 bg-white text-teal-900 hover:bg-teal-50'}`}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-50 sm:h-10 sm:w-10">
                    <Icon aria-hidden="true" className="h-4 w-4 sm:h-5 sm:w-5" />
                  </span>
                  {t(`browse.${key}`)}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => {
            clearFilters();
            setLayout('list');
            browseResults('classes');
          }} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-teal-800 underline underline-offset-4">
            {t('browse.allClasses')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>

          {selectedClassGroup && (
            <div id="category-results" className="mt-8 scroll-mt-36 border-t border-stone-200 pt-6 lg:scroll-mt-24">
              <h2 className="mb-4 text-xl font-bold">{t(`browse.${selectedClassGroup}`)}</h2>
              {loading ? <p role="status">{t('browse.loading')}</p>
                : loadError ? <p role="alert">{t('browse.loadError')}</p>
                : filteredClasses.length === 0 ? <p>{t('browse.noResults')}</p>
                : (
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredClasses.map(renderClassCard)}
                  </div>
                )}
            </div>
          )}
        </section>
      )}

      {(browseMode === 'schools' || showSearchResults) && (
        <section id="schools" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 scroll-mt-28 md:scroll-mt-20">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-bold text-stone-900">{t('nav.schools')}</h1>
            {renderLayoutSwitch(schoolLayout, setSchoolLayout)}
          </div>
          {loading ? (
            <div role="status" className="flex justify-center py-12 text-stone-500">
              <Loader2 aria-label={t('browse.loadingSchools')} className="w-6 h-6 animate-spin" />
            </div>
          ) : loadError ? (
            <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
              {t('browse.loadError')}
            </p>
          ) : filteredSchools.length === 0 ? (
            <p className="text-stone-500">{t('browse.noSchools')}</p>
          ) : schoolLayout === 'map' ? (
            <MapView
              schools={filteredSchools.map(([key, group]) => {
                const store = locatedSchool(group.stores);
                return {
                  key,
                  store: store ?? group.school,
                  located: Boolean(store),
                  classes: filteredClasses.filter((cls) => group.storeIds.has(cls.store_id)),
                };
              })}
              onSelectClass={handleSelectClass}
              onSelectSchool={handleSelectSchool}
            />
          ) : (
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSchools.map(([key, { school, storeIds }]) => (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => handleSelectSchool(key)}
                    className="block h-full w-full overflow-hidden rounded-2xl border border-stone-200 bg-white text-left shadow-sm transition-colors hover:border-teal-500"
                  >
                    {schoolPhotoLists.get(key)?.[0] && (
                      <img src={schoolPhotoLists.get(key)?.[0]} alt="" loading="lazy" className="h-44 w-full object-cover" />
                    )}
                    <span className="block p-5">
                      <span className="block text-lg font-bold text-stone-900">{school.name}</span>
                      <SchoolReviewRating ratings={reviews.filter((review) => !review.hidden && storeIds.has(review.store_id)).map((review) => review.rating)} />
                      <span className="mt-2 flex items-start gap-1.5 text-sm text-stone-500">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          {tArea(school.area)}
                          {school.address && ` · ${school.address}`}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {browseMode !== 'categories' && <section hidden={browseMode !== 'classes' && !showSearchResults} id="classes" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 scroll-mt-28 md:scroll-mt-20">
        {selectedSchool && (
          <button type="button" onClick={handleBackToSchools}
            className="mb-5 inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t(returningToAccount ? 'student.account' : 'browse.backToSchools')}
          </button>
        )}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-medium text-stone-500">
              {availableClassCount}{' '}
              {availableClassCount === 1 ? t('browse.classAvailable') : t('browse.classesAvailable')}
            </p>
            {filterSchool && (
              <button
                onClick={handleBackToSchools}
                className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition-colors"
              >
                {selectedSchool?.school.name}
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
          {renderLayoutSwitch(layout, setLayout)}
        </div>

        {layout === 'list' && selectedSchool && (
          <section className="mb-8 grid gap-5 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-2">
            <div>
              <h2 className="text-lg font-bold text-stone-900">{selectedSchool.school.name}</h2>
              <p className="mt-2 flex items-start gap-1.5 text-sm text-stone-600">
                <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                {[tArea(selectedSchool.school.area), selectedSchool.school.address].filter(Boolean).join(' · ')}
              </p>
              <details key={selectedSchool.school.id} className="group mt-4">
                <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-xl border border-teal-200 px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50 focus-visible:outline-teal-600 [&::-webkit-details-marker]:hidden">
                  <Info aria-hidden="true" className="h-4 w-4" />
                  {t('browse.schoolInfo')}
                  <ChevronDown aria-hidden="true" className="h-4 w-4 group-open:rotate-180" />
                </summary>
                <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-stone-600">
                  {schoolDescription || t('browse.noSchoolDescription')}
                </p>
              </details>
            </div>
            {selectedLocation ? <SchoolLocationMap school={selectedLocation} /> : (
              <p className="self-center text-sm text-stone-500">{t('map.schoolLocationPending')}</p>
            )}
          </section>
        )}

        {layout === 'list' && selectedPhotos.length > 0 && (
          <section aria-label={t('detail.studioPhotos')} className="mb-8">
            <h2 className="mb-3 text-sm font-semibold text-stone-700">{t('detail.studioPhotos')}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {selectedPhotos.map((url) => (
                <img key={url} src={url} alt={selectedSchool?.school.name ?? ''} loading="lazy"
                  className="h-44 w-full rounded-2xl border border-stone-200 object-cover" />
              ))}
            </div>
          </section>
        )}

        {!loading && !loadError && approvedScheduleRows.length > 0 && (
          <details className="mb-8 min-w-0 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
            <summary className="cursor-pointer text-sm font-semibold text-stone-700">
              {t('detail.studioSchedule')}
            </summary>
            <div className="mt-4"><ScheduleTable rows={approvedScheduleRows} /></div>
          </details>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-24 text-stone-500">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm font-medium">{t('browse.loading')}</span>
          </div>
        ) : loadError ? (
          <div className="flex items-center justify-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-red-700">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm font-medium">{t('browse.loadError')}</span>
          </div>
        ) : layout === 'map' ? (
          <div className="space-y-3">
            <p className="text-sm text-stone-500">{t('browse.mapHint')}</p>
            <MapView schools={mapSchools} onSelectClass={handleSelectClass} onSelectSchool={handleSelectSchool} />
          </div>
        ) : visibleClassCount === 0 && selectedSchoolWithoutClasses ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm flex flex-col">
              <div className="p-5 flex flex-col gap-2">
                <span
                  className={`self-start px-2 py-0.5 rounded-full text-xs font-semibold ${
                    CATEGORY_COLORS[selectedSchoolWithoutClasses.category] ?? 'bg-stone-100 text-stone-700'
                  }`}
                >
                  {tCat(selectedSchoolWithoutClasses.category)}
                </span>
                <p className="text-xs text-stone-400">{t('map.noClasses')}</p>
              </div>
            </div>
          </div>
        ) : visibleClassCount === 0 ? (
          <div className="text-center py-24">
            <p className="text-lg font-semibold text-stone-800">
              {t(classes.length === 0 ? 'browse.noPublishedClasses' : 'browse.noResults')}
            </p>
            {classes.length === 0 && isAdmin && (
              <button type="button" onClick={handleAccountClick}
                className="mt-6 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
                {t('browse.goToClassApproval')}
              </button>
            )}
            {classes.length > 0 && activeFilterCount > 0 && (
              <p className="mt-2 text-sm text-stone-500">{t('browse.tryAdjusting')}</p>
            )}
            {classes.length > 0 && activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="mt-6 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors"
              >
                {t('browse.clearAll')}
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredClasses.map(renderClassCard)}
          </div>
        )}
        {layout === 'list' && selectedSchool && (
          <SchoolReviews reviews={reviews.filter((review) => selectedSchool.storeIds.has(review.store_id) && (isAdmin || !review.hidden))}
            failed={reviewsFailed} admin={isAdmin} onModerate={moderateReview} />
        )}
      </section>}

      <HowItWorks onListSchool={openListing} onBrowseSchools={handleBrowseSchools} onJoin={user ? undefined : () => goTo('student-auth')} />
    </>
  );

  const renderStudentAccount = () => user && (
    <StudentAccount
      key={user.id}
      memberId={user.id}
      initialSection={accountSection?.memberId === user.id ? accountSection.section : undefined}
      name={typeof user.user_metadata.full_name === 'string' ? user.user_metadata.full_name : undefined}
      email={user.email}
      classes={classes}
      schools={[...schoolGroups].map(([key, { school, stores, storeIds }]) => ({ key, school, storeIds, mapStore: locatedSchool(stores) }))}
      onClass={handleSelectClass}
      onSchool={(key, section) => {
        handleSelectSchool(key);
        schoolAccountOrigin.current = { memberId: user.id, section };
      }}
      onBack={() => goTo(selectedClass ? 'request' : 'browse')}
      onSignOut={async () => {
        await signOut();
        goTo('browse');
      }}
    />
  );


  const renderView = () => {
    switch (view) {
      case 'detail':
        return selectedClass && (
          <ClassDetail
            cls={selectedClass}
            schoolCover={classSchoolCovers.get(selectedClass.store_id)}
            onBack={() => goTo('browse')}
            onTrial={(c) => handleStartRequest(c, 'trial')}
            onEnroll={(c) => handleStartRequest(c, 'enrollment')}
            onWaitlist={handleStartWaitlist}
          />
        );
      case 'waitlist':
        return selectedClass && (
          <WaitlistForm
            key={selectedClass.id}
            cls={selectedClass}
            onBack={() => goTo('detail')}
            onHome={() => goTo('browse')}
          />
        );
      case 'request':
        return selectedClass && (
          <RequestForm
            key={selectedClass.id}
            cls={selectedClass}
            kind={requestKind}
            onBack={() => goTo('detail')}
            onOpenStudentAccount={!user || isMember ? () => goTo(isMember ? 'student-account' : 'student-auth') : undefined}
            onDone={() => goTo('success')}
          />
        );
      case 'success':
        return <RequestSuccess kind={requestKind} className={selectedClass?.title ?? ''} onBack={() => goTo('browse')} />;
      case 'student-return':
        return (
          <div role="status" className="flex justify-center py-24 text-teal-700">
            <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
            <span className="sr-only">{t('student.loading')}</span>
          </div>
        );
      case 'student-auth':
      case 'student-account':
        if (authLoading || roleLoading || isAdmin || ownedStoreId) {
          return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin" /></div>;
        }
        if (roleError) {
          return <p role="alert" className="mx-auto max-w-3xl px-4 py-10 text-rose-700">{t('admin.roleError')}</p>;
        }
        return isMember ? renderStudentAccount() : (
          <AuthPage student onAuthenticated={() => goTo('student-account')} onBack={() => goTo(selectedClass ? 'request' : 'browse')} />
        );
      case 'auth':
        return <AuthPage adminOnly onBack={() => goTo('browse')} />;
      case 'dashboard':
        if (authLoading || roleLoading) {
          return (
            <div className="flex justify-center py-24 text-stone-500">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          );
        }
        if (!user) return <AuthPage adminOnly onBack={() => goTo('browse')} />;
        if (!isAdmin && !ownedStoreId) {
          return (
            <section className="mx-auto max-w-xl space-y-4 px-4 py-12">
              <p role="alert" className="text-stone-700">{t(roleError ? 'admin.roleError' : 'admin.staffOnly')}</p>
              {isMember && (
                <button type="button" onClick={() => goTo('student-account')} className="font-semibold text-teal-700 underline">
                  {t('student.account')}
                </button>
              )}
            </section>
          );
        }
        return isAdmin
          ? <AdminDashboard
              onBack={() => {
                clearFilters();
                setBrowseMode('home');
                setLayout('list');
                goTo('browse');
                void fetchClasses();
              }}
              onPublicationChanged={() => void fetchClasses(true)}
            />
          : <StudioOwnerDashboard onBack={() => goTo('browse')} />;
      default:
        return renderHome();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-stone-900">
      <Header
        onLogoClick={() => {
          schoolAccountOrigin.current = null;
          clearFilters();
          setBrowseMode('home');
          setLayout('list');
          goTo('browse');
        }}
        onAdminClick={handleAccountClick}
        onMemberClick={() => goTo(isMember ? 'student-account' : 'student-auth')}
        onHowItWorks={() => {
          setView('browse');
          setScrollToResults('how-it-works');
        }}
        onListSchool={openListing}
        onBrowseClasses={() => {
          schoolAccountOrigin.current = null;
          schoolListFilters.current = null;
          clearFilters();
          setLayout('list');
          browseResults('categories');
          void fetchClasses(classes.length > 0 && !loadError);
        }}
        onBrowseSchools={handleBrowseSchools}
      />
      <main className="flex-1">{reviewCode ? <SchoolReviewForm code={reviewCode} /> : renderView()}</main>
      <Footer />
      <StudioListingModal open={listingOpen} onClose={() => setListingOpen(false)} />
    </div>
  );
}

function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <AccessibilityProvider>
          <AppContent />
        </AccessibilityProvider>
      </AuthProvider>
    </I18nProvider>
  );
}

export default App;
