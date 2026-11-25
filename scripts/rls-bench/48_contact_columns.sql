-- Column-lockdown checks (migration 52, review 2026-11-21 #3).
-- One transaction, rolled back at the end. Prints PASS/FAIL lines.
-- run.sh splices supabase/52_rollback.sql in at the marker, so the last probe
-- proves the attack works against the old grants (the test can see the bug).
SET client_min_messages = warning;
BEGIN;
CREATE TEMP TABLE out (n serial, line text);
GRANT ALL ON out, out_n_seq TO authenticated, anon;

CREATE FUNCTION pg_temp.ok(name text, cond boolean, detail text DEFAULT '') RETURNS void LANGUAGE sql AS $$
  INSERT INTO out (line) VALUES (CASE WHEN cond THEN 'PASS  ' ELSE 'FAIL  ' END || name ||
    CASE WHEN cond OR detail = '' THEN '' ELSE ' -- ' || detail END)
$$;

UPDATE profiles SET phone = '0400' || left(id::text, 6);

-- The attack: a signed-in pupil asks for everyone's e-mail and phone directly.
CREATE FUNCTION pg_temp.attack() RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM bench.become((SELECT id FROM bench.people WHERE school = 'A' AND role = 'student'));
  SELECT count(*) INTO n FROM profiles WHERE email IS NOT NULL OR phone IS NOT NULL;
  PERFORM bench.unbecome();
  RETURN n::text;
EXCEPTION WHEN OTHERS THEN PERFORM bench.unbecome(); RETURN 'E' || SQLSTATE;
END $$;

DO $$
DECLARE
  adm uuid := (SELECT id FROM bench.people WHERE school = 'A' AND role = 'admin');
  tch uuid := (SELECT id FROM bench.people WHERE school = 'A' AND role = 'teacher');
  stu uuid := (SELECT id FROM bench.people WHERE school = 'A' AND role = 'student');
  res text; n bigint;
BEGIN
  res := pg_temp.attack();
  PERFORM pg_temp.ok('pupil cannot read e-mail/phone columns directly', res = 'E42501', res);

  PERFORM bench.become(stu);
  SELECT count(*) INTO n FROM profiles WHERE first_name IS NOT NULL;
  PERFORM bench.unbecome();
  PERFORM pg_temp.ok('control: pupil still reads names in their school', n >= 5, n::text);

  PERFORM bench.become(stu);
  SELECT count(*) INTO n FROM public.get_profile_contacts(ARRAY[stu, tch]);
  PERFORM bench.unbecome();
  PERFORM pg_temp.ok('control: pupil still gets own + teacher contacts via 51', n = 2, n::text);

  -- Beheer's edit dialog writes phone without reading it.
  PERFORM bench.become(adm);
  UPDATE profiles SET phone = '0499000000' WHERE id = tch;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM bench.unbecome();
  PERFORM pg_temp.ok('control: admin still saves a phone number', n = 1, n::text);

  -- Grant drift: every column except email/phone readable, those two not.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'profiles'
     AND has_column_privilege('authenticated', 'public.profiles', column_name, 'SELECT') = (column_name IN ('email', 'phone'));
  PERFORM pg_temp.ok('grants: all profiles columns readable except email + phone', n = 0, n::text || ' columns wrong');
END $$;

-- The test can see the bug: run.sh splices supabase/52_rollback.sql in here.
-- @@ROLLBACK_52@@
DO $$
DECLARE res text := pg_temp.attack();
BEGIN
  PERFORM pg_temp.ok('[old grants] the test sees the bug: pupil reads everyone''s e-mail/phone',
    res ~ '^[0-9]+$' AND res::int >= 5, res);
END $$;

SELECT line FROM out ORDER BY n;
ROLLBACK;
