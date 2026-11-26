BEGIN;

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- Preserve schools previously published by approving a listing application.
UPDATE public.stores AS school
SET published_at = prior.approved_at
FROM (
  SELECT school.id, min(request.approved_at) AS approved_at
  FROM public.stores AS school
  JOIN public.pre_registrations AS request
    ON school.name = btrim(coalesce(request.name, ''))
    AND school.email = request.email
    AND school.address = btrim(coalesce(request.address, ''))
    AND school.area = coalesce(request.area, '')
  WHERE request.role = 'store' AND request.approved_at IS NOT NULL
  GROUP BY school.id
) AS prior
WHERE school.id = prior.id AND school.published_at IS NULL;

DROP POLICY IF EXISTS public_read_stores ON public.stores;
CREATE POLICY public_read_stores ON public.stores FOR SELECT TO anon, authenticated
  USING (published_at IS NOT NULL);

CREATE POLICY staff_read_stores ON public.stores FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_store_owner(id));

DROP POLICY IF EXISTS public_read_classes ON public.classes;
CREATE POLICY public_read_classes ON public.classes FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.stores AS school
    WHERE school.id = classes.store_id AND school.published_at IS NOT NULL
  ));

CREATE POLICY staff_read_classes ON public.classes FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_store_owner(store_id));

CREATE FUNCTION public.enforce_school_publication_admin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.published_at IS DISTINCT FROM OLD.published_at AND current_user = 'authenticated' THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change school publication' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_school_publication_admin
BEFORE UPDATE ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.enforce_school_publication_admin();

CREATE FUNCTION public.publish_school_application(application_id uuid, school_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  approved_time timestamptz := now();
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators can publish schools' USING ERRCODE = '42501';
  END IF;

  UPDATE public.pre_registrations
  SET approved_at = coalesce(approved_at, approved_time)
  WHERE id = application_id AND role = 'store' AND rejected_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'School application is missing or rejected';
  END IF;

  UPDATE public.stores
  SET published_at = coalesce(published_at, approved_time)
  WHERE id = school_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'School is missing';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.publish_school_application(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_school_application(uuid, uuid) TO authenticated;

COMMIT;
