-- ============================================================
-- Migration 16 — Manual score columns: class tests / offline homework
-- Source: mosque feedback 2026-06-09 (FEEDBACK_BUILD_PLAN §E)
-- ============================================================
--
-- One mechanism covers both feedback items:
--   * "manual input in puntenlijst for a test in class"
--   * "no upload but still a score for non-online homework"
-- A class_test is a manually-scored column in the gradebook (title + max
-- score + date); test_scores holds one score per student per test.
--
-- score <= max_score is enforced client-side (cross-table CHECK is not
-- possible); score >= 0 is enforced here, mirroring submission_feedback.
--
-- Idempotent. RUN IN: Supabase SQL editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.class_tests (
  id         uuid NOT NULL DEFAULT uuid_generate_v4(),
  class_id   uuid NOT NULL,
  title      character varying NOT NULL,
  max_score  numeric NOT NULL CHECK (max_score > 0),
  test_date  date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT class_tests_pkey PRIMARY KEY (id),
  CONSTRAINT class_tests_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE,
  CONSTRAINT class_tests_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.test_scores (
  id         uuid NOT NULL DEFAULT uuid_generate_v4(),
  test_id    uuid NOT NULL,
  student_id uuid NOT NULL,
  score      numeric NOT NULL CHECK (score >= 0),
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT test_scores_pkey PRIMARY KEY (id),
  CONSTRAINT test_scores_test_student_key UNIQUE (test_id, student_id),
  CONSTRAINT test_scores_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.class_tests(id) ON DELETE CASCADE,
  CONSTRAINT test_scores_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_class_tests_class  ON public.class_tests(class_id);
CREATE INDEX IF NOT EXISTS idx_test_scores_student ON public.test_scores(student_id);

ALTER TABLE public.class_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_scores ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS test_scores_updated_at ON public.test_scores;
CREATE TRIGGER test_scores_updated_at
  BEFORE UPDATE ON public.test_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---- RLS: class_tests (mirrors exam_scores) ----------------

DROP POLICY IF EXISTS member_read_class_tests ON public.class_tests;
CREATE POLICY member_read_class_tests ON public.class_tests
  FOR SELECT TO authenticated
  USING (am_i_student_of_class(class_id) OR am_i_teacher_of_class(class_id));

DROP POLICY IF EXISTS teacher_manage_class_tests ON public.class_tests;
CREATE POLICY teacher_manage_class_tests ON public.class_tests
  FOR ALL TO authenticated
  USING (am_i_teacher_of_class(class_id))
  WITH CHECK (am_i_teacher_of_class(class_id));

DROP POLICY IF EXISTS admin_manage_class_tests ON public.class_tests;
CREATE POLICY admin_manage_class_tests ON public.class_tests
  FOR ALL TO authenticated
  USING (
    (SELECT get_my_role()) IN ('admin', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = class_tests.class_id
        AND ((SELECT is_super_admin()) OR c.tenant_id = (SELECT get_my_tenant_id()))
    )
  )
  WITH CHECK (
    (SELECT get_my_role()) IN ('admin', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = class_tests.class_id
        AND ((SELECT is_super_admin()) OR c.tenant_id = (SELECT get_my_tenant_id()))
    )
  );

-- ---- RLS: test_scores --------------------------------------

DROP POLICY IF EXISTS student_read_own_test_scores ON public.test_scores;
CREATE POLICY student_read_own_test_scores ON public.test_scores
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS teacher_manage_test_scores ON public.test_scores;
CREATE POLICY teacher_manage_test_scores ON public.test_scores
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM class_tests t
      WHERE t.id = test_scores.test_id
        AND am_i_teacher_of_class(t.class_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM class_tests t
      WHERE t.id = test_scores.test_id
        AND am_i_teacher_of_class(t.class_id)
    )
  );

DROP POLICY IF EXISTS admin_manage_test_scores ON public.test_scores;
CREATE POLICY admin_manage_test_scores ON public.test_scores
  FOR ALL TO authenticated
  USING (
    (SELECT get_my_role()) IN ('admin', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM class_tests t
      JOIN classes c ON c.id = t.class_id
      WHERE t.id = test_scores.test_id
        AND ((SELECT is_super_admin()) OR c.tenant_id = (SELECT get_my_tenant_id()))
    )
  )
  WITH CHECK (
    (SELECT get_my_role()) IN ('admin', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM class_tests t
      JOIN classes c ON c.id = t.class_id
      WHERE t.id = test_scores.test_id
        AND ((SELECT is_super_admin()) OR c.tenant_id = (SELECT get_my_tenant_id()))
    )
  );

-- ============================================================
-- VERIFICATION
-- ============================================================
-- select tablename, policyname, cmd from pg_policies
--   where tablename in ('class_tests','test_scores');
