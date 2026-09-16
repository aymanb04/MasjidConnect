-- ROLLBACK for migration 33: restores the four SELECT policies exactly as they
-- were on 2026-09-16, transcribed from the live pg_policies output.
--
-- Use this if anything about file access looks wrong after 33 is applied.
-- The app goes back to being slow, but slow is recoverable and wrong is not.

BEGIN;

DROP POLICY IF EXISTS "submission_files_select" ON storage.objects;
CREATE POLICY "submission_files_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    (bucket_id = 'submission-files'::text)
    AND (
      ((storage.foldername(name))[1] = ((SELECT auth.uid()))::text)
      OR (EXISTS (
            SELECT 1
            FROM (((submission_files sf
                 JOIN submissions s ON ((s.id = sf.submission_id)))
                 JOIN assignments a ON ((a.id = s.assignment_id)))
                 JOIN class_teachers ct ON ((ct.class_id = a.class_id)))
            WHERE ((sf.file_url = objects.name)
              AND (ct.teacher_id = (SELECT auth.uid())))))
      OR ((((SELECT get_my_role()))::text = 'admin'::text)
          AND (EXISTS (
            SELECT 1
            FROM (((submission_files sf
                 JOIN submissions s ON ((s.id = sf.submission_id)))
                 JOIN assignments a ON ((a.id = s.assignment_id)))
                 JOIN classes c ON ((c.id = a.class_id)))
            WHERE ((sf.file_url = objects.name)
              AND (c.tenant_id = (SELECT get_my_tenant_id()))))))
      OR (SELECT is_super_admin())
    )
  );

DROP POLICY IF EXISTS "student_docs_select" ON storage.objects;
CREATE POLICY "student_docs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    (bucket_id = 'student-documents'::text)
    AND (
      (SELECT is_super_admin())
      OR (
        ((storage.foldername(name))[1] = ((SELECT get_my_tenant_id()))::text)
        AND (
          (((SELECT get_my_role()))::text = ANY (ARRAY['admin'::text, 'leerlingenbegeleiding'::text]))
          OR (EXISTS (
                SELECT 1
                FROM (class_students cs
                      JOIN class_teachers ct ON ((ct.class_id = cs.class_id)))
                WHERE ((cs.student_id = ((storage.foldername(objects.name))[2])::uuid)
                  AND (ct.teacher_id = (SELECT auth.uid())))))
        )
      )
    )
  );

DROP POLICY IF EXISTS reports_staff_select ON storage.objects;
CREATE POLICY reports_staff_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    (bucket_id = 'student-reports'::text)
    AND (
      (SELECT is_super_admin())
      OR (
        ((storage.foldername(name))[1] = ((SELECT get_my_tenant_id()))::text)
        AND (
          (((SELECT get_my_role()))::text = 'admin'::text)
          OR (
            (((SELECT get_my_role()))::text = 'teacher'::text)
            AND ((storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text)
            AND (EXISTS (
                  SELECT 1
                  FROM (class_students cs
                        JOIN class_teachers ct ON ((ct.class_id = cs.class_id)))
                  WHERE ((cs.student_id = ((storage.foldername(objects.name))[2])::uuid)
                    AND (ct.teacher_id = (SELECT auth.uid())))))
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "module_docs_select" ON storage.objects;
CREATE POLICY "module_docs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    (bucket_id = 'module-documents'::text)
    AND (
      (SELECT is_super_admin())
      OR (
        ((storage.foldername(name))[1] = 'modules'::text)
        AND (EXISTS (
              SELECT 1
              FROM (lesson_modules lm
                    JOIN classes c ON ((c.id = lm.class_id)))
              WHERE ((lm.id = ((storage.foldername(objects.name))[2])::uuid)
                AND ((lm.is_visible AND am_i_student_of_class(lm.class_id))
                  OR am_i_teacher_of_class(lm.class_id)
                  OR ((((SELECT get_my_role()))::text = 'admin'::text)
                      AND (c.tenant_id = (SELECT get_my_tenant_id())))))))
      )
    )
  );

-- The helper functions are harmless once nothing calls them, but drop them so
-- the database matches the pre-33 state exactly.
DROP FUNCTION IF EXISTS public.storage_teaches_student(uuid);
DROP FUNCTION IF EXISTS public.storage_can_read_submission(text);
DROP FUNCTION IF EXISTS public.storage_can_read_module(uuid);

COMMIT;
