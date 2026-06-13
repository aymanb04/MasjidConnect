-- ============================================================
-- Migration 18 — Oudercontact (parent-teacher) time slots
-- Source: mosque feedback 2026-06-09 (FEEDBACK_BUILD_PLAN §H)
-- ============================================================
--
-- Teachers/admins publish slots; a slot is booked by the student account
-- (on the parent's behalf) or by an admin. No parent login exists.
--
-- Capacity is enforced client-side (mirrors the attendance approach);
-- the UNIQUE(slot_id, student_id) constraint at least blocks a student
-- double-booking the same slot.
--
-- Idempotent. RUN IN: Supabase SQL editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.oudercontact_slots (
  id         uuid NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id  uuid NOT NULL,
  teacher_id uuid NOT NULL,
  class_id   uuid,                 -- optional context
  starts_at  timestamp with time zone NOT NULL,
  ends_at    timestamp with time zone NOT NULL,
  capacity   integer NOT NULL DEFAULT 1 CHECK (capacity > 0),
  note       text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT oudercontact_slots_pkey PRIMARY KEY (id),
  CONSTRAINT oudercontact_slots_time_check CHECK (ends_at > starts_at),
  CONSTRAINT oudercontact_slots_tenant_id_fkey  FOREIGN KEY (tenant_id)  REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT oudercontact_slots_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT oudercontact_slots_class_id_fkey   FOREIGN KEY (class_id)   REFERENCES public.classes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.oudercontact_bookings (
  id         uuid NOT NULL DEFAULT uuid_generate_v4(),
  slot_id    uuid NOT NULL,
  student_id uuid NOT NULL,
  booked_by  uuid NOT NULL,
  note       text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT oudercontact_bookings_pkey PRIMARY KEY (id),
  CONSTRAINT oudercontact_bookings_slot_student_key UNIQUE (slot_id, student_id),
  CONSTRAINT oudercontact_bookings_slot_id_fkey    FOREIGN KEY (slot_id)    REFERENCES public.oudercontact_slots(id) ON DELETE CASCADE,
  CONSTRAINT oudercontact_bookings_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT oudercontact_bookings_booked_by_fkey  FOREIGN KEY (booked_by)  REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_oudercontact_slots_tenant     ON public.oudercontact_slots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_oudercontact_slots_teacher    ON public.oudercontact_slots(teacher_id);
CREATE INDEX IF NOT EXISTS idx_oudercontact_bookings_slot    ON public.oudercontact_bookings(slot_id);
CREATE INDEX IF NOT EXISTS idx_oudercontact_bookings_student ON public.oudercontact_bookings(student_id);

ALTER TABLE public.oudercontact_slots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oudercontact_bookings ENABLE ROW LEVEL SECURITY;

-- ---- RLS: slots --------------------------------------------
-- Everyone in the tenant can read slots (students need them to book).

DROP POLICY IF EXISTS tenant_read_oudercontact_slots ON public.oudercontact_slots;
CREATE POLICY tenant_read_oudercontact_slots ON public.oudercontact_slots
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT get_my_tenant_id()) OR (SELECT is_super_admin()));

DROP POLICY IF EXISTS teacher_manage_own_slots ON public.oudercontact_slots;
CREATE POLICY teacher_manage_own_slots ON public.oudercontact_slots
  FOR ALL TO authenticated
  USING (teacher_id = (SELECT auth.uid()) AND tenant_id = (SELECT get_my_tenant_id()))
  WITH CHECK (teacher_id = (SELECT auth.uid()) AND tenant_id = (SELECT get_my_tenant_id()));

DROP POLICY IF EXISTS admin_manage_oudercontact_slots ON public.oudercontact_slots;
CREATE POLICY admin_manage_oudercontact_slots ON public.oudercontact_slots
  FOR ALL TO authenticated
  USING (
    (SELECT is_super_admin())
    OR ((SELECT get_my_role())::text = 'admin' AND tenant_id = (SELECT get_my_tenant_id()))
  )
  WITH CHECK (
    (SELECT is_super_admin())
    OR ((SELECT get_my_role())::text = 'admin' AND tenant_id = (SELECT get_my_tenant_id()))
  );

-- ---- RLS: bookings -----------------------------------------
-- Student manages own booking; admin manages tenant bookings; the slot's
-- teacher can read bookings on their slots. tenant resolved via the slot.

DROP POLICY IF EXISTS student_manage_own_booking ON public.oudercontact_bookings;
CREATE POLICY student_manage_own_booking ON public.oudercontact_bookings
  FOR ALL TO authenticated
  USING (student_id = (SELECT auth.uid()))
  WITH CHECK (
    student_id = (SELECT auth.uid())
    AND booked_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM oudercontact_slots s
      WHERE s.id = oudercontact_bookings.slot_id
        AND s.tenant_id = (SELECT get_my_tenant_id())
    )
  );

DROP POLICY IF EXISTS teacher_read_slot_bookings ON public.oudercontact_bookings;
CREATE POLICY teacher_read_slot_bookings ON public.oudercontact_bookings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM oudercontact_slots s
      WHERE s.id = oudercontact_bookings.slot_id
        AND s.teacher_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS admin_manage_bookings ON public.oudercontact_bookings;
CREATE POLICY admin_manage_bookings ON public.oudercontact_bookings
  FOR ALL TO authenticated
  USING (
    (SELECT is_super_admin())
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND EXISTS (
        SELECT 1 FROM oudercontact_slots s
        WHERE s.id = oudercontact_bookings.slot_id
          AND s.tenant_id = (SELECT get_my_tenant_id())
      )
    )
  )
  WITH CHECK (
    (SELECT is_super_admin())
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND EXISTS (
        SELECT 1 FROM oudercontact_slots s
        WHERE s.id = oudercontact_bookings.slot_id
          AND s.tenant_id = (SELECT get_my_tenant_id())
      )
    )
  );

-- ============================================================
-- VERIFICATION
-- ============================================================
-- select tablename, policyname, cmd from pg_policies
--   where tablename in ('oudercontact_slots','oudercontact_bookings');
