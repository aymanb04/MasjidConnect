-- ============================================================
-- Migration 20 — dashboard RPC (perf: one round-trip per load)
--
-- Replaces the dashboard page's per-role waterfall of PostgREST
-- calls with a single function call. SECURITY INVOKER: every table
-- read below still goes through RLS as the calling user, so this
-- returns exactly what the separate client queries returned.
--
-- Apply in the Supabase SQL editor BEFORE deploying the client
-- code that calls it (the client falls back to the old queries if
-- the function is missing, so order is not critical).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_data()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  my_role   text := (SELECT get_my_role())::text;
  my_id     uuid := (SELECT auth.uid());
  my_tenant uuid := (SELECT get_my_tenant_id());
  result    jsonb;
BEGIN
  IF my_role = 'student' THEN
    WITH my_classes AS (
      SELECT c.id, c.name, c.color
      FROM class_students cs
      JOIN classes c ON c.id = cs.class_id
      WHERE cs.student_id = my_id
    ),
    open_assignments AS (
      SELECT a.id, a.title, a.due_date, mc.name AS class_name
      FROM assignments a
      JOIN my_classes mc ON mc.id = a.class_id
      WHERE a.is_published
        AND NOT EXISTS (
          SELECT 1 FROM submissions s
          WHERE s.assignment_id = a.id AND s.student_id = my_id
        )
    )
    SELECT jsonb_build_object(
      'classes',          (SELECT coalesce(jsonb_agg(mc), '[]'::jsonb) FROM my_classes mc),
      'open_assignments', (SELECT coalesce(jsonb_agg(oa), '[]'::jsonb) FROM (
                             SELECT * FROM open_assignments ORDER BY due_date ASC LIMIT 5
                           ) oa),
      'open_count',       (SELECT count(*) FROM open_assignments),
      'submitted_count',  (SELECT count(*) FROM submissions WHERE student_id = my_id)
    ) INTO result;

  ELSIF my_role = 'teacher' THEN
    WITH my_classes AS (
      SELECT c.id, c.name, c.color
      FROM class_teachers ct
      JOIN classes c ON c.id = ct.class_id
      WHERE ct.teacher_id = my_id
    )
    SELECT jsonb_build_object(
      'classes',          (SELECT coalesce(jsonb_agg(mc), '[]'::jsonb) FROM my_classes mc),
      'assignment_count', (SELECT count(*) FROM assignments
                           WHERE class_id IN (SELECT id FROM my_classes)),
      'to_grade_count',   (SELECT count(*) FROM submissions s
                           JOIN assignments a ON a.id = s.assignment_id
                           WHERE a.class_id IN (SELECT id FROM my_classes)
                             AND s.status = 'submitted')
    ) INTO result;

  ELSIF my_role = 'super_admin' THEN
    SELECT jsonb_build_object(
      'class_count',   (SELECT count(*) FROM classes  WHERE NOT is_archived),
      'teacher_count', (SELECT count(*) FROM profiles WHERE role = 'teacher'),
      'student_count', (SELECT count(*) FROM profiles WHERE role = 'student'),
      'tenant_count',  (SELECT count(*) FROM tenants  WHERE is_active)
    ) INTO result;

  ELSE
    -- admin + leerlingenbegeleiding: tenant-scoped counts (RLS caps
    -- these to the caller's tenant regardless; the filter keeps the
    -- plans on the tenant index).
    SELECT jsonb_build_object(
      'class_count',   (SELECT count(*) FROM classes
                        WHERE tenant_id = my_tenant AND NOT is_archived),
      'teacher_count', (SELECT count(*) FROM profiles
                        WHERE tenant_id = my_tenant AND role = 'teacher'),
      'student_count', (SELECT count(*) FROM profiles
                        WHERE tenant_id = my_tenant AND role = 'student')
    ) INTO result;
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_data() TO authenticated;
