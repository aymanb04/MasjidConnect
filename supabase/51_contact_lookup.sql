-- 51: get_profile_contacts(ids), one role-checked way to read e-mail + phone.
--
-- The app reads contact details through this function instead of selecting
-- profiles.email / profiles.phone itself (lib/profile-contacts.ts). It returns,
-- for the ids asked:
--   own row                         -> e-mail + phone
--   super_admin                     -> everyone
--   admin, leerlingenbegeleiding    -> everyone in their school
--   teacher                         -> staff of their school + their own pupils
--   student                         -> e-mail (no phone) of the teachers of their
--                                      own classes (the class page's mail button)
-- Anyone else, or anyone outside the school: no row at all. Inactive/erased
-- callers get only their own row: the school branch needs get_my_tenant_id(),
-- which is NULL for them since migration 50.
--
-- Adds a function, changes nothing that exists. Safe to apply before the app
-- that calls it is deployed.
-- Idempotent. RUN IN: Supabase SQL editor (one script = one transaction).
-- Undo: 51_rollback.sql (only after the app no longer calls it).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_profile_contacts(p_ids uuid[])
RETURNS TABLE (id uuid, email text, phone text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH me AS (
    SELECT (SELECT auth.uid())                AS uid,
           public.get_my_tenant_id()          AS tid,
           public.is_super_admin()            AS su,
           (SELECT r.role::text FROM public.profiles r WHERE r.id = (SELECT auth.uid())) AS role
  )
  SELECT p.id,
         p.email::text,
         CASE WHEN p.id = me.uid OR me.su OR me.role <> 'student' THEN p.phone::text END
    FROM public.profiles p, me
   WHERE p.id = ANY (p_ids)
     AND me.uid IS NOT NULL
     AND (
          p.id = me.uid
       OR me.su
       OR (me.tid IS NOT NULL AND p.tenant_id = me.tid AND (
              me.role IN ('admin', 'leerlingenbegeleiding')
           OR (me.role = 'teacher' AND (
                  p.role <> 'student'
               OR EXISTS (SELECT 1 FROM public.class_students cs
                            JOIN public.class_teachers ct ON ct.class_id = cs.class_id
                           WHERE cs.student_id = p.id AND ct.teacher_id = me.uid)))
           OR (me.role = 'student' AND EXISTS (
                  SELECT 1 FROM public.class_teachers ct
                    JOIN public.class_students cs ON cs.class_id = ct.class_id
                   WHERE ct.teacher_id = p.id AND cs.student_id = me.uid))
          ))
     );
$$;

REVOKE ALL ON FUNCTION public.get_profile_contacts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_contacts(uuid[]) TO authenticated;

COMMIT;

-- Verify (expect fn = true, anon_fn = false):
--   SELECT has_function_privilege('authenticated', 'public.get_profile_contacts(uuid[])', 'EXECUTE') AS fn,
--          has_function_privilege('anon', 'public.get_profile_contacts(uuid[])', 'EXECUTE') AS anon_fn;
