-- ============================================================
-- Migration 32 — fix the RLS recursion introduced by migration 31
-- ============================================================
-- Written 2026-09-13, minutes after 31 was applied. Applying 31 broke the
-- huiswerk page for every teacher and admin:
--
--   42P17: infinite recursion detected in policy for relation "assignments"
--
-- THE CYCLE. Migration 31 made `student_view_assignments` read
-- `assignment_students` to decide whether an assignment is targeted. Postgres
-- OR-evaluates every SELECT policy on a table regardless of who is asking, so a
-- teacher's plain `SELECT ... FROM assignments` also evaluates that student
-- policy → which selects from `assignment_students` → whose
-- `staff_manage_assignment_students` policy selects from `assignments` → and
-- round it goes.
--
-- This is the same trap recorded for `profiles.update_own_profile`: a policy on
-- A that reads B, where B's policy reads A. It is invisible in review and
-- instant in production — the browser check caught it within a minute of the
-- feature going up, which is exactly why the flow is driven in a browser and
-- not just typechecked.
--
-- THE FIX. Two SECURITY DEFINER helpers, the same device this schema already
-- uses for `get_my_tenant_id()` and `is_super_admin()`. They run as the owner,
-- so reading `assignment_students` inside them does not re-enter RLS and the
-- cycle cannot form.
--
-- Safe to run after 31. Idempotent.

BEGIN;

-- Does this assignment target specific pupils at all?
CREATE OR REPLACE FUNCTION public.assignment_is_targeted(a_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assignment_students WHERE assignment_id = a_id
  );
$$;

-- Is the current user one of the pupils it targets?
CREATE OR REPLACE FUNCTION public.assignment_targets_me(a_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assignment_students
    WHERE assignment_id = a_id AND student_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.assignment_is_targeted(uuid) FROM public;
REVOKE ALL ON FUNCTION public.assignment_targets_me(uuid)  FROM public;
GRANT EXECUTE ON FUNCTION public.assignment_is_targeted(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assignment_targets_me(uuid)  TO authenticated;

-- Same rule as 31, expressed without touching assignment_students directly.
DROP POLICY IF EXISTS "student_view_assignments" ON public.assignments;
CREATE POLICY "student_view_assignments" ON public.assignments
  FOR SELECT TO authenticated
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM class_students
      WHERE class_students.class_id = assignments.class_id
        AND class_students.student_id = (SELECT auth.uid())
    )
    AND (
      NOT public.assignment_is_targeted(assignments.id)
      OR public.assignment_targets_me(assignments.id)
    )
  );

COMMIT;

-- ---- Verification -------------------------------------------------------
-- As a teacher:  SELECT count(*) FROM assignments;   -- must not error
-- As a targeted pupil:    the assignment appears
-- As an untargeted pupil: it does not
