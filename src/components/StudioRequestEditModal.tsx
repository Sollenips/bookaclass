import { useState } from 'react';
import { Loader2, AlertCircle, X } from 'lucide-react';
import { supabase, type PreRegistration } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { SchoolListingFields } from '@/components/SchoolListingFields';
import { combineScheduleDays, emptyListingValues, expandScheduleDays, formatSchedule, type ListingFormValues } from '@/lib/listingForm';
import { schoolApplicationPhotoUrl } from '@/lib/studioImageUpload';
import { requestScheduleRows } from '@/lib/schoolPublish';

type Props = {
  request: PreRegistration;
  onClose: () => void;
  onSaved: () => void;
};

// Admin edits a pending application (school + its classes). Saving only updates the
// application in the database - nothing is published until "Approve & publish".
export function StudioRequestEditModal({ request, onClose, onSaved }: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState<ListingFormValues>(() => ({
    ...emptyListingValues(),
    name: request.name ?? '',
    description: request.description ?? '',
    category: request.category ?? '',
    area: request.area ?? '',
    address: request.address ?? '',
    latitude: request.latitude ?? null,
    longitude: request.longitude ?? null,
    phone: request.phone ?? '',
    email: request.email,
    image_url: schoolApplicationPhotoUrl(request.image_url) ?? '',
    photo_url_1: schoolApplicationPhotoUrl(request.photo_url_1) ?? '',
    photo_url_2: schoolApplicationPhotoUrl(request.photo_url_2) ?? '',
    school_manager: request.school_manager ?? '',
    disability_access: request.disability_access ?? false,
    accessibility_info: request.accessibility_info ?? '',
    schedule: combineScheduleDays(requestScheduleRows(request)).map((r) => ({
      id: crypto.randomUUID(),
      lesson: r.lesson,
      day: r.day,
      time: r.time,
      dayTimes: r.dayTimes,
      ages: r.ages,
      cost: r.cost,
      availability: r.availability,
    })),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.schedule.some((row) => row.lesson.trim() && !row.day.trim())) {
      setError(t('sched.dayRequired'));
      return;
    }
    if (saving) return;
    setSaving(true);
    setError(null);

    // Same shape the public "List Your School" form saves
    const { error: err } = await supabase
      .from('pre_registrations')
      .update({
        email: form.email.trim().toLowerCase(),
        name: form.name.trim(),
        phone: form.phone.trim(),
        area: form.area,
        description: form.description.trim() || null,
        category: form.category,
        address: form.address.trim(),
        latitude: form.latitude,
        longitude: form.longitude,
        image_url: form.image_url || null,
        photo_url_1: form.photo_url_1 || null,
        photo_url_2: form.photo_url_2 || null,
        school_manager: form.school_manager.trim() || null,
        disability_access: form.disability_access,
        accessibility_info: form.accessibility_info.trim() || null,
        weekly_schedule:
          formatSchedule(form.schedule, {
            day: (d) => t(`lf.${d}`),
            ages: t('lf.ages'),
            cost: t('lf.cost'),
            availability: t('lf.availability'),
          }) || null,
        schedule_rows: expandScheduleDays(form.schedule)
          .filter((r) => r.lesson.trim())
          .map(({ lesson, day, time, ages, cost, availability }) => ({
            lesson: lesson.trim(),
            day,
            time,
            ages: ages.trim(),
            cost: cost.trim(),
            availability: availability.trim(),
          })),
      })
      .eq('id', request.id);

    if (err) {
      setError(`${t('admin.errorSave')} (${err.message})`);
      setSaving(false);
      return;
    }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-stone-900">{t('admin.edit')}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors" aria-label={t('form.cancel')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          <SchoolListingFields values={form} onChange={setForm} showPrivacy={false} />

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
