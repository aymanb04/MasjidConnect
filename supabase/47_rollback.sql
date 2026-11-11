-- Undo 47_grade_audit_log.sql. Keeps the rows already logged and the
-- subject_id column (dropping them would destroy evidence); stops logging and
-- gives the API roles back their original table grants.

BEGIN;

DO $undo$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['submission_feedback', 'category_scores', 'exam_scores',
                           'test_scores', 'attendance_records', 'submissions'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_grade_change ON public.%I', t);
    END IF;
  END LOOP;
END
$undo$;
DROP FUNCTION IF EXISTS public.audit_grade_change();

GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_logs TO anon, authenticated;

COMMIT;
