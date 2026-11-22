-- Inactive-user and erasure-guard checks (migration 50, review 2026-11-21 #5 + #6).
-- One transaction, rolled back at the end. Prints PASS/FAIL lines.
SET client_min_messages = warning;
BEGIN;
CREATE TEMP TABLE out (n serial, line text);
GRANT ALL ON out, out_n_seq TO authenticated;

CREATE FUNCTION pg_temp.ok(name text, cond boolean, detail text DEFAULT '') RETURNS void LANGUAGE sql AS $$
  INSERT INTO out (line) VALUES (CASE WHEN cond THEN 'PASS  ' ELSE 'FAIL  ' END || name ||
    CASE WHEN cond OR detail = '' THEN '' ELSE ' -- ' || detail END)
$$;

-- Runs the probes; `expect_fixed` says which outcome is the PASS.
CREATE FUNCTION pg_temp.probe(expect_fixed boolean) RETURNS void LANGUAGE plpgsql AS $p$
DECLARE
  tch uuid := (SELECT id FROM bench.people WHERE school = 'A' AND role = 'teacher');
  adm uuid := (SELECT id FROM bench.people WHERE school = 'A' AND role = 'admin');
  stu uuid := (SELECT id FROM bench.people WHERE school = 'A' AND role = 'student');
  n bigint; own bigint; err text; tag text := CASE WHEN expect_fixed THEN '' ELSE '[old code] ' END;
BEGIN
  -- #5 control: an active teacher reads their school.
  IF expect_fixed THEN
    PERFORM bench.become(tch); SELECT count(*) INTO n FROM classes; PERFORM bench.unbecome();
    PERFORM pg_temp.ok('control: active teacher reads classes', n > 0, n::text);
  END IF;

  -- #5: archive the teacher (service role), then let their still-valid token read.
  UPDATE profiles SET is_active = false WHERE id = tch;
  PERFORM bench.become(tch);
  SELECT count(*) INTO n FROM classes;
  SELECT count(*) INTO own FROM profiles WHERE id = tch;
  PERFORM bench.unbecome();
  IF expect_fixed THEN
    PERFORM pg_temp.ok('archived teacher reads no classes', n = 0, n::text || ' rows');
    PERFORM pg_temp.ok('  ... but still sees their own profile (so the app can sign them out)', own = 1);
  ELSE
    PERFORM pg_temp.ok(tag || 'the test sees the bug: archived teacher still reads classes', n > 0, n::text);
  END IF;
  UPDATE profiles SET is_active = true WHERE id = tch;

  -- #6: the pupil is erased (service role sets the flag, as the route does).
  UPDATE profiles SET is_anonymized = true, is_active = false, first_name = 'Verwijderd' WHERE id = stu;

  err := NULL;
  BEGIN
    PERFORM bench.become(adm);
    UPDATE profiles SET is_anonymized = false, is_active = true WHERE id = stu;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM bench.unbecome();
  EXCEPTION WHEN OTHERS THEN err := SQLSTATE; PERFORM bench.unbecome();
  END;
  IF expect_fixed THEN
    PERFORM pg_temp.ok('admin cannot un-erase a profile', err = '42501', coalesce(err, n::text || ' rows changed'));
  ELSE
    PERFORM pg_temp.ok(tag || 'the test sees the bug: admin un-erases the profile', err IS NULL AND n = 1, coalesce(err, ''));
    UPDATE profiles SET is_anonymized = true WHERE id = stu;   -- put it back for the next probe
  END IF;

  IF expect_fixed THEN
    err := NULL;
    BEGIN
      PERFORM bench.become(adm);
      UPDATE profiles SET first_name = 'Echte naam' WHERE id = stu;
      PERFORM bench.unbecome();
    EXCEPTION WHEN OTHERS THEN err := SQLSTATE; PERFORM bench.unbecome();
    END;
    PERFORM pg_temp.ok('admin cannot write a name back onto an erased profile', err = '42501', coalesce(err, 'no error'));

    err := NULL;
    BEGIN
      PERFORM bench.become(adm);
      UPDATE profiles SET is_anonymized = true WHERE id = tch;
      PERFORM bench.unbecome();
    EXCEPTION WHEN OTHERS THEN err := SQLSTATE; PERFORM bench.unbecome();
    END;
    PERFORM pg_temp.ok('admin cannot mark someone erased without the erasure', err = '42501', coalesce(err, 'no error'));

    PERFORM bench.become(adm);
    UPDATE profiles SET first_name = first_name WHERE id = tch;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM bench.unbecome();
    PERFORM pg_temp.ok('control: admin still edits a normal profile', n = 1, n::text);

    UPDATE profiles SET first_name = 'Verwijderd' WHERE id = stu;   -- service role: allowed
    PERFORM pg_temp.ok('control: the service role still writes an erased profile', true);
  END IF;
  UPDATE profiles SET is_anonymized = false, is_active = true WHERE id = stu;
END
$p$;

SELECT pg_temp.probe(true);

-- The test can see the bug: run.sh splices supabase/50_rollback.sql in here.
-- @@ROLLBACK_50@@
SELECT pg_temp.probe(false);

SELECT line FROM out ORDER BY n;
ROLLBACK;
