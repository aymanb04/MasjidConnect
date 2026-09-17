-- 34: weighted grading per class.
--
-- De Kroon asked (2026-09-17) whether their Koran weighting fits in the app:
--   huiswerk 25% · progressie 40% · examen 30% · tajweed 5%
--
-- It did not. The rapport auto-filled each subject with one pooled average,
-- Sum(earned)/Sum(max) over homework + tests together, with exams excluded
-- entirely. No weighting existed anywhere in the schema, and two of their four
-- components (progressie, tajweed) are teacher judgements with nowhere to live.
--
-- DESIGN. A class gets a list of categories. Each carries a weight and says
-- where its mark comes from:
--
--   huiswerk   automatic -- all graded homework in the class
--   toetsen    automatic -- all toetsen in the class
--   examen     automatic -- the exam score for the semester
--   handmatig  the teacher types one mark per pupil (progressie, tajweed,
--              gedrag, inzet -- whatever the school grades by judgement)
--
-- Any number of categories, any names, any weights, per class. That covers De
-- Kroon exactly and does not assume the next school grades Qur'an at all.
--
-- TWO DELIBERATE CHOICES
--
-- 1. A class with NO categories keeps today's behaviour exactly. De Kroon is
--    live with 112 pupils mid-year; nothing may change under them until they
--    choose it, school by school and class by class.
--
-- 2. Categories with no marks yet are skipped and the remaining weights are
--    renormalised. Progressie is given at the end of the year -- a pupil must
--    not read 40% short in December because their teacher has not judged it
--    yet. See lib/grading.ts.

BEGIN;

CREATE TABLE IF NOT EXISTS public.grade_categories (
  id         uuid NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id  uuid NOT NULL,
  class_id   uuid NOT NULL,
  name       text NOT NULL,
  -- Where the mark comes from. 'handmatig' means category_scores below.
  source     text NOT NULL DEFAULT 'handmatig'
               CHECK (source IN ('huiswerk', 'toetsen', 'examen', 'handmatig')),
  -- A percentage. Not constrained to sum to 100 in the database: a half-built
  -- configuration must be saveable. The UI is what insists on 100.
  weight     numeric NOT NULL CHECK (weight >= 0 AND weight <= 100),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grade_categories_pkey PRIMARY KEY (id),
  CONSTRAINT grade_categories_class_name_key UNIQUE (class_id, name),
  CONSTRAINT grade_categories_tenant_fkey FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT grade_categories_class_fkey FOREIGN KEY (class_id)
    REFERENCES public.classes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_grade_categories_class ON public.grade_categories(class_id);

-- One mark per pupil per handmatig category. Same shape as every other score
-- in this app (score + max_score) so the school keeps thinking in /10 or /20
-- rather than in percentages.
CREATE TABLE IF NOT EXISTS public.category_scores (
  id          uuid NOT NULL DEFAULT uuid_generate_v4(),
  category_id uuid NOT NULL,
  student_id  uuid NOT NULL,
  score       numeric NOT NULL CHECK (score >= 0),
  max_score   numeric NOT NULL DEFAULT 10 CHECK (max_score > 0),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT category_scores_pkey PRIMARY KEY (id),
  CONSTRAINT category_scores_category_student_key UNIQUE (category_id, student_id),
  CONSTRAINT category_scores_within_max CHECK (score <= max_score),
  CONSTRAINT category_scores_category_fkey FOREIGN KEY (category_id)
    REFERENCES public.grade_categories(id) ON DELETE CASCADE,
  CONSTRAINT category_scores_student_fkey FOREIGN KEY (student_id)
    REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_category_scores_student ON public.category_scores(student_id);

ALTER TABLE public.grade_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_scores  ENABLE ROW LEVEL SECURITY;

-- ---- RLS ------------------------------------------------------------------
-- Mirrors class_tests / exam_scores: a teacher manages their own classes, an
-- admin their tenant, a pupil reads their own marks and nobody else's.
--
-- Uses the existing SECURITY DEFINER helpers rather than EXISTS joins. After
-- migration 33 that is not a style preference: a policy that reaches into
-- another RLS-protected table makes the PLANNER expand that table's policies
-- too, which is what made signing a storage URL take 30 seconds.

DROP POLICY IF EXISTS grade_categories_read ON public.grade_categories;
CREATE POLICY grade_categories_read ON public.grade_categories
  FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin())
    OR (
      tenant_id = (SELECT get_my_tenant_id())
      AND (
        (SELECT get_my_role())::text = ANY (ARRAY['admin', 'leerlingenbegeleiding'])
        OR am_i_teacher_of_class(class_id)
        OR am_i_student_of_class(class_id)
      )
    )
  );

DROP POLICY IF EXISTS grade_categories_write ON public.grade_categories;
CREATE POLICY grade_categories_write ON public.grade_categories
  FOR ALL TO authenticated
  USING (
    (SELECT is_super_admin())
    OR (tenant_id = (SELECT get_my_tenant_id())
        AND ((SELECT get_my_role())::text = 'admin' OR am_i_teacher_of_class(class_id)))
  )
  WITH CHECK (
    (SELECT is_super_admin())
    OR (tenant_id = (SELECT get_my_tenant_id())
        AND ((SELECT get_my_role())::text = 'admin' OR am_i_teacher_of_class(class_id)))
  );

-- category_scores has no class_id of its own; category_owner_class() keeps the
-- lookup behind a SECURITY DEFINER boundary so the policy stays cheap to plan.
CREATE OR REPLACE FUNCTION public.category_owner_class(p_category uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $fn$
  SELECT class_id FROM grade_categories WHERE id = p_category;
$fn$;
REVOKE ALL ON FUNCTION public.category_owner_class(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.category_owner_class(uuid) TO authenticated;

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

COMMIT;

-- Verify:
--   SELECT polname FROM pg_policy WHERE polrelid = 'public.grade_categories'::regclass;
--   SELECT polname FROM pg_policy WHERE polrelid = 'public.category_scores'::regclass;
--   -- no class configured yet, so nothing changes for anyone:
--   SELECT count(*) FROM public.grade_categories;   -- expect 0
