import { isUnlimitedCapacity } from '@/lib/availability';
import { parseCapacity, parsePrice } from '@/lib/schoolPublish';
import { ScheduleAvailabilityInput, ScheduleCostInput, ScheduleDaysInput, ScheduleDayTimesInput } from '@/components/ScheduleInputs';
import { ANY_DAY, expandScheduleDays, scheduleDays } from '@/lib/listingForm';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Pencil, Trash2, Loader2, ArrowLeft, AlertCircle, X, Accessibility, MapPin, Check } from 'lucide-react';
import { supabase, type ClassItem, type Store, type Booking, type PreRegistration } from '@/lib/supabase';
import { CATEGORIES, CATEGORY_COLORS } from '@/lib/constants';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { StudioFormModal } from '@/components/StudioFormModal';
import { StudioCreateModal } from '@/components/StudioCreateModal';
import { AdminTeachersTab } from '@/components/AdminTeachersTab';
import { AdminWaitlistTab } from '@/components/AdminWaitlistTab';
import { AdminRequestsTab } from '@/components/AdminRequestsTab';
import { AdminBookingRequestsTab } from '@/components/AdminBookingRequestsTab';
import { groupSchools, combineSchoolSchedules, type SchoolGroup } from '@/lib/schoolGroups';
import { studioClassIds } from '@/lib/studioClassApproval';
import { geocodeAddress } from '@/lib/geocode';

type Props = {
  onBack: () => void;
  onPublicationChanged: () => void;
};

