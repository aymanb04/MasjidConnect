-- ============================================================
-- 7b — Wrap auth.uid() and helper functions in (SELECT ...) for RLS perf
-- ============================================================
--
-- Background:
--   PostgreSQL evaluates auth.uid() and stable functions PER ROW during RLS
--   evaluation unless wrapped as (SELECT ...). Wrapping turns the call into
--   an InitPlan that runs ONCE per query and caches the result.
--
--   On small tables this is invisible. On a 10K-row submissions scan it is
--   10K function calls vs 1.
--
-- What this script does:
--   PART A — Rewrites the 6 helper functions (get_my_role, get_my_tenant_id,
--            is_super_admin, am_i_student_of_class, am_i_teacher_of_class,
--            am_i_member_of_group) to use (SELECT auth.uid()) inside their
--            bodies. CREATE OR REPLACE — no breaking change, no policy drops.
--
--   PART B — Rewrites every RLS policy that calls these functions or auth.uid()
--            bare. Pattern: DROP POLICY + CREATE POLICY with wrapped expressions.
--            65 policies total.
--
-- Safety:
--   Whole script runs in a single transaction (BEGIN/COMMIT). Either every
--   policy is rewritten or nothing changes. Concurrent app queries during the
--   run will wait briefly for locks — should complete in <1 second.
--
-- After running, verify with:
--   SELECT tablename, policyname, qual, with_check FROM pg_policies
--   WHERE schemaname = 'public' ORDER BY tablename, policyname;
--   (No raw "auth.uid()" — only "(SELECT auth.uid())" should appear)

BEGIN;

