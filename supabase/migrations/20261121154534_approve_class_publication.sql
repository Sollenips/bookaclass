BEGIN;

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS schedule_key text,
  ADD COLUMN IF NOT EXISTS schedule_ages text,
  ADD COLUMN IF NOT EXISTS schedule_cost text,
  ADD COLUMN IF NOT EXISTS schedule_availability text;

CREATE UNIQUE INDEX IF NOT EXISTS classes_store_schedule_key
  ON public.classes (store_id, schedule_key);

DROP POLICY IF EXISTS public_read_classes ON public.classes;

CREATE POLICY public_read_classes ON public.classes
  FOR SELECT TO anon, authenticated
  USING (
    published_at IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.stores AS school
      WHERE school.id = classes.store_id AND school.published_at IS NOT NULL
    )
  );

DROP POLICY IF EXISTS staff_read_classes ON public.classes;

CREATE POLICY staff_read_classes ON public.classes
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_store_owner(store_id));

CREATE OR REPLACE FUNCTION public.enforce_class_publication_admin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  changes_publication boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    changes_publication := NEW.published_at IS NOT NULL;
  ELSE
    changes_publication := NEW.published_at IS DISTINCT FROM OLD.published_at;
  END IF;

  IF changes_publication THEN
    IF current_user = 'anon' THEN
      RAISE EXCEPTION 'Only administrators can publish classes' USING ERRCODE = '42501';
    ELSIF current_user = 'authenticated' AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can publish classes' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_class_publication_admin ON public.classes;

CREATE TRIGGER enforce_class_publication_admin
  BEFORE INSERT OR UPDATE OF published_at ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_class_publication_admin();

DO $$
BEGIN
  IF to_regprocedure('public.resolve_scheduled_class(uuid,text,text,text,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.resolve_scheduled_class(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated';
  END IF;
END;
$$;

COMMIT;
