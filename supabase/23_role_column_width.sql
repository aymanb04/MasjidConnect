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
-- already list the value; only the width was wrong. schema.sql declares these
-- columns unbounded, so the file and the live database had drifted.
--
-- Postgres refuses to retype a column that any policy references
-- ("0A000: cannot alter type of a column used in a policy definition"). Reading
-- the migration files is NOT enough to find them: most policies go through the
-- get_my_role() helper, but some inline a subquery on profiles.role instead
-- (announcements_delete does), and the numbered files do not make that obvious.
-- The service-role key cannot read pg_policies over PostgREST either.
--
-- So this migration discovers the dependent policies from pg_depend, saves their
-- definitions from pg_policies, drops them, widens the columns, and recreates
-- them from the saved definitions — whatever they turn out to be. Everything is
-- in one transaction: on any failure the whole thing rolls back and every policy
-- stays exactly as it was.
--
-- After applying: re-run `npx tsx scripts/rls-smoke.ts` (expect 33/33) and sync
-- supabase/schema.sql.

BEGIN;

-- 1. Every policy that depends on profiles.role or invitations.role.
CREATE TEMP TABLE _polsave ON COMMIT DROP AS
WITH target_cols AS (
    SELECT a.attrelid, a.attnum
      FROM pg_attribute a
     WHERE a.attname = 'role'
       AND a.attrelid IN ('public.profiles'::regclass, 'public.invitations'::regclass)
),
dependent AS (
    SELECT n.nspname AS schemaname, c.relname AS tablename, pol.polname AS policyname
      FROM pg_depend d
      JOIN pg_policy pol   ON pol.oid = d.objid AND d.classid = 'pg_policy'::regclass
      JOIN pg_class c      ON c.oid = pol.polrelid
      JOIN pg_namespace n  ON n.oid = c.relnamespace
      JOIN target_cols t   ON t.attrelid = d.refobjid AND t.attnum = d.refobjsubid
     GROUP BY 1, 2, 3
)
SELECT p.schemaname, p.tablename, p.policyname,
       p.permissive, p.roles, p.cmd, p.qual, p.with_check
  FROM pg_policies p
  JOIN dependent dep
    ON dep.schemaname = p.schemaname
   AND dep.tablename  = p.tablename
   AND dep.policyname = p.policyname;

-- 2. Drop them.
DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT * FROM _polsave LOOP
        EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;

-- 3. The actual point of the migration.
ALTER TABLE public.profiles    ALTER COLUMN role TYPE character varying(50);
ALTER TABLE public.invitations ALTER COLUMN role TYPE character varying(50);

-- 4. Put them back exactly as they were (qual/with_check come straight from
--    pg_policies, so the restored expressions are the live ones, not my guess).
DO $$
DECLARE r record; stmt text;
BEGIN
    FOR r IN SELECT * FROM _polsave LOOP
        stmt := format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
                       r.policyname, r.schemaname, r.tablename,
                       CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
                       r.cmd,
                       array_to_string(r.roles, ', '));
        IF r.qual       IS NOT NULL THEN stmt := stmt || format(' USING (%s)', r.qual);       END IF;
        IF r.with_check IS NOT NULL THEN stmt := stmt || format(' WITH CHECK (%s)', r.with_check); END IF;
        EXECUTE stmt;
    END LOOP;
END $$;

COMMIT;

-- Verify: both columns must read 50, and every policy that was dropped must be
-- back, still scoped TO authenticated.
SELECT 'column' AS kind,
       table_name AS name,
       character_maximum_length::text AS detail
  FROM information_schema.columns
 WHERE table_schema = 'public' AND column_name = 'role'
   AND table_name IN ('profiles', 'invitations')
UNION ALL
SELECT 'policy',
       tablename || '.' || policyname,
       cmd || ' -> ' || array_to_string(roles, ',')
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('profiles', 'invitations', 'announcements')
 ORDER BY 1, 2;
