-- Undo 48_rls_read_speed.sql: exact de policies van 46 (wall) en 36 / eerder
-- (submissions) terug, de drie verzamel-functies weg, jit terug naar de
-- server-standaard. Rechten waren in 48 al identiek; dit herstelt de vorm.

BEGIN;

ALTER ROLE authenticated RESET jit;
ALTER ROLE anon          RESET jit;

DROP POLICY IF EXISTS tenant_wall ON public.attendance_records;
CREATE POLICY tenant_wall ON public.attendance_records AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (tenant_of_attendance_session(session_id) = (SELECT get_my_tenant_id())
         OR (SELECT is_super_admin()))
  WITH CHECK ((tenant_of_attendance_session(session_id) = (SELECT get_my_tenant_id())
               AND tenant_of_profile(student_id) = (SELECT get_my_tenant_id()))
              OR (SELECT is_super_admin()));

DROP POLICY IF EXISTS tenant_wall ON public.submissions;
CREATE POLICY tenant_wall ON public.submissions AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (tenant_of_assignment(assignment_id) = (SELECT get_my_tenant_id())
         OR (SELECT is_super_admin()))
  WITH CHECK ((tenant_of_assignment(assignment_id) = (SELECT get_my_tenant_id())
               AND tenant_of_profile(student_id) = (SELECT get_my_tenant_id()))
              OR (SELECT is_super_admin()));

DROP POLICY IF EXISTS teacher_view_submissions ON public.submissions;
CREATE POLICY teacher_view_submissions ON public.submissions
  FOR SELECT TO authenticated
  USING (
    am_i_teacher_of_class(public.assignment_owner_class(assignment_id))
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND public.assignment_tenant(assignment_id) = (SELECT get_my_tenant_id())
    )
  );

DROP POLICY IF EXISTS student_view_own_submissions ON public.submissions;
CREATE POLICY student_view_own_submissions ON public.submissions
  FOR SELECT
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS super_admin_all_submissions ON public.submissions;
CREATE POLICY super_admin_all_submissions ON public.submissions
  FOR ALL
  USING (is_super_admin());

DROP FUNCTION IF EXISTS public.my_tenant_attendance_session_ids();
DROP FUNCTION IF EXISTS public.my_tenant_assignment_ids();
DROP FUNCTION IF EXISTS public.my_taught_assignment_ids();

COMMIT;

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
