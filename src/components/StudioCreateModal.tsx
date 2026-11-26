import { useState } from 'react';
import { Loader2, AlertCircle, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CATEGORIES } from '@/lib/constants';
import { useI18n } from '@/lib/i18n';
import { geocodeAddress } from '@/lib/geocode';
import { planClasses, scheduledClassFields, safeHttps } from '@/lib/schoolPublish';
import { SchoolListingFields } from '@/components/SchoolListingFields';
import { emptyListingValues, expandScheduleDays, formatSchedule, type ListingFormValues } from '@/lib/listingForm';

type Props = {
  onClose: () => void;
  onSaved: () => void;
};

// "Add Studio" in the Admin Dashboard: the same form visitors see under "List Your School".
// It publishes the school and its classes straight away, exactly like approving an application.
export function StudioCreateModal({ onClose, onSaved }: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState<ListingFormValues>(emptyListingValues);
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

    const name = form.name.trim();
    const address = form.address.trim();
    const description = form.description.trim();
    const category = form.category || CATEGORIES[0];
    const cover = safeHttps(form.image_url);
    const rows = expandScheduleDays(form.schedule)
      .filter((r) => r.lesson.trim())
      .map(({ lesson, day, time, ages, cost, availability }) => ({
        lesson: lesson.trim(),
        day,
        time,
        ages: ages.trim(),
        cost: cost.trim(),
        availability: availability.trim(),
      }));
    const planned = planClasses(rows);
    const point = await geocodeAddress(address, form.area);

    const { data, error: storeErr } = await supabase
      .from('stores')
      .insert([
        {
          name,
          description,
          category,
          area: form.area,
          address,
          phone: form.phone.trim(),
          email: form.email.trim(),
          image_url: cover,
          photo_url_1: safeHttps(form.photo_url_1),
          photo_url_2: safeHttps(form.photo_url_2),
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
          latitude: point?.latitude ?? null,
          longitude: point?.longitude ?? null,
          geocoded_at: point ? new Date().toISOString() : null,
        },
      ])
      .select('id')
      .single();

    if (storeErr || !data) {
      setError(`${t('admin.errorSave')} (${storeErr?.message ?? 'no id returned'})`);
      setSaving(false);
      return;
    }

    // Publish its classes; if that fails, undo the school so nothing is half-saved
    if (planned.length > 0) {
      const classes = await supabase.from('classes').insert(
        planned.map((c) => ({
          store_id: data.id,
          ...scheduledClassFields(data.id, c),
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
        await supabase.from('stores').delete().eq('id', data.id);
        setError(`${t('admin.errorSave')} (${classes.error.message})`);
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
          <h2 className="text-lg font-bold text-stone-900">{t('admin.addStudio')}</h2>
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
