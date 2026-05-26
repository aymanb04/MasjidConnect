-- ============================================================
-- Migration 8 — New features: feedback, student_reports,
--               attendance RLS policies
-- Run in Supabase SQL Editor (project: MasjidConnect)
-- Date: 2026-05-26
-- ============================================================
--
-- BEFORE running this file, do the following in the Supabase Dashboard:
--
--   Storage → New bucket
--     Name:    student-reports
--     Public:  OFF (private)
--
--   Then add two Storage policies on that bucket:
--
--   Policy 1 — Students read own reports:
--     Operation: SELECT
--     Expression:
--       bucket_id = 'student-reports'
--       AND (storage.foldername(name))[1] = auth.uid()::text
--
--   Policy 2 — Teachers / admins manage all reports:
--     Operation: ALL
--     Expression:
--       bucket_id = 'student-reports'
--       AND EXISTS (
--         SELECT 1 FROM profiles
--         WHERE profiles.id = auth.uid()
--           AND profiles.role IN ('teacher','admin','super_admin')
--           AND profiles.is_active = true
--       )
--
-- ============================================================

-- ─── 8a. feedback table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.feedback (
  id         uuid        NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id  uuid,
  user_id    uuid        NOT NULL,
  user_name  text,
  user_role  text,
  type       text        NOT NULL DEFAULT 'bug'
               CHECK (type IN ('bug', 'suggestie', 'vraag')),
  message    text        NOT NULL,
  page_url   text,
  is_read    boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_pkey PRIMARY KEY (id),
  CONSTRAINT feedback_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can submit feedback
CREATE POLICY "users_insert_feedback" ON public.feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Only super_admin can read / manage feedback
CREATE POLICY "super_admin_manage_feedback" ON public.feedback
  FOR ALL
  TO authenticated
  USING ((SELECT is_super_admin()));

-- ─── 8b. student_reports table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.student_reports (
  id             uuid    NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id      uuid    NOT NULL,
  student_id     uuid    NOT NULL,
  class_id       uuid    NOT NULL,
  school_year_id uuid    NOT NULL,
  uploaded_by    uuid    NOT NULL,
  semester       int     NOT NULL CHECK (semester IN (1, 2)),
  file_name      text    NOT NULL,
  file_url       text    NOT NULL,  -- storage path (not public URL)
  file_size      bigint,
  file_type      text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_reports_pkey PRIMARY KEY (id),
  -- One report per student per class per semester per year
  CONSTRAINT student_reports_unique_slot
    UNIQUE (student_id, class_id, school_year_id, semester),
  CONSTRAINT student_reports_tenant_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT student_reports_student_fkey
    FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT student_reports_class_fkey
    FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE,
  CONSTRAINT student_reports_year_fkey
    FOREIGN KEY (school_year_id) REFERENCES public.school_years(id) ON DELETE CASCADE,
  CONSTRAINT student_reports_uploader_fkey
    FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id)
);

ALTER TABLE public.student_reports ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_student_reports_student
  ON public.student_reports(student_id);
CREATE INDEX IF NOT EXISTS idx_student_reports_class
  ON public.student_reports(class_id);

-- Students see only their own reports
CREATE POLICY "student_view_own_reports" ON public.student_reports
  FOR SELECT
  TO authenticated
  USING (student_id = (SELECT auth.uid()));

-- Teachers: view + manage reports for classes they teach
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

-- Admins manage all reports in their tenant
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

-- Super admin full access
CREATE POLICY "super_admin_all_reports" ON public.student_reports
  FOR ALL
  TO authenticated
  USING ((SELECT is_super_admin()));

-- ─── 8c. attendance RLS policies ─────────────────────────────────────────────
-- Tables already exist with RLS enabled but zero policies.
-- Until now they were inaccessible to all non-service-role callers (safe default).

-- Teachers & admins manage sessions
CREATE POLICY "teacher_admin_manage_attendance_sessions"
  ON public.attendance_sessions
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

-- Students can see sessions for their own classes (to view their attendance)
CREATE POLICY "student_view_own_class_sessions"
  ON public.attendance_sessions
  FOR SELECT
  TO authenticated
  USING (
    class_id IN (
      SELECT class_id FROM class_students
      WHERE student_id = (SELECT auth.uid())
    )
  );

-- Teachers & admins manage records within sessions they can access
CREATE POLICY "teacher_admin_manage_attendance_records"
  ON public.attendance_records
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

-- Students see their own records
CREATE POLICY "student_view_own_attendance_records"
  ON public.attendance_records
  FOR SELECT
  TO authenticated
  USING (student_id = (SELECT auth.uid()));
