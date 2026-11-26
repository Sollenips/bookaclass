/*
# Structured class list for applications + live class updates

Plain-English summary: the "List Your School" form now saves the weekly class table in
a structured form, so that pressing "Approve" in the admin Requests tab can publish the
school AND its classes exactly as submitted. Visitors with the site open also see new
classes appear without refreshing.

## Modified tables
- pre_registrations.schedule_rows (jsonb, nullable): one entry per class row submitted
  (lesson, day, time, ages, cost, availability)

## Realtime
- Adds the classes table to the supabase_realtime publication (if it exists), next to
  stores, so the public site refreshes when a class is added.

## Notes
1. Additive and safe to re-run. No data is removed.
*/

ALTER TABLE pre_registrations ADD COLUMN IF NOT EXISTS schedule_rows jsonb;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'classes'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.classes;
  END IF;
END $$;
