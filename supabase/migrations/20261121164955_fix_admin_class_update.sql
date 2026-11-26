BEGIN;

GRANT UPDATE (published_at) ON public.classes TO authenticated;

DROP POLICY IF EXISTS admin_update_classes ON public.classes;
CREATE POLICY admin_update_classes ON public.classes
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMIT;
