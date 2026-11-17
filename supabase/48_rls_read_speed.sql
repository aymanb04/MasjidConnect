-- 48: RLS-leessnelheid. Zelfde rechten, andere vorm.
--
-- AANLEIDING. Na migratie 46 (tenant wall) mat de bench (scripts/rls-bench,
-- ~een volledig schooljaar: 18,5k aanwezigheden, 11k indieningen) dat de
-- BESTAANDE policies al ~0,8-1,8 s kosten voor een admin die alle aanwezigheden
-- leest. Ontleed op 2026-11-14 (Postgres 15, bench, best of 5):
--
--   1. JIT. De policy-bomen zijn zo groot dat de geschatte kost boven
--      jit_above_cost komt; Postgres compileert dan LLVM-code per query. Dat
--      alleen was 1,5 s van de 1,8 s (admin, alle aanwezigheden). Voor korte
--      OLTP-queries levert JIT nooit iets op.
--   2. Per-rij SECURITY DEFINER-aanroepen. Die zijn ondoorzichtig voor de
--      planner (dat was de bedoeling: migratie 33/36, "planning bomb"), maar
--      kosten ~20 us per rij per aanroep. submissions riep er 3-5 per rij aan.
--   3. student_view_own_submissions en super_admin_all_submissions riepen
--      auth.uid() / is_super_admin() ONverpakt aan: opnieuw per rij.
--
-- OPLOSSING.
--   1. jit = off voor de rollen authenticated en anon. PostgREST past de
--      ALTER ROLE ... SET-instellingen van de rol die het aanneemt toe op elk
--      verzoek. service_role / postgres blijven ongemoeid.
--   2. "Welke ouder-ids mag ik zien" wordt EEN keer per query berekend door een
--      SECURITY DEFINER-functie die een verzameling teruggeeft; Postgres maakt
--      daar een hashtabel van ("hashed SubPlan"), daarna is elke rij een lookup.
--      Alleen waar die verzameling klein is: lessen (attendance_sessions) en
--      opdrachten (assignments) van de eigen school, of van de eigen klassen.
--   3. (SELECT ...) eromheen.
--
-- NIET GEDAAN, met reden: submission_feedback en submission_files. Hun ouder is
-- een indiening; de verzameling "alle indieningen van mijn school" is zo groot
-- als de tabel zelf. Gemeten: de puntenlijst van een opdracht werd TRAGER
-- (11 -> 37 ms) en een enkele rij 1 -> 63 ms. Die blijven per rij.
--
-- BETEKENIS ONGEWIJZIGD:
--   tenant_of_x(ouder) = mijn_tenant   <=>   ouder IN (ouders van mijn tenant)
--   am_i_teacher_of_class(assignment_owner_class(a))
--                                     <=>   a IN (opdrachten van klassen die ik geef)
--   NULL-ouder: links NULL = ... -> niet waar; rechts NULL IN (...) -> niet waar.
--   Alle WITH CHECK-expressies (schrijven, per rij, goedkoop) blijven LETTERLIJK
--   zoals in 46/36: alleen USING (lezen/zichtbaarheid) verandert.
-- Bewezen met scripts/rls-bench (census: eigen school identiek met/zonder wall;
-- aanval met USING(true) op elke tabel: 0 lekken) en scripts/rls-smoke.ts.
--
-- Gemeten effect (bench, ms, voor -> na):
--   admin  alle aanwezigheden          1769 ->  13
--   leerkracht aanwezigheden, 1 klas    425 ->  13
--   leerling eigen aanwezigheden        269 ->  11
--   leerkracht puntenlijst: indieningen 281 ->   3
--   admin  alle indieningen             415 ->   3
--   leerling eigen indieningen          488 ->   2
--   (feedback: ~20-50% sneller via JIT/indieningen, verder ongewijzigd)
--
-- Ongedaan maken: 48_rollback.sql.

BEGIN;

-- ── 1. JIT uit voor app-verkeer ──────────────────────────────────────────────
ALTER ROLE authenticated SET jit = off;
ALTER ROLE anon          SET jit = off;

-- ── 2. Verzamel-functies (een keer per query) ────────────────────────────────
-- Alle vier STABLE + SECURITY DEFINER met vaste search_path, net als de
-- tenant_of_*-lookups van 46. get_my_tenant_id() is dezelfde bron als de wall.

CREATE OR REPLACE FUNCTION public.my_tenant_attendance_session_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $fn$
  SELECT s.id FROM attendance_sessions s JOIN classes c ON c.id = s.class_id
   WHERE c.tenant_id = (SELECT public.get_my_tenant_id());