-- ============================================================
-- PART A — Helper functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS character varying
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role FROM profiles WHERE id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT tenant_id FROM profiles WHERE id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = (SELECT auth.uid()) AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.am_i_student_of_class(cid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM class_students
    WHERE class_id = cid AND student_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.am_i_teacher_of_class(cid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM class_teachers
    WHERE class_id = cid AND teacher_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.am_i_member_of_group(gid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM classes c
    JOIN class_teachers ct ON ct.class_id = c.id AND ct.teacher_id = (SELECT auth.uid())
    WHERE c.group_id = gid
    UNION
    SELECT 1 FROM classes c
    JOIN class_students cs ON cs.class_id = c.id AND cs.student_id = (SELECT auth.uid())
    WHERE c.group_id = gid
  );
$$;

-- ============================================================
-- PART B — RLS policies (table by table)
-- ============================================================

-- ─── tenants ────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_view_own_tenant" ON public.tenants;
CREATE POLICY "admin_view_own_tenant" ON public.tenants
  FOR SELECT USING (id = (SELECT get_my_tenant_id()));

DROP POLICY IF EXISTS "super_admin_all_tenants" ON public.tenants;
CREATE POLICY "super_admin_all_tenants" ON public.tenants
  FOR ALL USING ((SELECT is_super_admin()));

-- ─── profiles ───────────────────────────────────────────────
DROP POLICY IF EXISTS "view_own_profile" ON public.profiles;
CREATE POLICY "view_own_profile" ON public.profiles
  FOR SELECT USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "view_same_tenant_profiles" ON public.profiles;
CREATE POLICY "view_same_tenant_profiles" ON public.profiles
  FOR SELECT USING (tenant_id = (SELECT get_my_tenant_id()));

DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
CREATE POLICY "update_own_profile" ON public.profiles
  FOR UPDATE
  USING (id = (SELECT auth.uid()))
  WITH CHECK (
    id = (SELECT auth.uid())
    AND (role)::text = ((SELECT role FROM profiles WHERE id = (SELECT auth.uid())))::text
    AND tenant_id = (SELECT tenant_id FROM profiles WHERE id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "admin_manage_profiles" ON public.profiles;
CREATE POLICY "admin_manage_profiles" ON public.profiles
  FOR ALL
  USING (
    (SELECT get_my_role())::text = 'admin'
    AND tenant_id = (SELECT get_my_tenant_id())
  )
  WITH CHECK (
    (SELECT get_my_role())::text = 'admin'
    AND tenant_id = (SELECT get_my_tenant_id())
    AND (role)::text = ANY (ARRAY['student', 'teacher', 'admin'])
  );

DROP POLICY IF EXISTS "super_admin_all_profiles" ON public.profiles;
CREATE POLICY "super_admin_all_profiles" ON public.profiles
  FOR ALL USING ((SELECT is_super_admin()));

-- ─── school_years ───────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_members_view_years" ON public.school_years;
CREATE POLICY "tenant_members_view_years" ON public.school_years
  FOR SELECT USING (tenant_id = (SELECT get_my_tenant_id()));

DROP POLICY IF EXISTS "admin_manage_years" ON public.school_years;
CREATE POLICY "admin_manage_years" ON public.school_years
  FOR ALL USING (
    (SELECT get_my_role())::text = 'admin'
    AND tenant_id = (SELECT get_my_tenant_id())
  );

DROP POLICY IF EXISTS "super_admin_all_years" ON public.school_years;
CREATE POLICY "super_admin_all_years" ON public.school_years
  FOR ALL USING ((SELECT is_super_admin()));

-- ─── groups ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "member_view_groups" ON public.groups;
CREATE POLICY "member_view_groups" ON public.groups
  FOR SELECT USING (
    tenant_id = (SELECT get_my_tenant_id())
    AND ((SELECT get_my_role())::text = 'admin' OR am_i_member_of_group(id))
  );

DROP POLICY IF EXISTS "admin_manage_groups" ON public.groups;
CREATE POLICY "admin_manage_groups" ON public.groups
  FOR ALL USING (
    (SELECT get_my_role())::text = 'admin'
    AND tenant_id = (SELECT get_my_tenant_id())
  );

DROP POLICY IF EXISTS "super_admin_all_groups" ON public.groups;
CREATE POLICY "super_admin_all_groups" ON public.groups
  FOR ALL USING ((SELECT is_super_admin()));

-- ─── classes ────────────────────────────────────────────────
DROP POLICY IF EXISTS "member_view_own_classes" ON public.classes;
CREATE POLICY "member_view_own_classes" ON public.classes
  FOR SELECT USING (
    tenant_id = (SELECT get_my_tenant_id())
    AND (
      (SELECT get_my_role())::text = 'admin'
      OR am_i_teacher_of_class(id)
      OR am_i_student_of_class(id)
    )
  );

DROP POLICY IF EXISTS "admin_manage_classes" ON public.classes;
CREATE POLICY "admin_manage_classes" ON public.classes
  FOR ALL USING (
    (SELECT get_my_role())::text = 'admin'
    AND tenant_id = (SELECT get_my_tenant_id())
  );

DROP POLICY IF EXISTS "super_admin_all_classes" ON public.classes;
CREATE POLICY "super_admin_all_classes" ON public.classes
  FOR ALL USING ((SELECT is_super_admin()));

-- ─── class_teachers ─────────────────────────────────────────
DROP POLICY IF EXISTS "view_class_teachers" ON public.class_teachers;
CREATE POLICY "view_class_teachers" ON public.class_teachers
  FOR SELECT USING (
    (SELECT is_super_admin())
    OR (SELECT get_my_role())::text = 'admin'
    OR teacher_id = (SELECT auth.uid())
    OR am_i_student_of_class(class_id)
  );

DROP POLICY IF EXISTS "admin_manage_class_teachers" ON public.class_teachers;
CREATE POLICY "admin_manage_class_teachers" ON public.class_teachers
  FOR ALL
  USING (
    (SELECT is_super_admin())
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND EXISTS (
        SELECT 1 FROM classes
        WHERE classes.id = class_teachers.class_id
          AND classes.tenant_id = (SELECT get_my_tenant_id())
      )
    )
  )
  WITH CHECK (
    (SELECT is_super_admin())
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND EXISTS (
        SELECT 1 FROM classes
        WHERE classes.id = class_teachers.class_id
          AND classes.tenant_id = (SELECT get_my_tenant_id())
      )
    )
  );

DROP POLICY IF EXISTS "super_admin_class_teachers" ON public.class_teachers;
CREATE POLICY "super_admin_class_teachers" ON public.class_teachers
  FOR ALL USING ((SELECT is_super_admin()));

-- ─── class_students ─────────────────────────────────────────
DROP POLICY IF EXISTS "view_class_students" ON public.class_students;
CREATE POLICY "view_class_students" ON public.class_students
  FOR SELECT USING (
    (SELECT is_super_admin())
    OR (SELECT get_my_role())::text = 'admin'
    OR student_id = (SELECT auth.uid())
    OR am_i_teacher_of_class(class_id)
  );

-- Note: teacher_view_class_students is redundant with view_class_students above
-- (already flagged as 6e-bis in SECURITY_TODO.md for future cleanup). Rewriting
-- it here anyway so the auth.uid() wrap doesn't get missed if it's kept.
DROP POLICY IF EXISTS "teacher_view_class_students" ON public.class_students;
CREATE POLICY "teacher_view_class_students" ON public.class_students
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM class_teachers ct
      JOIN classes c ON c.id = ct.class_id
      WHERE ct.teacher_id = (SELECT auth.uid())
        AND ct.class_id = class_students.class_id
        AND c.tenant_id = (SELECT get_my_tenant_id())
    )
    OR (SELECT get_my_role())::text = 'admin'
  );

