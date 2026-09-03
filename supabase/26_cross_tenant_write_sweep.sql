-- ============================================================
-- Migration 26 — cross-tenant sweep: the policies migration 24's
-- lesson pointed at but nev    er swept.
--
-- ⚠️ APPLY TO PROD BEFORE COMMITTING (PROJECT.md §9): this file describes live
-- vulnerabilities, and the repo is public.
--
-- Found 2026-08-26 during a full launch-readiness audit. Migration 24 closed a
-- cross-tenant WRITE hole on attendance and recorded the lesson:
--
--     "check WITH CHECK separately from USING ... this survived because nobody
--      wrote a cross-tenant *write* test."
--
-- That diagnosis was right, but the sweep it implies was never run against the
-- rest of the schema. This migration is that sweep. Every finding below is the
-- same shape: an over-broad branch OR'd into a policy, or a FOR ALL policy with
-- no explicit WITH CHECK (Postgres then reuses USING as the check).
--
-- Why they were harmless until now: at the time of the audit ALL content lived
-- in the demo tenant — the real De Kroon tenant had 0 announcements, 0 module
-- documents and 0 report cards. These are prospective holes that arm themselves
-- the moment a real mosque starts using the app. There are also still no
-- database backups (SECURITY_AND_INFRA §1), so every DELETE below is
-- unrecoverable.
--
-- Idempotent: DROP IF EXISTS + CREATE throughout. RUN IN: Supabase SQL editor.
-- After applying: re-run `npx tsx scripts/rls-smoke.ts` and sync
-- supabase/schema.sql.
-- ============================================================


-- ============================================================
-- 1. H-1 — announcements_delete had NO tenant predicate
-- ============================================================
-- 7b:407. The admin branch was effectively USING (true):
--
--     created_by = auth.uid()
--     OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','super_admin')
--
-- RLS DELETE does not require SELECT visibility, so an admin of mosque A could
-- run an unqualified `delete from announcements` and wipe EVERY other mosque's
-- announcements. Policies are permissive and OR-combine, so the correctly
-- scoped admin_manage_announcements did not save it.
--
-- It was missed because it inlines a subquery on profiles.role instead of
-- calling get_my_role() — exactly the trap migration 23 documents.

DROP POLICY IF EXISTS "announcements_delete" ON public.announcements;
CREATE POLICY "announcements_delete" ON public.announcements
  FOR DELETE TO authenticated
  USING (
    (SELECT is_super_admin())
    OR (
      tenant_id = (SELECT get_my_tenant_id())
      AND (
        created_by = (SELECT auth.uid())
        OR (SELECT get_my_role())::text = 'admin'
      )
    )
  );


-- ============================================================
-- 2. H-2 — module_documents: cross-tenant read AND write
-- ============================================================
-- 7b:691. FOR ALL with no WITH CHECK (so USING is reused as the check) and an
-- unscoped `OR get_my_role() IN ('admin','super_admin')` branch. Any admin of
-- any tenant got SELECT/INSERT/UPDATE/DELETE on every module_documents row in
-- the database.
--
-- Migration 12 fixed this exact shape on submission_files and fixed the
-- module_docs_* STORAGE policies — but the module_documents TABLE policy was
-- never revisited. The bytes were safe (module_docs_select is tenant-scoped);
-- the metadata (titles, filenames, storage paths) and the DELETE were not.
--
-- Fix: teacher branch keeps its own-class scope; the admin branch moves out to
-- the already-correct tenant-scoped admin_manage_docs (7b:703), and super_admin
-- gets its own policy — module_documents had none, which is *why* the bare
-- role branch was there in the first place.

DROP POLICY IF EXISTS "teacher_manage_docs" ON public.module_documents;
CREATE POLICY "teacher_manage_docs" ON public.module_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lesson_modules lm
      JOIN public.class_teachers ct ON ct.class_id = lm.class_id
      WHERE lm.id = module_documents.module_id
        AND ct.teacher_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lesson_modules lm
      JOIN public.class_teachers ct ON ct.class_id = lm.class_id
      WHERE lm.id = module_documents.module_id
        AND ct.teacher_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "super_admin_all_module_documents" ON public.module_documents;
CREATE POLICY "super_admin_all_module_documents" ON public.module_documents
  FOR ALL TO authenticated
  USING ((SELECT is_super_admin()))
  WITH CHECK ((SELECT is_super_admin()));


