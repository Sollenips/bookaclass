import { useState, useEffect, useCallback } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { supabase, type WaitlistEntry, type WaitlistStatus } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';

type Entry = WaitlistEntry & {
  class: { title: string } | null;
  store: { name: string } | null;
};

const STATUSES: WaitlistStatus[] = ['waiting', 'contacted', 'enrolled', 'removed'];

export function AdminWaitlistTab() {
  const { t, lang } = useI18n();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('waitlist_entries')
      .select('*, class:classes(title), store:stores(name)')
      .order('created_at', { ascending: false });
    if (fetchError) setError(t('adminWaitlist.loadError'));
    else setEntries((data ?? []) as Entry[]);
    setLoading(false);
  }, [t]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const changeStatus = async (entry: Entry, status: WaitlistStatus) => {
    setBusyId(entry.id);
    setError(null);
    const { data, error: updateError } = await supabase
      .from('waitlist_entries')
      .update({ status })
      .eq('id', entry.id)
      .select('id');
    setBusyId(null);
    if (updateError || !data || data.length === 0) {
      setError(t('adminWaitlist.updateError'));
      return;
    }
    setEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, status } : x)));
  };

  const remove = async (entry: Entry) => {
    if (!confirm(t('adminWaitlist.confirmDelete'))) return;
    setBusyId(entry.id);
    setError(null);
    const { data, error: deleteError } = await supabase
      .from('waitlist_entries')
      .delete()
      .eq('id', entry.id)
      .select('id');
    setBusyId(null);
    if (deleteError || !data || data.length === 0) {
      setError(t('adminWaitlist.updateError'));
      return;
    }
    setEntries((prev) => prev.filter((x) => x.id !== entry.id));
  };

  const emailLabel = (status: WaitlistEntry['email_status']) =>
    status === 'sent' ? t('adminWaitlist.emailSent') : status === 'failed' ? t('adminWaitlist.emailFailed') : t('adminWaitlist.emailPending');
  const emailCls = (status: WaitlistEntry['email_status']) =>
    status === 'sent'
      ? 'bg-emerald-50 text-emerald-700'
      : status === 'failed'
        ? 'bg-rose-50 text-rose-700'
        : 'bg-amber-50 text-amber-700';

  return (
    <div>
      <p className="text-sm text-stone-500 mb-4">{t('adminWaitlist.note')}</p>

      {error && (
        <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-stone-400">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-stone-400">
          <p className="text-sm">{t('adminWaitlist.empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-2xl border border-stone-200 shadow-sm">
          <table className="w-full min-w-[900px] text-left border-collapse">
            <thead>
              <tr className="bg-stone-100 text-xs font-semibold text-stone-600">
                <th className="px-3 py-2.5">{t('adminWaitlist.date')}</th>
                <th className="px-3 py-2.5">{t('adminWaitlist.school')}</th>
                <th className="px-3 py-2.5">{t('adminWaitlist.class')}</th>
                <th className="px-3 py-2.5">{t('adminWaitlist.person')}</th>
                <th className="px-3 py-2.5">{t('adminWaitlist.contact')}</th>
                <th className="px-3 py-2.5">{t('adminWaitlist.status')}</th>
                <th className="px-3 py-2.5">{t('adminWaitlist.email')}</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const busy = busyId === entry.id;
                return (
                  <tr key={entry.id} className="border-t border-stone-200 text-sm text-stone-800 align-top">
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-stone-500">
                      {new Date(entry.created_at).toLocaleString(lang === 'el' ? 'el-GR' : 'en-GB', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-3 py-2.5">{entry.store?.name ?? '—'}</td>
                    <td className="px-3 py-2.5">{entry.class?.title ?? '—'}</td>
                    <td className="px-3 py-2.5 font-medium">{entry.name}</td>
                    <td className="px-3 py-2.5 text-xs">
                      <a href={`mailto:${entry.email}`} className="text-teal-700 underline break-all">{entry.email}</a>
                      <br />
                      <a href={`tel:${entry.phone}`} className="text-stone-600">{entry.phone}</a>
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={entry.status}
                        onChange={(e) => changeStatus(entry, e.target.value as WaitlistStatus)}
                        disabled={busy}
                        className="px-2 py-1.5 rounded-lg bg-white border border-stone-200 text-xs text-stone-800 outline-none focus:border-teal-400 disabled:opacity-60"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{t(`adminWaitlist.status.${s}`)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        title={entry.email_error ?? undefined}
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${emailCls(entry.email_status)}`}
                      >
                        {emailLabel(entry.email_status)}
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <button
                        onClick={() => remove(entry)}
                        disabled={busy}
                        className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-60"
                        aria-label="Delete"
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
