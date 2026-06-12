-- ============================================================
-- Migration 12 — Tenant-scope fixes for read/storage RLS
-- Author: security audit 2026-06-06 (SECURITY_TODO §0c, §0d)
-- ============================================================
--
-- Closes cross-tenant data-exposure holes confirmed against live pg_policies
-- on 2026-06-06. The 2026-05-21 audit tenant-scoped the *write* policies on
-- these tables but left several *read* policies (and one UPDATE) with a bare
-- `get_my_role() = 'admin'` branch and no tenant filter. Because RLS policies
-- OR-combine, that bare branch grants any admin global access across tenants.
--
-- Idempotent: every policy is DROP IF EXISTS + CREATE. Safe to re-run.
-- RUN IN: Supabase SQL editor (as postgres). Review the verification block at
-- the bottom after applying.
--
-- Helper functions referenced (all SECURITY DEFINER, already live):
--   get_my_role(), get_my_tenant_id(), is_super_admin(),
--   am_i_teacher_of_class(uuid), am_i_student_of_class(uuid)
-- ============================================================


-- ============================================================
-- SECTION A — public table read policies (§0c-1, §0c-3)
-- ============================================================

-- ---- submissions: SELECT (§0c-1) ---------------------------
-- Was: teacher EXISTS OR get_my_role()='admin'  (admin = global read)
DROP POLICY IF EXISTS teacher_view_submissions ON public.submissions;
CREATE POLICY teacher_view_submissions ON public.submissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assignments a
      JOIN class_teachers ct ON ct.class_id = a.class_id
      WHERE a.id = submissions.assignment_id
        AND ct.teacher_id = (SELECT auth.uid())
    )
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND EXISTS (
        SELECT 1 FROM assignments a
        JOIN classes c ON c.id = a.class_id
        WHERE a.id = submissions.assignment_id
          AND c.tenant_id = (SELECT get_my_tenant_id())
      )
    )
  );

-- ---- submissions: UPDATE (§0c-1) ---------------------------
-- Was: USING only, with bare admin branch (admin could edit any tenant's rows).
-- Now tenant-scoped on the admin branch, and a matching WITH CHECK so a row can't
-- be updated into another tenant's scope.
DROP POLICY IF EXISTS teacher_update_submissions ON public.submissions;
CREATE POLICY teacher_update_submissions ON public.submissions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assignments a
      JOIN class_teachers ct ON ct.class_id = a.class_id
      WHERE a.id = submissions.assignment_id
        AND ct.teacher_id = (SELECT auth.uid())
    )
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND EXISTS (
        SELECT 1 FROM assignments a
        JOIN classes c ON c.id = a.class_id
        WHERE a.id = submissions.assignment_id
          AND c.tenant_id = (SELECT get_my_tenant_id())
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assignments a
      JOIN class_teachers ct ON ct.class_id = a.class_id
      WHERE a.id = submissions.assignment_id
        AND ct.teacher_id = (SELECT auth.uid())
    )
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND EXISTS (
        SELECT 1 FROM assignments a
        JOIN classes c ON c.id = a.class_id
        WHERE a.id = submissions.assignment_id
          AND c.tenant_id = (SELECT get_my_tenant_id())
      )
    )
  );

-- ---- submission_files: SELECT (§0c-1) ----------------------
-- Was: teacher EXISTS OR role = ANY(admin,super_admin)  (global read), which
-- overrode the correctly-scoped admin_view_submission_files policy. Drop the
-- admin/super_admin branch here; the existing admin_view_submission_files
-- (tenant-scoped) and super_admin_all_submission_files policies cover those roles.
DROP POLICY IF EXISTS teacher_view_submission_files ON public.submission_files;
CREATE POLICY teacher_view_submission_files ON public.submission_files
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN class_teachers ct ON ct.class_id = a.class_id
      WHERE s.id = submission_files.submission_id
        AND ct.teacher_id = (SELECT auth.uid())
    )
  );

-- ---- class_students: SELECT (§0c-3) ------------------------
-- Was: is_super_admin() OR get_my_role()='admin' OR student=self OR am_i_teacher.
-- The admin branch had no tenant filter. Scope it.
DROP POLICY IF EXISTS view_class_students ON public.class_students;
CREATE POLICY view_class_students ON public.class_students
  FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin())
    OR student_id = (SELECT auth.uid())
    OR am_i_teacher_of_class(class_id)
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND EXISTS (
        SELECT 1 FROM classes c
        WHERE c.id = class_students.class_id
          AND c.tenant_id = (SELECT get_my_tenant_id())
      )
    )
  );

-- Redundant + unscoped-admin duplicate (also flagged in §6e-bis). The broad
-- view_class_students above already covers teachers via am_i_teacher_of_class.
DROP POLICY IF EXISTS teacher_view_class_students ON public.class_students;