-- ============================================================
-- 3. M-4 — submission_files.file_url was attacker-writable
-- ============================================================
-- 7b:584. student_manage_own_files is FOR ALL with a USING that constrains only
-- WHICH SUBMISSION the row hangs off — file_url itself was unconstrained.
--
-- Why that matters: the storage policies (mig 12) resolve authorisation by
-- joining `submission_files.file_url = storage.objects.name`. So a student could
-- insert a row against their OWN submission while pointing file_url at ANY
-- object path in the bucket, including another tenant's — and their own teacher
-- then satisfied submission_files_select for that path and could download a
-- foreign student's file. The tenant scoping in mig 12 is sound in isolation but
-- was subverted because the join key was writable.
--
-- Fix: pin the first path segment to the caller's uid, mirroring the storage
-- policy submission_files_insert. Submission path is {user_id}/{assignment_id}/...

DROP POLICY IF EXISTS "student_manage_own_files" ON public.submission_files;
CREATE POLICY "student_manage_own_files" ON public.submission_files
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.submissions
      WHERE submissions.id = submission_files.submission_id
        AND submissions.student_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.submissions
      WHERE submissions.id = submission_files.submission_id
        AND submissions.student_id = (SELECT auth.uid())
    )
    AND (storage.foldername(file_url))[1] = (SELECT auth.uid())::text
  );


-- ============================================================
-- 4. M-5 — report cards: staff scoping stopped at the tenant
-- ============================================================
-- 12:174-237. Report path is {tenant_id}/{student_id}/{class_id}_s{semester}.{ext}
-- but the four reports_staff_* policies only checked foldername[1] (the tenant)
-- plus role IN ('teacher','admin'). foldername[2] — the student — was never
-- checked for staff, so ANY teacher could enumerate, overwrite and DELETE every
-- minor's report card in the mosque, including students they don't teach.
--
-- The corresponding TABLE policy (teacher_manage_class_reports, 8b:34) IS
-- correctly class-scoped: the storage layer was strictly weaker than the table
-- layer guarding the same documents. Migration 12 was a real improvement over
-- the unscoped 9f75t9_* policies it replaced — it just stopped one folder short.
--
-- ⚠️ Inside EXISTS subqueries the path MUST be spelled storage.objects.name, not
-- the bare `name` (mig 12 note). The bare form silently never matches.
--
-- The uuid cast is guarded by a shape test so a malformed path filters the row
-- out instead of raising 22P02 and erroring the whole listing.

