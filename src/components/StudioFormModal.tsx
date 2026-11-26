import { MonthlyPackageEditor } from '@/components/MonthlyPackageEditor';
import { useState } from 'react';
import { Loader2, AlertCircle, X } from 'lucide-react';
import { supabase, type ClassItem, type Store } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { geocodeAddress } from '@/lib/geocode';
import { SchoolListingFields } from '@/components/SchoolListingFields';
import { combineScheduleDays, emptyListingValues, expandScheduleDays, type ListingFormValues } from '@/lib/listingForm';
import { studioInputCls, studioLabelCls } from '@/lib/studioForm';
import { combineSchoolSchedules, type SchoolGroup } from '@/lib/schoolGroups';
import { publishStudioClass, studioClassIds, studioScheduleDrafts } from '@/lib/studioClassApproval';
import { localizeScheduleDays, scheduleRowsForEditing } from '@/lib/scheduleDisplay';
import { StudioScheduleEditor, type StudioScheduleRow } from '@/components/StudioScheduleEditor';

type Props = {
  store: Store | null;
  schoolGroup?: SchoolGroup;
  schoolClasses?: ClassItem[];
  showOwnerInvite?: boolean;
  onClassPublished?: () => void;
  onClose: () => void;
  onSaved: () => void;
};

const toFormValues = (store: Store | null): ListingFormValues => ({
  ...emptyListingValues(),
  ...(store
    ? {
        name: store.name,
        description: store.description ?? '',
        category: store.category,
        area: store.area,
        address: store.address ?? '',
        phone: store.phone ?? '',
        email: store.email ?? '',
        image_url: store.image_url ?? '',
        photo_url_1: store.photo_url_1 ?? '',
        photo_url_2: store.photo_url_2 ?? '',
        school_manager: store.school_manager ?? '',
        disability_access: store.disability_access ?? false,
        accessibility_info: store.accessibility_info ?? '',
      }
    : {}),
  schedule: [],
});

