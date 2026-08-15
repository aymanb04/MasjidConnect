-- Migration 25 — let leerlingenbegeleiding READ attendance (still never write).
--
-- Screening on 2026-08-15 found /aanwezigheid listing every class in the tenant
-- for a counselor while the data behind it was RLS-blocked (0 of 27 records
-- visible), so the page looked functional and returned nothing. Absenteeism is
-- the main signal the role works from, so the read is granted rather than the
-- page hidden.
--
-- SELECT only. Writes stay closed by migration 24, which requires
-- am_i_teacher_of_class() or admin — a counselor is neither, and that was
-- re-verified after this grant.
--
-- Same shape as the counselor_read_* policies in migration 13: role check plus a
-- tenant check reached through classes, since attendance_sessions has no
-- tenant_id of its own. Policies are permissive, so these OR in alongside the
-- existing ones — nothing is dropped, and no column is retyped (see gotcha 12c).

BEGIN;

DROP POLICY IF EXISTS counselor_read_attendance_sessions ON public.attendance_sessions;
CREATE POLICY counselor_read_attendance_sessions ON public.attendance_sessions
  FOR SELECT TO authenticated
  USING (
    (SELECT get_my_role())::text = 'leerlingenbegeleiding'
    AND EXISTS (
      SELECT 1 FROM classes c
       WHERE c.id = attendance_sessions.class_id
         AND c.tenant_id = (SELECT get_my_tenant_id())
    )
  );

DROP POLICY IF EXISTS counselor_read_attendance_records ON public.attendance_records;
CREATE POLICY counselor_read_attendance_records ON public.attendance_records
  FOR SELECT TO authenticated
  USING (
    (SELECT get_my_role())::text = 'leerlingenbegeleiding'
    AND EXISTS (
      SELECT 1
        FROM attendance_sessions s
        JOIN classes c ON c.id = s.class_id
       WHERE s.id = attendance_records.session_id
         AND c.tenant_id = (SELECT get_my_tenant_id())
    )
  );

COMMIT;

SELECT tablename, policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('attendance_sessions', 'attendance_records')
 ORDER BY tablename, policyname;
