-- 33: stop storage.objects RLS from exploding at PLAN time.
--
-- SYMPTOM (De Kroon, 2026-09-16): "als ik op pdf klik blijft deze draaien en
-- stopt daarna gewoon". Signing a URL took 6-30+ s for an authenticated user
-- and ~115 ms for the service role, on the same object.
--
-- CAUSE, from EXPLAIN (ANALYZE, BUFFERS) as `authenticated`:
--     Planning Time:   813.585 ms
--     Execution Time: 1173.768 ms
--     Index Scan ... (actual time=52.849..58.955 rows=1)
-- with essentially every subplan marked "(never executed)".
--
-- Execution is fine: the bucket_id branch short-circuits and 35 buffers are
-- touched. The cost is PLANNING. The six OR-ed SELECT policies each carry EXISTS
-- subqueries over submission_files / submissions / assignments / classes /
-- class_students / class_teachers, and every one of those tables has its OWN
-- RLS, which the planner expands recursively -- several of them referencing
-- classes again. The plan reached `classes c_94`, `class_teachers ct_34` and
-- InitPlan 29355; planning alone read 2415 buffers. That price is paid on every
-- request, and on shared-CPU `micro` under load it becomes tens of seconds.
--
-- FIX: move only the EXISTS bodies into SECURITY DEFINER functions. Those are
-- opaque to the planner, so the recursive expansion stops at the call. Bucket
-- gating, role checks and the OR structure stay in the policies, where they
-- remain readable and auditable.
--
-- SECURITY NOTE: SECURITY DEFINER bypasses RLS on the tables inside the
-- function, so the function body is now the ONLY gate for that branch. Each one
-- below is self-scoping: the teacher branches compare against auth.uid(), the
-- admin branches against get_my_tenant_id(), and the calling policy still checks
-- foldername[1] against the caller tenant. The logic is a transcription of the
-- live policy text, not a redesign.
--
-- TEST ON de-kroon-demo FIRST. verify-schooldocs.js and the cross-tenant probe
-- must both still pass before this touches the real tenant.

BEGIN;

-- Does the caller teach this pupil? student-documents and student-reports both
-- asked exactly this question.
CREATE OR REPLACE FUNCTION public.storage_teaches_student(p_student uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM class_students cs
    JOIN class_teachers ct ON ct.class_id = cs.class_id
    WHERE cs.student_id = p_student
      AND ct.teacher_id = (SELECT auth.uid())
  );
$fn$;

-- submission-files: teacher of the class, or admin of the owning tenant.
-- (The "it is my own upload" branch stays in the policy: it needs no joins.)
CREATE OR REPLACE FUNCTION public.storage_can_read_submission(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $fn$
  SELECT EXISTS (
           SELECT 1
           FROM submission_files sf
           JOIN submissions    s  ON s.id  = sf.submission_id
           JOIN assignments    a  ON a.id  = s.assignment_id
           JOIN class_teachers ct ON ct.class_id = a.class_id
           WHERE sf.file_url = p_name
             AND ct.teacher_id = (SELECT auth.uid())
         )
      OR ( (SELECT get_my_role())::text = 'admin'
           AND EXISTS (
             SELECT 1
             FROM submission_files sf
             JOIN submissions s ON s.id = sf.submission_id
             JOIN assignments a ON a.id = s.assignment_id
             JOIN classes     c ON c.id = a.class_id
             WHERE sf.file_url = p_name
               AND c.tenant_id = (SELECT get_my_tenant_id())
           ) );
$fn$;

-- module-documents: a visible module of a class I attend, a class I teach, or
-- my own tenant as admin.
CREATE OR REPLACE FUNCTION public.storage_can_read_module(p_module uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM lesson_modules lm
    JOIN classes c ON c.id = lm.class_id
    WHERE lm.id = p_module
      AND ( (lm.is_visible AND am_i_student_of_class(lm.class_id))
         OR am_i_teacher_of_class(lm.class_id)
         OR ( (SELECT get_my_role())::text = 'admin'
              AND c.tenant_id = (SELECT get_my_tenant_id()) ) )
  );
$fn$;

REVOKE ALL ON FUNCTION public.storage_teaches_student(uuid)     FROM public;
REVOKE ALL ON FUNCTION public.storage_can_read_submission(text) FROM public;
REVOKE ALL ON FUNCTION public.storage_can_read_module(uuid)     FROM public;
GRANT EXECUTE ON FUNCTION public.storage_teaches_student(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_can_read_submission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_can_read_module(uuid)     TO authenticated;

-- ---- the four SELECT policies that carried EXISTS --------------------------
-- Same semantics; only the EXISTS bodies move behind a function call.
-- reports_student_select_own and tenant_docs_select are untouched: they have no
-- subqueries and were never part of the problem.

DROP POLICY IF EXISTS "submission_files_select" ON storage.objects;
CREATE POLICY "submission_files_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'submission-files'
    AND (
      (storage.foldername(storage.objects.name))[1] = ((SELECT auth.uid()))::text
      OR public.storage_can_read_submission(storage.objects.name)
      OR (SELECT is_super_admin())
    )
  );

DROP POLICY IF EXISTS "student_docs_select" ON storage.objects;
CREATE POLICY "student_docs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'student-documents'
    AND (
      (SELECT is_super_admin())
      OR (
        (storage.foldername(storage.objects.name))[1] = ((SELECT get_my_tenant_id()))::text
        AND (
          ((SELECT get_my_role())::text = ANY (ARRAY['admin','leerlingenbegeleiding']))
          OR public.storage_teaches_student(((storage.foldername(storage.objects.name))[2])::uuid)
        )
      )
    )
  );

DROP POLICY IF EXISTS reports_staff_select ON storage.objects;
CREATE POLICY reports_staff_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'student-reports'
    AND (
      (SELECT is_super_admin())
      OR (
        (storage.foldername(storage.objects.name))[1] = ((SELECT get_my_tenant_id()))::text
        AND (
          (SELECT get_my_role())::text = 'admin'
          OR (
            (SELECT get_my_role())::text = 'teacher'
            AND (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND public.storage_teaches_student(((storage.foldername(storage.objects.name))[2])::uuid)
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "module_docs_select" ON storage.objects;
CREATE POLICY "module_docs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'module-documents'
    AND (
      (SELECT is_super_admin())
      OR (
        (storage.foldername(storage.objects.name))[1] = 'modules'
        AND public.storage_can_read_module(((storage.foldername(storage.objects.name))[2])::uuid)
      )
    )
  );

COMMIT;

-- ---- verification ----------------------------------------------------------
-- Planning Time should fall from ~800 ms to single-digit ms.
--
-- BEGIN;
-- SELECT set_config('request.jwt.claims',
--   json_build_object('sub', (SELECT id FROM public.profiles
--                             WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug='de-kroon')
--                               AND role='admin' LIMIT 1),
--                     'role','authenticated')::text, true);
-- SET LOCAL ROLE authenticated;
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT id FROM storage.objects
-- WHERE bucket_id = 'tenant-documents'
--   AND name = (SELECT td.file_url FROM public.tenant_documents td
--                JOIN public.tenants t ON t.id = td.tenant_id
--               WHERE t.slug = 'de-kroon' ORDER BY td.created_at LIMIT 1);
-- ROLLBACK;