DROP POLICY IF EXISTS "admin_manage_class_students" ON public.class_students;
CREATE POLICY "admin_manage_class_students" ON public.class_students
  FOR ALL
  USING (
    (SELECT is_super_admin())
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND EXISTS (
        SELECT 1 FROM classes
        WHERE classes.id = class_students.class_id
          AND classes.tenant_id = (SELECT get_my_tenant_id())
      )
    )
  )
  WITH CHECK (
    (SELECT is_super_admin())
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND EXISTS (
        SELECT 1 FROM classes
        WHERE classes.id = class_students.class_id
          AND classes.tenant_id = (SELECT get_my_tenant_id())
      )
    )
  );

DROP POLICY IF EXISTS "super_admin_class_students" ON public.class_students;
CREATE POLICY "super_admin_class_students" ON public.class_students
  FOR ALL USING ((SELECT is_super_admin()));

-- ─── class_sessions (rooster) ───────────────────────────────
DROP POLICY IF EXISTS "student_view_sessions" ON public.class_sessions;
CREATE POLICY "student_view_sessions" ON public.class_sessions
  FOR SELECT USING (am_i_student_of_class(class_id));

DROP POLICY IF EXISTS "teacher_view_sessions" ON public.class_sessions;
CREATE POLICY "teacher_view_sessions" ON public.class_sessions
  FOR SELECT USING (am_i_teacher_of_class(class_id));

DROP POLICY IF EXISTS "admin_manage_sessions" ON public.class_sessions;
CREATE POLICY "admin_manage_sessions" ON public.class_sessions
  FOR ALL
  USING (
    (SELECT get_my_role())::text = 'admin'
    AND tenant_id = (SELECT get_my_tenant_id())
  )
  WITH CHECK (
    (SELECT get_my_role())::text = 'admin'
    AND tenant_id = (SELECT get_my_tenant_id())
  );

DROP POLICY IF EXISTS "super_admin_all_sessions" ON public.class_sessions;
CREATE POLICY "super_admin_all_sessions" ON public.class_sessions
  FOR ALL USING ((SELECT is_super_admin()));

