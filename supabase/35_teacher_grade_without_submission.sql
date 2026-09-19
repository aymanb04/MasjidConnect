-- 35: laat een leerkracht punten geven aan een leerling die niets indient.
--
-- AANLEIDING (2026-09-19). Een leerkracht Qur'an van De Kroon gaf per leerling
-- een eigen surah op en wilde die in de les overhoren en quoteren:
--
--   "Ik zou eigenlijk moeten kunnen zien per leerling wat het huiswerk was
--    zodat ik daar nu ook punten op kan geven."
--
-- Dat kon niet, om twee redenen. De tweede is deze:
--
--   submission_feedback hangt aan een submissions-rij, en submissions mocht
--   alleen de LEERLING zelf aanmaken (student_insert_submission, bovendien
--   alleen vóór de deadline). Bij het opzeggen van een surah laadt niemand iets
--   op, dus bestond er geen rij, dus was er niets om een punt aan te hangen.
--   De leerkracht zag "3 leerlingen hebben nog niet ingediend" en verder niets.
--
-- (De eerste reden was puur UI: de per-leerling taak werd wél opgehaald maar
-- nooit getoond. Dat is opgelost in de app, zonder migratie.)
--
-- WAT DIT DOET: een leerkracht van de klas -- en een admin van de tenant -- mag
-- een submissions-rij aanmaken namens een leerling, op voorwaarde dat die
-- leerling echt in de klas van die opdracht zit. Zo werkt "quoteren zonder
-- indiening" via dezelfde weg als gewone feedback, en komt het punt vanzelf in
-- de puntenlijst, het gewogen gemiddelde en het rapport terecht.
--
-- WAT DIT NIET DOET: de bestaande regels voor leerlingen blijven ongemoeid. Een
-- leerling kan nog steeds alleen voor zichzelf indienen, en nog steeds alleen
-- vóór de deadline. Een leerkracht kan niets aanmaken buiten zijn eigen klassen.

BEGIN;

-- Twee SECURITY DEFINER-helpers, geen EXISTS-joins in de policy zelf. Na
-- migratie 33 is dat geen stijlkwestie: een policy die een andere RLS-tabel
-- binnenkijkt laat de PLANNER de policies van die tabel mee uitklappen, en dat
-- is precies wat het ondertekenen van een bestands-URL 30 seconden liet duren.

CREATE OR REPLACE FUNCTION public.assignment_owner_class(p_assignment uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $fn$
  SELECT class_id FROM assignments WHERE id = p_assignment;
$fn$;
REVOKE ALL ON FUNCTION public.assignment_owner_class(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.assignment_owner_class(uuid) TO authenticated;

-- Let op: dit is NIET am_i_student_of_class(). Die vraagt "zit IK in die klas";
-- hier moeten we weten of een ANDERE leerling erin zit.
CREATE OR REPLACE FUNCTION public.class_has_student(p_class uuid, p_student uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM class_students
    WHERE class_id = p_class AND student_id = p_student
  );
$fn$;
REVOKE ALL ON FUNCTION public.class_has_student(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.class_has_student(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS staff_insert_submission_for_student ON public.submissions;
CREATE POLICY staff_insert_submission_for_student ON public.submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    -- de leerling moet in de klas van de opdracht zitten; anders kan een
    -- leerkracht een rij maken voor een kind dat hij niet lesgeeft
    public.class_has_student(
      public.assignment_owner_class(submissions.assignment_id),
      submissions.student_id)
    AND (
      (SELECT is_super_admin())
      OR am_i_teacher_of_class(public.assignment_owner_class(submissions.assignment_id))
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

-- Nakijken (verwacht: de policy bestaat, en de twee helpers ook):
--   SELECT polname FROM pg_policy WHERE polrelid = 'public.submissions'::regclass;
--   SELECT proname FROM pg_proc
--    WHERE proname IN ('assignment_owner_class','class_has_student');
--
-- Empirisch nakijken is belangrijker dan bovenstaande: "geen fout" is niet
-- hetzelfde als "toegestaan". Zie scripts/rls-smoke.ts.
