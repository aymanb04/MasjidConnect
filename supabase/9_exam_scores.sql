-- Migration 9: exam_scores table
-- Paper exams — teachers enter score + max_score per student per semester.
-- No assignment/submission flow; fully separate from homework.

CREATE TABLE IF NOT EXISTS exam_scores (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id     uuid REFERENCES classes(id)   ON DELETE CASCADE NOT NULL,
  student_id   uuid REFERENCES profiles(id)  ON DELETE CASCADE NOT NULL,
  semester     smallint NOT NULL CHECK (semester IN (1, 2)),
  score        numeric  NOT NULL CHECK (score >= 0),
  max_score    numeric  NOT NULL DEFAULT 20   CHECK (max_score > 0),
  notes        text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (class_id, student_id, semester)
);

ALTER TABLE exam_scores ENABLE ROW LEVEL SECURITY;

-- Students can read their own scores
CREATE POLICY student_read_own_exam_scores ON exam_scores
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));

-- Teachers can manage scores for classes they teach
CREATE POLICY teacher_manage_exam_scores ON exam_scores
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM class_teachers ct
      WHERE ct.class_id  = exam_scores.class_id
        AND ct.teacher_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM class_teachers ct
      WHERE ct.class_id  = exam_scores.class_id
        AND ct.teacher_id = (SELECT auth.uid())
    )
  );

-- Admins / super_admin can manage all scores within their tenant
CREATE POLICY admin_manage_exam_scores ON exam_scores
  FOR ALL TO authenticated
  USING (
    (SELECT get_my_role()) IN ('admin', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = exam_scores.class_id
        AND c.tenant_id = (SELECT get_my_tenant_id())
    )
  )
  WITH CHECK (
    (SELECT get_my_role()) IN ('admin', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = exam_scores.class_id
        AND c.tenant_id = (SELECT get_my_tenant_id())
    )
  );
