-- ============================================================
-- 7c — Scope every RLS policy TO authenticated
-- ============================================================
--
-- Background:
--   PostgreSQL RLS policies created without a TO clause default to `public`,
--   meaning they apply to every Postgres role: anon, authenticated,
--   authenticator, dashboard_user, supabase_privileged_role.
--
--   The Supabase Performance Advisor counts a multiple_permissive_policies
--   warning *per role × table × action*, so 4 unused roles inflate the
--   count by ~5x. With 65 policies, that's ~275 warnings — 4/5 of which are
--   spurious because the app only ever uses the `authenticated` role.
--
-- What this script does:
--   ALTER POLICY ... TO authenticated; — for all 65 RLS policies.
--   USING/WITH CHECK clauses are preserved (ALTER POLICY without those
--   keywords leaves them untouched).
--
-- Why it's safe:
--   - The app requires login (useProfile redirects unauthenticated users
--     to /login). No legitimate request ever hits RLS as `anon`.
--   - The API routes use the service-role key (supabaseAdmin), which
--     bypasses RLS entirely. Restricting to authenticated has no effect.
--   - Supabase Studio also uses service-role internally — restricting
--     `dashboard_user` won't break the dashboard UI.
--   - `authenticator` and `supabase_privileged_role` are infrastructure
--     roles that don't read app data through these policies.
--
-- Expected impact:
--   Performance Advisor warnings drop from ~275 to ~55 (the remaining ones
--   are real same-role duplicates that need policy consolidation, tracked
--   separately).
--
-- Safety:
--   Single BEGIN/COMMIT transaction. ALTER POLICY is fast (metadata-only,
--   no data movement). If anything errors mid-script, full rollback.

BEGIN;

-- ─── tenants ────────────────────────────────────────────────
ALTER POLICY "admin_view_own_tenant"           ON public.tenants TO authenticated;
ALTER POLICY "super_admin_all_tenants"         ON public.tenants TO authenticated;

-- ─── profiles ───────────────────────────────────────────────
ALTER POLICY "view_own_profile"                ON public.profiles TO authenticated;
ALTER POLICY "view_same_tenant_profiles"       ON public.profiles TO authenticated;
ALTER POLICY "update_own_profile"              ON public.profiles TO authenticated;
ALTER POLICY "admin_manage_profiles"           ON public.profiles TO authenticated;
ALTER POLICY "super_admin_all_profiles"        ON public.profiles TO authenticated;

-- ─── school_years ───────────────────────────────────────────
ALTER POLICY "tenant_members_view_years"       ON public.school_years TO authenticated;
ALTER POLICY "admin_manage_years"              ON public.school_years TO authenticated;
ALTER POLICY "super_admin_all_years"           ON public.school_years TO authenticated;

-- ─── groups ─────────────────────────────────────────────────
ALTER POLICY "member_view_groups"              ON public.groups TO authenticated;
ALTER POLICY "admin_manage_groups"             ON public.groups TO authenticated;
ALTER POLICY "super_admin_all_groups"          ON public.groups TO authenticated;

-- ─── classes ────────────────────────────────────────────────
ALTER POLICY "member_view_own_classes"         ON public.classes TO authenticated;
ALTER POLICY "admin_manage_classes"            ON public.classes TO authenticated;
ALTER POLICY "super_admin_all_classes"         ON public.classes TO authenticated;

-- ─── class_teachers ─────────────────────────────────────────
ALTER POLICY "view_class_teachers"             ON public.class_teachers TO authenticated;
ALTER POLICY "admin_manage_class_teachers"     ON public.class_teachers TO authenticated;
ALTER POLICY "super_admin_class_teachers"      ON public.class_teachers TO authenticated;

-- ─── class_students ─────────────────────────────────────────
ALTER POLICY "view_class_students"             ON public.class_students TO authenticated;
ALTER POLICY "teacher_view_class_students"     ON public.class_students TO authenticated;
ALTER POLICY "admin_manage_class_students"     ON public.class_students TO authenticated;
ALTER POLICY "super_admin_class_students"      ON public.class_students TO authenticated;

-- ─── class_sessions (rooster) ───────────────────────────────
ALTER POLICY "student_view_sessions"           ON public.class_sessions TO authenticated;
ALTER POLICY "teacher_view_sessions"           ON public.class_sessions TO authenticated;
ALTER POLICY "admin_manage_sessions"           ON public.class_sessions TO authenticated;
ALTER POLICY "super_admin_all_sessions"        ON public.class_sessions TO authenticated;

