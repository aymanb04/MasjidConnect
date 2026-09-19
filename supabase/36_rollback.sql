-- ROLLBACK voor migratie 36: zet de policies terug zoals ze op 2026-09-19
-- waren, letterlijk overgenomen uit de live pg_policies-uitvoer.
--
-- Gebruik dit als er na 36 iets mis lijkt met wie welke punten mag zien of
-- opslaan. Traag is te herstellen, verkeerd niet.
--
-- Let op: staff_insert_submission_for_student komt hier terug in de vorm van
-- migratie 35 (met de inline subquery op classes). Wil je ook 35 terugdraaien,
-- dan moet je die policy daarna nog droppen.

BEGIN;

DROP POLICY IF EXISTS student_view_own_feedback ON public.submission_feedback;
CREATE POLICY student_view_own_feedback ON public.submission_feedback
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM submissions
      WHERE submissions.id = submission_feedback.submission_id
        AND submissions.student_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS teacher_view_class_feedback ON public.submission_feedback;
CREATE POLICY teacher_view_class_feedback ON public.submission_feedback
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM ((submissions s
        JOIN assignments a ON ((a.id = s.assignment_id)))
        JOIN class_teachers ct ON ((ct.class_id = a.class_id)))
      WHERE ((s.id = submission_feedback.submission_id)
        AND (ct.teacher_id = (SELECT auth.uid())))
    )
  );

DROP POLICY IF EXISTS admin_view_feedback ON public.submission_feedback;
CREATE POLICY admin_view_feedback ON public.submission_feedback
  FOR SELECT TO authenticated
  USING (
    (((SELECT get_my_role()))::text = 'admin'::text)
    AND (EXISTS (
      SELECT 1
      FROM ((submissions s
        JOIN assignments a ON ((a.id = s.assignment_id)))
        JOIN classes c ON ((c.id = a.class_id)))
      WHERE ((s.id = submission_feedback.submission_id)
        AND (c.tenant_id = (SELECT get_my_tenant_id())))
    ))
  );

DROP POLICY IF EXISTS teacher_manage_feedback ON public.submission_feedback;
CREATE POLICY teacher_manage_feedback ON public.submission_feedback
  FOR ALL TO authenticated
  USING (
    ((teacher_id = (SELECT auth.uid()))
      OR (((SELECT get_my_role()))::text = 'admin'::text))
    AND (EXISTS (
      SELECT 1
      FROM ((submissions s
        JOIN assignments a ON ((a.id = s.assignment_id)))
        JOIN classes c ON ((c.id = a.class_id)))
      WHERE ((s.id = submission_feedback.submission_id)
        AND (c.tenant_id = (SELECT get_my_tenant_id())))
    ))
  )
  WITH CHECK (
    ((teacher_id = (SELECT auth.uid()))
      OR (((SELECT get_my_role()))::text = 'admin'::text))
    AND (EXISTS (
      SELECT 1
      FROM ((submissions s
        JOIN assignments a ON ((a.id = s.assignment_id)))
        JOIN classes c ON ((c.id = a.class_id)))
      WHERE ((s.id = submission_feedback.submission_id)
        AND (c.tenant_id = (SELECT get_my_tenant_id())))
    ))
  );

DROP POLICY IF EXISTS teacher_view_submissions ON public.submissions;
CREATE POLICY teacher_view_submissions ON public.submissions
  FOR SELECT TO authenticated
  USING (
    (EXISTS (
      SELECT 1 FROM (assignments a
        JOIN class_teachers ct ON ((ct.class_id = a.class_id)))
      WHERE ((a.id = submissions.assignment_id)
        AND (ct.teacher_id = (SELECT auth.uid())))))
    OR ((((SELECT get_my_role()))::text = 'admin'::text)
      AND (EXISTS (
        SELECT 1 FROM (assignments a
          JOIN classes c ON ((c.id = a.class_id)))
        WHERE ((a.id = submissions.assignment_id)
          AND (c.tenant_id = (SELECT get_my_tenant_id()))))))
  );

DROP POLICY IF EXISTS teacher_update_submissions ON public.submissions;
CREATE POLICY teacher_update_submissions ON public.submissions
  FOR UPDATE TO authenticated
  USING (
    (EXISTS (
      SELECT 1 FROM (assignments a
        JOIN class_teachers ct ON ((ct.class_id = a.class_id)))
      WHERE ((a.id = submissions.assignment_id)
        AND (ct.teacher_id = (SELECT auth.uid())))))
    OR ((((SELECT get_my_role()))::text = 'admin'::text)
      AND (EXISTS (
        SELECT 1 FROM (assignments a
          JOIN classes c ON ((c.id = a.class_id)))
        WHERE ((a.id = submissions.assignment_id)
          AND (c.tenant_id = (SELECT get_my_tenant_id()))))))
  )
  WITH CHECK (
    (EXISTS (
      SELECT 1 FROM (assignments a
        JOIN class_teachers ct ON ((ct.class_id = a.class_id)))
      WHERE ((a.id = submissions.assignment_id)
        AND (ct.teacher_id = (SELECT auth.uid())))))
    OR ((((SELECT get_my_role()))::text = 'admin'::text)
      AND (EXISTS (
        SELECT 1 FROM (assignments a
          JOIN classes c ON ((c.id = a.class_id)))
        WHERE ((a.id = submissions.assignment_id)
          AND (c.tenant_id = (SELECT get_my_tenant_id()))))))
  );

DROP POLICY IF EXISTS staff_insert_submission_for_student ON public.submissions;
CREATE POLICY staff_insert_submission_for_student ON public.submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.class_has_student(
      public.assignment_owner_class(assignment_id), student_id)
    AND (
      (SELECT is_super_admin())
      OR am_i_teacher_of_class(public.assignment_owner_class(assignment_id))
      OR (
        (SELECT get_my_role())::text = 'admin'
        AND (SELECT get_my_tenant_id()) = (
          SELECT c.tenant_id FROM classes c
          WHERE c.id = public.assignment_owner_class(submissions.assignment_id)
        )
      )
    )
  );

COMMIT;
