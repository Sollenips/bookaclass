/*
  BookaClass - Free Trial + Enrollment Requests (ONE migration)
  =============================================================
  Run AFTER bookaclass_consolidated_setup.sql (needs its is_admin() function).
  Safe to run more than once. Deletes nothing.

  What it does:
  - Reuses the existing "bookings" table for BOTH request types (kind = 'trial' | 'enrollment').
    Old rows stay and show under Enrollment Requests.
  - Adds "class_slots": the days/times you configure per class. Trials can only be booked on these.
  - A database trigger sets the school, the price (trial = 0, enrollment = class price),
    status = 'pending' and checks the slot, age, consent. Visitors cannot fake any of it.
  - Blocks duplicate free trials (same student name at the same school) and duplicate
    pending enrollments (same student name in the same class).
  - Only the admin can read or change requests. No payments, no owner accounts.
*/

-- ── 1. Columns on bookings ─────────────────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'enrollment',
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS preferred_time time,
  ADD COLUMN IF NOT EXISTS first_month_price_eur numeric(8,2),
  ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

ALTER TABLE bookings ALTER COLUMN preferred_date DROP NOT NULL;
ALTER TABLE bookings ALTER COLUMN booker_phone DROP NOT NULL;

-- Fill school for old rows
UPDATE bookings b SET store_id = c.store_id
FROM classes c WHERE c.id = b.class_id AND b.store_id IS NULL;

-- Replace any old status/kind checks with the new allowed values
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.bookings'::regclass AND contype = 'c'
             AND (pg_get_constraintdef(oid) ILIKE '%status%' OR pg_get_constraintdef(oid) ILIKE '%kind%')
  LOOP
    EXECUTE format('ALTER TABLE bookings DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'confirmed'));
ALTER TABLE bookings ADD CONSTRAINT bookings_kind_check CHECK (kind IN ('trial', 'enrollment'));

CREATE INDEX IF NOT EXISTS idx_bookings_kind_status ON bookings(kind, status);
CREATE INDEX IF NOT EXISTS idx_bookings_store_id ON bookings(store_id);

-- ── 2. Available days/times per class ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS class_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),   -- 1 = Monday ... 7 = Sunday
  start_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, weekday, start_time)
);
CREATE INDEX IF NOT EXISTS idx_class_slots_class_id ON class_slots(class_id);
ALTER TABLE class_slots ENABLE ROW LEVEL SECURITY;

-- ── 3. Server-side checks on every new request ─────────────────────────────
CREATE OR REPLACE FUNCTION prepare_booking_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c classes%ROWTYPE;
BEGIN
  SELECT * INTO c FROM classes WHERE id = NEW.class_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'class_not_found'; END IF;

  NEW.store_id := c.store_id;
  NEW.status := 'pending';
  NEW.status_updated_at := NULL;
  NEW.participant_name := btrim(NEW.participant_name);
  NEW.booker_name := btrim(NEW.booker_name);
  NEW.booker_email := lower(btrim(NEW.booker_email));
  NEW.booker_phone := btrim(NEW.booker_phone);
  NEW.guardian_name := NULLIF(btrim(COALESCE(NEW.guardian_name, '')), '');

  IF char_length(NEW.participant_name) < 2 OR char_length(NEW.participant_name) > 120 THEN
    RAISE EXCEPTION 'invalid_name'; END IF;
  IF NEW.booker_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(NEW.booker_email) > 200 THEN
    RAISE EXCEPTION 'invalid_email'; END IF;
  IF NEW.booker_phone IS NULL OR char_length(NEW.booker_phone) < 6 OR char_length(NEW.booker_phone) > 30 THEN
    RAISE EXCEPTION 'invalid_phone'; END IF;
  IF NEW.participant_age < 0 OR NEW.participant_age > 120 THEN RAISE EXCEPTION 'invalid_age'; END IF;
  IF NEW.participant_age < c.age_min OR (c.age_max IS NOT NULL AND NEW.participant_age > c.age_max) THEN
    RAISE EXCEPTION 'age_out_of_range'; END IF;
  IF NEW.participant_age < 18 AND NEW.guardian_name IS NULL THEN RAISE EXCEPTION 'guardian_required'; END IF;
  IF NEW.privacy_accepted_at IS NULL THEN RAISE EXCEPTION 'privacy_required'; END IF;
  NEW.privacy_accepted_at := now();
  NEW.notes := NULLIF(left(btrim(COALESCE(NEW.notes, '')), 1000), '');

  IF NEW.kind = 'trial' THEN
    NEW.first_month_price_eur := 0;
    IF NEW.preferred_date IS NULL OR NEW.preferred_time IS NULL THEN RAISE EXCEPTION 'slot_required'; END IF;
    IF NEW.preferred_date < current_date OR NEW.preferred_date > current_date + 60 THEN
      RAISE EXCEPTION 'slot_unavailable'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM class_slots s
      WHERE s.class_id = NEW.class_id
        AND s.weekday = extract(isodow FROM NEW.preferred_date)::int
        AND s.start_time = NEW.preferred_time
    ) THEN RAISE EXCEPTION 'slot_unavailable'; END IF;
  ELSE
    NEW.kind := 'enrollment';
    NEW.first_month_price_eur := c.price_eur;
    NEW.preferred_date := NULL;
    NEW.preferred_time := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.prepare_booking_request() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS prepare_booking_request ON bookings;
