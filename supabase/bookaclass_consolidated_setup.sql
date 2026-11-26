/*
  BookaClass - ONE consolidated setup for the NEW Supabase project
  ================================================================
  Safe to run more than once. It never deletes rows or tables.
  It only: adds missing columns/tables, grants, policies, functions, one storage bucket.

  BEFORE RUNNING:
  1. Create your admin login in Supabase: Authentication > Users > Add user
     (tick "Auto Confirm User"). Use the email below.
  2. Then paste this whole file in SQL Editor and press Run.

  Result:
  - Visitors: can read schools, classes and published teachers; can create a booking;
    can submit "List Your School". They cannot edit or read anything else.
  - ONE admin (the email below): full control through the Admin Dashboard.
  - Nobody else can create an account (sign-ups blocked at database level).
  - School owners have no accounts. The owner tables below stay empty.
*/

-- ── 0. Safety check: the admin account must already exist ──────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower('nikoskarado@gmail.com')) THEN
    RAISE EXCEPTION 'Create the admin user (nikoskarado@gmail.com) in Authentication > Users first, then run this file again. Nothing was changed.';
  END IF;
END $$;

-- ── 1. Base tables (only created if missing) ───────────────────────────────
CREATE TABLE IF NOT EXISTS stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, description text NOT NULL, category text NOT NULL,
  area text NOT NULL, address text NOT NULL, phone text NOT NULL, email text NOT NULL,
  image_url text, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  title text NOT NULL, description text NOT NULL, category text NOT NULL, instructor text NOT NULL,
  age_min int NOT NULL DEFAULT 4, age_max int, price_eur numeric(8,2) NOT NULL DEFAULT 0,
  duration_minutes int NOT NULL DEFAULT 60, capacity int NOT NULL DEFAULT 10,
  weekly_schedule text NOT NULL, image_url text, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  participant_name text NOT NULL, participant_age int NOT NULL, guardian_name text,
  booker_name text NOT NULL, booker_email text NOT NULL, booker_phone text NOT NULL,
  preferred_date date NOT NULL, notes text, status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pre_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL, role text NOT NULL DEFAULT 'user', name text,
  created_at timestamptz DEFAULT now()
);

-- ── 2. Missing columns ─────────────────────────────────────────────────────
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS photo_url_1 text,
  ADD COLUMN IF NOT EXISTS photo_url_2 text,
  ADD COLUMN IF NOT EXISTS floor text,
  ADD COLUMN IF NOT EXISTS disability_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rate_info text,
  ADD COLUMN IF NOT EXISTS first_class_discount_pct int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_schedule text,
  ADD COLUMN IF NOT EXISTS school_manager text,
  ADD COLUMN IF NOT EXISTS accessibility_info text,
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;

ALTER TABLE pre_registrations
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS studio_info text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS photo_url_1 text,
  ADD COLUMN IF NOT EXISTS photo_url_2 text,
  ADD COLUMN IF NOT EXISTS floor text,
  ADD COLUMN IF NOT EXISTS disability_access boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS rate_info text,
  ADD COLUMN IF NOT EXISTS first_class_discount_pct integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_schedule text,
  ADD COLUMN IF NOT EXISTS school_manager text,
  ADD COLUMN IF NOT EXISTS accessibility_info text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS schedule_rows jsonb,
  ADD COLUMN IF NOT EXISTS email_status text,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_error text,
  ADD COLUMN IF NOT EXISTS email_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS privacy_acknowledged_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='pre_registrations' AND column_name='store_id') THEN
    ALTER TABLE pre_registrations ADD COLUMN store_id uuid REFERENCES stores(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Existing applications must never trigger an email; new ones start as 'pending'
UPDATE pre_registrations SET email_status = 'skipped' WHERE email_status IS NULL;
ALTER TABLE pre_registrations ALTER COLUMN email_status SET DEFAULT 'pending';
ALTER TABLE pre_registrations ALTER COLUMN email_status SET NOT NULL;
ALTER TABLE pre_registrations DROP CONSTRAINT IF EXISTS pre_registrations_email_status_check;
ALTER TABLE pre_registrations ADD CONSTRAINT pre_registrations_email_status_check
  CHECK (email_status IN ('pending', 'sending', 'sent', 'failed', 'skipped'));

-- ── 3. Admin tables + helper functions ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Owner tables: kept EMPTY and inert. The existing screens query them, so they must exist.
CREATE TABLE IF NOT EXISTS store_owners (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, store_id)
);
CREATE TABLE IF NOT EXISTS studio_owner_invites (
  email text PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM app_admins WHERE user_id = auth.uid());
