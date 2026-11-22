-- 49: the signup trigger stops trusting the browser.
--
-- Why: handle_new_user (migration 26) took role AND tenant_id from
-- raw_user_meta_data. That column is written by whoever calls auth.signUp(),
-- i.e. anyone with the public anon key. 26 refused only 'super_admin', so
-- {"role":"admin","tenant_id":"<any school>"} produced an admin of that school.
-- The only thing in the way was the dashboard switch "Allow new users to sign
-- up" being off -- a setting no migration records and (until this change) no
-- test checked. Review 2026-11-21, finding #1.
--
-- What changes: role and tenant_id now come ONLY from raw_app_meta_data, which
-- GoTrue lets nobody but the service role write. Names still come from
-- raw_user_meta_data (harmless, and inviteUserByEmail can't set app metadata).
-- With no app metadata the profile is a dead stub: role 'student', no school.
-- The tenant wall (46) then hides every row from it.
--
-- Callers (all service role), changed in the same commit:
--   * scripts/bulk-onboard.mjs, supabase/seed.ts, run-app zz-users.cjs:
--     createUser({ app_metadata: { role, tenant_id } })
--   * /api/invite: inviteUserByEmail cannot set app metadata, so the route sets
--     role + tenant_id on the profile right after, and deletes the new account
--     again if that fails (no half-made users).
-- APPLY 49 AND DEPLOY THE ROUTE TOGETHER: with 49 live and the old route, an
-- invited user arrives as a stub without a school (fixable in Beheer, but
-- confusing). The old route with 49 not applied is unaffected.
--
-- Not changed: the trigger on auth.users itself (it exists in production but
-- was created in the dashboard, so it is not in this repo -- see the verify
-- query at the bottom). Only the function body is replaced.
--
-- Idempotent. RUN IN: Supabase SQL editor. Undo: 49_rollback.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID := NULL;
  v_role      TEXT;
  v_app       JSONB := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb);
BEGIN
  -- Server-written only. A malformed uuid raises, which is right: only our own
  -- service-role code writes this, so a bad value is a bug to surface.
  IF NULLIF(v_app->>'tenant_id', '') IS NOT NULL THEN
    v_tenant_id := (v_app->>'tenant_id')::UUID;
  END IF;

  v_role := COALESCE(v_app->>'role', 'student');
  IF v_role NOT IN ('student', 'teacher', 'admin', 'leerlingenbegeleiding') THEN
    v_role := 'student';   -- super_admin is made by hand, never by a trigger
  END IF;

  INSERT INTO public.profiles (id, first_name, last_name, role, tenant_id, email)
  VALUES (
    NEW.id,
    LEFT(COALESCE(NEW.raw_user_meta_data->>'first_name', ''), 100),
    LEFT(COALESCE(NEW.raw_user_meta_data->>'last_name', ''), 100),
    v_role,
    v_tenant_id,
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

COMMIT;

-- ── Verify (after COMMIT) ────────────────────────────────────────────────────
-- 1. The trigger that calls it exists (expect 1 row, enabled 'O'):
--   SELECT tgname, tgenabled FROM pg_trigger
--    WHERE tgrelid = 'auth.users'::regclass AND tgfoid = 'public.handle_new_user'::regproc;
-- 2. The body is the new one (expect true):
--   SELECT prosrc LIKE '%raw_app_meta_data%' FROM pg_proc WHERE oid = 'public.handle_new_user'::regproc;
-- 3. Invite one test person into the DEMO school from Beheer and check their
--    role/school in Beheer. Then archive or erase them.
