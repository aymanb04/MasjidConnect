-- DRY RUN for migration 33. Changes NOTHING: it ends in ROLLBACK.
--
-- Both tenants share one database and storage RLS is database-wide, so the
-- migration cannot be scoped to de-kroon-demo. This is the substitute: apply it
-- inside a transaction, measure, check permissions from inside that same
-- transaction, then throw it all away.
--
-- WHY IT LOOKS LIKE THIS: the Supabase SQL editor only shows the result of the
-- LAST statement. A first version of this file ran nine checks and displayed
-- one of them -- and the one that survived was a "must be 0", which reads the
-- same whether isolation works or the policy now blocks everybody. So every
-- check is collected into a temp table and printed once at the end.
--
-- Run the WHOLE file in one go. Read every row of the result before deciding.

BEGIN;

CREATE TEMP TABLE dryrun (step int, check_name text, result text, verdict text)
  ON COMMIT DROP;

-- ---------- 1. BEFORE ------------------------------------------------------
DO $probe$
DECLARE
  real_admin uuid; demo_admin uuid; plan jsonb; real_file text;
BEGIN
  SELECT id INTO real_admin FROM public.profiles
   WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug='de-kroon')
     AND role='admin' LIMIT 1;
  SELECT id INTO demo_admin FROM public.profiles
   WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug='de-kroon-demo')
     AND role='admin' LIMIT 1;

  -- Derived, not hardcoded: this repo is public, and the tenant id plus the
  -- storage path of a school's own reglement do not belong in it.
  SELECT td.file_url INTO real_file
    FROM public.tenant_documents td
    JOIN public.tenants t ON t.id = td.tenant_id
   WHERE t.slug = 'de-kroon' AND td.is_published
   ORDER BY td.created_at LIMIT 1;

  INSERT INTO dryrun VALUES
    (0,'real admin found', coalesce(real_admin::text,'NOT FOUND'),
       CASE WHEN real_admin IS NULL THEN 'STOP' ELSE 'ok' END),
    (0,'demo admin found', coalesce(demo_admin::text,'NOT FOUND'),
       CASE WHEN demo_admin IS NULL THEN 'STOP' ELSE 'ok' END);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', real_admin, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  EXECUTE format(
    'EXPLAIN (ANALYZE, FORMAT JSON) SELECT id FROM storage.objects '
    'WHERE bucket_id = %L AND name = %L', 'tenant-documents', real_file)
  INTO plan;

  EXECUTE 'RESET ROLE';
  INSERT INTO dryrun VALUES
    (1,'BEFORE planning time (ms)',
       round((plan->0->>'Planning Time')::numeric, 1)::text, 'baseline'),
    (1,'BEFORE execution time (ms)',
       round((plan->0->>'Execution Time')::numeric, 1)::text, 'baseline');
END
$probe$;

-- ---------- 2. THE MIGRATION BODY (no BEGIN/COMMIT of its own) -------------

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

-- ---------- 3. AFTER: speed + permissions ----------------------------------
DO $verify$
DECLARE
  real_admin uuid; demo_admin uuid; plan jsonb; n int;
  real_file text; real_tenant_prefix text;
BEGIN
  SELECT id INTO real_admin FROM public.profiles
   WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug='de-kroon')
     AND role='admin' LIMIT 1;
  SELECT id INTO demo_admin FROM public.profiles
   WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug='de-kroon-demo')
     AND role='admin' LIMIT 1;

  -- Derived, not hardcoded: this repo is public, and the tenant id plus the
  -- storage path of a school's own reglement do not belong in it.
  SELECT td.file_url INTO real_file
    FROM public.tenant_documents td
    JOIN public.tenants t ON t.id = td.tenant_id
   WHERE t.slug = 'de-kroon' AND td.is_published
   ORDER BY td.created_at LIMIT 1;
  SELECT (id)::text || '/%' INTO real_tenant_prefix
    FROM public.tenants WHERE slug = 'de-kroon';

  -- --- as the REAL school admin ---
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', real_admin, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  EXECUTE format(
    'EXPLAIN (ANALYZE, FORMAT JSON) SELECT id FROM storage.objects '
    'WHERE bucket_id = %L AND name = %L', 'tenant-documents', real_file)
  INTO plan;

  SELECT count(*) INTO n FROM storage.objects
   WHERE bucket_id='tenant-documents' AND name = real_file;
  EXECUTE 'RESET ROLE';

  INSERT INTO dryrun VALUES
    (2,'AFTER planning time (ms)',
       round((plan->0->>'Planning Time')::numeric, 1)::text, 'want: single digits'),
    (2,'AFTER execution time (ms)',
       round((plan->0->>'Execution Time')::numeric, 1)::text, 'want: single digits'),
    (3,'POSITIVE CONTROL: real admin sees own reglement', n::text,
       CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL - access broken' END);

  -- --- as the DEMO admin, looking at the real school ---
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', demo_admin, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO n FROM storage.objects
   WHERE bucket_id='tenant-documents' AND name = real_file;
  EXECUTE 'RESET ROLE';
  INSERT INTO dryrun VALUES
    (4,'ISOLATION: demo admin sees real reglement', n::text,
       CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL - LEAK' END);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', demo_admin, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM storage.objects WHERE name LIKE real_tenant_prefix;
  EXECUTE 'RESET ROLE';
  INSERT INTO dryrun VALUES
    (5,'ISOLATION: demo admin sees any real file', n::text,
       CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL - LEAK' END);
END
$verify$;

-- ---------- 4. the one result the editor will show -------------------------
SELECT step, check_name, result, verdict FROM dryrun ORDER BY step, check_name;

-- ---------- 5. undo everything --------------------------------------------
ROLLBACK;
