-- 46: the tenant wall -- one RESTRICTIVE policy on every table.
--
-- Why: the same bug has now shipped five times (migrations 12, 24, 26, 34, 39):
-- a new permissive policy forgets "AND tenant_id = my tenant", and an admin of
-- school A can read or write school B. Fixing each policy (migration 45) treats
-- the symptom. This migration removes the bug class.
--
-- How: Postgres OR-s permissive policies together, but AND-s every RESTRICTIVE
-- policy on top of them. So each table gets one restrictive "tenant_wall":
--
--     row's school = my school   OR   I am super_admin
--
-- After this, a sloppy permissive policy can at worst over-share INSIDE a
-- school; it can no longer reach another school's rows, for SELECT, INSERT,
-- UPDATE (old and new row) or DELETE.
--
--   * Tables with a tenant_id column: found at apply time from the live
--     catalog (not from schema.sql, which has drifted before), walled on it.
--   * Child tables without tenant_id: walled through their parent via small
--     SECURITY DEFINER lookups (the pattern of migration 45's
--     category_owner_tenant). Where a child row also names a pupil/teacher,
--     that person must be in my school too -- so nobody can link another
--     school's pupil into their own class either.
--   * profiles: you can always READ your own row (super_admin has tenant_id
--     NULL); writes still need your own school, so nobody can move themself.
--   * tenants: wall on id.
--   * Rows with tenant_id NULL (feedback / audit_logs written by super_admin)
--     stay visible to super_admin only -- as before.
--
-- Not affected: the service role (bypasses RLS: all /api routes, erasure,
-- operator scripts), anon (has no permissive policy anywhere, and the wall
-- is TO authenticated only), FK cascades, and SECURITY DEFINER functions.
--
-- Safety: the last block FAILS THE WHOLE TRANSACTION if any public table with
-- RLS enabled is left without a wall -- e.g. a table that exists in production
-- but not in our snapshot. Nothing is applied in that case; send the error
-- text to Claude.
--
-- Idempotent. RUN IN: Supabase SQL editor, as one transaction.
-- RLS on/off is never changed by this file.
-- Undo: 46_rollback.sql.  Verify: the queries at the bottom, then
--   npx tsx scripts/rls-smoke.ts   (all PASS, including section "migration 46").

BEGIN;

-- ── 1. Lookups: "which school owns this parent row?" ─────────────────────────
-- SECURITY DEFINER so they read past RLS (no recursion, no planning bomb --
-- see migrations 33/36), STABLE, owned by postgres, search_path pinned.