-- ─── announcements ──────────────────────────────────────────
DROP POLICY IF EXISTS "announcements_read" ON public.announcements;
CREATE POLICY "announcements_read" ON public.announcements
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = (SELECT auth.uid()))
    AND (
      class_id IS NULL
      OR class_id IN (
        SELECT class_students.class_id FROM class_students
        WHERE class_students.student_id = (SELECT auth.uid())
        UNION
        SELECT class_teachers.class_id FROM class_teachers
        WHERE class_teachers.teacher_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "student_read_announcements" ON public.announcements;
CREATE POLICY "student_read_announcements" ON public.announcements
  FOR SELECT USING (
    tenant_id = (SELECT get_my_tenant_id())
    AND (
      class_id IS NULL
      OR EXISTS (
        SELECT 1 FROM class_students
        WHERE class_students.class_id = announcements.class_id
          AND class_students.student_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "teacher_read_announcements" ON public.announcements;
CREATE POLICY "teacher_read_announcements" ON public.announcements
  FOR SELECT USING (
    tenant_id = (SELECT get_my_tenant_id())
    AND (
      class_id IS NULL
      OR EXISTS (
        SELECT 1 FROM class_teachers
        WHERE class_teachers.class_id = announcements.class_id
          AND class_teachers.teacher_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "announcements_insert" ON public.announcements;
CREATE POLICY "announcements_insert" ON public.announcements
  FOR INSERT WITH CHECK (
    created_by = (SELECT auth.uid())
    AND tenant_id = (SELECT tenant_id FROM profiles WHERE id = (SELECT auth.uid()))
    AND (
      (SELECT role FROM profiles WHERE id = (SELECT auth.uid()))::text
        = ANY (ARRAY['admin', 'super_admin'])
      OR (
        class_id IS NOT NULL
        AND class_id IN (
          SELECT class_teachers.class_id FROM class_teachers
          WHERE class_teachers.teacher_id = (SELECT auth.uid())
        )
      )
    )
  );

DROP POLICY IF EXISTS "teacher_post_announcements" ON public.announcements;
CREATE POLICY "teacher_post_announcements" ON public.announcements
  FOR INSERT WITH CHECK (
    (SELECT get_my_role())::text = 'teacher'
    AND tenant_id = (SELECT get_my_tenant_id())
    AND class_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM class_teachers
      WHERE class_teachers.class_id = announcements.class_id
        AND class_teachers.teacher_id = (SELECT auth.uid())
    )
    AND created_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "announcements_delete" ON public.announcements;
CREATE POLICY "announcements_delete" ON public.announcements
  FOR DELETE USING (
    created_by = (SELECT auth.uid())
    OR (SELECT role FROM profiles WHERE id = (SELECT auth.uid()))::text
       = ANY (ARRAY['admin', 'super_admin'])
  );

DROP POLICY IF EXISTS "teacher_delete_own_announcements" ON public.announcements;
CREATE POLICY "teacher_delete_own_announcements" ON public.announcements
  FOR DELETE USING (
    (SELECT get_my_role())::text = 'teacher'
    AND created_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "admin_manage_announcements" ON public.announcements;
CREATE POLICY "admin_manage_announcements" ON public.announcements
  FOR ALL USING (
    (SELECT get_my_role())::text = 'admin'
    AND tenant_id = (SELECT get_my_tenant_id())
  );

DROP POLICY IF EXISTS "super_admin_all_announcements" ON public.announcements;
CREATE POLICY "super_admin_all_announcements" ON public.announcements
  FOR ALL USING ((SELECT is_super_admin()));

-- ─── assignments ────────────────────────────────────────────
DROP POLICY IF EXISTS "student_view_assignments" ON public.assignments;
CREATE POLICY "student_view_assignments" ON public.assignments
  FOR SELECT USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM class_students
      WHERE class_students.class_id = assignments.class_id
        AND class_students.student_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "teacher_manage_assignments" ON public.assignments;
CREATE POLICY "teacher_manage_assignments" ON public.assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM class_teachers ct
      JOIN classes c ON c.id = ct.class_id
      WHERE ct.teacher_id = (SELECT auth.uid())
        AND assignments.class_id = c.id
        AND c.tenant_id = (SELECT get_my_tenant_id())
    )
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND EXISTS (
        SELECT 1 FROM classes
        WHERE classes.id = assignments.class_id
          AND classes.tenant_id = (SELECT get_my_tenant_id())
      )
    )
  );

DROP POLICY IF EXISTS "super_admin_all_assignments" ON public.assignments;
CREATE POLICY "super_admin_all_assignments" ON public.assignments
  FOR ALL USING ((SELECT is_super_admin()));

-- ─── submissions ────────────────────────────────────────────
DROP POLICY IF EXISTS "student_view_own_submissions" ON public.submissions;
CREATE POLICY "student_view_own_submissions" ON public.submissions
  FOR SELECT USING (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "student_insert_submission" ON public.submissions;
CREATE POLICY "student_insert_submission" ON public.submissions
  FOR INSERT WITH CHECK (
    student_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM assignments
      WHERE assignments.id = submissions.assignment_id
        AND (assignments.due_date IS NULL OR assignments.due_date > now())
    )
  );

DROP POLICY IF EXISTS "student_update_own_submissions" ON public.submissions;
CREATE POLICY "student_update_own_submissions" ON public.submissions
  FOR UPDATE
  USING (student_id = (SELECT auth.uid()))
  WITH CHECK (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "student_delete_own_submissions" ON public.submissions;
CREATE POLICY "student_delete_own_submissions" ON public.submissions
  FOR DELETE USING (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "teacher_view_submissions" ON public.submissions;
CREATE POLICY "teacher_view_submissions" ON public.submissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM assignments a
      JOIN class_teachers ct ON ct.class_id = a.class_id
      WHERE a.id = submissions.assignment_id
        AND ct.teacher_id = (SELECT auth.uid())
    )
    OR (SELECT get_my_role())::text = 'admin'
  );

DROP POLICY IF EXISTS "teacher_update_submissions" ON public.submissions;
CREATE POLICY "teacher_update_submissions" ON public.submissions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM assignments a
      JOIN class_teachers ct ON ct.class_id = a.class_id
      WHERE a.id = submissions.assignment_id
        AND ct.teacher_id = (SELECT auth.uid())
    )
    OR (SELECT get_my_role())::text = 'admin'
  );

DROP POLICY IF EXISTS "super_admin_all_submissions" ON public.submissions;
CREATE POLICY "super_admin_all_submissions" ON public.submissions
  FOR ALL USING ((SELECT is_super_admin()));

-- ─── submission_feedback ────────────────────────────────────
DROP POLICY IF EXISTS "student_view_own_feedback" ON public.submission_feedback;
CREATE POLICY "student_view_own_feedback" ON public.submission_feedback
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM submissions
      WHERE submissions.id = submission_feedback.submission_id
        AND submissions.student_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "teacher_view_class_feedback" ON public.submission_feedback;
CREATE POLICY "teacher_view_class_feedback" ON public.submission_feedback
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN class_teachers ct ON ct.class_id = a.class_id
      WHERE s.id = submission_feedback.submission_id
        AND ct.teacher_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "admin_view_feedback" ON public.submission_feedback;
CREATE POLICY "admin_view_feedback" ON public.submission_feedback
  FOR SELECT USING (
    (SELECT get_my_role())::text = 'admin'
    AND EXISTS (
      SELECT 1 FROM submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN classes c ON c.id = a.class_id
      WHERE s.id = submission_feedback.submission_id
        AND c.tenant_id = (SELECT get_my_tenant_id())
    )
  );

DROP POLICY IF EXISTS "teacher_manage_feedback" ON public.submission_feedback;
CREATE POLICY "teacher_manage_feedback" ON public.submission_feedback
  FOR ALL
  USING (
    (teacher_id = (SELECT auth.uid()) OR (SELECT get_my_role())::text = 'admin')
    AND EXISTS (
      SELECT 1 FROM submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN classes c ON c.id = a.class_id
      WHERE s.id = submission_feedback.submission_id
        AND c.tenant_id = (SELECT get_my_tenant_id())
    )
  )
  WITH CHECK (
    (teacher_id = (SELECT auth.uid()) OR (SELECT get_my_role())::text = 'admin')
    AND EXISTS (
      SELECT 1 FROM submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN classes c ON c.id = a.class_id
      WHERE s.id = submission_feedback.submission_id
        AND c.tenant_id = (SELECT get_my_tenant_id())
    )
  );

-- ─── submission_files ───────────────────────────────────────
DROP POLICY IF EXISTS "student_manage_own_files" ON public.submission_files;
CREATE POLICY "student_manage_own_files" ON public.submission_files
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM submissions
      WHERE submissions.id = submission_files.submission_id
        AND submissions.student_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "teacher_view_submission_files" ON public.submission_files;
CREATE POLICY "teacher_view_submission_files" ON public.submission_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN class_teachers ct ON ct.class_id = a.class_id
      WHERE s.id = submission_files.submission_id
        AND ct.teacher_id = (SELECT auth.uid())
    )
    OR (SELECT get_my_role())::text = ANY (ARRAY['admin', 'super_admin'])
  );

DROP POLICY IF EXISTS "admin_view_submission_files" ON public.submission_files;
CREATE POLICY "admin_view_submission_files" ON public.submission_files
  FOR SELECT USING (
    (SELECT get_my_role())::text = 'admin'
    AND EXISTS (
      SELECT 1 FROM submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN classes c ON c.id = a.class_id
      WHERE s.id = submission_files.submission_id
        AND c.tenant_id = (SELECT get_my_tenant_id())
    )
  );

DROP POLICY IF EXISTS "super_admin_all_submission_files" ON public.submission_files;
CREATE POLICY "super_admin_all_submission_files" ON public.submission_files
  FOR ALL USING ((SELECT is_super_admin()));

-- ─── lesson_modules ─────────────────────────────────────────
DROP POLICY IF EXISTS "student_view_visible_modules" ON public.lesson_modules;
CREATE POLICY "student_view_visible_modules" ON public.lesson_modules
  FOR SELECT USING (
    is_visible = true
    AND EXISTS (
      SELECT 1 FROM class_students
      WHERE class_students.class_id = lesson_modules.class_id
        AND class_students.student_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "teacher_manage_modules" ON public.lesson_modules;
CREATE POLICY "teacher_manage_modules" ON public.lesson_modules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM class_teachers
      WHERE class_teachers.class_id = lesson_modules.class_id
        AND class_teachers.teacher_id = (SELECT auth.uid())
    )
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND EXISTS (
        SELECT 1 FROM classes
        WHERE classes.id = lesson_modules.class_id
          AND classes.tenant_id = (SELECT get_my_tenant_id())
      )
    )
  );

DROP POLICY IF EXISTS "admin_manage_modules" ON public.lesson_modules;
CREATE POLICY "admin_manage_modules" ON public.lesson_modules
  FOR ALL
  USING (
    (SELECT get_my_role())::text = 'admin'
    AND EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = lesson_modules.class_id
        AND classes.tenant_id = (SELECT get_my_tenant_id())
    )
  )
  WITH CHECK (
    (SELECT get_my_role())::text = 'admin'
    AND EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = lesson_modules.class_id
        AND classes.tenant_id = (SELECT get_my_tenant_id())
    )
  );

