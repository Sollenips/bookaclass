import { packageLabel } from '@/lib/monthlyPackages';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase, type Booking, type ClassItem, type RequestKind, type RequestStatus } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';

type Props = {
  kind: RequestKind;
  bookings: Booking[];
  classes: ClassItem[];
  onChanged: () => void;
  onFlash: (msg: string) => void;
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-stone-200 text-stone-600',
};

const FILTERS: Array<RequestStatus | 'all'> = ['all', 'pending', 'approved', 'rejected', 'cancelled'];

export function AdminBookingRequestsTab({ kind, bookings, classes, onChanged, onFlash }: Props) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<RequestStatus | 'all'>('all');
  const [reviewLink, setReviewLink] = useState<{ bookingId: string; url: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const classMap = new Map(classes.map((c) => [c.id, c]));

  // Older "confirmed" bookings are treated as approved
  const norm = (s: string) => (s === 'confirmed' ? 'approved' : s);
  const rows = bookings.filter((b) => b.kind === kind && (filter === 'all' || norm(b.status) === filter));

  const setStatus = async (b: Booking, status: RequestStatus) => {
    setBusyId(b.id);
    const { error } = await supabase.from('bookings').update({ status }).eq('id', b.id);
    setBusyId(null);
    if (error) {
      onFlash(t('admin.reqError'));
      return;
    }
    onFlash(t('admin.reqUpdated'));
    onChanged();
  };

  const confirmVisit = async (booking: Booking) => {
    if (!window.confirm(t('reviews.confirmVisit'))) return;
    setBusyId(booking.id);
    const { data, error } = await supabase.rpc('issue_school_review_invite', { target_booking: booking.id });
    setBusyId(null);
    if (error || typeof data !== 'string') {
      onFlash(t('reviews.issueError'));
      return;
    }
    const url = new URL(window.location.href);
    url.hash = new URLSearchParams({ 'school-review': data }).toString();
    url.search = '';
    setReviewLink({ bookingId: booking.id, url: url.href });
  };

  const fmtDate = (iso: string) => new Date(iso).toLocaleString();

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === f ? 'bg-teal-600 text-white' : 'bg-white border border-stone-200 text-stone-600 hover:border-teal-300'
            }`}
          >
            {f === 'all' ? t('admin.reqAll') : t(`booking.status.${f}`)}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-16 text-stone-400">
          <p className="text-sm">{t('admin.noRequests')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((b) => {
            const cls = classMap.get(b.class_id);
            const status = norm(b.status);
            const busy = busyId === b.id;
            return (
              <div key={b.id} className="bg-white rounded-xl border border-stone-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-stone-900">
                      {b.participant_name} <span className="font-normal text-stone-500">({b.participant_age})</span>
                    </p>
                    <p className="text-xs text-stone-500 mt-0.5">
                      {t('admin.reqClass')}: {cls?.store?.name ?? '—'} / {cls?.title ?? '—'}
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[b.status] ?? 'bg-stone-100 text-stone-600'}`}>
                    {t(`booking.status.${b.status}`)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1 mt-3 text-sm text-stone-600">
                  <div>
                    <span className="text-xs text-stone-400">{t('admin.reqCustomer')}</span>
                    <p>{b.guardian_name ? `${b.guardian_name} (guardian)` : b.booker_name}</p>
                    <p className="text-xs text-stone-500 break-all">{b.booker_email}</p>
                    <p className="text-xs text-stone-500">{b.booker_phone}</p>
                  </div>
                  {kind === 'trial' ? (
                    <div>
                      <span className="text-xs text-stone-400">{t('admin.reqWhen')}</span>
                      <p>
                        {b.preferred_date ?? '—'} {b.preferred_time ? b.preferred_time.slice(0, 5) : ''}
                      </p>
                      <p className="text-xs text-stone-500">€0</p>
                    </div>
                  ) : (
                    <div>
                      {b.monthly_package && <p className="text-sm font-medium">{packageLabel(b.monthly_package, t)}</p>}
                      <span className="text-xs text-stone-400">{t('admin.reqPrice')}</span>
                      <p className="font-semibold">
                        €{Number(b.first_month_price_eur ?? cls?.price_eur ?? 0).toFixed(2)}
                      </p>
                    </div>
                  )}
                  <div>
                    <span className="text-xs text-stone-400">{t('admin.reqReceived')}</span>
                    <p className="text-xs">{fmtDate(b.created_at)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-stone-100">
                  <ActionButton disabled={busy || status === 'approved'} onClick={() => setStatus(b, 'approved')} tone="ok">
                    {t('admin.reqApprove')}
                  </ActionButton>
                  <ActionButton disabled={busy || status === 'rejected'} onClick={() => setStatus(b, 'rejected')} tone="bad">
                    {t('admin.reqReject')}
                  </ActionButton>
                  <ActionButton disabled={busy || status === 'cancelled'} onClick={() => setStatus(b, 'cancelled')} tone="muted">
                    {t('admin.reqCancel')}
                  </ActionButton>
                  {status === 'approved' && (
                    <ActionButton disabled={busy} onClick={() => void confirmVisit(b)} tone="muted">
                      {t('reviews.invite')}
                    </ActionButton>
                  )}
                  {busy && <Loader2 className="w-4 h-4 animate-spin text-stone-400" />}
                </div>
                {reviewLink?.bookingId === b.id && (
                  <div className="mt-3 space-y-2">
                    <input readOnly aria-label={t('reviews.link')} value={reviewLink.url}
                      onFocus={(event) => event.target.select()}
                      className="w-full rounded-lg border border-stone-300 px-2 py-1 text-sm" />
                    <a className="text-sm font-semibold text-teal-800 underline"
                      href={'mailto:' + encodeURIComponent(b.booker_email) + '?subject=' + encodeURIComponent(t('reviews.emailSubject')) + '&body=' + encodeURIComponent(t('reviews.emailBody') + '\n\n' + reviewLink.url)}>
                      {t('reviews.openEmail')}
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  tone,
  disabled,
  onClick,
  children,
}: {
  tone: 'ok' | 'bad' | 'muted';
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const tones = {
    ok: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50',
    bad: 'border-rose-300 text-rose-700 hover:bg-rose-50',
    muted: 'border-stone-300 text-stone-600 hover:bg-stone-50',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${tones[tone]}`}
    >
      {children}
    </button>
  );
}
