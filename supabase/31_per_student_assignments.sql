-- ============================================================
-- Migration 31 — huiswerk per leerling (optioneel)
-- ============================================================
-- Written 2026-09-13. The Qur'an teacher needs to set different homework per
-- pupil: each child memorises a different range, so nobody in the class shares
-- an assignment.
--
-- Built as a general option rather than a Qur'an feature. One optional table
-- covers both things a teacher might want:
--
--   · TARGETING      — same task, a subset of the class (remedial work, extension)
--   · PER-PUPIL TASK — a different task for each pupil (Qur'an memorisation)
--
-- Semantics, deliberately chosen so nothing existing changes:
--   · NO rows for an assignment  → the whole class gets it, exactly as today.
--   · rows present               → ONLY those pupils get it, each with their own
--                                  optional task_text on top of the shared title
--                                  and description.
--
-- NOT the same as the "Hifz- en Koranopvolging" promised on the landing page.
-- That is progress tracking over time (which surahs memorised, revision cycles);
-- this is "what is your task this week". A step towards it, not the thing.

BEGIN;

CREATE TABLE IF NOT EXISTS public.assignment_students (
  id            uuid NOT NULL DEFAULT uuid_generate_v4(),
  assignment_id uuid NOT NULL,
  student_id    uuid NOT NULL,
  -- The pupil's own task, e.g. "soera 78, vers 1-20". Optional: with targeting
  -- alone the shared description is the task.
  task_text     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignment_students_pkey PRIMARY KEY (id),
  CONSTRAINT assignment_students_unique UNIQUE (assignment_id, student_id),
  CONSTRAINT assignment_students_assignment_fkey FOREIGN KEY (assignment_id)
    REFERENCES public.assignments(id) ON DELETE CASCADE,
  CONSTRAINT assignment_students_student_fkey FOREIGN KEY (student_id)
    REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_assignment_students_assignment
  ON public.assignment_students(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_students_student
  ON public.assignment_students(student_id);

DROP TRIGGER IF EXISTS assignment_students_updated_at ON public.assignment_students;
CREATE TRIGGER assignment_students_updated_at
  BEFORE UPDATE ON public.assignment_students
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.assignment_students ENABLE ROW LEVEL SECURITY;

-- ---- RLS: assignment_students -------------------------------------------
-- A pupil sees ONLY their own row. Without that, per-pupil homework would leak
-- every classmate's task — and in a Qur'an class that is a public ranking of who
-- is furthest along, which is exactly the kind of comparison a school does not
-- want to publish.

DROP POLICY IF EXISTS student_view_own_assignment_row ON public.assignment_students;
CREATE POLICY student_view_own_assignment_row ON public.assignment_students
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS staff_manage_assignment_students ON public.assignment_students;
CREATE POLICY staff_manage_assignment_students ON public.assignment_students
  FOR ALL TO authenticated
  USING (
    (SELECT is_super_admin())
    OR EXISTS (
      SELECT 1 FROM assignments a
      JOIN classes c ON c.id = a.class_id
      WHERE a.id = assignment_students.assignment_id
        AND c.tenant_id = (SELECT get_my_tenant_id())
        AND (
          (SELECT get_my_role())::text = 'admin'
          OR EXISTS (
            SELECT 1 FROM class_teachers ct
            WHERE ct.class_id = c.id AND ct.teacher_id = (SELECT auth.uid())
          )
        )
    )
  )
  WITH CHECK (
    (SELECT is_super_admin())
    OR EXISTS (
      SELECT 1 FROM assignments a
      JOIN classes c ON c.id = a.class_id
      WHERE a.id = assignment_students.assignment_id
        AND c.tenant_id = (SELECT get_my_tenant_id())
        AND (
          (SELECT get_my_role())::text = 'admin'
          OR EXISTS (
            SELECT 1 FROM class_teachers ct
            WHERE ct.class_id = c.id AND ct.teacher_id = (SELECT auth.uid())
          )
        )
    )
  );

-- ---- RLS: assignments, now aware of targeting ---------------------------
-- THE SECURITY POINT OF THIS MIGRATION. Previously a pupil saw every published
-- assignment of their class. With targeting that would show them assignments
-- meant for somebody else. A pupil now sees an assignment only when it is
-- untargeted (whole class) or targeted at them.

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
      NOT EXISTS (
        SELECT 1 FROM assignment_students ast
        WHERE ast.assignment_id = assignments.id
      )
      OR EXISTS (
        SELECT 1 FROM assignment_students ast
        WHERE ast.assignment_id = assignments.id
          AND ast.student_id = (SELECT auth.uid())
      )
    )
  );

COMMIT;

-- ---- Verification -------------------------------------------------------
-- A pupil not targeted must not see the assignment at all:
--   SELECT count(*) FROM assignments;            -- as that pupil
-- A pupil must see only their own row:
--   SELECT count(*) FROM assignment_students;    -- as that pupil, expect <= 1 per assignment
-- SELECT polname FROM pg_policy WHERE polrelid = 'public.assignment_students'::regclass;
