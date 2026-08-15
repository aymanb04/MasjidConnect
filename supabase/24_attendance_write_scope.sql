-- Migration 24 — close a cross-tenant WRITE hole on attendance.
--
-- ⚠️ APPLY TO PROD BEFORE COMMITTING (PROJECT.md §9): this file describes a live
-- vulnerability, and the repo is public.
--
-- Found 2026-08-15 while screening the leerlingenbegeleiding role. The policy
-- teacher_admin_manage_attendance_sessions (8b) had a tenant-scoped USING but an
-- unscoped WITH CHECK:
--
--     WITH CHECK ( teacher_id = auth.uid()
--                  OR get_my_role() IN ('admin','super_admin') )
--
-- The first branch asks only "is the teacher_id you supplied your own id?" — no
-- role check, no tenant check, no link between the actor and the class. So ANY
-- authenticated user could insert an attendance session for ANY class in ANY
-- tenant simply by putting their own uid in teacher_id.
--
-- PROVEN against prod: a student of the De Kroon DEMO tenant inserted a session
-- for a class in the REAL De Kroon tenant — a class the same account could not
-- even SELECT. (Probe row deleted immediately.) Reads were never affected;
-- migration 12 closed those. This is the write side of the same boundary.
--
-- Impact:
--   1. Cross-tenant write — one mosque can pollute another's attendance.
--   2. attendance_records chains off s.teacher_id = auth.uid(), so owning a
--      forged session lets the attacker write attendance records for real
--      students in that class.
--   3. Denial of service: attendance_sessions is UNIQUE (class_id, session_date).
--      Squatting a date leaves the real teacher unable to create that day's
--      session, and unable to edit the squatted one (USING requires ownership).
--   4. The records policy's admin branch was likewise untenanted: an admin of
--      tenant A could write records into tenant B's session given its id.
--
-- Fix: every branch is tenant-scoped, and creating a session now requires
-- actually teaching that class (am_i_teacher_of_class) rather than merely
-- claiming to. super_admin keeps blanket access via is_super_admin(), which
-- matters because its tenant_id is NULL and would fail a tenant comparison.
--
-- Behaviour preserved: teachers manage sessions for their own classes; admins
-- manage any session inside their own tenant; students keep their existing
-- read-only view (student_view_own_* policies are untouched).
--
-- After applying: re-run `npx tsx scripts/rls-smoke.ts` and re-run the
-- cross-tenant probe, which must now be denied.

BEGIN;

DROP POLICY IF EXISTS "teacher_admin_manage_attendance_sessions" ON public.attendance_sessions;

CREATE POLICY "teacher_admin_manage_attendance_sessions" ON public.attendance_sessions
  FOR ALL
  TO authenticated
  USING (
    (SELECT is_super_admin())
    OR (
      class_id IN (
        SELECT id FROM classes WHERE tenant_id = (SELECT get_my_tenant_id())
      )
      AND (
        teacher_id = (SELECT auth.uid())
        OR (SELECT get_my_role())::text = 'admin'
      )
    )
  )
  WITH CHECK (
    (SELECT is_super_admin())
    OR (
      class_id IN (
        SELECT id FROM classes WHERE tenant_id = (SELECT get_my_tenant_id())
      )
      AND (
        -- must actually teach the class, not merely claim the row
        ((SELECT am_i_teacher_of_class(class_id)) AND teacher_id = (SELECT auth.uid()))
        OR (SELECT get_my_role())::text = 'admin'
      )
    )
  );

DROP POLICY IF EXISTS "teacher_admin_manage_attendance_records" ON public.attendance_records;

CREATE POLICY "teacher_admin_manage_attendance_records" ON public.attendance_records
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM attendance_sessions s
        JOIN classes c ON c.id = s.class_id
       WHERE s.id = attendance_records.session_id
         AND (
           (SELECT is_super_admin())
           OR (
             c.tenant_id = (SELECT get_my_tenant_id())
             AND (
               s.teacher_id = (SELECT auth.uid())
               OR (SELECT get_my_role())::text = 'admin'
             )
           )
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM attendance_sessions s
        JOIN classes c ON c.id = s.class_id
       WHERE s.id = attendance_records.session_id
         AND (
           (SELECT is_super_admin())
           OR (
             c.tenant_id = (SELECT get_my_tenant_id())
             AND (
               s.teacher_id = (SELECT auth.uid())
               OR (SELECT get_my_role())::text = 'admin'
             )
           )
         )
    )
  );

COMMIT;

-- Verify the policies are back and scoped to authenticated.
SELECT tablename, policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('attendance_sessions', 'attendance_records')
 ORDER BY tablename, policyname;
