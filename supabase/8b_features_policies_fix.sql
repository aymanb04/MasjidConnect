-- ============================================================
-- Migration 8b — Fix policy syntax from 8_features_migration.sql
-- The TO authenticated clause must come AFTER FOR, not before it.
-- Run this in the Supabase SQL Editor after 8_features_migration.sql
-- ============================================================

-- ─── feedback policies ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "users_insert_feedback"        ON public.feedback;
DROP POLICY IF EXISTS "super_admin_manage_feedback"  ON public.feedback;

CREATE POLICY "users_insert_feedback" ON public.feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "super_admin_manage_feedback" ON public.feedback
  FOR ALL
  TO authenticated
  USING ((SELECT is_super_admin()));

-- ─── student_reports policies ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "student_view_own_reports"      ON public.student_reports;
DROP POLICY IF EXISTS "teacher_manage_class_reports"  ON public.student_reports;
DROP POLICY IF EXISTS "admin_manage_reports"          ON public.student_reports;
DROP POLICY IF EXISTS "super_admin_all_reports"       ON public.student_reports;

CREATE POLICY "student_view_own_reports" ON public.student_reports
  FOR SELECT
  TO authenticated
  USING (student_id = (SELECT auth.uid()));

CREATE POLICY "teacher_manage_class_reports" ON public.student_reports
  FOR ALL
  TO authenticated
  USING (
    (SELECT get_my_role()) = 'teacher'
    AND tenant_id = (SELECT get_my_tenant_id())
    AND EXISTS (
      SELECT 1 FROM class_teachers
      WHERE class_teachers.class_id = student_reports.class_id
        AND class_teachers.teacher_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    (SELECT get_my_role()) = 'teacher'
    AND tenant_id = (SELECT get_my_tenant_id())
    AND uploaded_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM class_teachers
      WHERE class_teachers.class_id = student_reports.class_id
        AND class_teachers.teacher_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "admin_manage_reports" ON public.student_reports
  FOR ALL
  TO authenticated
  USING (
    (SELECT get_my_role()) IN ('admin', 'super_admin')
    AND tenant_id = (SELECT get_my_tenant_id())
  )
  WITH CHECK (
    (SELECT get_my_role()) IN ('admin', 'super_admin')
    AND tenant_id = (SELECT get_my_tenant_id())
  );

CREATE POLICY "super_admin_all_reports" ON public.student_reports
  FOR ALL
  TO authenticated
  USING ((SELECT is_super_admin()));

-- ─── attendance_sessions policies ────────────────────────────────────────────

DROP POLICY IF EXISTS "teacher_admin_manage_attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "student_view_own_class_sessions"          ON public.attendance_sessions;

CREATE POLICY "teacher_admin_manage_attendance_sessions" ON public.attendance_sessions
  FOR ALL
  TO authenticated
  USING (
    teacher_id = (SELECT auth.uid())
    OR (
      (SELECT get_my_role()) IN ('admin', 'super_admin')
      AND class_id IN (
        SELECT id FROM classes
        WHERE tenant_id = (SELECT get_my_tenant_id())
      )
    )
  )
  WITH CHECK (
    teacher_id = (SELECT auth.uid())
    OR (SELECT get_my_role()) IN ('admin', 'super_admin')
  );

CREATE POLICY "student_view_own_class_sessions" ON public.attendance_sessions
  FOR SELECT
  TO authenticated
  USING (
    class_id IN (
      SELECT class_id FROM class_students
      WHERE student_id = (SELECT auth.uid())
    )
  );

-- ─── attendance_records policies ─────────────────────────────────────────────

DROP POLICY IF EXISTS "teacher_admin_manage_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "student_view_own_attendance_records"     ON public.attendance_records;

CREATE POLICY "teacher_admin_manage_attendance_records" ON public.attendance_records
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM attendance_sessions s
      WHERE s.id = attendance_records.session_id
        AND (
          s.teacher_id = (SELECT auth.uid())
          OR (SELECT get_my_role()) IN ('admin', 'super_admin')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM attendance_sessions s
      WHERE s.id = attendance_records.session_id
        AND (
          s.teacher_id = (SELECT auth.uid())
          OR (SELECT get_my_role()) IN ('admin', 'super_admin')
        )
    )
  );

CREATE POLICY "student_view_own_attendance_records" ON public.attendance_records
  FOR SELECT
  TO authenticated
  USING (student_id = (SELECT auth.uid()));
