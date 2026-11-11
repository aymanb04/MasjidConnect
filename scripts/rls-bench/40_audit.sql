-- Audit-log checks (migration 47). Everything runs in one transaction that is
-- rolled back at the end. Prints PASS/FAIL lines.
SET client_min_messages = warning;
BEGIN;
CREATE TEMP TABLE out (n serial, line text);
GRANT ALL ON out, out_n_seq TO authenticated;

CREATE FUNCTION pg_temp.ok(name text, cond boolean, detail text DEFAULT '') RETURNS void LANGUAGE sql AS $$
  INSERT INTO out (line) VALUES (CASE WHEN cond THEN 'PASS  ' ELSE 'FAIL  ' END || name ||
    CASE WHEN cond OR detail = '' THEN '' ELSE ' -- ' || detail END)
$$;

DO $t$
DECLARE
  tch uuid := (SELECT id FROM bench.people WHERE school = 'A' AND role = 'teacher');
  stu uuid := (SELECT id FROM bench.people WHERE school = 'A' AND role = 'student');
  sup uuid := (SELECT id FROM bench.people WHERE role = 'super_admin');
  adm_b uuid := (SELECT id FROM bench.people WHERE school = 'B' AND role = 'admin');
  ten_a uuid := (SELECT key FROM bench.seeded WHERE tbl = 'tenants' AND school = 'A');
  fb uuid  := (SELECT key FROM bench.seeded WHERE tbl = 'submission_feedback' AND school = 'A');
  ar uuid  := (SELECT key FROM bench.seeded WHERE tbl = 'attendance_records' AND school = 'A');
  ts uuid  := (SELECT key FROM bench.seeded WHERE tbl = 'test_scores' AND school = 'A');
  before bigint; r record; n bigint; err text;
