-- Two fake schools, A and B, with at least one row in every public table.
-- Every row is recorded in bench.seeded (table, key column, key, school) so the
-- tests can ask "which of B's rows can this user of A touch?" generically.
-- Test bench only.

CREATE SCHEMA IF NOT EXISTS bench;
GRANT USAGE ON SCHEMA bench TO authenticated, anon;

CREATE TABLE IF NOT EXISTS bench.seeded (
  tbl text NOT NULL, keycol text NOT NULL, key uuid NOT NULL, school text NOT NULL
);
CREATE TABLE IF NOT EXISTS bench.people (school text, role text, id uuid);
GRANT SELECT ON bench.seeded, bench.people TO authenticated, anon;

CREATE OR REPLACE FUNCTION bench.reg(p_tbl text, p_key uuid, p_school text, p_keycol text DEFAULT 'id')
RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO bench.seeded VALUES (p_tbl, p_keycol, p_key, p_school) RETURNING key
$$;

CREATE OR REPLACE FUNCTION bench.person(p_school text, p_tenant uuid, p_role text, p_first text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v, lower(p_first) || '.' || lower(p_school) || '@bench.test');
  INSERT INTO public.profiles (id, tenant_id, role, first_name, last_name, email)
       VALUES (v, p_tenant, p_role, p_first, p_school, lower(p_first) || '.' || lower(p_school) || '@bench.test');
  PERFORM bench.reg('profiles', v, p_school);
  INSERT INTO bench.people VALUES (p_school, p_role || CASE WHEN p_first LIKE '%2' THEN '2' ELSE '' END, v);
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION bench.seed_school(s text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  t uuid; y uuid; g uuid; c uuid;
  adm uuid; tch uuid; lb uuid; stu uuid; stu2 uuid;
  a uuid; sub uuid; ses uuid; ct uuid; lm uuid; slot uuid; rc uuid; cat uuid;
  fam uuid; doc uuid; tmp uuid;
BEGIN
  INSERT INTO tenants (name, slug) VALUES ('School ' || s, 'bench-' || lower(s)) RETURNING id INTO t;
  PERFORM bench.reg('tenants', t, s);

  adm  := bench.person(s, t, 'admin',                 'Admin');
  tch  := bench.person(s, t, 'teacher',               'Teacher');
  lb   := bench.person(s, t, 'leerlingenbegeleiding', 'Counsellor');
  stu  := bench.person(s, t, 'student',               'Pupil');
  stu2 := bench.person(s, t, 'student',               'Pupil2');

  INSERT INTO school_years (tenant_id, name, start_date, end_date, is_active)
       VALUES (t, '2026-2027', '2026-09-01', '2027-06-30', true) RETURNING id INTO y;
  PERFORM bench.reg('school_years', y, s);
  INSERT INTO groups (tenant_id, school_year_id, name) VALUES (t, y, 'Groep 1') RETURNING id INTO g;
  PERFORM bench.reg('groups', g, s);
  INSERT INTO classes (tenant_id, school_year_id, group_id, name)
       VALUES (t, y, g, 'Arabisch G1') RETURNING id INTO c;
  PERFORM bench.reg('classes', c, s);

  INSERT INTO class_teachers (class_id, teacher_id) VALUES (c, tch) RETURNING id INTO tmp; PERFORM bench.reg('class_teachers', tmp, s);
  INSERT INTO class_students (class_id, student_id) VALUES (c, stu) RETURNING id INTO tmp; PERFORM bench.reg('class_students', tmp, s);
  INSERT INTO class_students (class_id, student_id) VALUES (c, stu2) RETURNING id INTO tmp; PERFORM bench.reg('class_students', tmp, s);
  INSERT INTO class_sessions (class_id, tenant_id, day_of_week, start_time, end_time) VALUES (c, t, 6, '09:00', '11:00') RETURNING id INTO tmp; PERFORM bench.reg('class_sessions', tmp, s);

  INSERT INTO assignments (class_id, created_by, title, max_score, allow_file_submission, allow_text_submission, is_published)
       VALUES (c, tch, 'Huiswerk 1', 10, true, true, true) RETURNING id INTO a;
  PERFORM bench.reg('assignments', a, s);
  INSERT INTO assignment_students (assignment_id, student_id) VALUES (a, stu) RETURNING id INTO tmp; PERFORM bench.reg('assignment_students', tmp, s);
  INSERT INTO submissions (assignment_id, student_id, status, text_content) VALUES (a, stu, 'submitted', 'mijn werk') RETURNING id INTO sub;
  PERFORM bench.reg('submissions', sub, s);
  INSERT INTO submission_files (submission_id, file_name, file_url) VALUES (sub, 'werk.pdf', 'x/werk.pdf') RETURNING id INTO tmp; PERFORM bench.reg('submission_files', tmp, s);
  INSERT INTO submission_feedback (submission_id, teacher_id, score, comment) VALUES (sub, tch, 8, 'goed') RETURNING id INTO tmp; PERFORM bench.reg('submission_feedback', tmp, s);

  INSERT INTO attendance_sessions (class_id, teacher_id, session_date) VALUES (c, tch, '2026-10-03') RETURNING id INTO ses;
  PERFORM bench.reg('attendance_sessions', ses, s);
  INSERT INTO attendance_records (session_id, student_id, status) VALUES (ses, stu, 'present') RETURNING id INTO tmp; PERFORM bench.reg('attendance_records', tmp, s);

  INSERT INTO class_tests (class_id, title, max_score, created_by) VALUES (c, 'Toets 1', 20, tch) RETURNING id INTO ct;
  PERFORM bench.reg('class_tests', ct, s);
  INSERT INTO test_scores (test_id, student_id, score) VALUES (ct, stu, 15) RETURNING id INTO tmp; PERFORM bench.reg('test_scores', tmp, s);
  INSERT INTO exam_scores (class_id, student_id, semester, score, max_score) VALUES (c, stu, 1, 40, 50) RETURNING id INTO tmp; PERFORM bench.reg('exam_scores', tmp, s);

  INSERT INTO grade_categories (tenant_id, class_id, name, weight, source) VALUES (t, c, 'Mondeling', 20, 'handmatig') RETURNING id INTO cat;
  PERFORM bench.reg('grade_categories', cat, s);
  INSERT INTO category_scores (category_id, student_id, score, max_score) VALUES (cat, stu, 7, 10) RETURNING id INTO tmp; PERFORM bench.reg('category_scores', tmp, s);

  INSERT INTO lesson_modules (class_id, created_by, title) VALUES (c, tch, 'Les 1') RETURNING id INTO lm;
  PERFORM bench.reg('lesson_modules', lm, s);
  INSERT INTO module_documents (module_id, title, file_name, file_url) VALUES (lm, 'Blad', 'blad.pdf', 'x/blad.pdf') RETURNING id INTO tmp; PERFORM bench.reg('module_documents', tmp, s);

  INSERT INTO oudercontact_slots (tenant_id, teacher_id, starts_at, ends_at) VALUES (t, tch, '2026-12-05 10:00+01', '2026-12-05 10:15+01') RETURNING id INTO slot;
  PERFORM bench.reg('oudercontact_slots', slot, s);
  INSERT INTO oudercontact_bookings (slot_id, student_id, booked_by) VALUES (slot, stu, stu) RETURNING id INTO tmp; PERFORM bench.reg('oudercontact_bookings', tmp, s);

  INSERT INTO rapport_cards (tenant_id, student_id, school_year_id, semester) VALUES (t, stu, y, 1) RETURNING id INTO rc;
  PERFORM bench.reg('rapport_cards', rc, s);
  INSERT INTO rapport_lines (rapport_card_id, class_id) VALUES (rc, c) RETURNING id INTO tmp; PERFORM bench.reg('rapport_lines', tmp, s);

  INSERT INTO announcements (tenant_id, created_by, title, content, audience, is_published) VALUES (t, adm, 'Welkom', 'Hallo', 'school', true) RETURNING id INTO tmp; PERFORM bench.reg('announcements', tmp, s);
  INSERT INTO calendar_events (tenant_id, title, starts_on, ends_on) VALUES (t, 'Uitstap', '2026-12-12', '2026-12-12') RETURNING id INTO tmp; PERFORM bench.reg('calendar_events', tmp, s);
  INSERT INTO audit_logs (tenant_id, user_id, action) VALUES (t, adm, 'bench') RETURNING id INTO tmp; PERFORM bench.reg('audit_logs', tmp, s);
  INSERT INTO feedback (tenant_id, user_id, message, type) VALUES (t, tch, 'idee', 'suggestie') RETURNING id INTO tmp; PERFORM bench.reg('feedback', tmp, s);
  INSERT INTO invitations (tenant_id, email, role, invited_by, token) VALUES (t, 'nieuw.' || lower(s) || '@bench.test', 'teacher', adm, 'tok-' || s) RETURNING id INTO tmp; PERFORM bench.reg('invitations', tmp, s);
  INSERT INTO payments (tenant_id, amount, status) VALUES (t, 500, 'paid') RETURNING id INTO tmp; PERFORM bench.reg('payments', tmp, s);

  INSERT INTO families (tenant_id, label) VALUES (t, 'Familie ' || s) RETURNING id INTO fam;
  PERFORM bench.reg('families', fam, s);
  INSERT INTO student_details (student_id, tenant_id, family_id) VALUES (stu, t, fam);
  PERFORM bench.reg('student_details', stu, s, 'student_id');
  INSERT INTO student_notes (tenant_id, student_id, author_id, body, visible_to_student) VALUES (t, stu, tch, 'Goed bezig', true) RETURNING id INTO tmp; PERFORM bench.reg('student_notes', tmp, s);
  INSERT INTO student_notes (tenant_id, student_id, author_id, body, visible_to_student) VALUES (t, stu, lb, 'Intern', false) RETURNING id INTO tmp; PERFORM bench.reg('student_notes', tmp, s);
  INSERT INTO student_documents (tenant_id, student_id, file_name, file_url, uploaded_by, doc_type) VALUES (t, stu, 'contract.pdf', 'x/c.pdf', adm, 'contract') RETURNING id INTO tmp; PERFORM bench.reg('student_documents', tmp, s);
  INSERT INTO student_goals (tenant_id, class_id, student_id) VALUES (t, c, stu) RETURNING id INTO tmp; PERFORM bench.reg('student_goals', tmp, s);
  INSERT INTO student_reports (tenant_id, student_id, class_id, school_year_id, uploaded_by, semester, file_name, file_url) VALUES (t, stu, c, y, adm, 1, 'r.pdf', 'x/r.pdf') RETURNING id INTO tmp; PERFORM bench.reg('student_reports', tmp, s);

  INSERT INTO fee_config (tenant_id, school_year_id) VALUES (t, y) RETURNING id INTO tmp; PERFORM bench.reg('fee_config', tmp, s);
  INSERT INTO fee_payments (tenant_id, school_year_id, fee_type, amount, student_id) VALUES (t, y, 'membership', 50, stu) RETURNING id INTO tmp; PERFORM bench.reg('fee_payments', tmp, s);
  INSERT INTO staff_pay (staff_id, tenant_id, hourly_rate) VALUES (tch, t, 15);
  PERFORM bench.reg('staff_pay', tch, s, 'staff_id');
  INSERT INTO payroll_entries (tenant_id, staff_id, period_month, hours, rate_snapshot, amount) VALUES (t, tch, '2026-10', 8, 15, 120) RETURNING id INTO tmp; PERFORM bench.reg('payroll_entries', tmp, s);

  INSERT INTO tenant_documents (tenant_id, title, file_name, file_url, uploaded_by, doc_type, is_published) VALUES (t, 'Reglement', 'reg.pdf', 'x/reg.pdf', adm, 'reglement', true) RETURNING id INTO doc;
  PERFORM bench.reg('tenant_documents', doc, s);
  INSERT INTO tenant_document_acks (tenant_id, document_id, user_id, version) VALUES (t, doc, stu, 1) RETURNING id INTO tmp; PERFORM bench.reg('tenant_document_acks', tmp, s);
END $$;

-- A super_admin (no tenant), then the two schools.
DO $$
DECLARE v uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v, 'super@bench.test');
  INSERT INTO public.profiles (id, tenant_id, role, first_name, last_name) VALUES (v, NULL, 'super_admin', 'Super', 'Admin');
  INSERT INTO bench.people VALUES ('-', 'super_admin', v);
  PERFORM bench.reg('profiles', v, '-');
END $$;
SELECT bench.seed_school('A');
SELECT bench.seed_school('B');

-- Every public table must have seeded rows, or a test would pass vacuously.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(tablename, ', ') INTO missing FROM pg_tables
   WHERE schemaname = 'public' AND tablename NOT IN (SELECT tbl FROM bench.seeded);
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'seed has no rows for: %', missing; END IF;
END $$;
