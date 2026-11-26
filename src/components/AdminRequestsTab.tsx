import { localizeLessonCost } from '@/lib/listingForm';
import { isUnlimitedAvailability, isUnlimitedCapacity } from '@/lib/availability';
import { useRef, useState } from 'react';
import {
  Check,
  Loader2,
  Trash2,
  MapPin,
  Mail,
  Phone,
  User,
  Accessibility,
  RotateCcw,
  AlertCircle,
  AlertTriangle,
  Calendar,
  Pencil,
} from 'lucide-react';
import { supabase, type PreRegistration } from '@/lib/supabase';
import { CATEGORIES } from '@/lib/constants';
import { useI18n } from '@/lib/i18n';
import { geocodeAddress } from '@/lib/geocode';
import { schoolApplicationPhotoUrl } from '@/lib/studioImageUpload';
import { planClasses, scheduledClassFields, requestScheduleRows, type PlannedClass } from '@/lib/schoolPublish';
import { StudioRequestEditModal } from '@/components/StudioRequestEditModal';

type Props = {
  requests: PreRegistration[];
  rejected?: PreRegistration[];
  onChanged: () => void;
  onFlash: (message: string) => void;
};

const STALE_EMAIL_MS = 5 * 60 * 1000;

type EmailState = 'sent' | 'failed' | 'sending' | 'none';

function emailState(req: PreRegistration): EmailState {
  const status = req.email_status;
  if (status === 'sent') return 'sent';
  if (status === 'failed') return 'failed';
  if (status === 'pending' || status === 'sending') {
    // still waiting after 5 minutes: treat as not sent so it can be resent
    return Date.now() - new Date(req.created_at).getTime() > STALE_EMAIL_MS ? 'failed' : 'sending';
  }
  return 'none';
}

function agesText(c: PlannedClass): string {
  return c.age_max == null ? `${c.age_min}+` : `${c.age_min}–${c.age_max}`;
}

