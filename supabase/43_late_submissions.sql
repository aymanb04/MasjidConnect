-- 43: huiswerk mag na de deadline nog ingediend worden, met de vermelding "te laat".
--
-- AANLEIDING (2026-10-21/22). Na de deadline kon een leerling niets meer
-- indienen: het formulier verdween en de database weigerde de rij
-- (student_insert_submission eiste due_date > now()). Op 2026-10-21 stonden zo
-- 83 van de 142 leerling-plaatsen bij in-app huiswerk van De Kroon op slot,
-- zonder dat de leerkracht het voor één leerling kon heropenen.
-- Beslissing Ayman 2026-10-22: "just a te laat mark is fine".
--
-- WAT DIT DOET
--   1. De insert-policy voor leerlingen laat de deadline-eis vallen. De rest blijft:
--      enkel voor jezelf, enkel voor een opdracht die je mag zien.
--   2. Nieuwe kolom submissions.is_late (standaard false).
--   3. Een trigger zet bij elke schrijfactie DOOR DE LEERLING ZELF:
--        submitted_at := now()            (de server beslist, niet de klok van de gsm)
--        is_late      := deadline voorbij
--      Rijen die een leerkracht of admin aanmaakt (quoteren zonder indiening,
--      migratie 35) worden niet aangeraakt en staan dus nooit op "te laat".
--
-- WAT DIT NIET DOET
--   - Papieren huiswerk (migratie 41) blijft zonder indiening en dus zonder "te laat".
--   - Bestaande rijen: allemaal is_late = false. Dat klopt, want tot nu toe kon er
--     niets na de deadline binnenkomen.
--
-- Idempotent. RUN IN: Supabase SQL editor. Terugdraaien: 43_rollback.sql.

BEGIN;

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS is_late boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.submissions_mark_late()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $fn$
DECLARE
  due timestamptz;
BEGIN
  -- Only the pupil's own write. Staff and the service role (auth.uid() NULL)
  -- keep whatever they send.
  IF auth.uid() IS NULL OR NEW.student_id IS DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;
  NEW.submitted_at := now();
  SELECT a.due_date INTO due FROM assignments a WHERE a.id = NEW.assignment_id;
  NEW.is_late := due IS NOT NULL AND now() > due;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS submissions_mark_late ON public.submissions;
CREATE TRIGGER submissions_mark_late
  BEFORE INSERT OR UPDATE ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.submissions_mark_late();

-- The live form is migration 7b's (TO authenticated, wrapped auth.uid(); schema.sql
-- still shows the older text). Same as 7b, minus the due_date condition.
DROP POLICY IF EXISTS "student_insert_submission" ON public.submissions;
CREATE POLICY "student_insert_submission" ON public.submissions
  FOR INSERT TO authenticated WITH CHECK (
    student_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM assignments
      WHERE assignments.id = submissions.assignment_id
    )
  );

COMMIT;

-- VERIFY (expect: is_late column, the trigger, and a policy WITHOUT due_date):
--   SELECT column_name, data_type, column_default FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'submissions' AND column_name = 'is_late';
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.submissions'::regclass AND NOT tgisinternal;
--   SELECT polname, pg_get_expr(polwithcheck, polrelid) FROM pg_policy
--    WHERE polrelid = 'public.submissions'::regclass AND polname = 'student_insert_submission';
