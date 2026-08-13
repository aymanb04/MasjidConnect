-- Migration 23 — widen the role columns so 'leerlingenbegeleiding' fits.
--
-- Bug found 2026-08-13. The live columns are character varying(20); the role
-- string 'leerlingenbegeleiding' is 21 characters. Every attempt to create a
-- counselor failed inside the handle_new_user trigger with "value too long for
-- type character varying(20)", which GoTrue surfaced as a generic 500 and
-- /api/invite reported as "Uitnodiging kon niet worden verzonden" — pointing at
-- e-mail delivery rather than the database.
--
-- Consequence: the leerlingenbegeleiding role has been UNUSABLE since migration
-- 13 introduced it. That is why PROJECT.md records it as "never exercised, no
-- demo account" — the account could not be created at all. The CHECK constraints
-- already list the value, so only the width was wrong, and schema.sql shows an
-- unbounded `character varying`, so the file and the live database had drifted.
--
-- Postgres refuses to retype a column that a policy references
-- ("0A000: cannot alter type of a column used in a policy definition"), so the
-- two policies that read profiles.role are dropped and recreated verbatim:
--   * update_own_profile    — from 7b_rls_auth_uid_wrap.sql (unchanged)
--   * admin_manage_profiles — from 13_leerlingenbegeleiding_role.sql (the
--                             current version, with the four-role array)
-- The other three profiles policies (view_own_profile, view_same_tenant_profiles,
-- super_admin_all_profiles) never mention role and are left alone, as is
-- admin_manage_invitations, which calls get_my_role() rather than reading the
-- column.
--
-- Everything is inside one transaction: if any step fails the whole thing rolls
-- back and profiles keeps its policies. Do not run the statements piecemeal.
--
-- After applying: re-run `npx tsx scripts/rls-smoke.ts` (expect 33/33) and sync
-- supabase/schema.sql, which still declares these columns unbounded.

BEGIN;

DROP POLICY IF EXISTS update_own_profile    ON public.profiles;
DROP POLICY IF EXISTS admin_manage_profiles ON public.profiles;

ALTER TABLE public.profiles    ALTER COLUMN role TYPE character varying(50);
ALTER TABLE public.invitations ALTER COLUMN role TYPE character varying(50);

-- Recreated exactly as they were. update_own_profile keeps its known recursion
-- quirk (PROJECT.md gotcha #3) on purpose: a width fix must not change behaviour.
CREATE POLICY update_own_profile ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (
    id = (SELECT auth.uid())
    AND (role)::text = ((SELECT role FROM profiles WHERE id = (SELECT auth.uid())))::text
    AND tenant_id = (SELECT tenant_id FROM profiles WHERE id = (SELECT auth.uid()))
  );

CREATE POLICY admin_manage_profiles ON public.profiles
  FOR ALL TO authenticated
  USING (
    (SELECT get_my_role())::text = 'admin'
    AND tenant_id = (SELECT get_my_tenant_id())
  )
  WITH CHECK (
    (SELECT get_my_role())::text = 'admin'
    AND tenant_id = (SELECT get_my_tenant_id())
    AND (role)::text = ANY (ARRAY['student', 'teacher', 'admin', 'leerlingenbegeleiding'])
  );

COMMIT;

-- Verify: both columns report 50 ...
SELECT table_name, column_name, character_maximum_length
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN ('profiles', 'invitations')
   AND column_name = 'role';

-- ... and all five profiles policies are present and scoped to authenticated.
SELECT policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'profiles'
 ORDER BY policyname;