-- ─── announcements ──────────────────────────────────────────
ALTER POLICY "announcements_read"              ON public.announcements TO authenticated;
ALTER POLICY "student_read_announcements"      ON public.announcements TO authenticated;
ALTER POLICY "teacher_read_announcements"      ON public.announcements TO authenticated;
ALTER POLICY "announcements_insert"            ON public.announcements TO authenticated;
ALTER POLICY "teacher_post_announcements"      ON public.announcements TO authenticated;
ALTER POLICY "announcements_delete"            ON public.announcements TO authenticated;
ALTER POLICY "teacher_delete_own_announcements" ON public.announcements TO authenticated;
ALTER POLICY "admin_manage_announcements"      ON public.announcements TO authenticated;
ALTER POLICY "super_admin_all_announcements"   ON public.announcements TO authenticated;

-- ─── assignments ────────────────────────────────────────────
ALTER POLICY "student_view_assignments"        ON public.assignments TO authenticated;
ALTER POLICY "teacher_manage_assignments"      ON public.assignments TO authenticated;
ALTER POLICY "super_admin_all_assignments"     ON public.assignments TO authenticated;

-- ─── submissions ────────────────────────────────────────────
ALTER POLICY "student_view_own_submissions"    ON public.submissions TO authenticated;
ALTER POLICY "student_insert_submission"       ON public.submissions TO authenticated;
ALTER POLICY "student_update_own_submissions"  ON public.submissions TO authenticated;
ALTER POLICY "student_delete_own_submissions"  ON public.submissions TO authenticated;
ALTER POLICY "teacher_view_submissions"        ON public.submissions TO authenticated;
ALTER POLICY "teacher_update_submissions"      ON public.submissions TO authenticated;
ALTER POLICY "super_admin_all_submissions"     ON public.submissions TO authenticated;

-- ─── submission_feedback ────────────────────────────────────
ALTER POLICY "student_view_own_feedback"       ON public.submission_feedback TO authenticated;
ALTER POLICY "teacher_view_class_feedback"     ON public.submission_feedback TO authenticated;
ALTER POLICY "admin_view_feedback"             ON public.submission_feedback TO authenticated;
ALTER POLICY "teacher_manage_feedback"         ON public.submission_feedback TO authenticated;

-- ─── submission_files ───────────────────────────────────────
ALTER POLICY "student_manage_own_files"        ON public.submission_files TO authenticated;
ALTER POLICY "teacher_view_submission_files"   ON public.submission_files TO authenticated;
ALTER POLICY "admin_view_submission_files"     ON public.submission_files TO authenticated;
ALTER POLICY "super_admin_all_submission_files" ON public.submission_files TO authenticated;

-- ─── lesson_modules ─────────────────────────────────────────
ALTER POLICY "student_view_visible_modules"    ON public.lesson_modules TO authenticated;
ALTER POLICY "teacher_manage_modules"          ON public.lesson_modules TO authenticated;
ALTER POLICY "admin_manage_modules"            ON public.lesson_modules TO authenticated;
ALTER POLICY "super_admin_all_modules"         ON public.lesson_modules TO authenticated;

-- ─── module_documents ───────────────────────────────────────
ALTER POLICY "student_view_docs"               ON public.module_documents TO authenticated;
ALTER POLICY "teacher_manage_docs"             ON public.module_documents TO authenticated;
ALTER POLICY "admin_manage_docs"               ON public.module_documents TO authenticated;

-- ─── invitations ────────────────────────────────────────────
ALTER POLICY "admin_manage_invitations"        ON public.invitations TO authenticated;

-- ─── audit_logs ─────────────────────────────────────────────
ALTER POLICY "super_admin_all_logs"            ON public.audit_logs TO authenticated;

-- ─── payments ───────────────────────────────────────────────
ALTER POLICY "admin_view_own_payments"         ON public.payments TO authenticated;
ALTER POLICY "super_admin_all_payments"        ON public.payments TO authenticated;

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES — run these AFTER the migration
-- ============================================================

-- 1. Confirm every policy is now scoped to authenticated (should return 0 rows)
-- SELECT tablename, policyname, roles
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND NOT (roles::text[] @> ARRAY['authenticated']);

-- 2. Smoke test from the app — same as 7b:
--    - student, teacher, admin, super_admin all log in and see their pages
--
-- 3. Database Advisor → Performance:
--    Warning count should drop from ~275 to ~55.
--    The remaining warnings are real same-role duplicates (e.g. profiles
--    has 4 SELECT policies all applying to `authenticated`). Those require
--    actual policy consolidation, tracked as a separate todo.