DROP POLICY IF EXISTS reports_staff_select ON storage.objects;
CREATE POLICY reports_staff_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'student-reports'
    AND (
      (SELECT is_super_admin())
      OR (
        (storage.foldername(storage.objects.name))[1] = (SELECT get_my_tenant_id())::text
        AND (
          (SELECT get_my_role())::text = 'admin'
          OR (
            (SELECT get_my_role())::text = 'teacher'
            AND (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND EXISTS (
              SELECT 1 FROM public.class_students cs
              JOIN public.class_teachers ct ON ct.class_id = cs.class_id
              WHERE cs.student_id = ((storage.foldername(storage.objects.name))[2])::uuid
                AND ct.teacher_id = (SELECT auth.uid())
            )
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS reports_staff_insert ON storage.objects;
CREATE POLICY reports_staff_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'student-reports'
    AND (
      (SELECT is_super_admin())
      OR (
        (storage.foldername(storage.objects.name))[1] = (SELECT get_my_tenant_id())::text
        AND (
          (SELECT get_my_role())::text = 'admin'
          OR (
            (SELECT get_my_role())::text = 'teacher'
            AND (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND EXISTS (
              SELECT 1 FROM public.class_students cs
              JOIN public.class_teachers ct ON ct.class_id = cs.class_id
              WHERE cs.student_id = ((storage.foldername(storage.objects.name))[2])::uuid
                AND ct.teacher_id = (SELECT auth.uid())
            )
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS reports_staff_update ON storage.objects;
CREATE POLICY reports_staff_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'student-reports'
    AND (
      (SELECT is_super_admin())
      OR (
        (storage.foldername(storage.objects.name))[1] = (SELECT get_my_tenant_id())::text
        AND (
          (SELECT get_my_role())::text = 'admin'
          OR (
            (SELECT get_my_role())::text = 'teacher'
            AND (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND EXISTS (
              SELECT 1 FROM public.class_students cs
              JOIN public.class_teachers ct ON ct.class_id = cs.class_id
              WHERE cs.student_id = ((storage.foldername(storage.objects.name))[2])::uuid
                AND ct.teacher_id = (SELECT auth.uid())
            )
          )
        )
      )
    )
  )
  WITH CHECK (
    bucket_id = 'student-reports'
    AND (
      (SELECT is_super_admin())
      OR (
        (storage.foldername(storage.objects.name))[1] = (SELECT get_my_tenant_id())::text
        AND (
          (SELECT get_my_role())::text = 'admin'
          OR (
            (SELECT get_my_role())::text = 'teacher'
            AND (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND EXISTS (
              SELECT 1 FROM public.class_students cs
              JOIN public.class_teachers ct ON ct.class_id = cs.class_id
              WHERE cs.student_id = ((storage.foldername(storage.objects.name))[2])::uuid
                AND ct.teacher_id = (SELECT auth.uid())
            )
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS reports_staff_delete ON storage.objects;
CREATE POLICY reports_staff_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'student-reports'
    AND (
      (SELECT is_super_admin())
      OR (
        (storage.foldername(storage.objects.name))[1] = (SELECT get_my_tenant_id())::text
        AND (SELECT get_my_role())::text = 'admin'
      )
    )
  );
-- NOTE: DELETE is deliberately admin-only. Teachers generate and overwrite their
-- own students' reports; destroying a report card is an admin action, and this
-- mirrors rapport_cards_delete (mig 19), which is already admin-only.


-- ============================================================
-- 5. M-3 — anyone could publish oudercontact slots
-- ============================================================
-- 18:63. teacher_manage_own_slots asked only "is the teacher_id you supplied
-- your own id?" — no role check, no link between the actor and a class. This is
-- verbatim the flaw migration 24 diagnosed on attendance. Tenant-bounded, so not
-- cross-tenant, but any STUDENT could create fake parent-teacher slots that
-- every member of the mosque sees via tenant_read_oudercontact_slots.

DROP POLICY IF EXISTS teacher_manage_own_slots ON public.oudercontact_slots;
CREATE POLICY teacher_manage_own_slots ON public.oudercontact_slots
  FOR ALL TO authenticated
  USING (
    teacher_id = (SELECT auth.uid())
    AND tenant_id = (SELECT get_my_tenant_id())
    AND (SELECT get_my_role())::text = 'teacher'
  )
  WITH CHECK (
    teacher_id = (SELECT auth.uid())
    AND tenant_id = (SELECT get_my_tenant_id())
    AND (SELECT get_my_role())::text = 'teacher'
  );


-- ============================================================
-- 6. M-7 — writes validated the DECLARED tenant, not the subject's
-- ============================================================
-- staff_write_student_details (14:148) and rapport_cards_insert (19:62) gate on
-- the tenant_id COLUMN SUPPLIED BY THE CLIENT, without confirming that
-- student_id actually belongs to that tenant.
--
-- student_details' PK is student_id, so an admin of tenant A could insert a row
-- keyed on tenant B's student and permanently SQUAT the primary key — tenant B
-- can then never create that student's dossier. Same unique-constraint DoS that
-- migration 24 describes for attendance_sessions. They cannot READ B's data this
-- way (the UPDATE USING still requires the stored tenant_id to match), but they
-- can write records ABOUT a foreign minor.
--
-- 15_payments.sql:150 already does this correctly for fee_payments; this brings
-- the dossier and rapport writes in line.

DROP POLICY IF EXISTS staff_write_student_details ON public.student_details;
CREATE POLICY staff_write_student_details ON public.student_details
  FOR ALL TO authenticated
  USING (
    (SELECT is_super_admin())
    OR (
      tenant_id = (SELECT get_my_tenant_id())
      AND (
        (SELECT get_my_role())::text = 'admin'
        OR EXISTS (
          SELECT 1 FROM public.class_students cs
          JOIN public.class_teachers ct ON ct.class_id = cs.class_id
          WHERE cs.student_id = student_details.student_id
            AND ct.teacher_id = (SELECT auth.uid())
        )
      )
    )
  )
  WITH CHECK (
    (SELECT is_super_admin())
    OR (
      tenant_id = (SELECT get_my_tenant_id())
      -- NEW: the subject must really live in my tenant, not merely be claimed to.
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = student_details.student_id
          AND p.tenant_id = (SELECT get_my_tenant_id())
      )
      AND (
        (SELECT get_my_role())::text = 'admin'
        OR EXISTS (
          SELECT 1 FROM public.class_students cs
          JOIN public.class_teachers ct ON ct.class_id = cs.class_id
          WHERE cs.student_id = student_details.student_id
            AND ct.teacher_id = (SELECT auth.uid())
        )
      )
    )
  );

DROP POLICY IF EXISTS rapport_cards_insert ON public.rapport_cards;
CREATE POLICY rapport_cards_insert ON public.rapport_cards
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT get_my_tenant_id())
    AND (SELECT get_my_role())::text IN ('admin', 'teacher')
    AND status = 'draft'
    -- NEW: the card's subject must really live in my tenant.
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = rapport_cards.student_id
        AND p.tenant_id = (SELECT get_my_tenant_id())
    )
  );


-- ============================================================
-- 7. M-2 — update_own_profile did not pin is_active / is_anonymized
-- ============================================================
-- 7b:124 pins role and tenant_id (correct), but nothing constrained is_active or
-- is_anonymized. Today the whole policy is dead code: its WITH CHECK sub-selects
-- profiles from inside a profiles policy, which recurses (42P17) — which is why
-- /api/terms/accept exists at all (SECURITY_AND_INFRA §2.7).
--
-- So escalation is currently blocked by an ERROR, not by a check. THE TRAP:
-- whoever repairs the recursion by swapping in the SECURITY DEFINER helpers
-- re-enables this policy, and at that moment the missing pins go live — a user
-- could un-archive themselves or clear their own GDPR is_anonymized tombstone
-- (schema.sql:181 relies on that flag to block reactivation of erased users).
--
-- This migration disarms the trap NOW by fixing both at once: the recursion is
-- resolved with get_my_role()/get_my_tenant_id() (SECURITY DEFINER, so no
-- recursion), and all four columns are pinned.
--
-- ⚠️ This makes the policy LIVE for the first time. /api/terms/accept keeps
-- working unchanged (service role bypasses RLS entirely); it is now belt AND
-- braces rather than the only route.

DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
CREATE POLICY "update_own_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (
    id = (SELECT auth.uid())
    AND (role)::text  = (SELECT get_my_role())::text
    AND tenant_id     IS NOT DISTINCT FROM (SELECT get_my_tenant_id())
    AND is_active     = true
    AND is_anonymized = false
  );
-- is_active = true / is_anonymized = false rather than "unchanged": an archived
-- or erased user is banned in GoTrue and has no session, so the only row this
-- policy can ever legitimately write is an active, non-erased one. Writing the
-- literal is both simpler and stricter than comparing against the stored value.


-- ============================================================
-- 8. M-1 — SECURITY DEFINER helpers: search_path + EXECUTE grants
-- ============================================================
-- The six helpers (7b:43-100) and both trigger functions (schema.sql:89-126) are
-- SECURITY DEFINER with no SET search_path. This is Supabase's
-- `function_search_path_mutable` advisor finding and the standard Postgres
-- privesc vector. EVERY RLS policy in this schema pivots on get_my_role(),
-- get_my_tenant_id() and is_super_admin(), so this is the widest blast radius in
-- the system.
--
-- Straight about exploitability: NOT currently exploitable — Supabase revokes
-- CREATE ON SCHEMA public from authenticated/anon, so there is nothing to shadow
-- `profiles` with. This is hardening on the highest-value target, not a patch.
--
-- Second half, which the existing docs do NOT cover: Postgres grants EXECUTE to
-- PUBLIC on new functions by default and no file ever revoked it. These live in
-- the PostgREST-exposed `public` schema, so `anon` can call
-- /rest/v1/rpc/is_super_admin with nothing but the publishable anon key. They
-- return NULL/false for an anonymous caller so there is no direct leak, but it
-- hands an unauthenticated caller a SECURITY DEFINER entry point into the very
-- functions that lack search_path hardening. 20_dashboard_rpc.sql:96 already
-- proves the REVOKE/GRANT pattern is known here — the helpers just never got it.
--
-- SET search_path = public (matching mig 20) also excludes pg_temp from the
-- path, so a temp table cannot shadow `profiles` either.

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS character varying
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.am_i_student_of_class(cid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_students
    WHERE class_id = cid AND student_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.am_i_teacher_of_class(cid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_teachers
    WHERE class_id = cid AND teacher_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.am_i_member_of_group(gid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes c
    JOIN public.class_teachers ct ON ct.class_id = c.id AND ct.teacher_id = (SELECT auth.uid())
    WHERE c.group_id = gid
    UNION
    SELECT 1 FROM public.classes c
    JOIN public.class_students cs ON cs.class_id = c.id AND cs.student_id = (SELECT auth.uid())
    WHERE c.group_id = gid
  );
$$;

-- RLS policy expressions are evaluated as the CALLING role, so `authenticated`
-- must keep EXECUTE or every policy that calls a helper starts failing.
-- anon/PUBLIC lose it: nothing anonymous has any business calling these.
REVOKE ALL ON FUNCTION public.get_my_role()                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_tenant_id()           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_super_admin()             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.am_i_student_of_class(uuid)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.am_i_teacher_of_class(uuid)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.am_i_member_of_group(uuid)   FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_role()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_id()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.am_i_student_of_class(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.am_i_teacher_of_class(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.am_i_member_of_group(uuid)  TO authenticated;


-- ============================================================
-- 9. H-3 — handle_new_user trusted client-supplied role
-- ============================================================
-- schema.sql:89 copies `role` straight out of raw_user_meta_data, which is fully
-- controlled by the caller of auth.signUp(). Note the asymmetry that made this
-- reachable: invitations_role_check (13:20) EXCLUDES super_admin, but
-- profiles_role_check (13:16) INCLUDES it — so {"role":"super_admin"} passed the
-- constraint and the trigger wrote it.
--
-- Closed today ONLY by the dashboard toggle "Enable email signups"
-- (verified 2026-08-26: "disable_signup": true). That is a setting no migration
-- records and no test asserts: a project restore, a migration to a new project,
-- or one accidental toggle re-opens self-service super_admin registration, which
-- reads every tenant's dossiers.
--
-- Fix: the trigger now refuses to mint privileged roles from metadata. Invited
-- users are unaffected — /api/invite creates them with the service role and
-- validates against VALID_ROLES first (invite/route.ts:11), and admin/teacher/
-- student/leerlingenbegeleiding all still flow through. Only 'super_admin' is
-- rejected, and it degrades to 'student' (least privilege) rather than raising,
-- so a legitimate invite can never be broken by this guard.
--
-- super_admin is created by hand in the Supabase dashboard, not by signup.
-- No REVOKE is needed on the trigger functions: Postgres refuses to call a
-- trigger function as an RPC, so they are not reachable through PostgREST. They
-- get SET search_path for the same shadowing reason as the helpers above.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID := NULL;
  v_role      TEXT;
BEGIN
  IF (NEW.raw_user_meta_data->>'tenant_id') IS NOT NULL
     AND (NEW.raw_user_meta_data->>'tenant_id') != '' THEN
    v_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::UUID;
  END IF;

  -- Whitelist. Anything unknown or privileged degrades to 'student'.
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'student');
  IF v_role NOT IN ('student', 'teacher', 'admin', 'leerlingenbegeleiding') THEN
    v_role := 'student';
  END IF;

  INSERT INTO public.profiles (id, first_name, last_name, role, tenant_id, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    v_role,
    v_tenant_id,
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_user_deleted()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.class_students WHERE student_id = OLD.id;
  DELETE FROM public.class_teachers WHERE teacher_id = OLD.id;
  DELETE FROM public.invitations   WHERE invited_by = OLD.id;
  RETURN OLD;
END;
$$;


-- ============================================================
-- VERIFICATION
-- ============================================================
-- 1) Every admin/staff branch now carries a tenant predicate:
--    select tablename, policyname, cmd, qual, with_check
--      from pg_policies
--     where tablename in ('announcements','module_documents','submission_files',
--                         'profiles','oudercontact_slots','student_details',
--                         'rapport_cards')
--     order by tablename, policyname;
--
-- 2) Storage policies:
--    select policyname, cmd, qual, with_check from pg_policies
--     where schemaname='storage' and policyname like 'reports_staff_%';
--
-- 3) search_path is pinned and PUBLIC/anon cannot execute:
--    select p.proname, p.proconfig, p.prosecdef
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname='public'
--       and p.proname in ('get_my_role','get_my_tenant_id','is_super_admin',
--                         'am_i_student_of_class','am_i_teacher_of_class',
--                         'am_i_member_of_group','handle_new_user',
--                         'handle_user_deleted');
--    -- proconfig must read {search_path=public} for all eight.
--
--    select proname, proacl from pg_proc
--     where proname in ('get_my_role','get_my_tenant_id','is_super_admin');
--    -- proacl must NOT contain "=X/" (the PUBLIC grant) and MUST contain
--    -- "authenticated=X/".
--
-- 4) The trigger no longer honours a privileged metadata role:
--    select prosrc from pg_proc where proname = 'handle_new_user';
--
-- 5) Then: npx tsx scripts/rls-smoke.ts