CREATE TRIGGER prepare_booking_request BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION prepare_booking_request();

-- Stamp the time whenever the admin changes a status
CREATE OR REPLACE FUNCTION touch_booking_status() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN NEW.status_updated_at := now(); END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS touch_booking_status ON bookings;
CREATE TRIGGER touch_booking_status BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION touch_booking_status();

-- ── 4. Duplicate protection (skipped with a notice if old data already clashes) ──
DO $$
BEGIN
  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_trial_per_student_school
      ON bookings (store_id, lower(btrim(participant_name)))
      WHERE kind = 'trial' AND status IN ('pending', 'approved', 'confirmed');
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'uniq_trial_per_student_school skipped: existing duplicates';
  END;
  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_enrollment_per_student_class
      ON bookings (class_id, lower(btrim(participant_name)))
      WHERE kind = 'enrollment' AND status IN ('pending', 'approved', 'confirmed');
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'uniq_enrollment_per_student_class skipped: existing duplicates';
  END;
END $$;

-- ── 5. Permissions + Row Level Security ────────────────────────────────────
GRANT SELECT ON class_slots TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON class_slots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON class_slots TO service_role;

GRANT INSERT ON bookings TO anon, authenticated;
GRANT SELECT ON bookings TO authenticated;
GRANT UPDATE (status) ON bookings TO authenticated;      -- admin may change ONLY the status

DROP POLICY IF EXISTS "public_insert_bookings" ON bookings;
DROP POLICY IF EXISTS "admin_select_bookings"  ON bookings;
DROP POLICY IF EXISTS "admin_update_bookings"  ON bookings;
CREATE POLICY "public_insert_bookings" ON bookings FOR INSERT
  TO anon, authenticated WITH CHECK (status = 'pending');
CREATE POLICY "admin_select_bookings" ON bookings FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "admin_update_bookings" ON bookings FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "public_read_class_slots"   ON class_slots;
DROP POLICY IF EXISTS "admin_insert_class_slots"  ON class_slots;
DROP POLICY IF EXISTS "admin_update_class_slots"  ON class_slots;
DROP POLICY IF EXISTS "admin_delete_class_slots"  ON class_slots;
CREATE POLICY "public_read_class_slots"  ON class_slots FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin_insert_class_slots" ON class_slots FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "admin_update_class_slots" ON class_slots FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_delete_class_slots" ON class_slots FOR DELETE TO authenticated USING (is_admin());
