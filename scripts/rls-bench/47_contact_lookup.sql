-- get_profile_contacts() rules (migration 51): who gets whose e-mail + phone.
-- One transaction, rolled back at the end. Prints PASS/FAIL lines.
-- run.sh splices supabase/51_rollback.sql in at the marker, so the last check
-- proves the probe notices a missing function.
SET client_min_messages = warning;
BEGIN;
CREATE TEMP TABLE out (n serial, line text);
GRANT ALL ON out, out_n_seq TO authenticated, anon;

CREATE FUNCTION pg_temp.ok(name text, cond boolean, detail text DEFAULT '') RETURNS void LANGUAGE sql AS $$
  INSERT INTO out (line) VALUES (CASE WHEN cond THEN 'PASS  ' ELSE 'FAIL  ' END || name ||
    CASE WHEN cond OR detail = '' THEN '' ELSE ' -- ' || detail END)
$$;

-- Everyone gets a phone number, so "phone hidden" can't pass by accident.
UPDATE profiles SET phone = '0400' || left(id::text, 6);

-- A pupil of school A who is NOT in the teacher's class. Inserted directly (not
-- via bench.person) so bench.people keeps one row per role; labelled 'outsider'.
CREATE TEMP TABLE extra (id uuid DEFAULT gen_random_uuid());
INSERT INTO extra DEFAULT VALUES;
INSERT INTO auth.users (id, email) SELECT id, 'outsider.a@bench.test' FROM extra;
INSERT INTO profiles (id, tenant_id, role, first_name, last_name, email, phone)
  SELECT e.id, p.tenant_id, 'student', 'Outsider', 'A', 'outsider.a@bench.test', '0400999999'
    FROM extra e, profiles p WHERE p.id = (SELECT id FROM bench.people WHERE school = 'A' AND role = 'admin');

-- What the function shows person p, as sorted "school:role+mail+phone" labels.
CREATE FUNCTION pg_temp.contacts(p uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
  -- Every id in BOTH schools, collected before becoming p: the caller passes ids
  -- it can't see, and the function must still refuse them.
  ids uuid[] := ARRAY(SELECT id FROM profiles);
BEGIN
  PERFORM bench.become(p);
  SELECT string_agg(lbl, ' ' ORDER BY lbl COLLATE "C") INTO r FROM (
    SELECT coalesce(bp.school || ':' || bp.role, 'outsider') ||
           CASE WHEN c.email IS NOT NULL THEN '+mail' ELSE '' END ||
           CASE WHEN c.phone IS NOT NULL THEN '+phone' ELSE '' END AS lbl
      FROM public.get_profile_contacts(ids) c
      LEFT JOIN bench.people bp ON bp.id = c.id
  ) x;
  PERFORM bench.unbecome();
  RETURN coalesce(r, '');
EXCEPTION WHEN OTHERS THEN PERFORM bench.unbecome(); RETURN 'E' || SQLSTATE;
END $$;

DO $$
DECLARE
  adm  uuid := (SELECT id FROM bench.people WHERE school = 'A' AND role = 'admin');
  tch  uuid := (SELECT id FROM bench.people WHERE school = 'A' AND role = 'teacher');
  lb   uuid := (SELECT id FROM bench.people WHERE school = 'A' AND role = 'leerlingenbegeleiding');
  stu  uuid := (SELECT id FROM bench.people WHERE school = 'A' AND role = 'student');
  su   uuid := (SELECT id FROM profiles WHERE role = 'super_admin' LIMIT 1);
  res  text; err text;
  a_all text := 'A:admin+mail+phone A:leerlingenbegeleiding+mail+phone A:student+mail+phone A:student2+mail+phone A:teacher+mail+phone outsider+mail+phone';
BEGIN
  res := pg_temp.contacts(stu);
  PERFORM pg_temp.ok('pupil: own row + own teacher''s e-mail (no phone), nothing else',
    res = 'A:student+mail+phone A:teacher+mail', res);

  res := pg_temp.contacts(tch);
  PERFORM pg_temp.ok('teacher: staff + own pupils, not a pupil they don''t teach, not school B',
    res = 'A:admin+mail+phone A:leerlingenbegeleiding+mail+phone A:student+mail+phone A:student2+mail+phone A:teacher+mail+phone', res);

  res := pg_temp.contacts(adm);
  PERFORM pg_temp.ok('admin: everyone in school A, nobody in B', res = a_all, res);
  res := pg_temp.contacts(lb);
  PERFORM pg_temp.ok('counsellor: everyone in school A, nobody in B', res = a_all, res);

  res := pg_temp.contacts(su);
  PERFORM pg_temp.ok('super_admin: both schools', res LIKE '%A:admin+mail+phone%' AND res LIKE '%B:admin+mail+phone%', res);

  UPDATE profiles SET is_active = false WHERE id = tch;
  res := pg_temp.contacts(tch);
  PERFORM pg_temp.ok('archived teacher: own row only', res = 'A:teacher+mail+phone', res);
  UPDATE profiles SET is_active = true WHERE id = tch;

  err := NULL;
  BEGIN
    PERFORM set_config('role', 'anon', true);
    PERFORM count(*) FROM public.get_profile_contacts(ARRAY[adm]);
    PERFORM bench.unbecome();
  EXCEPTION WHEN OTHERS THEN err := SQLSTATE; PERFORM bench.unbecome();
  END;
  PERFORM pg_temp.ok('anon cannot call the contact lookup', err = '42501', coalesce(err, 'no error'));
END $$;

-- The probe notices a missing function: run.sh splices 51_rollback.sql in here.
-- @@ROLLBACK_51@@
DO $$
DECLARE res text := pg_temp.contacts((SELECT id FROM bench.people WHERE school = 'A' AND role = 'admin'));
BEGIN
  PERFORM pg_temp.ok('[without 51] the probe sees the function is gone', res LIKE 'E%', res);
END $$;

SELECT line FROM out ORDER BY n;
ROLLBACK;