BEGIN
  DELETE FROM audit_logs WHERE action <> 'bench';

  -- 1. A teacher lowers a score: logged with old and new, pupil, school, actor.
  PERFORM bench.become(tch);
  UPDATE submission_feedback SET score = 6 WHERE id = fb;
  PERFORM bench.unbecome();
  SELECT * INTO r FROM audit_logs WHERE entity_id = fb ORDER BY created_at DESC LIMIT 1;
  PERFORM pg_temp.ok('score change is logged', r.id IS NOT NULL);
  PERFORM pg_temp.ok('  ... with old 8 -> new 6', r.metadata #>> '{old,score}' = '8' AND r.metadata #>> '{new,score}' = '6', coalesce(r.metadata::text, 'no row'));
  PERFORM pg_temp.ok('  ... about the pupil, in the school, by the teacher',
    r.subject_id = stu AND r.tenant_id = ten_a AND r.user_id = tch AND r.action = 'update');

  -- 2. Comment edited: recorded as changed, the text itself is never copied.
  PERFORM bench.become(tch);
  UPDATE submission_feedback SET comment = 'GEHEIME TEKST' WHERE id = fb;
  PERFORM bench.unbecome();
  -- (same transaction = same now(), so pick the row by content, not by time)
  SELECT * INTO r FROM audit_logs WHERE entity_id = fb AND metadata ? 'text_changed' LIMIT 1;
  PERFORM pg_temp.ok('comment edit logged as "changed"', r.metadata #>> '{text_changed,comment}' = 'true', coalesce(r.metadata::text, 'no row'));
  PERFORM pg_temp.ok('comment text is NOT in the log', NOT EXISTS (SELECT 1 FROM audit_logs WHERE metadata::text LIKE '%GEHEIME%'));

  -- 3. Re-saving attendance without a change writes nothing.
  SELECT count(*) INTO before FROM audit_logs;
  PERFORM bench.become(tch);
  UPDATE attendance_records SET status = status WHERE id = ar;
  PERFORM bench.unbecome();
  PERFORM pg_temp.ok('unchanged re-save is not logged', (SELECT count(*) FROM audit_logs) = before);

  -- 4. Present -> absent is logged.
  PERFORM bench.become(tch);
  UPDATE attendance_records SET status = 'absent' WHERE id = ar;
  PERFORM bench.unbecome();
  PERFORM pg_temp.ok('attendance change is logged', EXISTS (SELECT 1 FROM audit_logs
    WHERE entity_id = ar AND metadata #>> '{old,status}' = 'present' AND metadata #>> '{new,status}' = 'absent'));

  -- 5. A deleted test score keeps its old value in the log.
  PERFORM bench.become(tch);
  DELETE FROM test_scores WHERE id = ts;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM bench.unbecome();
  PERFORM pg_temp.ok('deleted score is logged with its value', n = 1 AND EXISTS (SELECT 1 FROM audit_logs
    WHERE entity_id = ts AND action = 'delete' AND metadata #>> '{old,score}' = '15'), 'rows deleted: ' || n);

  -- 6-8. The log is append-only for every signed-in user.
  BEGIN
    PERFORM bench.become(tch);
    DELETE FROM audit_logs;
    err := 'none';
  EXCEPTION WHEN OTHERS THEN err := SQLSTATE; END;
  PERFORM bench.unbecome();
  PERFORM pg_temp.ok('teacher cannot delete the log', err = '42501', 'got ' || err);
  BEGIN
    PERFORM bench.become(sup);
    UPDATE audit_logs SET metadata = '{}';
    err := 'none';
  EXCEPTION WHEN OTHERS THEN err := SQLSTATE; END;
  PERFORM bench.unbecome();
  PERFORM bench.unbecome();
  PERFORM pg_temp.ok('even super_admin cannot rewrite the log', err = '42501', 'got ' || err);
  BEGIN
    PERFORM bench.become(tch);
    INSERT INTO audit_logs (tenant_id, user_id, action) VALUES (ten_a, tch, 'forged');
    err := 'none';
  EXCEPTION WHEN OTHERS THEN err := SQLSTATE; END;
  PERFORM bench.unbecome();
  PERFORM pg_temp.ok('teacher cannot forge a log row', err = '42501', 'got ' || err);

  -- 9. Who can read it: super_admin yes; a teacher no; school B never.
  PERFORM bench.become(tch);  SELECT count(*) INTO n FROM audit_logs; PERFORM bench.unbecome();
  PERFORM pg_temp.ok('teacher cannot read the log', n = 0, n || ' rows');
  PERFORM bench.become(adm_b); SELECT count(*) INTO n FROM audit_logs WHERE tenant_id = ten_a; PERFORM bench.unbecome();
  PERFORM pg_temp.ok('school B cannot read school A''s log', n = 0, n || ' rows');
  PERFORM bench.become(sup);  SELECT count(*) INTO n FROM audit_logs WHERE action <> 'bench'; PERFORM bench.unbecome();
  PERFORM pg_temp.ok('super_admin reads the log', n >= 4, n || ' rows');

  -- 10. Service-role writes (erasure, operators) are not logged.
  SELECT count(*) INTO before FROM audit_logs;
  UPDATE submission_feedback SET score = 2, comment = NULL WHERE id = fb;   -- as postgres, no JWT
  PERFORM pg_temp.ok('service-role write is not logged', (SELECT count(*) FROM audit_logs) = before);

  -- 11. A pupil still cannot delete graded work (migration 45) -- and it is not
  --     silently gone: the attempt fails.
  BEGIN
    PERFORM bench.become(stu);
    DELETE FROM submissions WHERE student_id = stu;
    GET DIAGNOSTICS n = ROW_COUNT;
    err := 'deleted ' || n;
  EXCEPTION WHEN OTHERS THEN err := SQLSTATE; END;
  PERFORM bench.unbecome();
  PERFORM pg_temp.ok('pupil cannot delete graded work', err <> 'deleted 1', err);
END
$t$;

SELECT line FROM out ORDER BY n;
ROLLBACK;
