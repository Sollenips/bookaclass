import { ScheduleAvailabilityInput, ScheduleCostInput, ScheduleDaysInput, ScheduleDayTimesInput } from '@/components/ScheduleInputs';
import { useId, useState, type Dispatch, type SetStateAction } from 'react';
import { Accessibility, Plus, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { ImageUploadField } from '@/components/ImageUploadField';
import { SchoolAddressPicker } from '@/components/SchoolAddressPicker';
import { studioInputCls, studioLabelCls } from '@/lib/studioForm';
import {
  LISTING_AREAS,
  LISTING_CATEGORIES,
  emptyScheduleRow,
  type ListingFormValues,
  type ScheduleRow,
} from '@/lib/listingForm';

type Props = {
  values: ListingFormValues;
  onChange: Dispatch<SetStateAction<ListingFormValues>>;
  onImageUploadingChange?: (uploading: boolean) => void;
  onOpenPrivacy?: () => void;
  /** The public form needs the visitor's consent; the admin adding a school does not. */
  showPrivacy?: boolean;
  /** The lessons table creates classes, so it is only used when adding a new school. */
  showSchedule?: boolean;
};

type TextField = 'name' | 'description' | 'category' | 'area' | 'address' | 'phone' | 'email' | 'school_manager' | 'accessibility_info';

const cellCls =
  'w-full min-w-0 px-2.5 py-2 rounded-lg bg-white border border-stone-200 text-stone-800 placeholder:text-stone-400 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 text-sm';

export function SchoolListingFields({ values, onChange, onImageUploadingChange, onOpenPrivacy, showPrivacy = true, showSchedule = true }: Props) {
  const { t } = useI18n();
  const areaId = useId();
  const [customAreaSelected, setCustomAreaSelected] = useState(false);
  const usesCustomArea = customAreaSelected || Boolean(values.area && (values.area === 'Other' || !LISTING_AREAS.some(({ value }) => value === values.area)));

  const textOf =
    (field: TextField) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange({ ...values, [field]: e.target.value });

  function setRow<Field extends keyof Omit<ScheduleRow, 'id'>>(id: string, field: Field, value: ScheduleRow[Field]) {
    onChange((current) => ({
      ...current,
      schedule: current.schedule.map((row) => row.id === id ? { ...row, [field]: value } : row),
    }));
  }

  const addRow = () => onChange({ ...values, schedule: [...values.schedule, emptyScheduleRow()] });

  const removeRow = (id: string) =>
    onChange({
      ...values,
      schedule:
        values.schedule.length > 1
          ? values.schedule.filter((r) => r.id !== id)
          : [emptyScheduleRow()],
    });

  return (
    <div className="space-y-4">
      <div>
        <label className={studioLabelCls}>{t('lf.studio')}</label>
        <input value={values.name} onChange={textOf('name')} required className={studioInputCls} />
      </div>

      <div>
        <label className={studioLabelCls}>{t('lf.description')}</label>
        <textarea value={values.description} onChange={textOf('description')} rows={3} className={`${studioInputCls} resize-none`} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={studioLabelCls}>{t('lf.category')}</label>
          <select value={values.category} onChange={textOf('category')} required className={studioInputCls}>
            <option value="" disabled>{t('lf.selectCategory')}</option>
            {LISTING_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{t(`lf.${c.key}`)}</option>
            ))}
            {values.category && !LISTING_CATEGORIES.some((c) => c.value === values.category) && (
              <option value={values.category}>{values.category}</option>
            )}
          </select>
        </div>
        <div>
          <label htmlFor={areaId} className={studioLabelCls}>{t('lf.area')}</label>
          <select id={areaId} value={usesCustomArea ? 'Other' : values.area} onChange={(event) => {
            setCustomAreaSelected(event.target.value === 'Other');
            onChange((current) => ({ ...current, area: event.target.value, latitude: null, longitude: null }));
          }} required className={studioInputCls}>
            <option value="" disabled>{t('lf.selectArea')}</option>
            {LISTING_AREAS.map((area) => (
              <option key={area.value} value={area.value}>{t(`lf.${area.key}`)}</option>
            ))}
          </select>
          {usesCustomArea && (
            <label className="mt-2 block">
              <span className={studioLabelCls}>{t('lf.customArea')}</span>
              <input value={values.area === 'Other' ? '' : values.area} onChange={(event) => {
                setCustomAreaSelected(true);
                onChange((current) => ({ ...current, area: event.target.value, latitude: null, longitude: null }));
              }} required pattern=".*\S.*" maxLength={100} className={studioInputCls} />
            </label>
          )}
        </div>
      </div>

      <div>
        <SchoolAddressPicker
          address={values.address}
          area={values.area}
          latitude={values.latitude}
          longitude={values.longitude}
          onAddressChange={(address) => onChange((current) => ({ ...current, address, latitude: null, longitude: null }))}
          onPointChange={(point) => onChange((current) => ({
            ...current,
            latitude: point?.latitude ?? null,
            longitude: point?.longitude ?? null,
          }))}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={studioLabelCls}>{t('lf.phone')}</label>
          <input type="tel" value={values.phone} onChange={textOf('phone')} required className={studioInputCls} />
        </div>
        <div>
          <label className={studioLabelCls}>{t('form.email')} *</label>
          <input type="email" value={values.email} onChange={textOf('email')} required className={studioInputCls} />
        </div>
      </div>

      <div>
        <label className={studioLabelCls}>{t('lf.cover')}</label>
        <ImageUploadField value={values.image_url} onUploadingChange={onImageUploadingChange} onChange={(url) => onChange((current) => ({ ...current, image_url: url }))} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={studioLabelCls}>{t('lf.photo1')}</label>
          <ImageUploadField value={values.photo_url_1} onUploadingChange={onImageUploadingChange} onChange={(url) => onChange((current) => ({ ...current, photo_url_1: url }))} />
        </div>
        <div>
          <label className={studioLabelCls}>{t('lf.photo2')}</label>
          <ImageUploadField value={values.photo_url_2} onUploadingChange={onImageUploadingChange} onChange={(url) => onChange((current) => ({ ...current, photo_url_2: url }))} />
        </div>
      </div>

      <div>
        <label className={studioLabelCls}>{t('lf.manager')}</label>
        <input value={values.school_manager} onChange={textOf('school_manager')} required placeholder={t('lf.managerHint')} className={studioInputCls} />
      </div>

      <label className="flex items-center gap-2.5 cursor-pointer select-none p-3 rounded-xl bg-stone-50 border border-stone-200 hover:border-teal-300 transition-colors">
        <input
          type="checkbox"
          checked={values.disability_access}
          onChange={(e) => onChange({ ...values, disability_access: e.target.checked })}
          className="w-4 h-4 rounded text-teal-600 focus:ring-teal-400"
        />
        <Accessibility className="w-4 h-4 text-stone-400" />
        <span className="text-sm font-medium text-stone-700">{t('lf.wheelchair')}</span>
      </label>

      <div>
        <label className={studioLabelCls}>{t('lf.access')}</label>
        <input value={values.accessibility_info} onChange={textOf('accessibility_info')} placeholder={t('lf.accessHint')} className={studioInputCls} />
      </div>

      {showSchedule && (
        <div>
          <label className={studioLabelCls}>{t('lf.schedule')}</label>
          <p className="text-xs text-stone-500 mb-2">{t('lf.scheduleNote')}</p>
          <div className="overflow-x-auto rounded-xl border border-stone-200">
            <table className="w-full min-w-[820px] text-left border-collapse">
              <thead>
                <tr className="bg-stone-100 text-xs font-semibold text-stone-600">
                  <th className="px-2.5 py-2.5">{t('lf.lesson')}</th>
                  <th className="px-2.5 py-2.5">{t('lf.day')}</th>
                  <th className="px-2.5 py-2.5">{t('lf.time')}</th>
                  <th className="px-2.5 py-2.5">{t('lf.ages')}</th>
                  <th className="px-2.5 py-2.5">{t('lf.cost')}</th>
                  <th className="px-2.5 py-2.5">{t('lf.availability')}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {values.schedule.map((row) => (
                  <tr key={row.id} className="border-t border-stone-200">
                    <td className="p-1.5 w-[20%]">
                      <input value={row.lesson} onChange={(e) => setRow(row.id, 'lesson', e.target.value)} required placeholder={t('lf.lessonHint')} className={cellCls} />
                    </td>
                    <td className="p-1.5 align-top w-[16%]">
                      <ScheduleDaysInput value={row.day} onChange={(day) => setRow(row.id, 'day', day)} className={cellCls} />
                    </td>
                    <td className="p-1.5 align-top min-w-[13rem] w-[21%]">
                      <ScheduleDayTimesInput timing={row} onChange={(times) => setRow(row.id, 'dayTimes', times)} required className={cellCls} />
                    </td>
                    <td className="p-1.5 w-[17%]">
                      <input value={row.ages} onChange={(e) => setRow(row.id, 'ages', e.target.value)} required placeholder={t('lf.ageHint')} className={cellCls} />
                    </td>
                    <td className="p-1.5 w-[17%]">
                      <ScheduleCostInput value={row.cost} onChange={(cost) => setRow(row.id, 'cost', cost)} required className={cellCls} />
                    </td>
                    <td className="p-1.5 w-[17%]">
                      <ScheduleAvailabilityInput value={row.availability} onChange={(value) => setRow(row.id, 'availability', value)} className={cellCls} />
                    </td>
                    <td className="p-1.5">
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                        aria-label={t('lf.removeLesson')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={addRow}
            className="mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-teal-600 bg-teal-50 text-teal-700 text-sm font-semibold hover:bg-teal-100 transition-colors"
          >
            <Plus className="w-4 h-4" /> {t('lf.addLesson').replace(/^\+\s*/, '')}
          </button>
        </div>
      )}

      {showPrivacy && (
        <label className="flex items-start gap-2.5 text-xs text-stone-600 leading-relaxed cursor-pointer">
          <input
            type="checkbox"
            required
            checked={values.privacy_acknowledged}
            onChange={(e) => onChange({ ...values, privacy_acknowledged: e.target.checked })}
            className="mt-0.5 w-4 h-4 rounded text-teal-600 focus:ring-teal-400"
          />
          <span>
            {t('lf.privacyAcknowledged')}{' '}
            <button type="button" onClick={() => onOpenPrivacy?.()} className="text-teal-700 underline font-medium">
              {t('lf.schoolPrivacy')}
            </button>
            .
          </span>
        </label>
      )}
    </div>
  );
}
