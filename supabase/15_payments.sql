-- ============================================================
-- Migration 15 — Student fees + teacher payroll (admin-only)
-- Source: mosque feedback 2026-06-09 (FEEDBACK_BUILD_PLAN §C)
-- Requires: migration 14 (families)
-- ============================================================
--
-- NOTE: the existing `payments` table is for tenant→MasjidConnect
-- subscription payments (Stripe) and is NOT touched here. Student fees
-- live in `fee_payments`.
--
-- Fee model:
--   membership — per student, yearly
--   chart      — per family, yearly (one sibling pays → family covered)
--
-- Access: admin + super_admin ONLY, tenant-scoped. Explicitly NO teacher,
-- student or leerlingenbegeleiding access (counselor restriction from the
-- feedback). Teachers do not see their own payroll here.
--
-- Idempotent. RUN IN: Supabase SQL editor.
-- ============================================================

-- ---- Tables ------------------------------------------------

CREATE TABLE IF NOT EXISTS public.fee_config (
  id                uuid NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id         uuid NOT NULL,
  school_year_id    uuid NOT NULL,
  membership_amount numeric NOT NULL DEFAULT 0 CHECK (membership_amount >= 0),
  chart_amount      numeric NOT NULL DEFAULT 0 CHECK (chart_amount >= 0),
  membership_due    date,
  chart_due         date,
  created_at        timestamp with time zone DEFAULT now(),
  updated_at        timestamp with time zone DEFAULT now(),
  CONSTRAINT fee_config_pkey PRIMARY KEY (id),
  CONSTRAINT fee_config_tenant_year_key UNIQUE (tenant_id, school_year_id),
  CONSTRAINT fee_config_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fee_config_school_year_id_fkey FOREIGN KEY (school_year_id) REFERENCES public.school_years(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.fee_payments (
  id             uuid NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id      uuid NOT NULL,
  school_year_id uuid NOT NULL,
  fee_type       text NOT NULL CHECK (fee_type IN ('membership', 'chart')),
  student_id     uuid,            -- set for membership
  family_id      uuid,            -- set for chart
  amount         numeric NOT NULL CHECK (amount >= 0),
  paid_at        date,            -- NULL = registered but outstanding
  note           text,
  created_at     timestamp with time zone DEFAULT now(),
  CONSTRAINT fee_payments_pkey PRIMARY KEY (id),
  CONSTRAINT fee_payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fee_payments_school_year_id_fkey FOREIGN KEY (school_year_id) REFERENCES public.school_years(id) ON DELETE CASCADE,
  CONSTRAINT fee_payments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT fee_payments_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE,
  -- exactly one target per row, matching the fee type
  CONSTRAINT fee_payments_target_check CHECK (
    (fee_type = 'membership' AND student_id IS NOT NULL AND family_id IS NULL)
    OR (fee_type = 'chart' AND family_id IS NOT NULL AND student_id IS NULL)
  )
);

-- one membership row per student per year; one chart row per family per year
CREATE UNIQUE INDEX IF NOT EXISTS uq_fee_payments_membership
  ON public.fee_payments (school_year_id, student_id) WHERE fee_type = 'membership';
CREATE UNIQUE INDEX IF NOT EXISTS uq_fee_payments_chart
  ON public.fee_payments (school_year_id, family_id) WHERE fee_type = 'chart';
CREATE INDEX IF NOT EXISTS idx_fee_payments_tenant_year
  ON public.fee_payments (tenant_id, school_year_id);

CREATE TABLE IF NOT EXISTS public.staff_pay (
  staff_id    uuid NOT NULL,
  tenant_id   uuid NOT NULL,
  hourly_rate numeric NOT NULL CHECK (hourly_rate >= 0),
  updated_at  timestamp with time zone DEFAULT now(),
  CONSTRAINT staff_pay_pkey PRIMARY KEY (staff_id),
  CONSTRAINT staff_pay_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT staff_pay_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.payroll_entries (
  id            uuid NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL,
  staff_id      uuid NOT NULL,
  period_month  text NOT NULL CHECK (period_month ~ '^[0-9]{4}-[0-9]{2}$'),  -- YYYY-MM
  hours         numeric NOT NULL CHECK (hours >= 0),
  rate_snapshot numeric NOT NULL CHECK (rate_snapshot >= 0),
  amount        numeric NOT NULL CHECK (amount >= 0),  -- hours × rate_snapshot
  created_at    timestamp with time zone DEFAULT now(),
  CONSTRAINT payroll_entries_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_entries_staff_month_key UNIQUE (staff_id, period_month),
  CONSTRAINT payroll_entries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT payroll_entries_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payroll_entries_tenant_month
  ON public.payroll_entries (tenant_id, period_month);

ALTER TABLE public.fee_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_payments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_pay       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS fee_config_updated_at ON public.fee_config;
CREATE TRIGGER fee_config_updated_at
  BEFORE UPDATE ON public.fee_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---- RLS: admin + super_admin only, tenant-scoped ----------
-- WITH CHECK also verifies that referenced students/families/years belong
-- to the admin's own tenant (the ids come from the client).

DROP POLICY IF EXISTS admin_manage_fee_config ON public.fee_config;
CREATE POLICY admin_manage_fee_config ON public.fee_config
  FOR ALL TO authenticated
  USING (
    (SELECT is_super_admin())
    OR ((SELECT get_my_role())::text = 'admin' AND tenant_id = (SELECT get_my_tenant_id()))
  )
  WITH CHECK (
    (SELECT is_super_admin())
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND tenant_id = (SELECT get_my_tenant_id())
      AND EXISTS (
        SELECT 1 FROM school_years y
        WHERE y.id = fee_config.school_year_id
          AND y.tenant_id = (SELECT get_my_tenant_id())
      )
    )
  );

DROP POLICY IF EXISTS admin_manage_fee_payments ON public.fee_payments;
CREATE POLICY admin_manage_fee_payments ON public.fee_payments
  FOR ALL TO authenticated
  USING (
    (SELECT is_super_admin())
    OR ((SELECT get_my_role())::text = 'admin' AND tenant_id = (SELECT get_my_tenant_id()))
  )
  WITH CHECK (
    (SELECT is_super_admin())
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND tenant_id = (SELECT get_my_tenant_id())
      AND EXISTS (
        SELECT 1 FROM school_years y
        WHERE y.id = fee_payments.school_year_id
          AND y.tenant_id = (SELECT get_my_tenant_id())
      )
      AND (
        student_id IS NULL OR EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = fee_payments.student_id
            AND p.tenant_id = (SELECT get_my_tenant_id())
        )
      )
      AND (
        family_id IS NULL OR EXISTS (
          SELECT 1 FROM families f
          WHERE f.id = fee_payments.family_id
            AND f.tenant_id = (SELECT get_my_tenant_id())
        )
      )
    )
  );

DROP POLICY IF EXISTS admin_manage_staff_pay ON public.staff_pay;
CREATE POLICY admin_manage_staff_pay ON public.staff_pay
  FOR ALL TO authenticated
  USING (
    (SELECT is_super_admin())
    OR ((SELECT get_my_role())::text = 'admin' AND tenant_id = (SELECT get_my_tenant_id()))
  )
  WITH CHECK (
    (SELECT is_super_admin())
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND tenant_id = (SELECT get_my_tenant_id())
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = staff_pay.staff_id
          AND p.tenant_id = (SELECT get_my_tenant_id())
      )
    )
  );

DROP POLICY IF EXISTS admin_manage_payroll_entries ON public.payroll_entries;
CREATE POLICY admin_manage_payroll_entries ON public.payroll_entries
  FOR ALL TO authenticated
  USING (
    (SELECT is_super_admin())
    OR ((SELECT get_my_role())::text = 'admin' AND tenant_id = (SELECT get_my_tenant_id()))
  )
  WITH CHECK (
    (SELECT is_super_admin())
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND tenant_id = (SELECT get_my_tenant_id())
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = payroll_entries.staff_id
          AND p.tenant_id = (SELECT get_my_tenant_id())
      )
    )
  );

-- ============================================================
-- VERIFICATION
-- ============================================================
-- select tablename, policyname, cmd from pg_policies
--   where tablename in ('fee_config','fee_payments','staff_pay','payroll_entries');
-- As a teacher/student/leerlingenbegeleiding: select * from fee_payments; → 0 rows.