$fn$;

CREATE OR REPLACE FUNCTION public.my_tenant_assignment_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $fn$
  SELECT a.id FROM assignments a JOIN classes c ON c.id = a.class_id
   WHERE c.tenant_id = (SELECT public.get_my_tenant_id());
$fn$;

-- Zelfde definitie als am_i_teacher_of_class(): een rij in class_teachers.
CREATE OR REPLACE FUNCTION public.my_taught_assignment_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $fn$
  SELECT a.id FROM assignments a JOIN class_teachers ct ON ct.class_id = a.class_id
   WHERE ct.teacher_id = (SELECT auth.uid());
$fn$;

DO $grants$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['my_tenant_attendance_session_ids', 'my_tenant_assignment_ids',
                           'my_taught_assignment_ids'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I() FROM public, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I() TO authenticated', f);
  END LOOP;
END
$grants$;

-- ── 3. De wall op de twee grote kindtabellen: USING set-gebaseerd ────────────
-- WITH CHECK is letterlijk die van 46 stap 4.

DROP POLICY IF EXISTS tenant_wall ON public.attendance_records;
CREATE POLICY tenant_wall ON public.attendance_records AS RESTRICTIVE
  FOR ALL TO authenticated
  USING ((SELECT is_super_admin())
         OR session_id IN (SELECT public.my_tenant_attendance_session_ids()))
  WITH CHECK ((tenant_of_attendance_session(session_id) = (SELECT get_my_tenant_id())
               AND tenant_of_profile(student_id) = (SELECT get_my_tenant_id()))
              OR (SELECT is_super_admin()));

DROP POLICY IF EXISTS tenant_wall ON public.submissions;
CREATE POLICY tenant_wall ON public.submissions AS RESTRICTIVE
  FOR ALL TO authenticated
  USING ((SELECT is_super_admin())
         OR assignment_id IN (SELECT public.my_tenant_assignment_ids()))
  WITH CHECK ((tenant_of_assignment(assignment_id) = (SELECT get_my_tenant_id())
               AND tenant_of_profile(student_id) = (SELECT get_my_tenant_id()))
              OR (SELECT is_super_admin()));

-- ── 4. Permissieve leespolicies op submissions ───────────────────────────────

DROP POLICY IF EXISTS teacher_view_submissions ON public.submissions;
CREATE POLICY teacher_view_submissions ON public.submissions
  FOR SELECT TO authenticated
  USING (
    assignment_id IN (SELECT public.my_taught_assignment_ids())
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND assignment_id IN (SELECT public.my_tenant_assignment_ids())
    )
  );

-- Rol blijft "public" (zoals voorheen); alleen de aanroep is verpakt.
DROP POLICY IF EXISTS student_view_own_submissions ON public.submissions;
CREATE POLICY student_view_own_submissions ON public.submissions
  FOR SELECT
  USING (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS super_admin_all_submissions ON public.submissions;
CREATE POLICY super_admin_all_submissions ON public.submissions
  FOR ALL
  USING ((SELECT is_super_admin()));

-- Niet aangeraakt: teacher_update_submissions, staff_insert_submission_for_student,
-- student_insert/update/delete_own_submissions (schrijven = een rij), en alles
-- op submission_feedback / submission_files (zie kop).

-- ── 5. Guard: elke RLS-tabel heeft nog steeds precies een restrictieve wall ──
DO $guard$
DECLARE missing text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO missing
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity
     AND NOT EXISTS (SELECT 1 FROM pg_policy p
                      WHERE p.polrelid = c.oid AND p.polname = 'tenant_wall'
                        AND NOT p.polpermissive);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'tenant_wall missing on: % -- nothing applied.', missing;
  END IF;
END
$guard$;

COMMIT;

-- PostgREST de rolinstellingen opnieuw laten lezen (jit = off):
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

-- ── Nakijken (na COMMIT) ─────────────────────────────────────────────────────
-- 1. SELECT rolname, rolconfig FROM pg_roles WHERE rolname IN ('authenticated','anon');
--    -> beide bevatten jit=off
-- 2. SELECT count(*) FROM pg_policies WHERE schemaname='public'
--       AND policyname='tenant_wall' AND permissive='RESTRICTIVE';   -> 44
-- 3. npx tsx scripts/rls-smoke.ts  -> zelfde PASS-aantal als voorheen (73/0/4)
-- 4. App als demo-leerkracht, -leerling en -admin: aanwezigheden, huiswerk,
--    puntenlijst tonen data.
