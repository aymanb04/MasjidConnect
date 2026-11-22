-- 50 rollback: helpers back to migration 26's bodies, erasure guard removed.
-- WARNING: re-opens findings #5 (archived users keep reading until their token
-- expires) and #6 (an admin can un-erase a profile) of the 2026-11-21 review.
-- No BEGIN/COMMIT so the bench can run it inside its own transaction; the
-- Supabase SQL editor runs a pasted script as one transaction anyway.
CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'super_admin'
  );
$$;

DROP TRIGGER IF EXISTS profiles_erasure_guard ON public.profiles;
DROP FUNCTION IF EXISTS public.profiles_erasure_guard();
