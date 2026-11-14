-- Load test for the per-row parent lookups of migration 46. Run after run.sh
-- (school A seeded, wall applied). Scales school A to roughly a full year of a
-- 100-pupil school, then times typical reads as A's admin and teacher.
-- Run it twice: once as is, once after 46_rollback.sql, and compare.
\timing off
SET client_min_messages = warning;

DO $$
DECLARE t uuid; c uuid; tch uuid; a uuid; i int; k int;
BEGIN
  IF (SELECT count(*) FROM attendance_records) > 1000 THEN RETURN; END IF;  -- already scaled
  SELECT key INTO t FROM bench.seeded WHERE tbl = 'tenants' AND school = 'A';
  SELECT key INTO c FROM bench.seeded WHERE tbl = 'classes' AND school = 'A';
  SELECT id INTO tch FROM bench.people WHERE school = 'A' AND role = 'teacher';
  FOR i IN 1..100 LOOP
    PERFORM bench.person('A', t, 'student', 'Load' || i);
  END LOOP;
  INSERT INTO class_students (class_id, student_id)
    SELECT c, id FROM bench.people WHERE school = 'A' AND role = 'student' ON CONFLICT DO NOTHING;
  -- 200 lesson days x ~100 pupils
  INSERT INTO attendance_sessions (class_id, teacher_id, session_date)
    SELECT c, tch, date '2026-01-01' + g FROM generate_series(1, 200) g ON CONFLICT DO NOTHING;
  INSERT INTO attendance_records (session_id, student_id, status)
    SELECT s.id, cs.student_id, 'present'
      FROM attendance_sessions s JOIN class_students cs ON cs.class_id = s.class_id
     WHERE s.class_id = c ON CONFLICT DO NOTHING;
  -- 120 homework items x ~100 pupils, all graded
  FOR k IN 1..120 LOOP
    INSERT INTO assignments (class_id, created_by, title, max_score) VALUES (c, tch, 'HW' || k, 10) RETURNING id INTO a;
    INSERT INTO submissions (assignment_id, student_id, status)
      SELECT a, student_id, 'graded' FROM class_students WHERE class_id = c;
  END LOOP;
  INSERT INTO submission_feedback (submission_id, teacher_id, score)
    SELECT s.id, tch, 7 FROM submissions s LEFT JOIN submission_feedback f ON f.submission_id = s.id WHERE f.id IS NULL;
END $$;
ANALYZE;

CREATE OR REPLACE FUNCTION bench.time_as(p uuid, stmt text, reps int DEFAULT 5)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz; best interval := '1 hour'; n bigint; i int;
BEGIN
  FOR i IN 1..reps LOOP
    PERFORM bench.become(p);
    -- PostgREST applies the impersonated role's ALTER ROLE ... SET settings to
    -- every request (migration 48 sets jit = off there); SET ROLE alone does not.
    PERFORM set_config(split_part(c, '=', 1), substr(c, strpos(c, '=') + 1), true)
       FROM pg_roles r, unnest(r.rolconfig) c
      WHERE r.rolname = 'authenticated' AND split_part(c, '=', 1) NOT LIKE '%timeout';
    t0 := clock_timestamp();
    EXECUTE stmt INTO n;
    best := least(best, clock_timestamp() - t0);
    PERFORM bench.unbecome();
  END LOOP;
  RETURN format('%8s ms  rows=%s', round(extract(epoch FROM best) * 1000, 1), n);
END $$;

SELECT q.name, bench.time_as((SELECT id FROM bench.people WHERE school = 'A' AND role = q.who), q.stmt) AS best_of_5
FROM (VALUES
  ('admin   all attendance of the school', 'admin',   'SELECT count(*) FROM attendance_records'),
  ('teacher attendance, one class',        'teacher', 'SELECT count(*) FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id WHERE s.class_id = (SELECT key FROM bench.seeded WHERE tbl=''classes'' AND school=''A'')'),
  ('teacher puntenlijst: submissions',     'teacher', 'SELECT count(*) FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE a.class_id = (SELECT key FROM bench.seeded WHERE tbl=''classes'' AND school=''A'')'),
  ('teacher puntenlijst: feedback',        'teacher', 'SELECT count(*) FROM submission_feedback'),
  ('admin   one pupil''s submissions',     'admin',   'SELECT count(*) FROM submissions WHERE student_id = (SELECT id FROM bench.people WHERE school=''A'' AND role=''student'' LIMIT 1)'),
  ('teacher class roster',                 'teacher', 'SELECT count(*) FROM class_students')
) AS q(name, who, stmt);
