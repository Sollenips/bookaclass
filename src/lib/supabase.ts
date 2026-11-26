import type { MonthlyPackages, PackageKey } from '@/lib/monthlyPackages';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase configuration is missing. Reload the preview after the project environment is set.');
}

const signupFragment = new URLSearchParams(window.location.hash.slice(1));
export const signupReturn = {
  memberDestination: new URLSearchParams(window.location.search).get('account') === 'student',
  signupSession: signupFragment.get('type') === 'signup' && signupFragment.has('access_token'),
  failed: signupFragment.has('error') || signupFragment.has('error_code'),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function signInAsAdmin(email: string, password: string) {
  const verificationClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storageKey: `bookaclass-admin-check-${crypto.randomUUID()}`,
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await verificationClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session || !data.user) throw new Error('Invalid login');

  const admin = await verificationClient.from('app_admins')
    .select('user_id').eq('user_id', data.user.id).maybeSingle();
  if (admin.error) throw admin.error;
  if (!admin.data) throw new Error('Invalid login');

  const result = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (result.error) throw result.error;
}

export type Store = {
  id: string;
  published_at: string | null;
  name: string;
  description: string;
  category: string;
  area: string;
  address: string;
  phone: string;
  email: string;
  image_url: string | null;
  photo_url_1: string | null;
  photo_url_2: string | null;
  school_manager: string | null;
  disability_access: boolean;
  accessibility_info: string | null;
  rate_info: string | null;
  weekly_schedule: string | null;
  latitude: number | null;
  longitude: number | null;
  geocoded_at: string | null;
  created_at: string;
};

export type SubmittedScheduleRow = {
  lesson: string;
  day: string;
  time: string;
  ages: string;
  cost: string;
  availability: string;
};

export type PreRegistration = {
  id: string;
  email: string;
  role: string;
  name: string | null;
  phone: string | null;
  area: string | null;
  description: string | null;
  category: string | null;
  address: string | null;
  image_url: string | null;
  photo_url_1: string | null;
  photo_url_2: string | null;
  school_manager: string | null;
  disability_access: boolean | null;
  accessibility_info: string | null;
  rate_info: string | null;
  weekly_schedule: string | null;
  approved_at: string | null;
  rejected_at?: string | null;
  store_id: string | null;
  privacy_acknowledged_at: string | null;
  schedule_rows: SubmittedScheduleRow[] | null;
  email_status: string | null;
  email_error: string | null;
  created_at: string;
};

export type ClassItem = {
  monthly_packages?: MonthlyPackages;
  published_at: string | null;
  schedule_key?: string | null;
  schedule_ages?: string | null;
  schedule_cost?: string | null;
  schedule_availability?: string | null;
  schedule_display_cost?: string;
  id: string;
  store_id: string;
  title: string;
  description: string;
  category: string;
  instructor: string;
  age_min: number;
  age_max: number | null;
  price_eur: number;
  duration_minutes: number;
  capacity: number;
  weekly_schedule: string;
  image_url: string | null;
  created_at: string;
  store?: Store;
};

export type RequestKind = 'trial' | 'enrollment';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'confirmed';

export type Booking = {
  monthly_package?: PackageKey | null;
  id: string;
  class_id: string;
  store_id: string | null;
  kind: RequestKind;
  participant_name: string;
  participant_age: number;
  guardian_name: string | null;
  booker_name: string;
  booker_email: string;
  booker_phone: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  first_month_price_eur: number | null;
  privacy_accepted_at: string | null;
  notes: string | null;
  status: RequestStatus;
  status_updated_at: string | null;
  created_at: string;
};

// Old single-step booking form (kept for reference, no longer used by the site)
export type BookingInput = {
  class_id: string;
  participant_name: string;
  participant_age: number;
  guardian_name: string | null;
  booker_name: string;
  booker_email: string;
  booker_phone: string;
  preferred_date: string;
  notes: string | null;
};

// What a visitor sends for a free trial or an enrollment request.
// The database sets the school, price and "pending" status itself.
export type RequestInput = {
  class_id: string;
  kind: RequestKind;
  participant_name: string;
  participant_age: number;
  guardian_name: string | null;
  booker_name: string;
  booker_email: string;
  booker_phone: string;
  preferred_date: string | null;
  preferred_time: string | null;
  privacy_accepted_at: string;
  notes: string | null;
};

export type ClassSlot = {
  id: string;
  class_id: string;
  weekday: number; // 1 = Monday ... 7 = Sunday
  start_time: string; // "HH:MM:SS"
};

export type TeacherStatus = 'draft' | 'pending' | 'published';

export type Teacher = {
  id: string;
  store_id: string;
  name: string;
  photo_url: string | null;
  academic_status: string | null;
  experience_years: number;
  experience: string | null;
  age_min: number;
  age_max: number | null;
  status: TeacherStatus;
  created_at: string;
  updated_at: string;
};

export type TeacherInput = Pick<
  Teacher,
  'name' | 'photo_url' | 'academic_status' | 'experience_years' | 'experience' | 'age_min' | 'age_max'
>;

export type WaitlistStatus = 'waiting' | 'contacted' | 'enrolled' | 'removed';

export type WaitlistEntry = {
  id: string;
  class_id: string;
  store_id: string;
  name: string;
  email: string;
  phone: string;
  privacy_accepted_at: string;
  status: WaitlistStatus;
  email_status: 'pending' | 'sending' | 'sent' | 'failed';
  email_error: string | null;
  created_at: string;
};
