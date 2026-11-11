-- Undo 46_tenant_wall.sql: drop every tenant_wall policy and the lookups.
-- Permissive policies are untouched by 46, so this returns to the exact
-- pre-46 behaviour. 46 never changes whether RLS is on, so neither does this.
-- category_owner_tenant belongs to migration 45 and is kept.

BEGIN;

-- 47 (grade audit log) calls the tenant_of_* lookups dropped below; without
-- them every grade save would fail. Undo 47 first.
DO $dep$
BEGIN
  IF to_regprocedure('public.audit_grade_change()') IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 47 is still installed -- run 47_rollback.sql first. Nothing was changed.';
  END IF;
END
$dep$;

DO $undo$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
      FROM pg_policy p
      JOIN pg_class c     ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND p.polname = 'tenant_wall'
  LOOP
    EXECUTE format('DROP POLICY tenant_wall ON public.%I', r.tbl);
  END LOOP;
END
$undo$;

DROP FUNCTION IF EXISTS public.tenant_of_profile(uuid);
DROP FUNCTION IF EXISTS public.tenant_of_class(uuid);
DROP FUNCTION IF EXISTS public.tenant_of_assignment(uuid);
DROP FUNCTION IF EXISTS public.tenant_of_submission(uuid);
DROP FUNCTION IF EXISTS public.tenant_of_attendance_session(uuid);
DROP FUNCTION IF EXISTS public.tenant_of_class_test(uuid);
DROP FUNCTION IF EXISTS public.tenant_of_lesson_module(uuid);
DROP FUNCTION IF EXISTS public.tenant_of_oudercontact_slot(uuid);
DROP FUNCTION IF EXISTS public.tenant_of_rapport_card(uuid);

COMMIT;
