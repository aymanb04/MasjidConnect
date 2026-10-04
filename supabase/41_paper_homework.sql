-- 41: huiswerk op papier is nooit "te laat" en niet eeuwig "openstaand".
--
-- AANLEIDING (2026-10-04), de school: het rode "Te laat" verwart de ouders.
-- Bij De Kroon wordt huiswerk op papier gemaakt, dus niemand uploadt iets en
-- ELKE leerling stond na de deadline op "te laat".
--
-- Geen nieuwe kolom: allow_file_submission en allow_text_submission bestaan
-- al. Beide uit = niet via de app inleveren. Het formulier "Nieuw huiswerk"
-- vraagt dat nu expliciet.
--
-- Hier verandert enkel de leerlingtak van get_dashboard_data (rest = 40):
--   * papieren huiswerk telt na de deadline niet meer als "openstaand"
--   * elke rij krijgt needs_upload, zodat het dashboard weet of "te laat" mag
--
-- Vereist migratie 40.

BEGIN;

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
    -- Huiswerk via de app: open tot het ingediend is (ongewijzigd).
    -- Huiswerk op papier/mondeling (beide vlaggen uit): open tot de deadline,
    -- of een week na aanmaak als er geen deadline is. Er komt nooit een
    -- indiening, dus anders bleef het voor altijd "openstaand".
    open_assignments AS (
      SELECT a.id, a.title, a.due_date, mc.name AS class_name,
             (coalesce(a.allow_file_submission, false)
              OR coalesce(a.allow_text_submission, false)) AS needs_upload
      FROM assignments a
      JOIN my_classes mc ON mc.id = a.class_id
      WHERE a.is_published
        AND NOT EXISTS (
          SELECT 1 FROM submissions s
          WHERE s.assignment_id = a.id AND s.student_id = my_id
        )
        AND (
          coalesce(a.allow_file_submission, false)
          OR coalesce(a.allow_text_submission, false)
          OR a.due_date >= now()
          OR (a.due_date IS NULL AND a.created_at > now() - interval '7 days')
        )
    ),
    -- Alleen de eigen, zichtbaar gezette nota's; de auteur erbij, want een
    -- nota zonder afzender is voor een ouder onleesbaar.
    my_notes AS (
      SELECT n.id, n.body, n.created_at,
             trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) AS author_name
      FROM student_notes n
      LEFT JOIN profiles p ON p.id = n.author_id
      WHERE n.student_id = my_id
        AND n.visible_to_student
      ORDER BY n.created_at DESC
      LIMIT 5
    )
    SELECT jsonb_build_object(
      'classes',          (SELECT coalesce(jsonb_agg(mc), '[]'::jsonb) FROM my_classes mc),
      'open_assignments', (SELECT coalesce(jsonb_agg(oa), '[]'::jsonb) FROM (
                             SELECT * FROM open_assignments ORDER BY due_date ASC LIMIT 5
                           ) oa),
      'open_count',       (SELECT count(*) FROM open_assignments),
      'submitted_count',  (SELECT count(*) FROM submissions WHERE student_id = my_id),
      'notes',            (SELECT coalesce(jsonb_agg(mn), '[]'::jsonb) FROM my_notes mn)
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
    --
    -- Nieuw: `recent_notes`. Dit is de "melding" waar de school om vroeg, in
    -- de app zelf. Twee weken en hoogstens 15 rijen -- het is een signaal dat
    -- er iets geschreven is, geen archief; dat staat in het dossier.
    SELECT jsonb_build_object(
      'class_count',   (SELECT count(*) FROM classes
                        WHERE tenant_id = my_tenant AND NOT is_archived),
      'teacher_count', (SELECT count(*) FROM profiles
                        WHERE tenant_id = my_tenant AND role = 'teacher'),
      'student_count', (SELECT count(*) FROM profiles
                        WHERE tenant_id = my_tenant AND role = 'student'),
      'recent_notes',  (SELECT coalesce(jsonb_agg(rn), '[]'::jsonb) FROM (
                          SELECT n.id, n.body, n.created_at, n.visible_to_student,
                                 n.student_id,
                                 trim(coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')) AS student_name,
                                 trim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')) AS author_name
                          FROM student_notes n
                          LEFT JOIN profiles s ON s.id = n.student_id
                          LEFT JOIN profiles a ON a.id = n.author_id
                          WHERE n.tenant_id = my_tenant
                            AND n.created_at > now() - interval '14 days'
                          ORDER BY n.created_at DESC
                          LIMIT 15
                        ) rn),
      'notes_last_7d', (SELECT count(*) FROM student_notes
                        WHERE tenant_id = my_tenant
                          AND created_at > now() - interval '7 days')
    ) INTO result;
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_data() TO authenticated;

COMMIT;

-- Nakijken (als leerling):
--   SELECT jsonb_pretty(public.get_dashboard_data());
--   -- verwacht: open_assignments[].needs_upload aanwezig; papieren huiswerk
--   -- met een verstreken deadline staat er niet meer in.
