import { CATEGORIES } from '@/lib/constants';

export type StudioFormValues = {
  name: string;
  description: string;
  category: string;
  area: string;
  address: string;
  phone: string;
  email: string;
  image_url: string;
  photo_url_1: string;
  photo_url_2: string;
  school_manager: string;
  disability_access: boolean;
  accessibility_info: string;
  rate_info: string;
  weekly_schedule: string;
};

export const EMPTY_STUDIO_VALUES: StudioFormValues = {
  name: '',
  description: '',
  category: CATEGORIES[0],
  area: '',
  address: '',
  phone: '',
  email: '',
  image_url: '',
  photo_url_1: '',
  photo_url_2: '',
  school_manager: '',
  disability_access: false,
  accessibility_info: '',
  rate_info: '',
  weekly_schedule: '',
};

export const studioInputCls = 'w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-stone-800 placeholder:text-stone-400 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all text-sm';
export const studioLabelCls = 'block text-sm font-medium text-stone-700 mb-1.5';