-- ---- class_teachers: SELECT (§0c-3) ------------------------
DROP POLICY IF EXISTS view_class_teachers ON public.class_teachers;
CREATE POLICY view_class_teachers ON public.class_teachers
  FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin())
    OR teacher_id = (SELECT auth.uid())
    OR am_i_student_of_class(class_id)
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND EXISTS (
        SELECT 1 FROM classes c
        WHERE c.id = class_teachers.class_id
          AND c.tenant_id = (SELECT get_my_tenant_id())
      )
    )
  );


-- ============================================================
-- SECTION B — storage.objects policies (§0d)
-- Report path:     {tenant_id}/{student_id}/{class_id}_s{semester}.{ext}
--                  → foldername[1]=tenant_id, [2]=student_id
-- Submission path: {user_id}/{assignment_id}/{ts}_{name}
--                  → foldername[1]=user_id
-- Module path:     modules/{module_id}/{ts}_{name}
--                  → foldername[1]='modules', [2]=module_id
-- ============================================================

-- ---- student-reports: staff CRUD, tenant-scoped (§0d-1) ----
-- Was 4 policies "Teachers / admins manage all reports 9f75t9_{0..3}" gating only
-- on role+is_active with NO tenant/folder scope → any teacher could list+download
-- (and overwrite/delete) every tenant's report cards. Add tenant folder-scope.
DROP POLICY IF EXISTS "Teachers / admins manage all reports 9f75t9_0" ON storage.objects;
DROP POLICY IF EXISTS "Teachers / admins manage all reports 9f75t9_1" ON storage.objects;
DROP POLICY IF EXISTS "Teachers / admins manage all reports 9f75t9_2" ON storage.objects;
DROP POLICY IF EXISTS "Teachers / admins manage all reports 9f75t9_3" ON storage.objects;

-- super_admin (tenant_id IS NULL) keeps global access via is_super_admin();
-- teacher/admin are scoped to their own tenant's folder.
DROP POLICY IF EXISTS reports_staff_select ON storage.objects;
CREATE POLICY reports_staff_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'student-reports'
    AND (
      (SELECT is_super_admin())
      OR (
        (storage.foldername(name))[1] = (SELECT get_my_tenant_id())::text
        AND (SELECT get_my_role())::text = ANY (ARRAY['teacher','admin'])
      )
    )
  );

DROP POLICY IF EXISTS reports_staff_insert ON storage.objects;
CREATE POLICY reports_staff_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'student-reports'
    AND (
      (SELECT is_super_admin())
      OR (
        (storage.foldername(name))[1] = (SELECT get_my_tenant_id())::text
        AND (SELECT get_my_role())::text = ANY (ARRAY['teacher','admin'])
      )
    )
  );

DROP POLICY IF EXISTS reports_staff_update ON storage.objects;
CREATE POLICY reports_staff_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'student-reports'
    AND (
      (SELECT is_super_admin())
      OR (
        (storage.foldername(name))[1] = (SELECT get_my_tenant_id())::text
        AND (SELECT get_my_role())::text = ANY (ARRAY['teacher','admin'])
      )
    )
  )
  WITH CHECK (
    bucket_id = 'student-reports'
    AND (
      (SELECT is_super_admin())
      OR (
        (storage.foldername(name))[1] = (SELECT get_my_tenant_id())::text
        AND (SELECT get_my_role())::text = ANY (ARRAY['teacher','admin'])
      )
    )
  );

DROP POLICY IF EXISTS reports_staff_delete ON storage.objects;
CREATE POLICY reports_staff_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'student-reports'
    AND (
      (SELECT is_super_admin())
      OR (
        (storage.foldername(name))[1] = (SELECT get_my_tenant_id())::text
        AND (SELECT get_my_role())::text = ANY (ARRAY['teacher','admin'])
      )
    )
  );

-- ---- student-reports: student reads own (§0d-2 bug fix) ----
-- Was: foldername[1] = auth.uid()  — but [1] is the tenant_id, so it never
-- matched and students could not download their own reports. The student id is
-- in [2].
DROP POLICY IF EXISTS "students read won reports 9f75t9_0" ON storage.objects;
DROP POLICY IF EXISTS reports_student_select_own ON storage.objects;
CREATE POLICY reports_student_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'student-reports'
    AND (storage.foldername(name))[1] = (SELECT get_my_tenant_id())::text
    AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  );

-- ---- submission-files: tenant-scoped read/delete (§0d-4) ---
-- Was select: own-folder OR role∈(teacher,admin,super_admin)  [no tenant]
--     delete: own-folder OR role∈(admin,super_admin)          [no tenant]
-- Resolve tenant via submission_files.file_url = the storage path (= name).
DROP POLICY IF EXISTS submission_files_select ON storage.objects;
CREATE POLICY submission_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'submission-files'
    AND (
      -- student: own folder (path starts with their uid)
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      -- teacher of the class this file belongs to
      OR EXISTS (
        SELECT 1
        FROM submission_files sf
        JOIN submissions s   ON s.id = sf.submission_id
        JOIN assignments a   ON a.id = s.assignment_id
        JOIN class_teachers ct ON ct.class_id = a.class_id
        WHERE sf.file_url = storage.objects.name
          AND ct.teacher_id = (SELECT auth.uid())
      )
      -- admin of the file's tenant
      OR (
        (SELECT get_my_role())::text = 'admin'
        AND EXISTS (
          SELECT 1
          FROM submission_files sf
          JOIN submissions s ON s.id = sf.submission_id
          JOIN assignments a ON a.id = s.assignment_id
          JOIN classes c     ON c.id = a.class_id
          WHERE sf.file_url = storage.objects.name
            AND c.tenant_id = (SELECT get_my_tenant_id())
        )
      )
      OR (SELECT is_super_admin())
    )
  );