DROP POLICY IF EXISTS "super_admin_all_modules" ON public.lesson_modules;
CREATE POLICY "super_admin_all_modules" ON public.lesson_modules
  FOR ALL USING ((SELECT is_super_admin()));

-- ─── module_documents ───────────────────────────────────────
DROP POLICY IF EXISTS "student_view_docs" ON public.module_documents;
CREATE POLICY "student_view_docs" ON public.module_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lesson_modules lm
      JOIN class_students cs ON cs.class_id = lm.class_id
      WHERE lm.id = module_documents.module_id
        AND cs.student_id = (SELECT auth.uid())
        AND lm.is_visible = true
    )
  );

DROP POLICY IF EXISTS "teacher_manage_docs" ON public.module_documents;
CREATE POLICY "teacher_manage_docs" ON public.module_documents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM lesson_modules lm
      JOIN class_teachers ct ON ct.class_id = lm.class_id
      WHERE lm.id = module_documents.module_id
        AND ct.teacher_id = (SELECT auth.uid())
    )
    OR (SELECT get_my_role())::text = ANY (ARRAY['admin', 'super_admin'])
  );

DROP POLICY IF EXISTS "admin_manage_docs" ON public.module_documents;
CREATE POLICY "admin_manage_docs" ON public.module_documents
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM lesson_modules lm
      JOIN classes c ON c.id = lm.class_id
      WHERE lm.id = module_documents.module_id
        AND c.tenant_id = (SELECT get_my_tenant_id())
        AND (SELECT get_my_role())::text = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lesson_modules lm
      JOIN classes c ON c.id = lm.class_id
      WHERE lm.id = module_documents.module_id
        AND c.tenant_id = (SELECT get_my_tenant_id())
        AND (SELECT get_my_role())::text = 'admin'
    )
  );

