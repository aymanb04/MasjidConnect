-- 36: haal de EXISTS-joins uit de policies van submission_feedback en
-- submissions. Zelfde ziekte, zelfde medicijn als migratie 33.
--
-- AANLEIDING (2026-09-19). Bij het quoteren van drie leerlingen na elkaar sloeg
-- de eerste op en liepen de volgende vast:
--
--   57014: canceling statement due to statement timeout
--
-- Gemeten op één verbinding, als leerkracht:
--   profiles SELECT (controle) :  781 · 128 · 321 · 109 · 121 ms
--   submission_feedback SELECT :  400 · 490 · 480 · 481 · 352 ms
--   submission_feedback UPSERT : 1886 · TIMEOUT · 2568 · TIMEOUT · 6746 · TIMEOUT · TIMEOUT · TIMEOUT
--
-- De controle blijft snel, dus het is niet de database of het IO-budget: het is
-- deze tabel.
--
-- OORZAAK. Alle vier de policies op submission_feedback doen
--   EXISTS (submissions -> assignments -> classes / class_teachers)
-- en die tabellen hebben zélf RLS. De planner klapt bij het PLANNEN de policies
-- van elke aangeraakte tabel mee uit, recursief. Een UPSERT betaalt dat drie
-- keer: de INSERT-WITH CHECK, en bij conflict de UPDATE-USING én -WITH CHECK.
--
-- Migratie 35 heeft dit niet veroorzaakt maar wel verergerd: die zette er nog
-- een INSERT-policy op submissions bij, dus werd de boom die de planner moet
-- uitklappen groter. Vandaar dat het nu pas over de tijdslimiet ging.
--
-- OPLOSSING. SECURITY DEFINER-functies zijn ondoorzichtig voor de planner: hij
-- ziet één functieaanroep in plaats van een tabel met policies, en stopt met
-- uitklappen. De policies houden exact dezelfde betekenis.
--
-- MEEGENOMEN: staff_insert_submission_for_student uit migratie 35 had precies
-- dezelfde fout -- een inline "SELECT c.tenant_id FROM classes c" in de WITH
-- CHECK, en classes heeft ook RLS. Die is hier mee opgeschoond.

BEGIN;

-- ---- helpers --------------------------------------------------------------
-- Alle drie STABLE + SECURITY DEFINER, met een vaste search_path.

CREATE OR REPLACE FUNCTION public.submission_owner_student(p_submission uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $fn$
  SELECT student_id FROM submissions WHERE id = p_submission;
$fn$;

CREATE OR REPLACE FUNCTION public.submission_owner_class(p_submission uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $fn$
  SELECT a.class_id
  FROM submissions s
  JOIN assignments a ON a.id = s.assignment_id
  WHERE s.id = p_submission;
$fn$;

CREATE OR REPLACE FUNCTION public.assignment_tenant(p_assignment uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $fn$
  SELECT c.tenant_id
  FROM assignments a
  JOIN classes c ON c.id = a.class_id
  WHERE a.id = p_assignment;
$fn$;

CREATE OR REPLACE FUNCTION public.submission_tenant(p_submission uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $fn$
  SELECT c.tenant_id
  FROM submissions s
  JOIN assignments a ON a.id = s.assignment_id
  JOIN classes     c ON c.id = a.class_id
  WHERE s.id = p_submission;
$fn$;

REVOKE ALL ON FUNCTION public.submission_owner_student(uuid) FROM public;
REVOKE ALL ON FUNCTION public.submission_owner_class(uuid)   FROM public;
REVOKE ALL ON FUNCTION public.assignment_tenant(uuid)        FROM public;
REVOKE ALL ON FUNCTION public.submission_tenant(uuid)        FROM public;
GRANT EXECUTE ON FUNCTION public.submission_owner_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submission_owner_class(uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.assignment_tenant(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.submission_tenant(uuid)        TO authenticated;

-- ---- submission_feedback --------------------------------------------------

DROP POLICY IF EXISTS student_view_own_feedback ON public.submission_feedback;
CREATE POLICY student_view_own_feedback ON public.submission_feedback
  FOR SELECT TO authenticated
  USING (public.submission_owner_student(submission_id) = (SELECT auth.uid()));

DROP POLICY IF EXISTS teacher_view_class_feedback ON public.submission_feedback;
CREATE POLICY teacher_view_class_feedback ON public.submission_feedback
  FOR SELECT TO authenticated
  USING (am_i_teacher_of_class(public.submission_owner_class(submission_id)));

DROP POLICY IF EXISTS admin_view_feedback ON public.submission_feedback;
CREATE POLICY admin_view_feedback ON public.submission_feedback
  FOR SELECT TO authenticated
  USING (
    (SELECT get_my_role())::text = 'admin'
    AND public.submission_tenant(submission_id) = (SELECT get_my_tenant_id())
  );

-- Let op de betekenis, die blijft ongewijzigd: dit vraagt NIET dat je de klas
-- lesgeeft, wel dat je de feedback zelf geschreven hebt (of admin bent) én dat
-- de indiening in jouw tenant zit.
DROP POLICY IF EXISTS teacher_manage_feedback ON public.submission_feedback;
CREATE POLICY teacher_manage_feedback ON public.submission_feedback
  FOR ALL TO authenticated
  USING (
    (teacher_id = (SELECT auth.uid()) OR (SELECT get_my_role())::text = 'admin')
    AND public.submission_tenant(submission_id) = (SELECT get_my_tenant_id())
  )
  WITH CHECK (
    (teacher_id = (SELECT auth.uid()) OR (SELECT get_my_role())::text = 'admin')
    AND public.submission_tenant(submission_id) = (SELECT get_my_tenant_id())
  );

-- ---- submissions ----------------------------------------------------------
-- Dezelfde vorm, en de leerkracht bevraagt deze tabel rechtstreeks bij het
-- openen van een opdracht.

DROP POLICY IF EXISTS teacher_view_submissions ON public.submissions;
CREATE POLICY teacher_view_submissions ON public.submissions
  FOR SELECT TO authenticated
  USING (
    am_i_teacher_of_class(public.assignment_owner_class(assignment_id))
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND public.assignment_tenant(assignment_id) = (SELECT get_my_tenant_id())
    )
  );

DROP POLICY IF EXISTS teacher_update_submissions ON public.submissions;
CREATE POLICY teacher_update_submissions ON public.submissions
  FOR UPDATE TO authenticated
  USING (
    am_i_teacher_of_class(public.assignment_owner_class(assignment_id))
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND public.assignment_tenant(assignment_id) = (SELECT get_my_tenant_id())
    )
  )
  WITH CHECK (
    am_i_teacher_of_class(public.assignment_owner_class(assignment_id))
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND public.assignment_tenant(assignment_id) = (SELECT get_my_tenant_id())
    )
  );

-- Uit migratie 35, nu zonder de inline subquery op classes.
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
        AND public.assignment_tenant(assignment_id) = (SELECT get_my_tenant_id())
      )
    )
  );

-- De policies voor leerlingen blijven onaangeroerd: student_view_own_*,
-- student_insert_submission (nog steeds alleen vóór de deadline),
-- student_update_own_*, student_delete_own_*, super_admin_all_submissions.

COMMIT;

-- Nakijken: eerst de tijden, dan de rechten. "Geen fout" is niet "toegestaan" --
-- een lege SELECT en een UPDATE van 0 rijen zien er identiek uit als succes.
-- scripts/rls-smoke.ts dekt de rechten af.
