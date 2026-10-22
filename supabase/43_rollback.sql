-- Rollback of 43_late_submissions.sql: deadline enforced again, no "te laat".
-- Late submissions made in the meantime stay in the table (with is_late lost);
-- list them BEFORE running this if they matter:
--   SELECT id, assignment_id, student_id, submitted_at FROM submissions WHERE is_late;
-- RUN IN: Supabase SQL editor.

BEGIN;

DROP TRIGGER IF EXISTS submissions_mark_late ON public.submissions;
DROP FUNCTION IF EXISTS public.submissions_mark_late();

DROP POLICY IF EXISTS "student_insert_submission" ON public.submissions;
CREATE POLICY "student_insert_submission" ON public.submissions
  FOR INSERT TO authenticated WITH CHECK (
    student_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM assignments
      WHERE assignments.id = submissions.assignment_id
        AND (assignments.due_date IS NULL OR assignments.due_date > now())
    )
  );

ALTER TABLE public.submissions DROP COLUMN IF EXISTS is_late;

COMMIT;