CREATE OR REPLACE FUNCTION public.tenant_of_profile(p uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$fn$ SELECT tenant_id FROM profiles WHERE id = p $fn$;

CREATE OR REPLACE FUNCTION public.tenant_of_class(p uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$fn$ SELECT tenant_id FROM classes WHERE id = p $fn$;

CREATE OR REPLACE FUNCTION public.tenant_of_assignment(p uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$fn$ SELECT c.tenant_id FROM assignments a JOIN classes c ON c.id = a.class_id WHERE a.id = p $fn$;

CREATE OR REPLACE FUNCTION public.tenant_of_submission(p uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$fn$ SELECT c.tenant_id FROM submissions s
       JOIN assignments a ON a.id = s.assignment_id
       JOIN classes c     ON c.id = a.class_id
      WHERE s.id = p $fn$;

CREATE OR REPLACE FUNCTION public.tenant_of_attendance_session(p uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$fn$ SELECT c.tenant_id FROM attendance_sessions s JOIN classes c ON c.id = s.class_id WHERE s.id = p $fn$;

CREATE OR REPLACE FUNCTION public.tenant_of_class_test(p uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$fn$ SELECT c.tenant_id FROM class_tests t JOIN classes c ON c.id = t.class_id WHERE t.id = p $fn$;

CREATE OR REPLACE FUNCTION public.tenant_of_lesson_module(p uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$fn$ SELECT c.tenant_id FROM lesson_modules m JOIN classes c ON c.id = m.class_id WHERE m.id = p $fn$;

CREATE OR REPLACE FUNCTION public.tenant_of_oudercontact_slot(p uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$fn$ SELECT tenant_id FROM oudercontact_slots WHERE id = p $fn$;

CREATE OR REPLACE FUNCTION public.tenant_of_rapport_card(p uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$fn$ SELECT tenant_id FROM rapport_cards WHERE id = p $fn$;

-- (category_owner_tenant(uuid) already exists, from migration 45.)

DO $grants$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'tenant_of_profile', 'tenant_of_class', 'tenant_of_assignment',
    'tenant_of_submission', 'tenant_of_attendance_session',
    'tenant_of_class_test', 'tenant_of_lesson_module',
    'tenant_of_oudercontact_slot', 'tenant_of_rapport_card'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(uuid) FROM public, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(uuid) TO authenticated', f);
  END LOOP;
END
$grants$;

-- One expression for "me": cheap, evaluated once per statement as an initplan.
-- (Spelled out inline below rather than wrapped in a function, so the planner
-- sees (SELECT ...) and caches it.)

-- ── 2. Tables that carry tenant_id -- found from the live catalog ───────────
DO $wall$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
     ORDER BY 1
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_wall ON public.%I', r.tbl);
    IF r.tbl = 'profiles' THEN
      EXECUTE $p$
        CREATE POLICY tenant_wall ON public.profiles AS RESTRICTIVE
          FOR ALL TO authenticated
          USING (
            id = (SELECT auth.uid())
            OR tenant_id = (SELECT get_my_tenant_id())
            OR (SELECT is_super_admin())
          )
          -- No "own row" escape here: during an UPDATE get_my_tenant_id()
          -- still sees the OLD row, so this already allows every edit of
          -- your own profile -- except moving yourself into another school
          -- (the bench caught exactly that with "id = auth.uid()" here).
          WITH CHECK (
            tenant_id = (SELECT get_my_tenant_id())
            OR (SELECT is_super_admin())
          )
      $p$;
    ELSE
      EXECUTE format($p$
        CREATE POLICY tenant_wall ON public.%I AS RESTRICTIVE
          FOR ALL TO authenticated
          USING      (tenant_id = (SELECT get_my_tenant_id()) OR (SELECT is_super_admin()))
          WITH CHECK (tenant_id = (SELECT get_my_tenant_id()) OR (SELECT is_super_admin()))
      $p$, r.tbl);
    END IF;
  END LOOP;
END
$wall$;

-- ── 3. tenants: wall on id ───────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_wall ON public.tenants;
CREATE POLICY tenant_wall ON public.tenants AS RESTRICTIVE
  FOR ALL TO authenticated
  USING      (id = (SELECT get_my_tenant_id()) OR (SELECT is_super_admin()))
  WITH CHECK (id = (SELECT get_my_tenant_id()) OR (SELECT is_super_admin()));

-- ── 4. Child tables without tenant_id -- walled through their parent ─────────
-- USING (reads, and the old row of UPDATE/DELETE) checks the parent's school.
-- WITH CHECK (new rows) also checks the pupil/teacher the row names: that is
-- what stops linking another school's pupil into my class. Reads don't need
-- the second lookup -- no write can create such a row -- which halves the
-- per-row cost on the big tables (attendance_records, submissions).
-- Skipped (with a NOTICE) if the table doesn't exist; the guard in step 5
-- still catches any table that ends up without a wall.
DO $child$
DECLARE
  me constant text := '(SELECT get_my_tenant_id())';
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('assignments',           'tenant_of_class(class_id)',                 NULL),
    ('attendance_sessions',   'tenant_of_class(class_id)',                 NULL),
    ('class_tests',           'tenant_of_class(class_id)',                 NULL),
    ('lesson_modules',        'tenant_of_class(class_id)',                 NULL),
    ('class_students',        'tenant_of_class(class_id)',                 'tenant_of_profile(student_id)'),
    ('class_teachers',        'tenant_of_class(class_id)',                 'tenant_of_profile(teacher_id)'),
    ('exam_scores',           'tenant_of_class(class_id)',                 'tenant_of_profile(student_id)'),
    ('assignment_students',   'tenant_of_assignment(assignment_id)',       'tenant_of_profile(student_id)'),
    ('submissions',           'tenant_of_assignment(assignment_id)',       'tenant_of_profile(student_id)'),
    ('attendance_records',    'tenant_of_attendance_session(session_id)',  'tenant_of_profile(student_id)'),
    ('test_scores',           'tenant_of_class_test(test_id)',             'tenant_of_profile(student_id)'),
    ('category_scores',       'category_owner_tenant(category_id)',        'tenant_of_profile(student_id)'),
    ('oudercontact_bookings', 'tenant_of_oudercontact_slot(slot_id)',      'tenant_of_profile(student_id)'),
    ('rapport_lines',         'tenant_of_rapport_card(rapport_card_id)',   'tenant_of_class(class_id)'),
    ('module_documents',      'tenant_of_lesson_module(module_id)',        NULL),
    ('submission_feedback',   'tenant_of_submission(submission_id)',       NULL),
    ('submission_files',      'tenant_of_submission(submission_id)',       NULL)
  ) AS t(tbl, parent, person)
  LOOP
    IF to_regclass('public.' || r.tbl) IS NULL THEN
      RAISE NOTICE 'tenant_wall: table % does not exist, skipped', r.tbl;
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = 'tenant_id') THEN
      CONTINUE;  -- already walled on its own tenant_id in step 2
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS tenant_wall ON public.%I', r.tbl);
    EXECUTE format(
      'CREATE POLICY tenant_wall ON public.%1$I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (%2$s = %4$s OR (SELECT is_super_admin())) '
      'WITH CHECK ((%2$s = %4$s AND %3$s) OR (SELECT is_super_admin()))',
      r.tbl, r.parent,
      CASE WHEN r.person IS NULL THEN 'true' ELSE r.person || ' = ' || me END,
      me);
  END LOOP;
END
$child$;

-- ── 5. Guard: no RLS table may be left without a wall ────────────────────────
-- This is the check that makes the migration fail closed. If it raises, the
-- whole transaction (steps 1-4 included) is rolled back.
DO $guard$
DECLARE missing text;
BEGIN
  -- RLS switched OFF on a public table is its own problem (PostgREST serves it
  -- to whoever has the grant). 46 deliberately does not flip it -- enabling RLS
  -- on a table with no permissive policy would lock the app out -- but says so.
  FOR missing IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
  LOOP
    RAISE WARNING 'tenant_wall: RLS is OFF on public.% -- wall created but inactive; investigate', missing;
  END LOOP;
  missing := NULL;

  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO missing
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
     AND c.relrowsecurity
     AND NOT EXISTS (SELECT 1 FROM pg_policy p
                      WHERE p.polrelid = c.oid AND p.polname = 'tenant_wall'
                        AND NOT p.polpermissive);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'tenant_wall missing on: % -- nothing applied. Add these tables to step 4 and rerun.', missing;
  END IF;
END
$guard$;

COMMIT;

-- ── Verify (run after COMMIT) ────────────────────────────────────────────────
-- 1. Every RLS table has exactly one restrictive tenant_wall (expect 0 rows):
--   SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
--      AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
--                       AND p.polname = 'tenant_wall' AND NOT p.polpermissive);
-- 2. How many walls (expect ~44, one per table):
--   SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
--      AND policyname = 'tenant_wall' AND permissive = 'RESTRICTIVE';
-- 3. Then: npx tsx scripts/rls-smoke.ts  -- all PASS. Then open the app as
--    the demo teacher and pupil once (dashboard, huiswerk, punten).
