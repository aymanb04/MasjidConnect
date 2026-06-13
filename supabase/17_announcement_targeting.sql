-- ============================================================
-- Migration 17 — Announcement audience targeting
-- Source: mosque feedback 2026-06-09 (FEEDBACK_BUILD_PLAN §G)
-- ============================================================
--
-- Adds two new targeting dimensions on top of school-wide / per-class:
--   * whole group (group_id → all classes of an age group)
--   * staff-only ("teachers"): visible to teacher/admin/leerlingenbegeleiding
--
-- `audience` is the source of truth for who sees a row:
--   'school'   → everyone in the tenant
--   'class'    → members of class_id
--   'group'    → members/teachers of any class in group_id
--   'teachers' → staff only (no students)
--
-- ⚠️ The three existing OR-combining read policies all treated
-- `class_id IS NULL` as "visible to everyone", which would leak a
-- staff-only (null class) announcement to students. They are dropped and
-- replaced by a single audience-aware policy below.
--
-- Idempotent. RUN IN: Supabase SQL editor.
-- ============================================================

-- ---- Columns + backfill ------------------------------------

ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS group_id uuid;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS audience text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'announcements_group_id_fkey'
  ) THEN
    ALTER TABLE public.announcements
      ADD CONSTRAINT announcements_group_id_fkey
      FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Backfill existing rows: class set → 'class', otherwise 'school'
UPDATE public.announcements SET audience = 'class'  WHERE audience IS NULL AND class_id IS NOT NULL;
UPDATE public.announcements SET audience = 'school' WHERE audience IS NULL;

ALTER TABLE public.announcements ALTER COLUMN audience SET DEFAULT 'school';
ALTER TABLE public.announcements ALTER COLUMN audience SET NOT NULL;

ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_audience_check;
ALTER TABLE public.announcements ADD CONSTRAINT announcements_audience_check
  CHECK (audience IN ('school', 'class', 'group', 'teachers'));

CREATE INDEX IF NOT EXISTS idx_announcements_group_id ON public.announcements(group_id);

-- ---- Read policy (single, audience-aware) ------------------

DROP POLICY IF EXISTS announcements_read         ON public.announcements;
DROP POLICY IF EXISTS student_read_announcements ON public.announcements;
DROP POLICY IF EXISTS teacher_read_announcements ON public.announcements;

CREATE POLICY announcements_read ON public.announcements
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT get_my_tenant_id())
    AND (
      -- admins / super_admin see everything in their tenant
      (SELECT get_my_role())::text = ANY (ARRAY['admin', 'super_admin'])

      -- school-wide
      OR audience = 'school'

      -- staff-only
      OR (audience = 'teachers'
          AND (SELECT get_my_role())::text = ANY (ARRAY['teacher', 'leerlingenbegeleiding']))

      -- class-targeted: enrolled in or teaching that class
      OR (audience = 'class' AND class_id IN (
            SELECT cs.class_id FROM class_students cs WHERE cs.student_id = (SELECT auth.uid())
            UNION
            SELECT ct.class_id FROM class_teachers ct WHERE ct.teacher_id = (SELECT auth.uid())
          ))

      -- group-targeted: member of, or teacher of, any class in that group
      OR (audience = 'group' AND group_id IN (
            SELECT c.group_id FROM classes c
            JOIN class_students cs ON cs.class_id = c.id
            WHERE cs.student_id = (SELECT auth.uid()) AND c.group_id IS NOT NULL
            UNION
            SELECT c.group_id FROM classes c
            JOIN class_teachers ct ON ct.class_id = c.id
            WHERE ct.teacher_id = (SELECT auth.uid()) AND c.group_id IS NOT NULL
          ))
    )
  );

-- INSERT/DELETE policies unchanged: admins already may insert any audience
-- (announcements_insert checks role + tenant + created_by, not class_id);
-- teachers remain class-only via teacher_post_announcements.

-- ============================================================
-- VERIFICATION
-- ============================================================
-- select audience, count(*) from announcements group by audience;
-- As a student: a 'teachers' announcement must NOT appear.
-- As a group member: a 'group' announcement for their group must appear.
