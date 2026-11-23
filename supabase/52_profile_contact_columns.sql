-- 52: pupils no longer read everyone's e-mail address and phone number.
--
-- Review 2026-11-21, finding #3 (SECURITY_AND_INFRA §2.4).
--
-- view_same_tenant_profiles lets every signed-in user read every profile row of
-- their school, and row-level security can't hide columns. So any pupil could
-- ask PostgREST for `profiles?select=email,phone` and get the contact details of
-- every pupil and staff member in the school. Accepted while only adult staff
-- had accounts; not since ~100 minors do (2026-09-15).
--
-- Fix: column privileges. `authenticated` keeps SELECT on every profiles column
-- EXCEPT email and phone. Rows stay as visible as before (names, roles: the
-- screens need them); the two contact columns don't. Contact details now come
-- only from get_profile_contacts() (migration 51), which checks the role.
-- `anon` loses SELECT entirely (it never had rows anyway). The grant is
-- computed from the live catalog, so a column schema.sql doesn't list (it has
-- drifted before) still gets granted.
--
-- UPDATE is untouched (no SELECT is needed on a column that is only written):
-- Beheer's edit dialog still saves a phone number. The service role (API
-- routes, operator scripts) has its own grants and is unaffected.
--
-- A NEW profiles column is NOT readable by signed-in users until granted:
--   GRANT SELECT (new_col) ON public.profiles TO authenticated;
-- and it needs an entry in PROFILE_COLUMNS (lib/profile-contacts.ts). The bench
-- fails if the table, the grants and that list drift apart.
--
-- ORDER: 51 applied + the app that uses it deployed FIRST. The old app reads
-- profiles with select('*'), which fails under these grants (everyone would be
-- signed out). Push this file only after it is live (public repo).
--
-- Pre-check (read-only), expect exactly these columns, nothing more:
--   SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
--     FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles';
--   -> id, tenant_id, role, first_name, last_name, email, phone, is_active,
--      is_anonymized, terms_accepted_at, terms_version, created_at, updated_at,
--      archived_at, must_change_password   (order may differ)
--
-- Idempotent. RUN IN: Supabase SQL editor (one script = one transaction).
-- Undo: 52_rollback.sql.

BEGIN;

REVOKE SELECT ON public.profiles FROM anon, authenticated;
-- Column-level grants survive a table-level REVOKE; clear them too, so a re-run
-- (or an earlier hand-made grant on email/phone) can't leave them readable.
REVOKE SELECT (email, phone) ON public.profiles FROM anon, authenticated;

DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'profiles'
     AND column_name NOT IN ('email', 'phone');
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO authenticated', cols);
END $$;

COMMIT;

-- Verify (expect has_email = false, has_phone = false, has_name = true):
--   SELECT has_column_privilege('authenticated', 'public.profiles', 'email', 'SELECT') AS has_email,
--          has_column_privilege('authenticated', 'public.profiles', 'phone', 'SELECT') AS has_phone,
--          has_column_privilege('authenticated', 'public.profiles', 'first_name', 'SELECT') AS has_name;
