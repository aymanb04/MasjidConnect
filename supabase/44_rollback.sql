-- Rollback of 44_feedback_staff_only.sql: restore the direct insert policy
-- exactly as 8b_features_policies_fix.sql created it.

DROP POLICY IF EXISTS "users_insert_feedback" ON public.feedback;

CREATE POLICY "users_insert_feedback" ON public.feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
