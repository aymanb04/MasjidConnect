-- 50: archived users lose database access at once; erasure can't be undone.
--
-- Review 2026-11-21, findings #5 and #6.
--
-- #5  get_my_tenant_id() and is_super_admin() never looked at is_active. An
--     archived (or erased) user's access token stays valid until it expires (up
--     to an hour), and until then PostgREST served them their whole school --
--     the API routes refused them (requireRole), the database did not.
--     Fix: both helpers return "no school" / false for an inactive or erased
--     profile. Every policy, the tenant wall (46) and the set-based helpers
--     (48) are built on these two, so one change covers all of them. The own
--     profile row stays readable (the wall's id = auth.uid() exception), so the
--     app can still see "inactive" and sign the person out.
--     `is_active IS NOT FALSE`, not `= true`: the column is nullable, and this
--     migration must never lock out someone the app treats as active today.
--
-- #6  admin_manage_profiles (mig 13) lets an admin write any column of a
--     profile in their school, including is_anonymized. Setting it back to
--     false re-opened the path reactivate -> set-password into an erased
--     account, and the name could be written back onto the kept statistics.
--     Fix: a trigger, not a policy tweak, so it also binds any policy added
--     later. For signed-in users (auth.uid() set): an erased row is read-only,
--     and is_anonymized can't be changed either way. The service role (the
--     erasure routes, operators) has no auth.uid() and is unaffected.
--
-- Idempotent. RUN IN: Supabase SQL editor (one script = one transaction).
-- Undo: 50_rollback.sql.

BEGIN;

-- ── #5 ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles
   WHERE id = (SELECT auth.uid())
     AND is_active IS NOT FALSE
     AND NOT is_anonymized;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'super_admin'
      AND is_active IS NOT FALSE AND NOT is_anonymized
  );
$$;

-- (grants unchanged: CREATE OR REPLACE keeps the ones migration 26 set)

-- ── #6 ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.profiles_erasure_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;                       -- service role / SQL editor: the erasure itself
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_anonymized THEN
    RAISE EXCEPTION 'profile % is erased and read-only', OLD.id USING ERRCODE = '42501';
  END IF;
  IF NEW.is_anonymized IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.is_anonymized ELSE false END) THEN
    RAISE EXCEPTION 'is_anonymized is set by the erasure route only' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.profiles_erasure_guard() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_erasure_guard ON public.profiles;
CREATE TRIGGER profiles_erasure_guard
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_erasure_guard();

COMMIT;

-- ── Verify (after COMMIT) ────────────────────────────────────────────────────
-- 1. SELECT prosrc LIKE '%is_active IS NOT FALSE%' FROM pg_proc
--     WHERE oid IN ('public.get_my_tenant_id'::regproc, 'public.is_super_admin'::regproc);   -- t, t
-- 2. SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass
--     AND tgname = 'profiles_erasure_guard';                                                -- 1 row
-- 3. npx tsx scripts/rls-smoke.ts (all PASS), then open the app once as the demo
--    admin, teacher and pupil (dashboard, Beheer, huiswerk, punten).