DROP POLICY IF EXISTS submission_files_delete ON storage.objects;
CREATE POLICY submission_files_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'submission-files'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (
        (SELECT get_my_role())::text = 'admin'
        AND EXISTS (
          SELECT 1
          FROM submission_files sf
          JOIN submissions s ON s.id = sf.submission_id
          JOIN assignments a ON a.id = s.assignment_id
          JOIN classes c     ON c.id = a.class_id
          WHERE sf.file_url = storage.objects.name
            AND c.tenant_id = (SELECT get_my_tenant_id())
        )
      )
      OR (SELECT is_super_admin())
    )
  );
-- NOTE: submission_files_insert is already correctly scoped to own folder
-- (WITH CHECK (storage.foldername(name))[1] = auth.uid()); left unchanged.

-- ---- module-documents: tenant/membership-scoped (§0d-3) ----
-- Was select: bucket only → readable by ANY authenticated user across tenants.
--     insert/delete: role∈(teacher,admin,super_admin), no tenant.
-- Resolve tenant + membership via foldername[2] = module_id → lesson_modules.
-- NOTE: relies on the path convention modules/{module_id}/...; the [1]='modules'
-- guard avoids casting a non-uuid. TEST after applying (uploads, student view,
-- teacher upload/delete) before relying on it.
-- NOTE: inside the EXISTS, `name` MUST be qualified as storage.objects.name —
-- unqualified it binds to classes.name and the policy silently never matches.
DROP POLICY IF EXISTS module_docs_select ON storage.objects;
CREATE POLICY module_docs_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'module-documents'
    AND (
      (SELECT is_super_admin())
      OR (
        (storage.foldername(name))[1] = 'modules'
        AND EXISTS (
          SELECT 1
          FROM lesson_modules lm
          JOIN classes c ON c.id = lm.class_id
          WHERE lm.id = ((storage.foldername(storage.objects.name))[2])::uuid
            AND (
              (lm.is_visible AND am_i_student_of_class(lm.class_id))
              OR am_i_teacher_of_class(lm.class_id)
              OR ((SELECT get_my_role())::text = 'admin'
                  AND c.tenant_id = (SELECT get_my_tenant_id()))
            )
        )
      )
    )
  );

DROP POLICY IF EXISTS module_docs_insert ON storage.objects;
CREATE POLICY module_docs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'module-documents'
    AND (
      (SELECT is_super_admin())
      OR (
        (storage.foldername(name))[1] = 'modules'
        AND EXISTS (
          SELECT 1
          FROM lesson_modules lm
          JOIN classes c ON c.id = lm.class_id
          WHERE lm.id = ((storage.foldername(storage.objects.name))[2])::uuid
            AND (
              am_i_teacher_of_class(lm.class_id)
              OR ((SELECT get_my_role())::text = 'admin'
                  AND c.tenant_id = (SELECT get_my_tenant_id()))
            )
        )
      )
    )
  );

DROP POLICY IF EXISTS module_docs_delete ON storage.objects;
CREATE POLICY module_docs_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'module-documents'
    AND (
      (SELECT is_super_admin())
      OR (
        (storage.foldername(name))[1] = 'modules'
        AND EXISTS (
          SELECT 1
          FROM lesson_modules lm
          JOIN classes c ON c.id = lm.class_id
          WHERE lm.id = ((storage.foldername(storage.objects.name))[2])::uuid
            AND (
              am_i_teacher_of_class(lm.class_id)
              OR ((SELECT get_my_role())::text = 'admin'
                  AND c.tenant_id = (SELECT get_my_tenant_id()))
            )
        )
      )
    )
  );


-- ============================================================
-- VERIFICATION (run after applying; eyeball the output)
-- ============================================================
-- Expect: every admin/staff branch below now contains a tenant_id / folder check.
--
-- select tablename, policyname, cmd, qual, with_check
-- from pg_policies
-- where (schemaname='public'
--        and tablename in ('submissions','submission_files',
--                          'class_students','class_teachers'))
--    or (schemaname='storage' and tablename='objects'
--        and policyname like ANY (ARRAY['reports_%','submission_files_%','module_docs_%']))
-- order by tablename, policyname;
--
-- Functional smoke test (do as a normal admin/teacher/student, NOT super_admin):
--   * admin A cannot select submissions / class_students of mosque B
--   * teacher cannot list() student-reports of another tenant
--   * student CAN now download their own report card (§0d-2)
--   * student of a class can still open visible module docs; outsider cannot