function Detail({ icon: Icon, label, children }: { icon?: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      {Icon && <Icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-stone-400" />}
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">{label}</p>
        <div className="text-stone-700 break-words">{children}</div>
      </div>
    </div>
  );
}

export function AdminRequestsTab({ requests, rejected = [], onChanged, onFlash }: Props) {
  const { t, tCat, tArea, lang } = useI18n();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingReq, setEditingReq] = useState<PreRegistration | null>(null);
  const label = (key: string) => t(key).replace(/\s*\*$/, '');

  const approvingRef = useRef(false);

  const approveRequest = async (req: PreRegistration) => {
    setBusyId(req.id);

    const name = (req.name ?? '').trim();
    const address = (req.address ?? '').trim();
    const area = req.area ?? '';
    const category = req.category || CATEGORIES[0];
    const description = (req.description ?? '').trim();
    const cover = schoolApplicationPhotoUrl(req.image_url);
    const planned = planClasses(requestScheduleRows(req));

    // If an earlier attempt for this same application already created the school
    // (for example the final save failed), reuse that school instead of creating a copy.
    const found = await supabase
      .from('stores')
      .select('id')
      .eq('name', name)
      .eq('email', req.email)
      .eq('address', address)
      .eq('area', area)
      .order('created_at', { ascending: true })
      .limit(1);
    if (found.error) {
      alert(`${t('admin.errorSave')} (${found.error.message})`);
      setBusyId(null);
      return;
    }
    const existingId: string | null = found.data?.[0]?.id ?? null;

    const point = existingId ? null : await geocodeAddress(address, area);

    // 1) prepare the school (skipped when it already exists)
    let storeId: string | null = existingId;
    const created = !existingId;
    if (!storeId) {
      const { data, error } = await supabase
        .from('stores')
        .insert([
          {
            name,
            description,
            category,
            area,
            address,
            phone: req.phone ?? '',
            email: req.email,
            image_url: cover,
            photo_url_1: schoolApplicationPhotoUrl(req.photo_url_1),
            photo_url_2: schoolApplicationPhotoUrl(req.photo_url_2),
            school_manager: req.school_manager,
            disability_access: req.disability_access ?? false,
            accessibility_info: req.accessibility_info,
            rate_info: req.rate_info,
            weekly_schedule: req.weekly_schedule,
            latitude: point?.latitude ?? null,
            longitude: point?.longitude ?? null,
            geocoded_at: point ? new Date().toISOString() : null,
          },
        ])
        .select('id')
        .single();

      if (error || !data) {
        alert(`${t('admin.errorSave')} (${error?.message ?? 'no id returned'})`);
        setBusyId(null);
        return;
      }
      storeId = data.id;
    }
    const sid = storeId as string;

    // 2) prepare its classes (if this fails, undo the school so nothing is half-published)
    // A reused school only gets classes if it has none yet, so classes are never doubled.
    let needClasses = planned.length > 0;
    if (needClasses && !created) {
      const have = await supabase.from('classes').select('id', { count: 'exact', head: true }).eq('store_id', sid);
      if (have.error) {
        alert(`${t('admin.errorSave')} (${have.error.message})`);
        setBusyId(null);
        return;
      }
      needClasses = (have.count ?? 0) === 0;
    }
    if (needClasses) {
      const classes = await supabase.from('classes').insert(
        planned.map((c) => ({
          store_id: sid,
          ...scheduledClassFields(sid, c),
          title: c.title,
          description: description || `${c.title} - ${name}`,
          category,
          instructor: name,
          age_min: c.age_min,
          age_max: c.age_max,
          price_eur: c.price_eur,
          duration_minutes: c.duration_minutes,
          capacity: c.capacity,
          weekly_schedule: c.weekly_schedule || '-',
          image_url: cover,
        }))
      );
      if (classes.error) {
        if (created) await supabase.from('stores').delete().eq('id', sid);
        alert(`${t('admin.errorSave')} (${classes.error.message})`);
        setBusyId(null);
        return;
      }
    }

    // Publish the prepared school and approve the application in one transaction.
    const { error: publishError } = await supabase.rpc('publish_school_application', {
      application_id: req.id,
      school_id: sid,
    });
    if (publishError) {
      alert(`${t('admin.errorSave')} (${publishError.message})`);
      setBusyId(null);
      return;
    }

    setBusyId(null);
    onFlash(
      t(point || !created ? 'admin.requestApproved' : 'admin.requestApprovedNoLocation', { count: planned.length })
    );
    onChanged();
  };

  const handleApprove = async (req: PreRegistration) => {
    if (approvingRef.current) return;
    approvingRef.current = true;
    try {
      await approveRequest(req);
    } finally {
      approvingRef.current = false;
    }
  };

  const handleReject = async (req: PreRegistration) => {
    if (!confirm(t('admin.confirmReject'))) return;
    setBusyId(req.id);
    // keep the application, but mark it rejected so it never appears as pending or public
    const { data, error } = await supabase
      .from('pre_registrations')
      .update({ rejected_at: new Date().toISOString() })
      .eq('id', req.id)
      .select('id');
    setBusyId(null);
    if (error || !data || data.length === 0) {
      alert(`${t('admin.errorSave')} (${error?.message ?? 'application was not updated'})`);
      return;
    }
    onFlash(t('admin.requestRejected'));
    onChanged();
  };

  const handleResend = async (req: PreRegistration) => {
    setBusyId(req.id);
    // the email is sent when the status CHANGES to 'pending', so go through 'failed' first if needed
    if (req.email_status !== 'failed') {
      await supabase.from('pre_registrations').update({ email_status: 'failed' }).eq('id', req.id);
    }
    const { error } = await supabase.from('pre_registrations').update({ email_status: 'pending' }).eq('id', req.id);
    setBusyId(null);
    if (error) {
      alert(t('admin.errorSave'));
      return;
    }
    onFlash(t('admin.req.resent'));
    onChanged();
  };

  const rejectedList =
    rejected.length > 0 ? (
      <div className="mt-8">
        <h3 className="text-sm font-semibold text-stone-500 mb-2">
          {t('admin.req.rejectedTitle')} ({rejected.length})
        </h3>
        <ul className="space-y-2">
          {rejected.map((r) => (
            <li key={r.id} className="bg-white rounded-xl border border-stone-200 px-4 py-3 text-xs text-stone-600">
              <span className="font-semibold text-stone-800">{r.name}</span> · {r.email} · {t('admin.req.rejectedOn')}:{' '}
              {new Date(r.rejected_at ?? r.created_at).toLocaleString(lang === 'el' ? 'el-GR' : 'en-GB', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  if (requests.length === 0) {
    return (
      <>
        <div className="text-center py-16 text-stone-400">
          <p className="text-sm">{t('admin.requestsEmpty')}</p>
        </div>
        {rejectedList}
      </>
    );
  }

  return (
    <>
    <div className="space-y-4">
      {editingReq && (
        <StudioRequestEditModal
          key={editingReq.id}
          request={editingReq}
          onClose={() => setEditingReq(null)}
          onSaved={() => {
            setEditingReq(null);
            onFlash(t('admin.studioSaved'));
            onChanged();
          }}
        />
      )}
      {requests.map((req) => {
        const busy = busyId === req.id;
        const planned = planClasses(requestScheduleRows(req));
        const photos = [req.image_url, req.photo_url_1, req.photo_url_2]
          .map((u) => schoolApplicationPhotoUrl(u))
          .filter((u): u is string => !!u);
        const email = emailState(req);
        const submitted = new Date(req.created_at).toLocaleString(lang === 'el' ? 'el-GR' : 'en-GB', {
          dateStyle: 'medium',
          timeStyle: 'short',
        });

        return (
          <div key={req.id} className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                {req.category && (
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold mb-1 bg-stone-100 text-stone-700">
                    {tCat(req.category)}
                  </span>
                )}
                <h3 className="text-base font-bold text-stone-900 leading-tight">{req.name}</h3>
              </div>
              <p className="text-xs text-stone-400">
                {t('admin.req.submitted')}: {submitted}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mt-4">
              <Detail icon={MapPin} label={label('lf.address')}>
                {req.area ? `${tArea(req.area)} · ` : ''}
                {req.address}
              </Detail>
              <Detail icon={Phone} label={label('lf.phone')}>{req.phone || '—'}</Detail>
              <Detail icon={Mail} label="Email">{req.email}</Detail>
              <Detail icon={User} label={label('lf.manager')}>{req.school_manager || '—'}</Detail>
              <Detail icon={Accessibility} label={label('lf.wheelchair')}>
                {req.disability_access ? t('admin.req.yes') : t('admin.req.no')}
              </Detail>
              <Detail icon={Accessibility} label={label('lf.access')}>{req.accessibility_info || '—'}</Detail>
            </div>

            {req.description && (
              <div className="mt-3">
                <Detail label={label('lf.description')}>
                  <span className="whitespace-pre-line">{req.description}</span>
                </Detail>
              </div>
            )}

            {photos.length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 mb-1">{t('admin.req.photos')}</p>
                <div className="flex flex-wrap gap-2">
                  {photos.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt="" className="h-16 w-24 object-cover rounded-lg border border-stone-200" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 rounded-xl bg-stone-50 border border-stone-200 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 mb-2">
                <Calendar className="w-3.5 h-3.5 text-stone-400" /> {t('admin.req.classesTitle')}
              </p>
              {planned.length === 0 ? (
                <p className="text-xs text-stone-500">{t('admin.req.noClasses')}</p>
              ) : (
                <ul className="space-y-2">
                  {planned.map((c) => (
                    <li key={`${c.title}-${c.weekly_schedule}`} className="text-xs text-stone-700">
                      <span className="font-semibold">{c.title}</span> · {c.weekly_schedule} · {agesText(c)} · {localizeLessonCost(c.submitted.cost || String(c.price_eur), t)} ·{' '}
                      {isUnlimitedCapacity(c.capacity) ? t('sched.unlimited') : `${c.capacity} ${t('admin.req.spots')}`} · {c.duration_minutes} {t('admin.req.minutes')}
                      {c.guessed.length > 0 && (
                        <span className="flex items-start gap-1 mt-0.5 text-amber-600">
                          <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" />
                          <span>
                            {t('admin.req.guess')} ({c.guessed.map((g) => label(g === 'capacity' ? 'lf.availability' : g === 'ages' ? 'lf.ages' : 'lf.cost')).join(', ')}).{' '}
                            {t('admin.req.submittedAs')}: {c.submitted.ages || '—'} / {c.submitted.cost || '—'} / {isUnlimitedAvailability(c.submitted.availability) ? t('sched.unlimited') : c.submitted.availability || '—'}
                          </span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {email === 'sent' && (
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <Check className="w-3.5 h-3.5" /> {t('admin.req.emailSent')}
                  </span>
                )}
                {email === 'sending' && (
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('admin.req.emailSending')}
                  </span>
                )}
                {email === 'failed' && (
                  <>
                    <span className="inline-flex items-center gap-1 font-semibold text-rose-600" title={req.email_error ?? undefined}>
                      <AlertCircle className="w-3.5 h-3.5" /> {t('admin.req.emailFailed')}
                    </span>
                    <button
                      onClick={() => handleResend(req)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-stone-200 text-stone-600 font-medium hover:bg-stone-50 transition-colors disabled:opacity-60"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> {t('admin.req.resend')}
                    </button>
                  </>
                )}
                {req.privacy_acknowledged_at && (
                  <span className="text-stone-400">{t('admin.req.privacyOk')}</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingReq(req)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 text-stone-700 text-sm font-semibold hover:bg-stone-50 transition-colors disabled:opacity-60"
                >
                  <Pencil className="w-4 h-4" /> {t('admin.edit')}
                </button>
                <button
                  onClick={() => handleApprove(req)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-60"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {t('admin.approve')}
                </button>
                <button
                  onClick={() => handleReject(req)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-sm font-medium text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-60"
                >
                  <Trash2 className="w-4 h-4" /> {t('admin.reject')}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-stone-400 mt-2 text-right">{t('admin.req.approveHint')}</p>
          </div>
        );
      })}
    </div>
    {rejectedList}
    </>
  );
}
