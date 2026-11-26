/*
# Map geocoding support and "List your school" approval

Plain-English summary: schools are placed on the map from their real address. This
migration records which schools have an exact (geocoded) location, lets admins review
"List your school" requests and turn them into schools, and lets the public site
receive live updates when a school is added or changed.

## Modified tables
### stores
- geocoded_at (timestamptz, nullable): when the stored latitude/longitude were looked up
  from the address. NULL means the location is missing or only approximate.

### pre_registrations
- approved_at (timestamptz, nullable): set when an admin approves the request
- store_id (uuid, nullable, FK -> stores, ON DELETE SET NULL): the school created from it

## Security
- Admins (is_admin()) can now read, update and delete pre_registrations rows.
- Public insert policy is unchanged. Anonymous users still cannot read requests.

## Realtime
- Adds the stores table to the supabase_realtime publication (if it exists) so open
  pages refresh the map when a school is added or its address changes.

## Notes
1. Additive and idempotent: safe to re-run, no data removed.
*/

ALTER TABLE stores ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;

ALTER TABLE pre_registrations ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE pre_registrations
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id) ON DELETE SET NULL;

GRANT SELECT, UPDATE, DELETE ON pre_registrations TO authenticated;

DROP POLICY IF EXISTS "admin_select_pre_registrations" ON pre_registrations;
CREATE POLICY "admin_select_pre_registrations" ON pre_registrations FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_update_pre_registrations" ON pre_registrations;
CREATE POLICY "admin_update_pre_registrations" ON pre_registrations FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_pre_registrations" ON pre_registrations;
CREATE POLICY "admin_delete_pre_registrations" ON pre_registrations FOR DELETE
  TO authenticated USING (is_admin());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'stores'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stores;
  END IF;
END $$;
