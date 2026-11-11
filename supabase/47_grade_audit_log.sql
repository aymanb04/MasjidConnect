-- 47: an append-only log of grade and attendance changes.
--
-- Why: red-team H3 (2026-11-01) showed a pupil could erase their own graded
-- work, and nothing would have shown it ever happened. Migration 45 closed that
-- hole; this makes the next one visible. "Who changed this score, and from
-- what?" now has an answer.
--
-- What is logged: an UPDATE that actually changes a score/status, and every
-- DELETE, on
--     submission_feedback  category_scores  exam_scores
--     test_scores          attendance_records  submissions
-- First entry (INSERT) is not logged: entering a grade is not tampering, and
-- it would multiply the volume. An upsert that CHANGES a score is an UPDATE.
--
-- Data minimisation: numbers and statuses only. Free text (comments, notes) is
-- recorded as "changed: true", never copied -- the log must not become a second
-- copy of what erasure scrubs.
--
-- Who is logged: signed-in users (the browser). Service-role writes -- GDPR
-- erasure, operator repairs, /api routes -- are not: erasure must not re-copy
-- what it removes, and operator writes have their own dry run + undo file.
--
-- GDPR: subject_id = the pupil the row is about. lib/personal-data-map.ts lists
-- audit_logs under OWNED_TABLES on subject_id, so erasure deletes a pupil's
-- audit rows and an export includes them. Retention: "logs 12 months"
-- (published 2026-09-02). DPA: new table with personal data -> Bijlage 1.
--
-- Append-only: anon/authenticated lose INSERT/UPDATE/DELETE/TRUNCATE; only the
-- trigger (SECURITY DEFINER, owner postgres) writes. super_admin reads (the
-- existing policy); the service role can still delete for retention/erasure.
--
-- Needs 46 (the tenant_of_* lookups). Idempotent. RUN IN: Supabase SQL editor.
-- Undo: 47_rollback.sql.

BEGIN;

-- ── 1. Table: who the row is about; no FK that would block erasure ──────────
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS subject_id uuid;
-- user_id -> profiles had no ON DELETE: erasing a teacher who appears in the
-- log would fail. Keep the uuid, drop the constraint.
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_tenant_id_fkey;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id)
  REFERENCES public.tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_audit_logs_subject ON public.audit_logs(subject_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity  ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM anon, authenticated;

-- ── 2. The trigger ───────────────────────────────────────────────────────────
-- TG_ARGV[0] = the columns to compare and record (numbers/statuses).
-- TG_ARGV[1] = free-text columns: only "changed: true/false" is recorded.
CREATE OR REPLACE FUNCTION public.audit_grade_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $fn$
DECLARE
  v_cols  text[] := string_to_array(TG_ARGV[0], ',');
  v_text  text[] := CASE WHEN TG_NARGS > 1 AND TG_ARGV[1] <> '' THEN string_to_array(TG_ARGV[1], ',') ELSE '{}' END;
  o jsonb := to_jsonb(OLD);
  n jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END;
  v_old jsonb := '{}'; v_new jsonb := '{}'; v_changed jsonb := '{}';
  v_subject uuid; v_tenant uuid; c text;
BEGIN
  IF auth.uid() IS NULL THEN            -- service role: erasure, operators, /api
    RETURN NULL;
  END IF;

  FOREACH c IN ARRAY v_cols LOOP
    IF TG_OP = 'DELETE' OR (o -> c) IS DISTINCT FROM (n -> c) THEN
      v_old := v_old || jsonb_build_object(c, o -> c);
      IF TG_OP = 'UPDATE' THEN v_new := v_new || jsonb_build_object(c, n -> c); END IF;
    END IF;
  END LOOP;
  FOREACH c IN ARRAY v_text LOOP
    IF TG_OP = 'UPDATE' AND (o -> c) IS DISTINCT FROM (n -> c) THEN
      v_changed := v_changed || jsonb_build_object(c, true);
    END IF;
  END LOOP;

  IF TG_OP = 'UPDATE' AND v_new = '{}' AND v_changed = '{}' THEN
    RETURN NULL;                         -- saved again, nothing changed
  END IF;

  -- Whose grade, and which school.
  CASE TG_TABLE_NAME
    WHEN 'submission_feedback' THEN
      SELECT s.student_id INTO v_subject FROM submissions s WHERE s.id = OLD.submission_id;
      v_tenant := tenant_of_submission(OLD.submission_id);
    WHEN 'submissions' THEN
      v_subject := OLD.student_id; v_tenant := tenant_of_assignment(OLD.assignment_id);
    WHEN 'attendance_records' THEN
      v_subject := OLD.student_id; v_tenant := tenant_of_attendance_session(OLD.session_id);
    WHEN 'test_scores' THEN
      v_subject := OLD.student_id; v_tenant := tenant_of_class_test(OLD.test_id);
    WHEN 'category_scores' THEN
      v_subject := OLD.student_id; v_tenant := category_owner_tenant(OLD.category_id);
    WHEN 'exam_scores' THEN
      v_subject := OLD.student_id; v_tenant := tenant_of_class(OLD.class_id);
  END CASE;
  -- A cascade from a parent delete can arrive after the parent is gone.
  v_tenant := coalesce(v_tenant, tenant_of_profile(v_subject));

  INSERT INTO audit_logs (tenant_id, user_id, subject_id, action, entity_type, entity_id, metadata)
  VALUES (v_tenant, auth.uid(), v_subject, lower(TG_OP), TG_TABLE_NAME, OLD.id,
          jsonb_strip_nulls(jsonb_build_object(
            'old', v_old,
            'new', CASE WHEN TG_OP = 'UPDATE' THEN v_new END,
            'text_changed', CASE WHEN v_changed <> '{}' THEN v_changed END,
            'role', get_my_role())));
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.audit_grade_change() FROM public, anon, authenticated;

DO $trg$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('submission_feedback', 'score',                            'comment'),
    ('category_scores',     'score,max_score',                  'note'),
    ('exam_scores',         'score,max_score,semester',         'notes'),
    ('test_scores',         'score',                            ''),
    ('attendance_records',  'status',                           'note'),
    ('submissions',         'status,assignment_id,student_id',  'text_content')
  ) AS t(tbl, cols, txt)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_grade_change ON public.%I', r.tbl);
    EXECUTE format(
      'CREATE TRIGGER audit_grade_change AFTER UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.audit_grade_change(%L, %L)',
      r.tbl, r.cols, r.txt);
  END LOOP;
END
$trg$;

COMMIT;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- 1. Six triggers:
--   SELECT event_object_table FROM information_schema.triggers
--    WHERE trigger_name = 'audit_grade_change' GROUP BY 1;
-- 2. The API roles cannot write the log (expect only SELECT, or nothing):
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name = 'audit_logs' AND grantee IN ('anon', 'authenticated');
-- 3. In the app (demo school): change one score as the demo teacher, then
--   SELECT action, entity_type, metadata, created_at FROM audit_logs
--    ORDER BY created_at DESC LIMIT 5;