-- ─── invitations ────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_manage_invitations" ON public.invitations;
CREATE POLICY "admin_manage_invitations" ON public.invitations
  FOR ALL USING (
    (SELECT get_my_role())::text = ANY (ARRAY['admin', 'super_admin'])
    AND (tenant_id = (SELECT get_my_tenant_id()) OR (SELECT is_super_admin()))
  );

-- ─── audit_logs ─────────────────────────────────────────────
DROP POLICY IF EXISTS "super_admin_all_logs" ON public.audit_logs;
CREATE POLICY "super_admin_all_logs" ON public.audit_logs
  FOR ALL USING ((SELECT is_super_admin()));

-- ─── payments ───────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_view_own_payments" ON public.payments;
CREATE POLICY "admin_view_own_payments" ON public.payments
  FOR SELECT USING (
    tenant_id = (SELECT get_my_tenant_id())
    AND (SELECT get_my_role())::text = 'admin'
  );

DROP POLICY IF EXISTS "super_admin_all_payments" ON public.payments;
CREATE POLICY "super_admin_all_payments" ON public.payments
  FOR ALL USING ((SELECT is_super_admin()));

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES — run these AFTER the migration
-- ============================================================

-- 1. Confirm no bare auth.uid() remains (should return 0 rows)
-- SELECT tablename, policyname FROM pg_policies
-- WHERE schemaname = 'public'
--   AND (
--     qual ~ '(?<!SELECT )auth\.uid\(\)'
--     OR with_check ~ '(?<!SELECT )auth\.uid\(\)'
--   );

-- 2. Confirm no bare helper function calls remain in policies
--    (this is a heuristic — look for the function name not preceded by SELECT)
-- SELECT tablename, policyname, qual, with_check FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;

-- 3. Smoke test from the app:
--    - Log in as student → /dashboard loads, sees only own submissions
--    - Log in as teacher → /klassen loads only assigned classes
--    - Log in as admin → /beheer shows tenant users
--    - Log in as super_admin → /superadmin shows all tenants
