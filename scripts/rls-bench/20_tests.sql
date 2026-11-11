-- Tenant-wall tests. Loaded after 10_seed.sql; run.sh drives the phases.
--
-- census(label): for every person of school A (+ super_admin) and every table,
--   what can they do to THEIR OWN school's rows? read / update / delete counts
--   and the outcome of inserting a copy of one row. Run with and without the
--   wall: the results must be identical, or the wall breaks something real.
--
-- attack(label): first adds a deliberately sloppy permissive policy
--   (USING true / WITH CHECK true) to EVERY table -- the bug class of
--   migrations 12/24/26/34/39 at its worst -- then every person of A tries to
--   read, update, delete, insert into, and re-point rows at school B.
--   With the wall every attempt must fail; without it they must succeed
--   (otherwise the test can't see a leak and proves nothing).

CREATE TABLE IF NOT EXISTS bench.results (
  label text, who text, tbl text, metric text, value text
);
GRANT INSERT, SELECT ON bench.results TO authenticated;

-- Which column points a row at its school (for the re-point attack).
CREATE TABLE IF NOT EXISTS bench.pointer (tbl text PRIMARY KEY, col text);
GRANT SELECT ON bench.pointer TO authenticated;
INSERT INTO bench.pointer
SELECT table_name, 'tenant_id' FROM information_schema.columns
 WHERE table_schema = 'public' AND column_name = 'tenant_id'
ON CONFLICT DO NOTHING;
INSERT INTO bench.pointer VALUES
  ('assignments', 'class_id'), ('attendance_sessions', 'class_id'), ('class_tests', 'class_id'),
  ('lesson_modules', 'class_id'), ('class_students', 'class_id'), ('class_teachers', 'class_id'),
  ('exam_scores', 'class_id'), ('assignment_students', 'assignment_id'), ('submissions', 'assignment_id'),
  ('attendance_records', 'session_id'), ('test_scores', 'test_id'), ('category_scores', 'category_id'),
  ('oudercontact_bookings', 'slot_id'), ('rapport_lines', 'rapport_card_id'),
  ('module_documents', 'module_id'), ('submission_feedback', 'submission_id'),
  ('submission_files', 'submission_id')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION bench.become(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

CREATE OR REPLACE FUNCTION bench.unbecome() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- Run one statement as person p; return rows affected, or the SQLSTATE.
-- Always rolled back (the block's EXCEPTION clause is a savepoint).
CREATE OR REPLACE FUNCTION bench.try(p uuid, stmt text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint; outcome text;
BEGIN
  BEGIN
    PERFORM bench.become(p);
    EXECUTE stmt;
    GET DIAGNOSTICS n = ROW_COUNT;
    outcome := n::text;
    RAISE EXCEPTION USING ERRCODE = 'P0B01';   -- undo whatever it did
  EXCEPTION
    WHEN SQLSTATE 'P0B01' THEN NULL;
    WHEN OTHERS THEN outcome := 'E' || SQLSTATE;
  END;
  PERFORM bench.unbecome();
  RETURN outcome;
END $$;

-- Count of rows of school s in tbl that p can SELECT.
CREATE OR REPLACE FUNCTION bench.visible(p uuid, t text, kc text, s text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  BEGIN
    PERFORM bench.become(p);
    EXECUTE format('SELECT count(*) FROM public.%I x WHERE x.%I IN (SELECT key FROM bench.seeded WHERE tbl = %L AND school = %L)', t, kc, t, s) INTO n;
  EXCEPTION WHEN OTHERS THEN
    PERFORM bench.unbecome(); RETURN 'E' || SQLSTATE;
  END;
  PERFORM bench.unbecome();
  RETURN n::text;
END $$;

-- INSERT a copy of one seeded row of school s (new key) as p.
CREATE OR REPLACE FUNCTION bench.copy_stmt(t text, kc text, s text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE j jsonb;
BEGIN
  EXECUTE format('SELECT to_jsonb(x) FROM public.%I x WHERE x.%I = (SELECT key FROM bench.seeded WHERE tbl = %L AND school = %L LIMIT 1)', t, kc, t, s) INTO j;
  j := jsonb_set(j, ARRAY[kc], to_jsonb(gen_random_uuid()));
  IF t = 'tenants' THEN j := jsonb_set(j, '{slug}', to_jsonb('copy-' || gen_random_uuid())); END IF;
  RETURN format('INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, %L::jsonb)', t, t, j);
END $$;

CREATE OR REPLACE FUNCTION bench.keyset(t text, s text) RETURNS text LANGUAGE sql AS $$
  SELECT format('(SELECT key FROM bench.seeded WHERE tbl = %L AND school = %L)', t, s)
$$;

CREATE OR REPLACE FUNCTION bench.census(label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE pp record; t record;
BEGIN
  FOR pp IN SELECT * FROM bench.people WHERE school IN ('A', '-') LOOP
    FOR t IN SELECT DISTINCT tbl, keycol FROM bench.seeded ORDER BY tbl LOOP
      INSERT INTO bench.results VALUES
        (label, pp.role, t.tbl, 'read_own',   bench.visible(pp.id, t.tbl, t.keycol, 'A')),
        (label, pp.role, t.tbl, 'read_other', bench.visible(pp.id, t.tbl, t.keycol, 'B')),
        (label, pp.role, t.tbl, 'update_own', bench.try(pp.id, format('UPDATE public.%I SET %I = %I WHERE %I IN %s', t.tbl, t.keycol, t.keycol, t.keycol, bench.keyset(t.tbl, 'A')))),
        (label, pp.role, t.tbl, 'delete_own', bench.try(pp.id, format('DELETE FROM public.%I WHERE %I IN %s', t.tbl, t.keycol, bench.keyset(t.tbl, 'A')))),
        (label, pp.role, t.tbl, 'insert_own', bench.try(pp.id, bench.copy_stmt(t.tbl, t.keycol, 'A')));
    END LOOP;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION bench.attack(label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE pp record; t record; ptr text; bval text; akey uuid;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS bench_leak ON public.%I', t.tablename);
    EXECUTE format('CREATE POLICY bench_leak ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t.tablename);
  END LOOP;

  FOR pp IN SELECT * FROM bench.people WHERE school = 'A' LOOP
    FOR t IN SELECT DISTINCT tbl, keycol FROM bench.seeded ORDER BY tbl LOOP
      INSERT INTO bench.results VALUES
        (label, pp.role, t.tbl, 'atk_read',   bench.visible(pp.id, t.tbl, t.keycol, 'B')),
        (label, pp.role, t.tbl, 'atk_update', bench.try(pp.id, format('UPDATE public.%I SET %I = %I WHERE %I IN %s', t.tbl, t.keycol, t.keycol, t.keycol, bench.keyset(t.tbl, 'B')))),
        (label, pp.role, t.tbl, 'atk_delete', bench.try(pp.id, format('DELETE FROM public.%I WHERE %I IN %s', t.tbl, t.keycol, bench.keyset(t.tbl, 'B')))),
        (label, pp.role, t.tbl, 'atk_insert', bench.try(pp.id, bench.copy_stmt(t.tbl, t.keycol, 'B')));

      -- Re-point one of A's rows at B (the migration-39 shape).
      SELECT col INTO ptr FROM bench.pointer WHERE tbl = t.tbl;
      IF ptr IS NOT NULL THEN
        EXECUTE format('SELECT %I::text FROM public.%I WHERE %I IN %s LIMIT 1', ptr, t.tbl, t.keycol, bench.keyset(t.tbl, 'B')) INTO bval;
        SELECT key INTO akey FROM bench.seeded WHERE tbl = t.tbl AND school = 'A' LIMIT 1;
        INSERT INTO bench.results VALUES (label, pp.role, t.tbl, 'atk_repoint',
          bench.try(pp.id, format('UPDATE public.%I SET %I = %L WHERE %I = %L', t.tbl, ptr, bval, t.keycol, akey)));
      END IF;
    END LOOP;
  END LOOP;

  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS bench_leak ON public.%I', t.tablename);
  END LOOP;
END $$;
