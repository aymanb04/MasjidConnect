-- ============================================================
-- 44 — Feedback inbox: no direct inserts from the browser
-- ============================================================
-- The feedback button is staff-only since 2026-10-24: parents, using their
-- child's pupil account, took it for a way to reach the school, and their
-- messages landed in the MasjidConnect inbox that nobody at the school sees.
-- The button is hidden for pupils and /api/feedback refuses them.
--
-- This closes the way around that. "users_insert_feedback" let ANY logged-in
-- user insert a row directly through the REST API (checked 2026-10-24: a demo
-- pupil's insert was accepted, status 201). Nothing in the app needs it: the
-- only writer is /api/feedback, which uses the service role and bypasses RLS.
--
-- super_admin_manage_feedback (read / mark read / delete) is untouched.
-- Idempotent. Rollback: 44_rollback.sql.

DROP POLICY IF EXISTS "users_insert_feedback" ON public.feedback;

-- ── VERIFY ──────────────────────────────────────────────────────────────────
-- 1. Only the super-admin policy is left on feedback:
--    SELECT policyname, cmd, roles FROM pg_policies
--     WHERE schemaname = 'public' AND tablename = 'feedback';
--    → one row: super_admin_manage_feedback | ALL | {authenticated}
--
-- 2. RLS is still on:
--    SELECT relrowsecurity FROM pg_class WHERE oid = 'public.feedback'::regclass;
--    → true