export function AdminDashboard({ onBack, onPublicationChanged }: Props) {
  const { user, signOut } = useAuth();
  const { t, tCat } = useI18n();
  const [tab, setTab] = useState<'classes' | 'trials' | 'enrollments' | 'studios' | 'teachers' | 'requests' | 'waitlist'>('classes');
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const schoolGroups = useMemo(() => [...groupSchools(stores).values()], [stores]);
  const studioIds = useMemo(() => studioClassIds(schoolGroups, classes), [classes, schoolGroups]);
  const manualPendingClasses = classes.filter((cls) => !cls.published_at && !studioIds.has(cls.id));
  const pendingSchoolGroups = schoolGroups.filter((group) => group.stores.some((store) => !store.published_at));
  const publishedSchoolGroups = schoolGroups.filter((group) => group.stores.some((store) => store.published_at));
  const publishedStoreIds = new Set(stores.filter((store) => store.published_at).map((store) => store.id));
  const [approvingClassId, setApprovingClassId] = useState<string | null>(null);
  const [requests, setRequests] = useState<PreRegistration[]>([]);
  const [rejectedRequests, setRejectedRequests] = useState<PreRegistration[]>([]);
  const [locating, setLocating] = useState<{ done: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [editingStore, setEditingStore] = useState<SchoolGroup | null>(null);
  const [showClassForm, setShowClassForm] = useState(false);
  const [showStudioForm, setShowStudioForm] = useState(false);
  const [approvingStoreId, setApprovingStoreId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [classesRes, bookingsRes, storesRes, requestsRes] = await Promise.all([
      supabase.from('classes').select('*, store:stores(*)').order('created_at', { ascending: false }),
      supabase.from('bookings').select('*').order('created_at', { ascending: false }),
      supabase.from('stores').select('*').order('created_at', { ascending: true }),
      supabase.from('pre_registrations').select('*').eq('role', 'store').is('approved_at', null).order('created_at', { ascending: false }),
    ]);
    if (requestsRes.data) {
      // rejected applications are kept (rejected_at is set) but are never shown as pending
      const all = requestsRes.data as PreRegistration[];
      setRequests(all.filter((r) => !r.rejected_at));
      setRejectedRequests(all.filter((r) => r.rejected_at));
    }
    if (classesRes.data) setClasses(classesRes.data as ClassItem[]);
    if (bookingsRes.data) setBookings(bookingsRes.data as Booking[]);
    if (storesRes.data) setStores(storesRes.data as Store[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 3000);
  };

  const handleApproveClass = async (item: ClassItem) => {
    setApprovingClassId(item.id);
    try {
      const result = await supabase.from('classes').update({ published_at: new Date().toISOString() })
        .eq('id', item.id).select('id');
      if (result.error || !result.data?.length) {
        alert(`${t('admin.errorSave')}${result.error ? ` (${result.error.message})` : ''}`);
        return;
      }
      await fetchData();
      onPublicationChanged();
      showFlash(t('admin.classPublished'));
    } finally {
      setApprovingClassId(null);
    }
  };

  const handleDeleteClass = async (cls: ClassItem) => {
    if (!confirm(t('admin.confirmDelete'))) return;
    const { error } = await supabase.from('classes').delete().eq('id', cls.id);
    if (error) {
      alert(t('admin.errorSave'));
      return;
    }
    setClasses((prev) => prev.filter((c) => c.id !== cls.id));
    showFlash(t('admin.deleted'));
  };

  const handleApproveStore = async (group: SchoolGroup) => {
    setApprovingStoreId(group.school.id);
    try {
      const { data, error } = await supabase
        .from('stores')
        .update({ published_at: new Date().toISOString() })
        .in('id', [...group.storeIds])
        .is('published_at', null)
        .select('id, published_at');

      if (error) {
        alert(`${t('admin.errorSave')} (${error.message})`);
        return;
      }
      if (data?.length) {
        const published = new Map(data.map((row) => [row.id, row.published_at]));
        setStores((current) => current.map((item) => published.has(item.id)
          ? { ...item, published_at: published.get(item.id) }
          : item));
        showFlash(t('admin.studioPublished'));
      } else {
        await fetchData();
        alert(t('admin.errorSave'));
      }
      onPublicationChanged();
    } finally {
      setApprovingStoreId(null);
    }
  };

  const handleDeleteStore = async (group: SchoolGroup) => {
    const message = group.stores.length > 1
      ? t('admin.confirmDeleteSchoolGroup', { name: group.school.name, count: group.stores.length })
      : t('admin.confirmDeleteStudio');
    if (!confirm(message)) return;
    const { data, error } = await supabase.from('stores').delete().in('id', [...group.storeIds]).select('id');
    // no error but no row deleted means the database silently refused the delete
    if (error || !data || data.length === 0) {
      alert(`${t('admin.errorSave')} (${error?.message ?? 'school was not deleted'})`);
      return;
    }
    const deleted = new Set(data.map((row) => row.id));
    setStores((prev) => prev.filter((s) => !deleted.has(s.id)));
    setClasses((prev) => prev.filter((c) => !deleted.has(c.store_id)));
    onPublicationChanged();
    showFlash(t('admin.studioDeleted'));
  };

  // Look up exact map locations for schools that don't have one yet
  const handleLocateAll = async () => {
    const targets = schoolGroups.filter((group) => group.stores.some((store) => !store.geocoded_at));
    if (targets.length === 0) return;
    let found = 0;
    setLocating({ done: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      const { school, stores: entries } = targets[i];
      const verified = entries.find((store) => store.geocoded_at && store.latitude != null && store.longitude != null);
      const point = verified ?? await geocodeAddress(school.address ?? '', school.area);
      if (point) {
        const { data } = await supabase
          .from('stores')
          .update({ latitude: point.latitude, longitude: point.longitude, geocoded_at: new Date().toISOString() })
          .in('id', entries.filter((store) => !store.geocoded_at).map((store) => store.id))
          .select('id');
        if (data?.length) found++;
      }
      setLocating({ done: i + 1, total: targets.length });
    }
    setLocating(null);
    await fetchData();
    onPublicationChanged();
    showFlash(t('admin.locateDone', { found, total: targets.length }));
  };

  const handleSaveClass = () => {
    setShowClassForm(false);
    setEditingClass(null);
    fetchData();
    showFlash(t('admin.saved'));
  };

  const handleSaveStore = () => {
    setShowStudioForm(false);
    setEditingStore(null);
    fetchData();
    showFlash(t('admin.studioSaved'));
    onPublicationChanged();
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-stone-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-teal-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> {t('admin.backToSite')}
          </button>
          <div className="flex items-center gap-3">
            <span className="text-sm text-stone-400 hidden sm:block">{user?.email}</span>
            <button
              onClick={signOut}
              className="px-3 py-1.5 rounded-lg border border-stone-200 text-sm font-semibold text-stone-600 hover:border-rose-300 hover:text-rose-600 transition-colors"
            >
              {t('auth.signOut')}
            </button>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-stone-900 mb-1">{t('admin.title')}</h1>
        <p className="text-stone-500 text-sm mb-6">{t('admin.subtitle')}</p>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6 border-b border-stone-200 overflow-x-auto">
          <button
            onClick={() => setTab('classes')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              tab === 'classes'
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            {t('admin.classes')} ({manualPendingClasses.length})
          </button>
          <button
            onClick={() => setTab('studios')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              tab === 'studios'
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            {t('admin.studios')} ({pendingSchoolGroups.length})
          </button>
          <button
            onClick={() => setTab('requests')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              tab === 'requests'
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            {t('admin.requests')} ({requests.length})
          </button>
          <button
            onClick={() => setTab('teachers')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              tab === 'teachers'
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            {t('admin.teachers')}
          </button>
          <button
            onClick={() => setTab('trials')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              tab === 'trials'
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            {t('admin.trials')} ({bookings.filter((b) => b.kind === 'trial' && b.status === 'pending').length})
          </button>
          <button
            onClick={() => setTab('enrollments')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              tab === 'enrollments'
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            {t('admin.enrollments')} ({bookings.filter((b) => b.kind === 'enrollment' && b.status === 'pending').length})
          </button>
          <button
            onClick={() => setTab('waitlist')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              tab === 'waitlist'
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            {t('admin.waitlist')}
          </button>
        </div>

        {flash && (
          <div className="mb-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium">
            {flash}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-stone-400">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : tab === 'classes' ? (
          <ClassesTab
            classes={manualPendingClasses}
            publishedStoreIds={publishedStoreIds}
            onApprove={handleApproveClass}
            approvingClassId={approvingClassId}
            onAdd={() => { setEditingClass(null); setShowClassForm(true); }}
            onEdit={(cls) => { setEditingClass(cls); setShowClassForm(true); }}
            onDelete={handleDeleteClass}
            tCat={tCat}
          />
        ) : tab === 'studios' ? (
          <StudiosTab
            groups={pendingSchoolGroups}
            publishedGroups={publishedSchoolGroups}
            canLocate={stores.some((store) => !store.geocoded_at)}
            classes={classes}
            onAdd={() => { setEditingStore(null); setShowStudioForm(true); }}
            onEdit={(store) => { setEditingStore(store); setShowStudioForm(true); }}
            onDelete={handleDeleteStore}
            onApprove={handleApproveStore}
            approvingStoreId={approvingStoreId}
            onLocateAll={handleLocateAll}
            locating={locating}
            tCat={tCat}
          />
        ) : tab === 'requests' ? (
          <AdminRequestsTab requests={requests} rejected={rejectedRequests} onChanged={() => {
            void fetchData();
            onPublicationChanged();
          }} onFlash={showFlash} />
        ) : tab === 'teachers' ? (
          <AdminTeachersTab />
        ) : tab === 'waitlist' ? (
          <AdminWaitlistTab />
        ) : (
          <AdminBookingRequestsTab
            kind={tab === 'trials' ? 'trial' : 'enrollment'}
            bookings={bookings}
            classes={classes}
            onChanged={fetchData}
            onFlash={showFlash}
          />
        )}
      </div>

      {showClassForm && (
        <ClassFormModal
          cls={editingClass}
          stores={stores}
          onClose={() => { setShowClassForm(false); setEditingClass(null); }}
          onSaved={handleSaveClass}
        />
      )}

      {showStudioForm && !editingStore && (
        <StudioCreateModal
          onClose={() => { setShowStudioForm(false); }}
          onSaved={handleSaveStore}
        />
      )}

      {showStudioForm && editingStore && (
        <StudioFormModal
          store={editingStore.school}
          schoolGroup={editingStore}
          schoolClasses={classes.filter((cls) => editingStore.storeIds.has(cls.store_id))}
          onClassPublished={() => {
            void fetchData();
            onPublicationChanged();
          }}
          showOwnerInvite
          onClose={() => { setShowStudioForm(false); setEditingStore(null); }}
          onSaved={handleSaveStore}
        />
      )}
    </div>
  );
}

function ClassesTab({
  classes,
  publishedStoreIds,
  onApprove,
  approvingClassId,
  onAdd,
  onEdit,
  onDelete,
  tCat,
}: {
  classes: ClassItem[];
  publishedStoreIds: Set<string>;
  onApprove: (item: ClassItem) => void;
  approvingClassId: string | null;
  onAdd?: () => void;
  onEdit: (cls: ClassItem) => void;
  onDelete: (cls: ClassItem) => void;
  tCat: (cat: string) => string;
}) {
  const { t } = useI18n();

  return (
    <div>
      {onAdd && (
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors mb-4"
        >
          <Plus className="w-4 h-4" /> {t('admin.addClass')}
        </button>
      )}

      {classes.length === 0 ? (
        <div className="text-center py-16 text-stone-400">
          <p className="text-sm">{t('admin.noPendingClasses')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {classes.map((cls) => {
            const color = CATEGORY_COLORS[cls.category] ?? 'bg-stone-100 text-stone-700';
            return (
              <div key={cls.id} className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden flex">
                <div className="w-24 h-24 flex-shrink-0 bg-stone-100">
                  {cls.image_url ? (
                    <img src={cls.image_url} alt={cls.title} className="w-full h-full object-cover" />
                  ) : null}
                </div>
                <div className="flex-1 p-3.5 flex flex-col justify-between">
                  <div>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold mb-1 ${color}`}>
                      {tCat(cls.category)}
                    </span>
                    <h3 className="text-sm font-bold text-stone-900 leading-tight">{cls.title}</h3>
                    <p className="text-xs text-stone-400 mt-0.5">{cls.store?.name}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 mt-2">
                    <ClassApproval
                      schoolPublished={publishedStoreIds.has(cls.store_id)}
                      busy={approvingClassId === cls.id}
                      disabled={approvingClassId !== null}
                      onApprove={() => onApprove(cls)}
                    />
                    <button
                      onClick={() => onEdit(cls)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-stone-600 hover:bg-stone-100 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" /> {t('admin.edit')}
                    </button>
                    <button
                      onClick={() => onDelete(cls)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-500 hover:bg-rose-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> {t('admin.deleteClass')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClassApproval({ schoolPublished, busy, disabled, onApprove }: {
  schoolPublished: boolean;
  busy: boolean;
  disabled: boolean;
  onApprove: () => void;
}) {
  const { t } = useI18n();
  if (!schoolPublished) return <p className="px-2.5 py-1.5 text-xs text-stone-500">{t('admin.approveSchoolFirst')}</p>;
  return (
    <button type="button" onClick={onApprove} disabled={disabled}
      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-60">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      {t('admin.approveStudio')}
    </button>
  );
}

function StudiosTab({
  groups,
  publishedGroups,
  canLocate,
  classes,
  onAdd,
  onEdit,
  onDelete,
  onApprove,
  approvingStoreId,
  onLocateAll,
  locating,
  tCat,
}: {
  groups: SchoolGroup[];
  publishedGroups: SchoolGroup[];
  canLocate: boolean;
  classes: ClassItem[];
  onAdd: () => void;
  onEdit: (group: SchoolGroup) => void;
  onDelete: (group: SchoolGroup) => void;
  onApprove: (group: SchoolGroup) => void;
  approvingStoreId: string | null;
  onLocateAll: () => void;
  locating: { done: number; total: number } | null;
  tCat: (cat: string) => string;
}) {
  const { t, tArea } = useI18n();
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> {t('admin.addStudio')}
        </button>
        {canLocate && (
          <button
            onClick={onLocateAll}
            disabled={locating !== null}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-sm font-semibold hover:bg-stone-50 transition-colors disabled:opacity-60"
          >
            {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            {locating ? t('admin.locating', { done: locating.done, total: locating.total }) : t('admin.locateAll')}
          </button>
        )}
      </div>

      <h2 className="mb-3 text-base font-semibold text-stone-900">{t('admin.studiosAwaitingApproval')}</h2>
      {groups.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-stone-500">
          <p className="text-sm">{t('admin.noPendingStudios')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {groups.map((group) => {
            const store = group.school;
            const lessonNames = new Set([
              ...classes.filter((cls) => group.storeIds.has(cls.store_id)).map((cls) => cls.title),
              ...combineSchoolSchedules(group.stores).rows.map((row) => row.lesson),
            ].map((name) => name.trim().toLowerCase()).filter(Boolean));
            return (
              <div key={store.id} className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden flex">
                <div className="w-24 h-24 flex-shrink-0 bg-stone-100">
                  {store.image_url ? (
                    <img src={store.image_url} alt={store.name} className="w-full h-full object-cover" />
                  ) : null}
                </div>
                <div className="flex-1 p-3.5 flex flex-col justify-between">
                  <div>
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold mb-1 bg-stone-100 text-stone-700">
                      {tCat(store.category)}
                    </span>
                    <h3 className="text-sm font-bold text-stone-900 leading-tight">{store.name}</h3>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {tArea(store.area)} · {lessonNames.size} {t('admin.classes').toLowerCase()}
                    </p>
                    {store.disability_access && (
                      <span className="inline-flex items-center gap-1 mt-1 text-xs text-emerald-600">
                        <Accessibility className="w-3 h-3" /> {t('detail.accessible')}
                      </span>
                    )}
                    {!store.geocoded_at && (
                      <p className="text-xs text-amber-600 mt-1">
                        {store.latitude == null ? t('admin.notOnMap') : t('admin.approxLocation')}
                      </p>
                    )}
                    {store.school_manager && (
                      <p className="text-xs text-stone-500 mt-1">{t('detail.schoolManager')}: {store.school_manager}</p>
                    )}
                    {store.accessibility_info && (
                      <p className="text-xs text-stone-500 mt-0.5">{store.accessibility_info}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 mt-2">
                    <button
                      type="button"
                      onClick={() => onApprove(group)}
                      disabled={approvingStoreId !== null}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-60 transition-colors"
                    >
                      {approvingStoreId === store.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Check className="w-3.5 h-3.5" />}
                      {t('admin.approveStudio')}
                    </button>
                    <button
                      onClick={() => onEdit(group)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-stone-600 hover:bg-stone-100 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" /> {t('admin.edit')}
                    </button>
                    <button
                      onClick={() => onDelete(group)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-500 hover:bg-rose-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> {t('admin.deleteClass')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-stone-900">
          {t('admin.publishedSchools')} ({publishedGroups.length})
        </h2>
        {publishedGroups.length === 0 ? (
          <p className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-500">
            {t('admin.noPublishedSchools')}
          </p>
        ) : (
          <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
            {publishedGroups.map((group) => (
              <li key={group.school.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-stone-900">{group.school.name}</p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {[tArea(group.school.area), group.school.address].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button type="button" onClick={() => onEdit(group)}
                  aria-label={`${t('admin.editSchool')}: ${group.school.name}`}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50">
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('admin.edit')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ClassFormModal({
  cls,
  stores,
  onClose,
  onSaved,
}: {
  cls: ClassItem | null;
  stores: Store[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, tCat } = useI18n();
  const [scheduleDay, setScheduleDay] = useState('');
  const [scheduleTimes, setScheduleTimes] = useState<Record<string, string>>({});
  const timing = { day: scheduleDay, time: '', dayTimes: scheduleTimes };
  const sessions = expandScheduleDays([timing]);
  const canAddSession = scheduleDays(scheduleDay).length > 0 && sessions.every(({ day, time }) => day === ANY_DAY ||
    /^(?:[01][0-9]|2[0-3]):[0-5][0-9](?:-(?:[01][0-9]|2[0-3]):[0-5][0-9])?$/.test(time));
  const [form, setForm] = useState({
    store_id: cls?.store_id ?? stores[0]?.id ?? '',
    title: cls?.title ?? '',
    description: cls?.description ?? '',
    category: cls?.category ?? 'Basketball',
    instructor: cls?.instructor ?? '',
    age_min: cls?.age_min?.toString() ?? '6',
    age_max: cls?.age_max?.toString() ?? '',
    cost: cls?.schedule_cost || cls?.price_eur?.toString() || '20',
    duration_minutes: cls?.duration_minutes?.toString() ?? '60',
    capacity: cls && isUnlimitedCapacity(cls.capacity) ? 'unlimited' : cls?.capacity?.toString() ?? '',
    weekly_schedule: cls?.weekly_schedule ?? '',
    image_url: cls?.image_url ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      store_id: form.store_id,
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      instructor: form.instructor.trim(),
      age_min: parseInt(form.age_min, 10) || 4,
      age_max: form.age_max ? parseInt(form.age_max, 10) : null,
      price_eur: parsePrice(form.cost).value,
      schedule_cost: form.cost.trim() || null,
      duration_minutes: parseInt(form.duration_minutes, 10) || 60,
      capacity: parseCapacity(form.capacity).value,
      weekly_schedule: form.weekly_schedule.trim(),
      image_url: form.image_url.trim() || null,
    };

    let errMsg = '';
    if (cls) {
      const res = await supabase.from('classes').update(payload).eq('id', cls.id);
      errMsg = res.error?.message ?? '';
    } else {
      const res = await supabase.from('classes').insert([payload]).select('id').single();
      errMsg = res.error?.message ?? (res.data ? '' : 'no id returned');
    }

    if (errMsg) {
      setError(`${t('admin.errorSave')} (${errMsg})`);
      setSaving(false);
      return;
    }
    onSaved();
  };

  const inputCls = 'w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-stone-800 placeholder:text-stone-400 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all text-sm';
  const labelCls = 'block text-sm font-medium text-stone-700 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-stone-900">
            {cls ? t('admin.editClass') : t('admin.addClass')}
          </h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          {/* Store selector */}
          <div>
            <label className={labelCls}>{t('form.category')}</label>
            <select
              value={form.store_id}
              onChange={(e) => setForm({ ...form, store_id: e.target.value })}
              required
              className={inputCls}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name} — {s.area}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>{t('form.title')}</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>{t('form.description')}</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required rows={3} className={`${inputCls} resize-none`} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t('form.category')}</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls}>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{tCat(cat)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t('form.instructor')}</label>
              <input value={form.instructor} onChange={(e) => setForm({ ...form, instructor: e.target.value })} required className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t('form.ageMin')}</label>
              <input type="number" value={form.age_min} onChange={(e) => setForm({ ...form, age_min: e.target.value })} required min={0} max={120} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t('form.ageMax')}</label>
              <input type="number" value={form.age_max} onChange={(e) => setForm({ ...form, age_max: e.target.value })} min={0} max={120} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t('form.price')}</label>
              <ScheduleCostInput value={form.cost} onChange={(cost) => setForm({ ...form, cost })} required className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t('form.duration')}</label>
              <input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} required min={1} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t('form.capacity')}</label>
              <ScheduleAvailabilityInput numeric value={form.capacity} onChange={(capacity) => setForm({ ...form, capacity })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t('form.schedule')}</label>
              <input value={form.weekly_schedule} onChange={(e) => setForm({ ...form, weekly_schedule: e.target.value })} required placeholder="Mon & Wed 17:00" className={inputCls} />
            </div>
          </div>

          <details className="rounded-xl border border-stone-200 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-teal-700">{t('sched.addSession')}</summary>
            <div className="mt-2 grid items-start gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <ScheduleDaysInput value={scheduleDay} onChange={setScheduleDay} className={inputCls} />
              <ScheduleDayTimesInput timing={timing} onChange={setScheduleTimes} className={inputCls} />
              <button type="button" disabled={!canAddSession}
                className="rounded-xl bg-teal-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => {
                  const entries = sessions.map(({ day, time }) => `${day} ${time}`.trim());
                  setForm((current) => ({
                    ...current,
                    weekly_schedule: [...new Set([...current.weekly_schedule.split(',').map((entry) => entry.trim()).filter(Boolean), ...entries])].join(', '),
                  }));
                  setScheduleDay('');
                  setScheduleTimes({});
                }}
              >
                {t('sched.addSession')}
              </button>
            </div>
          </details>


          <div>
            <label className={labelCls}>{t('form.imageUrl')}</label>
            <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." className={inputCls} />
          </div>

          {error && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-teal-600 text-white font-semibold text-sm hover:bg-teal-700 active:scale-[0.98] transition-all shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('form.save')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 rounded-xl border border-stone-200 text-stone-600 font-semibold text-sm hover:bg-stone-50 transition-colors"
            >
              {t('form.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
