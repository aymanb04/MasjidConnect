-- ============================================================
-- Migration 13 — New role: leerlingenbegeleiding (student counselor)
-- Source: mosque feedback 2026-06-09 (FEEDBACK_BUILD_PLAN §A)
-- ============================================================
--
-- A 5th role that can read all student dossiers/classes in its own tenant,
-- can add dossier notes and upload dossier documents (see migration 14),
-- but has no classes of its own and NO access to payment tables.
--
-- Idempotent: DROP IF EXISTS + CREATE. RUN IN: Supabase SQL editor.
-- ============================================================

-- ---- 1. Widen the role CHECK constraints -------------------

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'admin', 'teacher', 'student', 'leerlingenbegeleiding'));

ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('admin', 'teacher', 'student', 'leerlingenbegeleiding'));

-- ---- 2. Admins may assign the new role ---------------------

DROP POLICY IF EXISTS admin_manage_profiles ON public.profiles;
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

-- ---- 3. Counselor read access (own tenant only) ------------
-- The counselor needs to see classes/groups/enrollments to render a
-- student's dossier (classes list + exam scores). All branches are
-- tenant-scoped; no write access anywhere in this migration.

DROP POLICY IF EXISTS member_view_own_classes ON public.classes;
CREATE POLICY member_view_own_classes ON public.classes
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT get_my_tenant_id())
    AND (
      (SELECT get_my_role())::text = 'admin'
      OR (SELECT get_my_role())::text = 'leerlingenbegeleiding'
      OR am_i_teacher_of_class(id)
      OR am_i_student_of_class(id)
    )
  );

DROP POLICY IF EXISTS member_view_groups ON public.groups;
CREATE POLICY member_view_groups ON public.groups
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT get_my_tenant_id())
    AND (
      (SELECT get_my_role())::text = ANY (ARRAY['admin', 'leerlingenbegeleiding'])
      OR am_i_member_of_group(id)
    )
  );

DROP POLICY IF EXISTS view_class_students ON public.class_students;
CREATE POLICY view_class_students ON public.class_students
  FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin())
    OR student_id = (SELECT auth.uid())
    OR am_i_teacher_of_class(class_id)
    OR (
      (SELECT get_my_role())::text = ANY (ARRAY['admin', 'leerlingenbegeleiding'])
      AND EXISTS (
        SELECT 1 FROM classes c
        WHERE c.id = class_students.class_id
          AND c.tenant_id = (SELECT get_my_tenant_id())
      )
    )
  );

DROP POLICY IF EXISTS view_class_teachers ON public.class_teachers;
CREATE POLICY view_class_teachers ON public.class_teachers
  FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin())
    OR teacher_id = (SELECT auth.uid())
    OR am_i_student_of_class(class_id)
    OR (
      (SELECT get_my_role())::text = ANY (ARRAY['admin', 'leerlingenbegeleiding'])
      AND EXISTS (
        SELECT 1 FROM classes c
        WHERE c.id = class_teachers.class_id
          AND c.tenant_id = (SELECT get_my_tenant_id())
      )
    )
  );

-- Read-only on exam scores (dossier grades summary)
DROP POLICY IF EXISTS counselor_read_exam_scores ON public.exam_scores;
CREATE POLICY counselor_read_exam_scores ON public.exam_scores
  FOR SELECT TO authenticated
  USING (
    (SELECT get_my_role())::text = 'leerlingenbegeleiding'
    AND EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = exam_scores.class_id
        AND c.tenant_id = (SELECT get_my_tenant_id())
    )
  );

-- ============================================================
-- VERIFICATION
-- ============================================================
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conname in ('profiles_role_check', 'invitations_role_check');
-- select tablename, policyname, qual from pg_policies
--   where policyname in ('admin_manage_profiles','member_view_own_classes',
--     'member_view_groups','view_class_students','view_class_teachers',
--     'counselor_read_exam_scores');