export function StudioFormModal({ store, schoolGroup, schoolClasses, onClassPublished, showOwnerInvite = false, onClose, onSaved }: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState<ListingFormValues>(() => toFormValues(store));
  const [rateInfo, setRateInfo] = useState(store?.rate_info ?? '');
  // The schedule starts as an editable table (read from schedule_rows or from the saved
  // weekly_schedule); text that cannot be turned into rows is kept, never dropped.
  const [loaded] = useState(() => {
    if (!schoolGroup) return scheduleRowsForEditing(store ?? {});
    const { rows, notes } = combineSchoolSchedules(schoolGroup.stores);
    return { rows, text: notes.join('\n\n') };
  });
  const [scheduleRows, setScheduleRows] = useState<StudioScheduleRow[]>(() =>
    combineScheduleDays(loaded.rows).map((r) => ({ ...r, id: crypto.randomUUID() }))
  );
  const [legacyText, setLegacyText] = useState(loaded.text);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [mapCoordinates, setMapCoordinates] = useState('');
  const [uploadCount, setUploadCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [publishedKeys, setPublishedKeys] = useState<Set<string>>(() => new Set());
  const [approvingKey, setApprovingKey] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const savedClasses = schoolClasses ?? [];
  const studioIds = onClassPublished && schoolGroup
    ? studioClassIds([schoolGroup], savedClasses)
    : new Set<string>();
  const drafts = onClassPublished && schoolGroup ? studioScheduleDrafts(schoolGroup, savedClasses) : [];

  const approve = async (key: string, item: Parameters<typeof publishStudioClass>[0]) => {
    if (!onClassPublished || approvingKey) return;
    setApprovingKey(key);
    setApprovalError(null);
    try {
      const result = await publishStudioClass(item);
      if (result.error) {
        setApprovalError(`${t('admin.errorSave')} (${result.error.message})`);
        return;
      }
      if (!result.data?.length) {
        setApprovalError(t('admin.classApprovalNoUpdate'));
        return;
      }
      setPublishedKeys((previous) => new Set(previous).add(key));
      onClassPublished();
    } catch (err) {
      setApprovalError(err instanceof Error && err.message
        ? `${t('admin.errorSave')} (${err.message})`
        : t('admin.errorSave'));
    } finally {
      setApprovingKey(null);
    }
  };

  const approvalButton = (key: string, item: Parameters<typeof publishStudioClass>[0]) => (
    <button type="button" disabled={approvingKey !== null || saving} onClick={() => void approve(key, item)}
      className="rounded-lg px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-60">
      {approvingKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : t('admin.approveStudio')}
    </button>
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || uploadCount > 0) return;
    setSaving(true);
    setError(null);

    const address = form.address.trim();
    const addressChanged = !store || (store.address ?? '').trim() !== address || store.area !== form.area;
    let geo: Record<string, string | number | null> = {};
    if (mapCoordinates.trim()) {
      const point = mapCoordinates.trim().match(/^([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)$/);
      const latitude = Number(point?.[1]);
      const longitude = Number(point?.[2]);
      if (!point || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        setError(t('form.invalidMapCoordinates'));
        setSaving(false);
        return;
      }
      geo = { latitude, longitude, geocoded_at: new Date().toISOString() };
    } else if (addressChanged || !store?.geocoded_at) {
      const point = await geocodeAddress(address, form.area);
      if (point) {
        geo = { latitude: point.latitude, longitude: point.longitude, geocoded_at: new Date().toISOString() };
      } else if (addressChanged) {
        // never keep a location that belongs to the old address
        geo = { latitude: null, longitude: null, geocoded_at: null };
      }
    }

    const savedRows = expandScheduleDays(scheduleRows)
      .map((r) => {
        const row: Record<string, string> = {
          lesson: r.lesson.trim(),
          day: r.day.trim(),
          time: r.time.trim(),
          ages: r.ages.trim(),
          cost: r.cost.trim(),
          availability: r.availability.trim(),
        };
        if (r.duration.trim()) row.duration = r.duration.trim();
        return row;
      })
      .filter((r) => Object.values(r).some(Boolean));

    const notes = legacyText.trim();
    const weeklySchedule = savedRows.length
      ? JSON.stringify(notes ? { rows: savedRows, notes } : savedRows)
      : notes || null;

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      category: form.category,
      area: form.area,
      address,
      phone: form.phone.trim(),
      email: form.email.trim(),
      image_url: form.image_url || null,
      photo_url_1: form.photo_url_1 || null,
      photo_url_2: form.photo_url_2 || null,
      school_manager: form.school_manager.trim() || null,
      disability_access: form.disability_access,
      accessibility_info: form.accessibility_info.trim() || null,
      rate_info: rateInfo.trim() || null,
      weekly_schedule: weeklySchedule,
      ...geo,
    };

    let res;
    if (store) {
      const ids = schoolGroup ? [...schoolGroup.storeIds] : [store.id];
      const result = await supabase.from('stores').update(payload).in('id', ids).select('id');
      if (!result.error && result.data?.length !== ids.length) {
        setError(t('admin.errorSave'));
        setSaving(false);
        return;
      }
      res = result;
    } else {
      res = await supabase.from('stores').insert([payload]);
    }

    if (res.error) {
      setError(`${t('admin.errorSave')} (${res.error.message})`);
      setSaving(false);
      return;
    }

    const invitedEmail = ownerEmail.trim().toLowerCase();
    if (showOwnerInvite && store && invitedEmail) {
      const inviteRes = await supabase
        .from('studio_owner_invites')
        .upsert({ email: invitedEmail, store_id: store.id }, { onConflict: 'email' });
      if (inviteRes.error) {
        setError(t('admin.errorSave'));
        setSaving(false);
        return;
      }
    }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-stone-900">
            {store ? t('admin.editStudio') : t('admin.addStudio')}
          </h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          <SchoolListingFields
            values={form}
            onChange={setForm}
            onImageUploadingChange={(uploading) => setUploadCount((count) => count + (uploading ? 1 : -1))}
            showPrivacy={false}
            showSchedule={false}
          />

          <div>
            <label className={studioLabelCls}>{t('form.rateInfo')}</label>
            <input value={rateInfo} onChange={(e) => setRateInfo(e.target.value)} placeholder={t('form.rateInfoPh')} className={studioInputCls} />
          </div>
          <div>
            <label className={studioLabelCls}>{t('form.studioSchedule')}</label>
            <StudioScheduleEditor rows={scheduleRows} onChange={setScheduleRows} />
            {legacyText && (
              <div className="mt-3">
                <textarea value={legacyText} onChange={(e) => setLegacyText(e.target.value)} className={studioInputCls} />
                <p className="text-xs text-stone-400 mt-1.5">{t('form.legacyScheduleNote')}</p>
              </div>
            )}
          </div>

          {schoolGroup && (
            <label className="block">
              <span className={studioLabelCls}>{t('form.mapCoordinates')}</span>
              <input
                value={mapCoordinates}
                onChange={(event) => setMapCoordinates(event.target.value)}
                placeholder={store?.latitude != null && store.longitude != null && store.geocoded_at
                  ? `${store.latitude}, ${store.longitude}`
                  : '37.9700, 23.7500'}
                className={studioInputCls}
              />
            </label>
          )}

          {(savedClasses.length > 0 || drafts.length > 0) && (
            <div>
              <h3 className={studioLabelCls}>{t('admin.classes')}</h3>
              <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200">
                {savedClasses.map((cls) => {
                  const source = schoolGroup?.stores.find((entry) => entry.id === cls.store_id);
                  const published = Boolean(cls.published_at || publishedKeys.has(cls.id));
                  return (
                    <li key={cls.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm text-stone-700">
                      <span>
                        <span className="font-medium">{cls.title}</span>
                        {cls.weekly_schedule && cls.weekly_schedule !== '-' && (
                          <span className="ml-2 text-stone-500">{localizeScheduleDays(cls.weekly_schedule, t)}</span>
                        )}
                      </span>
                      {onClassPublished && studioIds.has(cls.id) && (published ? (
                        <span className="text-xs font-semibold text-emerald-700">{t('admin.studioPublishedStatus')}</span>
                      ) : source?.published_at ? approvalButton(cls.id, { ...cls, store: source }) : null)}
                      {onClassPublished && <MonthlyPackageEditor cls={cls} onSaved={onClassPublished} />}
                    </li>
                  );
                })}
                {drafts.map((draft) => (
                  <li key={draft.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm text-stone-700">
                    <span className="font-medium">{draft.lesson.title}</span>
                    {publishedKeys.has(draft.key) ? (
                      <span className="text-xs font-semibold text-emerald-700">{t('admin.studioPublishedStatus')}</span>
                    ) : approvalButton(draft.key, draft)}
                  </li>
                ))}
              </ul>
              {approvalError && <p role="alert" className="mt-2 text-sm text-rose-700">{approvalError}</p>}
            </div>
          )}

          {showOwnerInvite && store && (
            <div>
              <label className={studioLabelCls}>{t('form.ownerEmail')}</label>
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="owner@example.com"
                className={studioInputCls}
              />
              <p className="text-xs text-stone-400 mt-1.5">{t('form.ownerEmailHelp')}</p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving || uploadCount > 0 || approvingKey !== null}
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
