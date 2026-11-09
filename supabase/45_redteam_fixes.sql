-- 45: three RLS holes found in the red-team review of 2026-11-01.
--
-- H1  category_scores (migration 34): the admin and counsellor branches had no
--     tenant predicate. category_scores has no tenant_id of its own, so an admin
--     or counsellor of ANY school could read every school's weighted-grading
--     scores, and an admin could insert, change or delete them.
--     Fix: reach the tenant through the category, behind a SECURITY DEFINER
--     helper (the same pattern as category_owner_class, so the policy stays
--     cheap to plan -- see migration 36). WITH CHECK also requires the pupil to
--     be in the category's class, as staff_insert_submission_for_student does.
--
-- H2  student_notes (migration 39): the UPDATE policy's WITH CHECK let the
--     author move a note to any student_id and tenant_id. The pupil read policy
--     had no tenant check, so a re-aimed note appeared on that child's
--     dashboard as a note from the school.
--     Fix: a trigger makes student_id, tenant_id and author_id immutable for
--     every signed-in user (the service role keeps its hands free for erasure
--     and operator repairs), and the pupil read policy also checks the tenant.
--
-- H3  submissions (policies from 7b): a pupil could DELETE their own submission
--     (and with it, by cascade, the teacher's score and comment), move it to
--     another assignment, edit it after grading, or mark it 'graded' themself.
--     Fix: a trigger that constrains only the pupil acting on their own row.
--     Teachers, admins and the service role pass through untouched, so
--     migration 35 (grading without a submission), the assignment delete route
--     and GDPR erasure all keep working. A pupil may also no longer INSERT a
--     row with a status other than draft/submitted.
--
-- What a pupil can still do, on purpose: hand in, and hand in again (upsert)
-- until the work is graded. "Graded" means status graded/returned OR a
-- feedback row exists -- a score without the status flip still counts.
-- This matches the UI: SubmitAssignmentForm hides the form once graded.
--
-- Idempotent. RUN IN: Supabase SQL editor, as one transaction.
-- Undo: 45_rollback.sql.  Verify: the queries at the bottom, then
--   npx tsx scripts/rls-smoke.ts   (section "migration 45" must be all PASS).

BEGIN;

-- ── H1 ── category_scores ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.category_owner_tenant(p_category uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $fn$
  SELECT tenant_id FROM grade_categories WHERE id = p_category;
$fn$;
REVOKE ALL ON FUNCTION public.category_owner_tenant(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.category_owner_tenant(uuid) TO authenticated;

DROP POLICY IF EXISTS category_scores_read ON public.category_scores;
CREATE POLICY category_scores_read ON public.category_scores
  FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin())
    OR student_id = (SELECT auth.uid())
    OR (
      public.category_owner_tenant(category_id) = (SELECT get_my_tenant_id())
      AND (SELECT get_my_role())::text = ANY (ARRAY['admin', 'leerlingenbegeleiding'])
    )
    OR am_i_teacher_of_class(public.category_owner_class(category_id))
  );

DROP POLICY IF EXISTS category_scores_write ON public.category_scores;
CREATE POLICY category_scores_write ON public.category_scores
  FOR ALL TO authenticated
  USING (
    (SELECT is_super_admin())
    OR (
      public.category_owner_tenant(category_id) = (SELECT get_my_tenant_id())
      AND (SELECT get_my_role())::text = 'admin'
    )
    OR am_i_teacher_of_class(public.category_owner_class(category_id))
  )
  WITH CHECK (
    public.class_has_student(public.category_owner_class(category_id), student_id)
    AND (
      (SELECT is_super_admin())
      OR (
        public.category_owner_tenant(category_id) = (SELECT get_my_tenant_id())
        AND (SELECT get_my_role())::text = 'admin'
      )
      OR am_i_teacher_of_class(public.category_owner_class(category_id))
    )
  );

-- ── H2 ── student_notes ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.student_notes_pin()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public AS $fn$
BEGIN
  -- Service role (auth.uid() NULL): operator repairs and erasure stay possible.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.author_id IS DISTINCT FROM OLD.author_id THEN
    RAISE EXCEPTION 'Leerling, school en auteur van een nota kunnen niet gewijzigd worden'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS student_notes_pin ON public.student_notes;
CREATE TRIGGER student_notes_pin
  BEFORE UPDATE ON public.student_notes
  FOR EACH ROW EXECUTE FUNCTION public.student_notes_pin();

DROP POLICY IF EXISTS student_read_own_visible_notes ON public.student_notes;
CREATE POLICY student_read_own_visible_notes ON public.student_notes
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    AND visible_to_student
    AND tenant_id = (SELECT get_my_tenant_id())
  );

-- ── H3 ── submissions ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submissions_pupil_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $fn$
DECLARE
  graded boolean;
BEGIN
  -- Only the pupil acting on their own row is constrained. Staff (migration 35
  -- creates rows in the pupil's name) and the service role pass through.
  IF auth.uid() IS NULL OR OLD.student_id IS DISTINCT FROM auth.uid() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- SECURITY DEFINER so this sees the feedback row regardless of the pupil's RLS.
  graded := OLD.status IN ('graded', 'returned')
            OR EXISTS (SELECT 1 FROM submission_feedback f WHERE f.submission_id = OLD.id);

  IF TG_OP = 'DELETE' THEN
    IF graded THEN
      RAISE EXCEPTION 'Een beoordeelde indiening kan niet verwijderd worden'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.assignment_id IS DISTINCT FROM OLD.assignment_id THEN
    RAISE EXCEPTION 'Een indiening kan niet naar een andere opdracht verplaatst worden'
      USING ERRCODE = '42501';
  END IF;
  IF graded THEN
    RAISE EXCEPTION 'Een beoordeelde indiening kan niet meer gewijzigd worden'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS NULL OR NEW.status NOT IN ('draft', 'submitted') THEN
    RAISE EXCEPTION 'Ongeldige status voor een indiening'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS submissions_pupil_guard ON public.submissions;
CREATE TRIGGER submissions_pupil_guard
  BEFORE UPDATE OR DELETE ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.submissions_pupil_guard();

-- Migration 43's insert policy, plus: a pupil can only create draft/submitted.
DROP POLICY IF EXISTS "student_insert_submission" ON public.submissions;
CREATE POLICY "student_insert_submission" ON public.submissions
  FOR INSERT TO authenticated WITH CHECK (
    student_id = (SELECT auth.uid())
    AND status IN ('draft', 'submitted')
    AND EXISTS (
      SELECT 1 FROM assignments
      WHERE assignments.id = submissions.assignment_id
    )
  );

COMMIT;

-- VERIFY
--   -- H1: both policies mention category_owner_tenant
--   SELECT polname, pg_get_expr(polqual, polrelid) LIKE '%category_owner_tenant%' AS scoped
--     FROM pg_policy WHERE polrelid = 'public.category_scores'::regclass;   -- expect 2 rows, true
--   -- H2 + H3: the triggers exist
--   SELECT tgname FROM pg_trigger
--    WHERE tgname IN ('student_notes_pin', 'submissions_pupil_guard');      -- expect 2 rows
--   -- H3: insert policy has the status check
--   SELECT pg_get_expr(polwithcheck, polrelid) FROM pg_policy
--    WHERE polname = 'student_insert_submission';                          -- mentions status
--   -- Planning cost (migration 36 lesson): run as a teacher on the scores page,
--   -- or EXPLAIN ANALYZE SELECT * FROM category_scores LIMIT 50; should stay in ms.
--
-- Then: npx tsx scripts/rls-smoke.ts  -- "migration 45" section all PASS.
