BEGIN;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bookings_member_created_idx
  ON public.bookings (member_id, created_at DESC)
  WHERE member_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_booking_member()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.member_id := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_booking_member ON public.bookings;
CREATE TRIGGER set_booking_member
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_booking_member();

CREATE OR REPLACE FUNCTION public.my_booking_requests()
RETURNS TABLE (
  id uuid, class_id uuid, title text, school text, category text, area text,
  kind text, status text, preferred_date text, preferred_time text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT b.id, b.class_id, c.title::text, s.name::text, c.category::text, s.area::text,
         b.kind::text, b.status::text, b.preferred_date::text, b.preferred_time::text
  FROM public.bookings AS b
  JOIN public.classes AS c ON c.id = b.class_id
  LEFT JOIN public.stores AS s ON s.id = c.store_id
  WHERE b.member_id = (SELECT auth.uid())
  ORDER BY b.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.my_booking_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_booking_requests() TO authenticated;

COMMIT;
