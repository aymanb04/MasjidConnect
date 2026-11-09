-- 45 rollback: restores the policies exactly as migrations 34, 39 and 43 left
-- them, and removes the two triggers and three functions migration 45 added.
--
-- WARNING: this REOPENS the three holes migration 45 closes (H1 cross-tenant
-- category_scores, H2 re-aimable notes, H3 pupils deleting graded work).
-- Use it only if 45 breaks a real flow, and re-apply a fixed 45 the same day.
--
-- Idempotent. RUN IN: Supabase SQL editor.

BEGIN;

-- H3: triggers + insert policy back to migration 43
DROP TRIGGER IF EXISTS submissions_pupil_guard ON public.submissions;
DROP FUNCTION IF EXISTS public.submissions_pupil_guard();

DROP POLICY IF EXISTS "student_insert_submission" ON public.submissions;
CREATE POLICY "student_insert_submission" ON public.submissions
  FOR INSERT TO authenticated WITH CHECK (
    student_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM assignments
      WHERE assignments.id = submissions.assignment_id
    )
  );

-- H2: back to migration 39
DROP TRIGGER IF EXISTS student_notes_pin ON public.student_notes;
DROP FUNCTION IF EXISTS public.student_notes_pin();

DROP POLICY IF EXISTS student_read_own_visible_notes ON public.student_notes;
CREATE POLICY student_read_own_visible_notes ON public.student_notes
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    AND visible_to_student
  );

-- H1: back to migration 34 (policies first, then the helper they used)
DROP POLICY IF EXISTS category_scores_read ON public.category_scores;
CREATE POLICY category_scores_read ON public.category_scores
  FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin())
    OR student_id = (SELECT auth.uid())
    OR (SELECT get_my_role())::text = ANY (ARRAY['admin', 'leerlingenbegeleiding'])
    OR am_i_teacher_of_class(public.category_owner_class(category_id))
  );

DROP POLICY IF EXISTS category_scores_write ON public.category_scores;
CREATE POLICY category_scores_write ON public.category_scores
  FOR ALL TO authenticated
  USING (
    (SELECT is_super_admin())
    OR (SELECT get_my_role())::text = 'admin'
    OR am_i_teacher_of_class(public.category_owner_class(category_id))
  )
  WITH CHECK (
    (SELECT is_super_admin())
    OR (SELECT get_my_role())::text = 'admin'
    OR am_i_teacher_of_class(public.category_owner_class(category_id))
  );

DROP FUNCTION IF EXISTS public.category_owner_tenant(uuid);

COMMIT;

-- VERIFY: SELECT tgname FROM pg_trigger
--          WHERE tgname IN ('student_notes_pin','submissions_pupil_guard');  -- expect 0 rows
