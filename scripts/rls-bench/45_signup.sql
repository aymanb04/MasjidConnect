-- Signup-trigger checks (migration 49, review 2026-11-21 finding #1).
-- One transaction, rolled back at the end. Prints PASS/FAIL lines.
--
-- The trigger on auth.users lives only in production (made in the dashboard),
-- so it is created here, inside the transaction, exactly as Supabase's template
-- does: AFTER INSERT ... EXECUTE handle_new_user().
SET client_min_messages = warning;
BEGIN;
CREATE TEMP TABLE out (n serial, line text);
GRANT ALL ON out, out_n_seq TO authenticated;

CREATE FUNCTION pg_temp.ok(name text, cond boolean, detail text DEFAULT '') RETURNS void LANGUAGE sql AS $$
  INSERT INTO out (line) VALUES (CASE WHEN cond THEN 'PASS  ' ELSE 'FAIL  ' END || name ||
    CASE WHEN cond OR detail = '' THEN '' ELSE ' -- ' || detail END)
$$;

DROP TRIGGER IF EXISTS bench_on_auth_user_created ON auth.users;
CREATE TRIGGER bench_on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DO $t$
DECLARE
  ten_a uuid := (SELECT key FROM bench.seeded WHERE tbl = 'tenants' AND school = 'A');
  ten_b uuid := (SELECT key FROM bench.seeded WHERE tbl = 'tenants' AND school = 'B');
  atk uuid := gen_random_uuid(); sup uuid := gen_random_uuid();
  okv uuid := gen_random_uuid(); old uuid := gen_random_uuid();
  p record; n bigint;
BEGIN
  -- 1. The attack: a public signUp() with role + school in user metadata.
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (atk, 'atk@bench.test', jsonb_build_object('role', 'admin', 'tenant_id', ten_b,
                                                    'first_name', 'Eve', 'last_name', 'X'));
  SELECT * INTO p FROM profiles WHERE id = atk;
  PERFORM pg_temp.ok('signup metadata cannot pick a role', p.role = 'student', coalesce(p.role, 'no profile'));
  PERFORM pg_temp.ok('signup metadata cannot pick a school', p.tenant_id IS NULL, coalesce(p.tenant_id::text, ''));
  PERFORM pg_temp.ok('  ... the name still comes through', p.first_name = 'Eve');

  -- 2. The stub sees nothing of any school.
  PERFORM bench.become(atk);
  SELECT count(*) INTO n FROM profiles WHERE id <> atk;
  PERFORM pg_temp.ok('the stub reads no other profile', n = 0, n::text || ' rows');
  SELECT count(*) INTO n FROM tenants;
  PERFORM pg_temp.ok('the stub reads no school', n = 0, n::text || ' rows');
  PERFORM bench.unbecome();

  -- 3. Even app metadata cannot mint a super_admin.
  INSERT INTO auth.users (id, email, raw_app_meta_data)
  VALUES (sup, 'sup@bench.test', jsonb_build_object('role', 'super_admin', 'tenant_id', ten_a));
  SELECT * INTO p FROM profiles WHERE id = sup;
  PERFORM pg_temp.ok('app metadata cannot mint super_admin', p.role = 'student', p.role);

  -- 4. Control: the service-role path (app metadata) still works.
  INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  VALUES (okv, 'ok@bench.test', jsonb_build_object('role', 'teacher', 'tenant_id', ten_a),
                                jsonb_build_object('first_name', 'Ok', 'last_name', 'Y'));
  SELECT * INTO p FROM profiles WHERE id = okv;
  PERFORM pg_temp.ok('control: app metadata sets role + school',
    p.role = 'teacher' AND p.tenant_id = ten_a AND p.first_name = 'Ok', coalesce(p.role || ' ' || p.tenant_id, 'no profile'));
END
$t$;

-- 5. The test can see the bug. run.sh splices supabase/49_rollback.sql (= the
-- function as migration 26 left it) in at the marker below; the same attack
-- must then succeed, or this file proves nothing. All rolled back at the end.
-- @@ROLLBACK_49@@
DO $t2$
DECLARE
  ten_b uuid := (SELECT key FROM bench.seeded WHERE tbl = 'tenants' AND school = 'B');
  v uuid := gen_random_uuid(); p record;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (v, 'old@bench.test', jsonb_build_object('role', 'admin', 'tenant_id', ten_b));
  SELECT * INTO p FROM profiles WHERE id = v;
  PERFORM pg_temp.ok('the test sees the bug: under migration 26 the attack makes an admin of school B',
    p.role = 'admin' AND p.tenant_id = ten_b, coalesce(p.role || ' ' || p.tenant_id, 'no profile'));
END
$t2$;

SELECT line FROM out ORDER BY n;
ROLLBACK;