$$;
CREATE OR REPLACE FUNCTION is_store_owner(target_store uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM store_owners WHERE user_id = auth.uid() AND store_id = target_store);
$$;
REVOKE EXECUTE ON FUNCTION is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION is_store_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION is_store_owner(uuid) TO authenticated, service_role;

-- Register the ONE admin
INSERT INTO app_admins (user_id)
SELECT id FROM auth.users WHERE lower(email) = lower('nikoskarado@gmail.com')
ON CONFLICT (user_id) DO NOTHING;

-- ── 4. Teachers (existing feature: admin approves, public sees published only) ──
CREATE TABLE IF NOT EXISTS teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name text NOT NULL, photo_url text, academic_status text,
  experience_years int NOT NULL DEFAULT 0 CHECK (experience_years >= 0),
  experience text,
  age_min int NOT NULL DEFAULT 4 CHECK (age_min >= 0),
  age_max int CHECK (age_max IS NULL OR age_max >= age_min),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teachers_store_id ON teachers(store_id);
CREATE INDEX IF NOT EXISTS idx_teachers_status ON teachers(status);
CREATE INDEX IF NOT EXISTS idx_classes_store_id ON classes(store_id);
CREATE INDEX IF NOT EXISTS idx_classes_category ON classes(category);
CREATE INDEX IF NOT EXISTS idx_bookings_class_id ON bookings(class_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

CREATE OR REPLACE FUNCTION guard_teacher_write() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT is_admin() AND NEW.status = 'published' THEN
      RAISE EXCEPTION 'Only admins can publish teacher profiles';
    END IF;
    RETURN NEW;
  END IF;
  IF is_admin() THEN
    IF (NEW.store_id, NEW.name, NEW.photo_url, NEW.academic_status, NEW.experience_years,
        NEW.experience, NEW.age_min, NEW.age_max)
       IS DISTINCT FROM
       (OLD.store_id, OLD.name, OLD.photo_url, OLD.academic_status, OLD.experience_years,
        OLD.experience, OLD.age_min, OLD.age_max) THEN
      RAISE EXCEPTION 'Admins can only approve or publish teacher profiles';
    END IF;
  ELSE
    IF NEW.status = 'published' AND OLD.status <> 'published' THEN
      RAISE EXCEPTION 'Only admins can publish teacher profiles';
    END IF;
    IF OLD.status = 'published' THEN NEW.status := 'pending'; END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_teacher_write ON teachers;
CREATE TRIGGER guard_teacher_write BEFORE INSERT OR UPDATE ON teachers
  FOR EACH ROW EXECUTE FUNCTION guard_teacher_write();

-- ── 5. Row Level Security ON everywhere ────────────────────────────────────
ALTER TABLE stores               ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_registrations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_admins           ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_owners         ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_owner_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers             ENABLE ROW LEVEL SECURITY;

-- ── 6. Permissions (grants) ────────────────────────────────────────────────
GRANT SELECT ON stores, classes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON stores, classes TO authenticated;
GRANT INSERT ON bookings TO anon, authenticated;
GRANT SELECT ON bookings TO authenticated;
GRANT INSERT ON pre_registrations TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON pre_registrations TO authenticated;
GRANT SELECT ON app_admins, store_owners TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_owner_invites TO authenticated;
GRANT SELECT ON teachers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON teachers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stores, classes, bookings, pre_registrations,
  app_admins, store_owners, studio_owner_invites, teachers TO service_role;

-- ── 7. Policies (old loose ones are removed, strict admin-only ones added) ──
-- stores
DROP POLICY IF EXISTS "public_read_stores"      ON stores;
DROP POLICY IF EXISTS "auth_insert_stores"      ON stores;
DROP POLICY IF EXISTS "auth_update_stores"      ON stores;
DROP POLICY IF EXISTS "owner_update_own_store"  ON stores;
DROP POLICY IF EXISTS "admin_insert_stores"     ON stores;
DROP POLICY IF EXISTS "admin_update_stores"     ON stores;
DROP POLICY IF EXISTS "admin_delete_stores"     ON stores;
CREATE POLICY "public_read_stores"  ON stores FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin_insert_stores" ON stores FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "admin_update_stores" ON stores FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_delete_stores" ON stores FOR DELETE TO authenticated USING (is_admin());

-- classes
DROP POLICY IF EXISTS "public_read_classes"  ON classes;
DROP POLICY IF EXISTS "auth_insert_classes"  ON classes;
DROP POLICY IF EXISTS "auth_update_classes"  ON classes;
DROP POLICY IF EXISTS "auth_delete_classes"  ON classes;
DROP POLICY IF EXISTS "admin_insert_classes" ON classes;
DROP POLICY IF EXISTS "admin_update_classes" ON classes;
DROP POLICY IF EXISTS "admin_delete_classes" ON classes;
CREATE POLICY "public_read_classes"  ON classes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin_insert_classes" ON classes FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "admin_update_classes" ON classes FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_delete_classes" ON classes FOR DELETE TO authenticated USING (is_admin());

-- bookings: visitors may create, only admin may read
DROP POLICY IF EXISTS "public_insert_bookings" ON bookings;
DROP POLICY IF EXISTS "auth_select_bookings"   ON bookings;
DROP POLICY IF EXISTS "admin_select_bookings"  ON bookings;
CREATE POLICY "public_insert_bookings" ON bookings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admin_select_bookings"  ON bookings FOR SELECT TO authenticated USING (is_admin());

-- "List Your School" applications: visitors may only submit; only admin reads/approves/deletes
DROP POLICY IF EXISTS "public_insert_pre_registrations" ON pre_registrations;
DROP POLICY IF EXISTS "admin_select_pre_registrations"  ON pre_registrations;
DROP POLICY IF EXISTS "admin_update_pre_registrations"  ON pre_registrations;
DROP POLICY IF EXISTS "admin_delete_pre_registrations"  ON pre_registrations;
CREATE POLICY "public_insert_pre_registrations" ON pre_registrations FOR INSERT
  TO anon, authenticated WITH CHECK (email_status = 'pending');
CREATE POLICY "admin_select_pre_registrations" ON pre_registrations FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "admin_update_pre_registrations" ON pre_registrations FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_delete_pre_registrations" ON pre_registrations FOR DELETE TO authenticated USING (is_admin());

-- admin tables
DROP POLICY IF EXISTS "admins_select_own"     ON app_admins;
DROP POLICY IF EXISTS "owners_select_own"     ON store_owners;
DROP POLICY IF EXISTS "admin_select_owners"   ON store_owners;
DROP POLICY IF EXISTS "admin_manage_invites"  ON studio_owner_invites;
CREATE POLICY "admins_select_own"    ON app_admins FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "owners_select_own"    ON store_owners FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admin_manage_invites" ON studio_owner_invites FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- teachers: public sees published only; admin sees/approves all
DROP POLICY IF EXISTS "public_select_published_teachers" ON teachers;
DROP POLICY IF EXISTS "owner_select_teachers" ON teachers;
DROP POLICY IF EXISTS "owner_insert_teachers" ON teachers;
DROP POLICY IF EXISTS "owner_update_teachers" ON teachers;
DROP POLICY IF EXISTS "owner_delete_teachers" ON teachers;
CREATE POLICY "public_select_published_teachers" ON teachers FOR SELECT TO anon, authenticated USING (status = 'published');
CREATE POLICY "owner_select_teachers" ON teachers FOR SELECT TO authenticated USING (is_store_owner(store_id) OR is_admin());
CREATE POLICY "owner_insert_teachers" ON teachers FOR INSERT TO authenticated WITH CHECK (is_store_owner(store_id));
CREATE POLICY "owner_update_teachers" ON teachers FOR UPDATE TO authenticated
  USING (is_store_owner(store_id) OR is_admin()) WITH CHECK (is_store_owner(store_id) OR is_admin());
CREATE POLICY "owner_delete_teachers" ON teachers FOR DELETE TO authenticated USING (is_store_owner(store_id) OR is_admin());

-- ── 8. Block ALL new sign-ups (only the admin account above exists) ────────
CREATE OR REPLACE FUNCTION reject_new_user_signups() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Sign-ups are disabled.' USING ERRCODE = 'permission_denied';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reject_new_user_signups() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS link_studio_owner_invite ON auth.users;   -- owner accounts are off
DROP TRIGGER IF EXISTS block_new_signups ON auth.users;
CREATE TRIGGER block_new_signups BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION reject_new_user_signups();

-- ── 9. Photo storage bucket (visitors may upload new files only) ───────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('studio-images', 'studio-images', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "public_upload_studio_images" ON storage.objects;
CREATE POLICY "public_upload_studio_images" ON storage.objects FOR INSERT
  TO anon, authenticated WITH CHECK (bucket_id = 'studio-images');

-- ── 10. Realtime for live map/class updates (skipped if already added) ─────
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['stores', 'classes'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;
