-- MasjidConnect — Supabase Schema
-- Last synced: 2026-05-25
-- Source of truth: pg_policies + pg_constraint + pg_indexes
-- WARNING: This file is a reference/documentation copy. Do NOT run it as-is
--          against a live database (no idempotency guards, no migration order).
--
-- 2026-05-25 resync added:
--   - ON DELETE CASCADE / SET NULL on all FKs (matches live state)
--   - Missing UNIQUE constraints: groups(tenant,year,name),
--     attendance_sessions(class,date), attendance_records(session,student),
--     class_students/class_teachers/submissions junction uniqueness
--   - profiles.is_anonymized column (replaces 'Verwijderd' first_name sentinel)
--   - submission_feedback.score CHECK constraint
--   - New INDEXES section enumerating all FK + lookup indexes
--
-- Known live-DB cleanup pending in this file (intentionally not represented):
--   - Live DB still has duplicate UNIQUE policies on class_students (broad
--     view_class_students vs narrow teacher_view_class_students). Pure
--     redundancy, not a bug — defer until next RLS audit pass.

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS character varying
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.am_i_student_of_class(cid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (SELECT 1 FROM class_students WHERE class_id = cid AND student_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.am_i_teacher_of_class(cid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (SELECT 1 FROM class_teachers WHERE class_id = cid AND teacher_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.am_i_member_of_group(gid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM classes c
    JOIN class_teachers ct ON ct.class_id = c.id AND ct.teacher_id = auth.uid()
    WHERE c.group_id = gid
    UNION
    SELECT 1 FROM classes c
    JOIN class_students cs ON cs.class_id = c.id AND cs.student_id = auth.uid()
    WHERE c.group_id = gid
  );
$$;

-- Trigger: fires on auth.users INSERT to create a profile row
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID := NULL;
BEGIN
  IF (NEW.raw_user_meta_data->>'tenant_id') IS NOT NULL
     AND (NEW.raw_user_meta_data->>'tenant_id') != '' THEN
    v_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::UUID;
  END IF;

  INSERT INTO public.profiles (id, first_name, last_name, role, tenant_id, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    v_tenant_id,
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

-- Trigger: fires on auth.users DELETE to clean up class memberships
CREATE OR REPLACE FUNCTION public.handle_user_deleted()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.class_students WHERE student_id = OLD.id;
  DELETE FROM public.class_teachers WHERE teacher_id = OLD.id;
  DELETE FROM public.invitations WHERE invited_by = OLD.id;
  RETURN OLD;
END;
$$;

-- Trigger: sets updated_at = NOW() on any row update
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================
-- TABLES  (in FK dependency order)
-- ============================================================

CREATE TABLE public.tenants (
  id                    uuid             NOT NULL DEFAULT uuid_generate_v4(),
  name                  character varying NOT NULL,
  slug                  character varying NOT NULL UNIQUE,
  address               text,
  city                  character varying,
  phone                 character varying,
  email                 character varying,
  logo_url              text,
  website_url           text,
  is_active             boolean          DEFAULT true,
  subscription_status   character varying DEFAULT 'trial'
    CHECK (subscription_status IN ('trial', 'active', 'inactive', 'cancelled')),
  subscription_price    numeric          DEFAULT 500.00,
  subscription_interval character varying DEFAULT 'yearly'
    CHECK (subscription_interval IN ('monthly', 'yearly')),
  trial_ends_at         timestamp with time zone,
  notes                 text,
  created_at            timestamp with time zone DEFAULT now(),
  updated_at            timestamp with time zone DEFAULT now(),
  CONSTRAINT tenants_pkey PRIMARY KEY (id)
);

CREATE TABLE public.profiles (
  id             uuid             NOT NULL,
  tenant_id      uuid,
  role           character varying NOT NULL
    CHECK (role IN ('super_admin', 'admin', 'teacher', 'student')),
  first_name     character varying NOT NULL,
  last_name      character varying NOT NULL,
  email          character varying,
  phone          character varying,
  avatar_url     text,
  is_active      boolean          DEFAULT true,
  -- GDPR: true after anonymize. Prevents reactivation of erased users.
  is_anonymized  boolean          NOT NULL DEFAULT false,
  last_seen_at   timestamp with time zone,
  created_at     timestamp with time zone DEFAULT now(),
  updated_at     timestamp with time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);

CREATE TABLE public.school_years (
  id         uuid             NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id  uuid             NOT NULL,
  name       character varying NOT NULL,
  start_date date             NOT NULL,
  end_date   date             NOT NULL,
  is_active  boolean          DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT school_years_pkey PRIMARY KEY (id),
  CONSTRAINT school_years_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);

CREATE TABLE public.groups (
  id             uuid             NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id      uuid             NOT NULL,
  school_year_id uuid             NOT NULL,
  name           character varying NOT NULL,
  created_at     timestamp with time zone DEFAULT now(),
  CONSTRAINT groups_pkey PRIMARY KEY (id),
  -- One group name per tenant per school year (e.g. only one "Groep 1" in 2025-2026)
  CONSTRAINT groups_tenant_id_school_year_id_name_key UNIQUE (tenant_id, school_year_id, name),
  CONSTRAINT groups_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT groups_school_year_id_fkey FOREIGN KEY (school_year_id) REFERENCES public.school_years(id) ON DELETE CASCADE
);

CREATE TABLE public.classes (
  id             uuid             NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id      uuid             NOT NULL,
  school_year_id uuid             NOT NULL,
  group_id       uuid,
  name           character varying NOT NULL,
  description    text,
  color          character varying DEFAULT '#1B6B4A',
  icon           character varying DEFAULT 'book',
  is_archived    boolean          DEFAULT false,
  created_at     timestamp with time zone DEFAULT now(),
  updated_at     timestamp with time zone DEFAULT now(),
  CONSTRAINT classes_pkey PRIMARY KEY (id),
  CONSTRAINT classes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT classes_school_year_id_fkey FOREIGN KEY (school_year_id) REFERENCES public.school_years(id) ON DELETE CASCADE,
  -- Group deletion does not delete the class; FK is nulled and class becomes ungrouped
  CONSTRAINT classes_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL
);

CREATE TABLE public.class_teachers (
  id          uuid NOT NULL DEFAULT uuid_generate_v4(),
  class_id    uuid NOT NULL,
  teacher_id  uuid NOT NULL,
  assigned_at timestamp with time zone DEFAULT now(),
  CONSTRAINT class_teachers_pkey PRIMARY KEY (id),
  -- One row per (class, teacher) — prevents duplicate enrollments under concurrent invites
  CONSTRAINT class_teachers_class_id_teacher_id_key UNIQUE (class_id, teacher_id),
  CONSTRAINT class_teachers_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE,
  CONSTRAINT class_teachers_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE TABLE public.class_students (
  id          uuid NOT NULL DEFAULT uuid_generate_v4(),
  class_id    uuid NOT NULL,
  student_id  uuid NOT NULL,
  enrolled_at timestamp with time zone DEFAULT now(),
  CONSTRAINT class_students_pkey PRIMARY KEY (id),
  -- One row per (class, student) — prevents duplicate enrollments under concurrent invites
  CONSTRAINT class_students_class_id_student_id_key UNIQUE (class_id, student_id),
  CONSTRAINT class_students_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE,
  CONSTRAINT class_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- Rooster (weekly schedule) — day_of_week: 0=Sun … 6=Sat
CREATE TABLE public.class_sessions (
  id           uuid     NOT NULL DEFAULT uuid_generate_v4(),
  class_id     uuid     NOT NULL,
  tenant_id    uuid     NOT NULL,
  day_of_week  smallint NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time   time without time zone NOT NULL,
  end_time     time without time zone NOT NULL,
  location     character varying,
  created_at   timestamp with time zone DEFAULT now(),
  CONSTRAINT class_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT class_sessions_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE,
  CONSTRAINT class_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);

CREATE TABLE public.announcements (
  id           uuid             NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id    uuid             NOT NULL,
  class_id     uuid,                        -- NULL = school-wide
  created_by   uuid             NOT NULL,
  title        character varying NOT NULL,
  content      text,
  is_published boolean          DEFAULT true,
  published_at timestamp with time zone DEFAULT now(),
  created_at   timestamp with time zone DEFAULT now(),
  CONSTRAINT announcements_pkey PRIMARY KEY (id),
  CONSTRAINT announcements_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT announcements_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE,
  CONSTRAINT announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);

CREATE TABLE public.assignments (
  id                    uuid             NOT NULL DEFAULT uuid_generate_v4(),
  class_id              uuid             NOT NULL,
  created_by            uuid             NOT NULL,
  title                 character varying NOT NULL,
  description           text,
  due_date              timestamp with time zone,
  max_score             integer,
  allow_text_submission boolean          DEFAULT true,
  allow_file_submission boolean          DEFAULT true,
  is_published          boolean          DEFAULT true,
  created_at            timestamp with time zone DEFAULT now(),
  updated_at            timestamp with time zone DEFAULT now(),
  CONSTRAINT assignments_pkey PRIMARY KEY (id),
  CONSTRAINT assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE,
  CONSTRAINT assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);

CREATE TABLE public.submissions (
  id            uuid             NOT NULL DEFAULT uuid_generate_v4(),
  assignment_id uuid             NOT NULL,
  student_id    uuid             NOT NULL,
  text_content  text,
  status        character varying DEFAULT 'submitted'
    CHECK (status IN ('draft', 'submitted', 'graded', 'returned')),
  submitted_at  timestamp with time zone DEFAULT now(),
  updated_at    timestamp with time zone DEFAULT now(),
  CONSTRAINT submissions_pkey PRIMARY KEY (id),
  -- One submission per student per assignment (required by client-side upsert onConflict)
  CONSTRAINT submissions_assignment_id_student_id_key UNIQUE (assignment_id, student_id),
  CONSTRAINT submissions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE CASCADE,
  CONSTRAINT submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id)
);

CREATE TABLE public.submission_feedback (
  id            uuid    NOT NULL DEFAULT uuid_generate_v4(),
  submission_id uuid    NOT NULL UNIQUE,    -- one feedback row per submission, period
  teacher_id    uuid    NOT NULL,
  score         integer CHECK (score IS NULL OR score >= 0),
  comment       text,
  created_at    timestamp with time zone DEFAULT now(),
  updated_at    timestamp with time zone DEFAULT now(),
  CONSTRAINT submission_feedback_pkey PRIMARY KEY (id),
  CONSTRAINT submission_feedback_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id) ON DELETE CASCADE,
  CONSTRAINT submission_feedback_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id)
);

CREATE TABLE public.submission_files (
  id            uuid             NOT NULL DEFAULT uuid_generate_v4(),
  submission_id uuid             NOT NULL,
  file_name     character varying NOT NULL,
  file_url      text             NOT NULL,  -- storage path (not public URL) since bucket switch to private
  file_size     integer,
  file_type     character varying,
  uploaded_at   timestamp with time zone DEFAULT now(),
  CONSTRAINT submission_files_pkey PRIMARY KEY (id),
  CONSTRAINT submission_files_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id) ON DELETE CASCADE
);

CREATE TABLE public.lesson_modules (
  id          uuid             NOT NULL DEFAULT uuid_generate_v4(),
  class_id    uuid             NOT NULL,
  created_by  uuid             NOT NULL,
  title       character varying NOT NULL,
  description text,
  is_visible  boolean          DEFAULT true,
  order_index integer          DEFAULT 0,
  created_at  timestamp with time zone DEFAULT now(),
  updated_at  timestamp with time zone DEFAULT now(),
  CONSTRAINT lesson_modules_pkey PRIMARY KEY (id),
  CONSTRAINT lesson_modules_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE,
  CONSTRAINT lesson_modules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);

CREATE TABLE public.module_documents (
  id          uuid             NOT NULL DEFAULT uuid_generate_v4(),
  module_id   uuid             NOT NULL,
  title       character varying NOT NULL,
  file_name   character varying NOT NULL,
  file_url    text             NOT NULL,  -- storage path (not public URL)
  file_size   integer,
  file_type   character varying,
  order_index integer          DEFAULT 0,
  uploaded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT module_documents_pkey PRIMARY KEY (id),
  CONSTRAINT module_documents_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.lesson_modules(id) ON DELETE CASCADE
);

-- Attendance feature: DB tables exist, UI not yet built. No RLS policies yet.
CREATE TABLE public.attendance_sessions (
  id           uuid NOT NULL DEFAULT uuid_generate_v4(),
  class_id     uuid NOT NULL,
  teacher_id   uuid NOT NULL,
  session_date date NOT NULL,
  notes        text,
  created_at   timestamp with time zone DEFAULT now(),
  CONSTRAINT attendance_sessions_pkey PRIMARY KEY (id),
  -- Only one attendance session per class per day
  CONSTRAINT attendance_sessions_class_id_session_date_key UNIQUE (class_id, session_date),
  CONSTRAINT attendance_sessions_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE,
  CONSTRAINT attendance_sessions_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id)
);

CREATE TABLE public.attendance_records (
  id         uuid             NOT NULL DEFAULT uuid_generate_v4(),
  session_id uuid             NOT NULL,
  student_id uuid             NOT NULL,
  status     character varying DEFAULT 'present'
    CHECK (status IN ('present', 'absent', 'late', 'excused')),
  note       text,
  CONSTRAINT attendance_records_pkey PRIMARY KEY (id),
  -- One attendance record per student per session
  CONSTRAINT attendance_records_session_id_student_id_key UNIQUE (session_id, student_id),
  CONSTRAINT attendance_records_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  CONSTRAINT attendance_records_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id)
);

CREATE TABLE public.invitations (
  id          uuid             NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id   uuid             NOT NULL,
  email       character varying NOT NULL,
  role        character varying NOT NULL
    CHECK (role IN ('admin', 'teacher', 'student')),
  class_id    uuid,
  token       character varying NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex') UNIQUE,
  invited_by  uuid             NOT NULL,
  accepted_at timestamp with time zone,
  expires_at  timestamp with time zone NOT NULL DEFAULT (now() + '7 days'::interval),
  created_at  timestamp with time zone DEFAULT now(),
  CONSTRAINT invitations_pkey PRIMARY KEY (id),
  CONSTRAINT invitations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT invitations_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id),
  CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.profiles(id)
);

CREATE TABLE public.audit_logs (
  id          uuid             NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id   uuid,
  user_id     uuid,
  action      character varying NOT NULL,
  entity_type character varying,
  entity_id   uuid,
  metadata    jsonb,
  ip_address  inet,
  created_at  timestamp with time zone DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

CREATE TABLE public.payments (
  id                  uuid             NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id           uuid             NOT NULL,
  amount              numeric          NOT NULL,
  currency            character varying DEFAULT 'EUR',
  status              character varying DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  stripe_id           character varying,
  period_start        date,
  period_end          date,
  paid_at             timestamp with time zone,
  created_at          timestamp with time zone DEFAULT now(),
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);

-- ============================================================
-- INDEXES
-- PostgreSQL only auto-indexes PRIMARY KEY and UNIQUE constraints.
-- Foreign-key columns are NOT auto-indexed, so we create explicit indexes
-- on every FK column that is filtered on by the app's hot-path queries.
-- ============================================================

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_tenant         ON public.profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_active  ON public.profiles(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_profiles_role           ON public.profiles(role);

-- classes
CREATE INDEX IF NOT EXISTS idx_classes_tenant          ON public.classes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_classes_school_year     ON public.classes(school_year_id);

-- junction tables
CREATE INDEX IF NOT EXISTS idx_class_students_class    ON public.class_students(class_id);
CREATE INDEX IF NOT EXISTS idx_class_students_student  ON public.class_students(student_id);
CREATE INDEX IF NOT EXISTS idx_class_teachers_class    ON public.class_teachers(class_id);
CREATE INDEX IF NOT EXISTS idx_class_teachers_teacher  ON public.class_teachers(teacher_id);

-- assignments / submissions / files
CREATE INDEX IF NOT EXISTS idx_assignments_class       ON public.assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment  ON public.submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student     ON public.submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submission_files_submission ON public.submission_files(submission_id);

-- content
CREATE INDEX IF NOT EXISTS idx_lesson_modules_class    ON public.lesson_modules(class_id);
CREATE INDEX IF NOT EXISTS idx_announcements_tenant_id ON public.announcements(tenant_id);

-- invitations / audit
CREATE INDEX IF NOT EXISTS idx_invitations_email       ON public.invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token       ON public.invitations(token);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant       ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user         ON public.audit_logs(user_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.tenants            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_years       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_teachers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_students     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_files   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_modules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_documents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments           ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLICIES — tenants
-- ============================================================

CREATE POLICY "admin_view_own_tenant" ON public.tenants
  FOR SELECT USING (id = get_my_tenant_id());

CREATE POLICY "super_admin_all_tenants" ON public.tenants
  FOR ALL USING (is_super_admin());

-- ============================================================
-- POLICIES — profiles
-- ============================================================

CREATE POLICY "view_own_profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());

-- Known gap: exposes phone/email to all mosque members. Acceptable because
-- everyone in the same mosque knows each other; fixing requires rewriting
-- teacher-list queries on the class detail page.
CREATE POLICY "view_same_tenant_profiles" ON public.profiles
  FOR SELECT USING (tenant_id = get_my_tenant_id());

-- WITH CHECK prevents self-escalation of role or tenant_id
CREATE POLICY "update_own_profile" ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND (role)::text = (SELECT p.role FROM profiles p WHERE p.id = auth.uid())::text
    AND tenant_id = (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid())
  );

-- WITH CHECK prevents admins from assigning super_admin role
CREATE POLICY "admin_manage_profiles" ON public.profiles
  FOR ALL
  USING (
    (get_my_role())::text = 'admin'
    AND tenant_id = get_my_tenant_id()
  )
  WITH CHECK (
    (get_my_role())::text = 'admin'
    AND tenant_id = get_my_tenant_id()
    AND (role)::text = ANY (ARRAY['student', 'teacher', 'admin'])
  );

CREATE POLICY "super_admin_all_profiles" ON public.profiles
  FOR ALL USING (is_super_admin());

-- ============================================================
-- POLICIES — school_years
-- ============================================================

CREATE POLICY "tenant_members_view_years" ON public.school_years
  FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE POLICY "admin_manage_years" ON public.school_years
  FOR ALL USING (
    (get_my_role())::text = 'admin'
    AND tenant_id = get_my_tenant_id()
  );

CREATE POLICY "super_admin_all_years" ON public.school_years
  FOR ALL USING (is_super_admin());

-- ============================================================
-- POLICIES — groups
-- ============================================================

CREATE POLICY "member_view_groups" ON public.groups
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND ((get_my_role())::text = 'admin' OR am_i_member_of_group(id))
  );

CREATE POLICY "admin_manage_groups" ON public.groups
  FOR ALL USING (
    (get_my_role())::text = 'admin'
    AND tenant_id = get_my_tenant_id()
  );

CREATE POLICY "super_admin_all_groups" ON public.groups
  FOR ALL USING (is_super_admin());

-- ============================================================
-- POLICIES — classes
-- ============================================================

CREATE POLICY "member_view_own_classes" ON public.classes
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND (
      (get_my_role())::text = 'admin'
      OR am_i_teacher_of_class(id)
      OR am_i_student_of_class(id)
    )
  );

CREATE POLICY "admin_manage_classes" ON public.classes
  FOR ALL USING (
    (get_my_role())::text = 'admin'
    AND tenant_id = get_my_tenant_id()
  );

CREATE POLICY "super_admin_all_classes" ON public.classes
  FOR ALL USING (is_super_admin());

-- ============================================================
-- POLICIES — class_teachers
-- ============================================================

CREATE POLICY "view_class_teachers" ON public.class_teachers
  FOR SELECT USING (
    is_super_admin()
    OR (get_my_role())::text = 'admin'
    OR teacher_id = auth.uid()
    OR am_i_student_of_class(class_id)
  );

-- WITH CHECK scopes writes to own tenant (prevents cross-tenant teacher assignment)
CREATE POLICY "admin_manage_class_teachers" ON public.class_teachers
  FOR ALL
  USING (
    is_super_admin()
    OR (
      (get_my_role())::text = 'admin'
      AND EXISTS (
        SELECT 1 FROM classes
        WHERE classes.id = class_teachers.class_id
          AND classes.tenant_id = get_my_tenant_id()
      )
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      (get_my_role())::text = 'admin'
      AND EXISTS (
        SELECT 1 FROM classes
        WHERE classes.id = class_teachers.class_id
          AND classes.tenant_id = get_my_tenant_id()
      )
    )
  );

CREATE POLICY "super_admin_class_teachers" ON public.class_teachers
  FOR ALL USING (is_super_admin());

-- ============================================================
-- POLICIES — class_students
-- ============================================================

CREATE POLICY "view_class_students" ON public.class_students
  FOR SELECT USING (
    is_super_admin()
    OR (get_my_role())::text = 'admin'
    OR student_id = auth.uid()
    OR am_i_teacher_of_class(class_id)
  );

CREATE POLICY "teacher_view_class_students" ON public.class_students
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM class_teachers ct
      JOIN classes c ON c.id = ct.class_id
      WHERE ct.teacher_id = auth.uid()
        AND ct.class_id = class_students.class_id
        AND c.tenant_id = get_my_tenant_id()
    )
    OR (get_my_role())::text = 'admin'
  );

-- WITH CHECK scopes writes to own tenant (prevents cross-tenant student enrollment)
CREATE POLICY "admin_manage_class_students" ON public.class_students
  FOR ALL
  USING (
    is_super_admin()
    OR (
      (get_my_role())::text = 'admin'
      AND EXISTS (
        SELECT 1 FROM classes
        WHERE classes.id = class_students.class_id
          AND classes.tenant_id = get_my_tenant_id()
      )
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      (get_my_role())::text = 'admin'
      AND EXISTS (
        SELECT 1 FROM classes
        WHERE classes.id = class_students.class_id
          AND classes.tenant_id = get_my_tenant_id()
      )
    )
  );

CREATE POLICY "super_admin_class_students" ON public.class_students
  FOR ALL USING (is_super_admin());

-- ============================================================
-- POLICIES — class_sessions (rooster)
-- ============================================================

CREATE POLICY "student_view_sessions" ON public.class_sessions
  FOR SELECT USING (am_i_student_of_class(class_id));

CREATE POLICY "teacher_view_sessions" ON public.class_sessions
  FOR SELECT USING (am_i_teacher_of_class(class_id));

CREATE POLICY "admin_manage_sessions" ON public.class_sessions
  FOR ALL
  USING (
    (get_my_role())::text = 'admin'
    AND tenant_id = get_my_tenant_id()
  )
  WITH CHECK (
    (get_my_role())::text = 'admin'
    AND tenant_id = get_my_tenant_id()
  );

CREATE POLICY "super_admin_all_sessions" ON public.class_sessions
  FOR ALL USING (is_super_admin());

-- ============================================================
-- POLICIES — announcements
-- ============================================================

-- General read: own tenant + member of the class (or school-wide)
CREATE POLICY "announcements_read" ON public.announcements
  FOR SELECT USING (
    tenant_id = (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid())
    AND (
      class_id IS NULL
      OR class_id IN (
        SELECT class_students.class_id FROM class_students
        WHERE class_students.student_id = auth.uid()
        UNION
        SELECT class_teachers.class_id FROM class_teachers
        WHERE class_teachers.teacher_id = auth.uid()
      )
    )
  );

CREATE POLICY "student_read_announcements" ON public.announcements
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND (
      class_id IS NULL
      OR EXISTS (
        SELECT 1 FROM class_students
        WHERE class_students.class_id = announcements.class_id
          AND class_students.student_id = auth.uid()
      )
    )
  );

CREATE POLICY "teacher_read_announcements" ON public.announcements
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND (
      class_id IS NULL
      OR EXISTS (
        SELECT 1 FROM class_teachers
        WHERE class_teachers.class_id = announcements.class_id
          AND class_teachers.teacher_id = auth.uid()
      )
    )
  );

-- General insert: admin/super_admin (school-wide or class) or teacher of that class
CREATE POLICY "announcements_insert" ON public.announcements
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND tenant_id = (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid())
    AND (
      (SELECT p.role FROM profiles p WHERE p.id = auth.uid())::text
        = ANY (ARRAY['admin', 'super_admin'])
      OR (
        class_id IS NOT NULL
        AND class_id IN (
          SELECT class_teachers.class_id FROM class_teachers
          WHERE class_teachers.teacher_id = auth.uid()
        )
      )
    )
  );

-- Separate teacher INSERT using helper functions (cleaner, same effect)
CREATE POLICY "teacher_post_announcements" ON public.announcements
  FOR INSERT WITH CHECK (
    (get_my_role())::text = 'teacher'
    AND tenant_id = get_my_tenant_id()
    AND class_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM class_teachers
      WHERE class_teachers.class_id = announcements.class_id
        AND class_teachers.teacher_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "announcements_delete" ON public.announcements
  FOR DELETE USING (
    created_by = auth.uid()
    OR (SELECT p.role FROM profiles p WHERE p.id = auth.uid())::text
      = ANY (ARRAY['admin', 'super_admin'])
  );

CREATE POLICY "teacher_delete_own_announcements" ON public.announcements
  FOR DELETE USING (
    (get_my_role())::text = 'teacher'
    AND created_by = auth.uid()
  );

CREATE POLICY "admin_manage_announcements" ON public.announcements
  FOR ALL USING (
    (get_my_role())::text = 'admin'
    AND tenant_id = get_my_tenant_id()
  );

CREATE POLICY "super_admin_all_announcements" ON public.announcements
  FOR ALL USING (is_super_admin());

-- ============================================================
-- POLICIES — assignments
-- ============================================================

CREATE POLICY "student_view_assignments" ON public.assignments
  FOR SELECT USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM class_students
      WHERE class_students.class_id = assignments.class_id
        AND class_students.student_id = auth.uid()
    )
  );

CREATE POLICY "teacher_manage_assignments" ON public.assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM class_teachers ct
      JOIN classes c ON c.id = ct.class_id
      WHERE ct.teacher_id = auth.uid()
        AND assignments.class_id = c.id
        AND c.tenant_id = get_my_tenant_id()
    )
    OR (
      (get_my_role())::text = 'admin'
      AND EXISTS (
        SELECT 1 FROM classes
        WHERE classes.id = assignments.class_id
          AND classes.tenant_id = get_my_tenant_id()
      )
    )
  );

CREATE POLICY "super_admin_all_assignments" ON public.assignments
  FOR ALL USING (is_super_admin());

-- ============================================================
-- POLICIES — submissions
-- Note: previously a single ALL policy; split into 4 for deadline enforcement.
-- ============================================================

CREATE POLICY "student_view_own_submissions" ON public.submissions
  FOR SELECT USING (student_id = auth.uid());

-- Deadline enforced at DB level: INSERT blocked if due_date has passed
CREATE POLICY "student_insert_submission" ON public.submissions
  FOR INSERT WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM assignments
      WHERE assignments.id = submissions.assignment_id
        AND (assignments.due_date IS NULL OR assignments.due_date > now())
    )
  );

CREATE POLICY "student_update_own_submissions" ON public.submissions
  FOR UPDATE
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "student_delete_own_submissions" ON public.submissions
  FOR DELETE USING (student_id = auth.uid());

CREATE POLICY "teacher_view_submissions" ON public.submissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM assignments a
      JOIN class_teachers ct ON ct.class_id = a.class_id
      WHERE a.id = submissions.assignment_id
        AND ct.teacher_id = auth.uid()
    )
    OR (get_my_role())::text = 'admin'
  );

CREATE POLICY "teacher_update_submissions" ON public.submissions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM assignments a
      JOIN class_teachers ct ON ct.class_id = a.class_id
      WHERE a.id = submissions.assignment_id
        AND ct.teacher_id = auth.uid()
    )
    OR (get_my_role())::text = 'admin'
  );

CREATE POLICY "super_admin_all_submissions" ON public.submissions
  FOR ALL USING (is_super_admin());

-- ============================================================
-- POLICIES — submission_feedback
-- ============================================================

CREATE POLICY "student_view_own_feedback" ON public.submission_feedback
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM submissions
      WHERE submissions.id = submission_feedback.submission_id
        AND submissions.student_id = auth.uid()
    )
  );

CREATE POLICY "teacher_view_class_feedback" ON public.submission_feedback
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN class_teachers ct ON ct.class_id = a.class_id
      WHERE s.id = submission_feedback.submission_id
        AND ct.teacher_id = auth.uid()
    )
  );

CREATE POLICY "admin_view_feedback" ON public.submission_feedback
  FOR SELECT USING (
    (get_my_role())::text = 'admin'
    AND EXISTS (
      SELECT 1 FROM submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN classes c ON c.id = a.class_id
      WHERE s.id = submission_feedback.submission_id
        AND c.tenant_id = get_my_tenant_id()
    )
  );

-- WITH CHECK scopes writes to own tenant for both teacher and admin branches
CREATE POLICY "teacher_manage_feedback" ON public.submission_feedback
  FOR ALL
  USING (
    (teacher_id = auth.uid() OR (get_my_role())::text = 'admin')
    AND EXISTS (
      SELECT 1 FROM submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN classes c ON c.id = a.class_id
      WHERE s.id = submission_feedback.submission_id
        AND c.tenant_id = get_my_tenant_id()
    )
  )
  WITH CHECK (
    (teacher_id = auth.uid() OR (get_my_role())::text = 'admin')
    AND EXISTS (
      SELECT 1 FROM submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN classes c ON c.id = a.class_id
      WHERE s.id = submission_feedback.submission_id
        AND c.tenant_id = get_my_tenant_id()
    )
  );

-- ============================================================
-- POLICIES — submission_files
-- ============================================================

CREATE POLICY "student_manage_own_files" ON public.submission_files
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM submissions
      WHERE submissions.id = submission_files.submission_id
        AND submissions.student_id = auth.uid()
    )
  );

CREATE POLICY "teacher_view_submission_files" ON public.submission_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN class_teachers ct ON ct.class_id = a.class_id
      WHERE s.id = submission_files.submission_id
        AND ct.teacher_id = auth.uid()
    )
    OR (get_my_role())::text = ANY (ARRAY['admin', 'super_admin'])
  );

CREATE POLICY "admin_view_submission_files" ON public.submission_files
  FOR SELECT USING (
    (get_my_role())::text = 'admin'
    AND EXISTS (
      SELECT 1 FROM submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN classes c ON c.id = a.class_id
      WHERE s.id = submission_files.submission_id
        AND c.tenant_id = get_my_tenant_id()
    )
  );

CREATE POLICY "super_admin_all_submission_files" ON public.submission_files
  FOR ALL USING (is_super_admin());

-- ============================================================
-- POLICIES — lesson_modules
-- ============================================================

CREATE POLICY "student_view_visible_modules" ON public.lesson_modules
  FOR SELECT USING (
    is_visible = true
    AND EXISTS (
      SELECT 1 FROM class_students
      WHERE class_students.class_id = lesson_modules.class_id
        AND class_students.student_id = auth.uid()
    )
  );

CREATE POLICY "teacher_manage_modules" ON public.lesson_modules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM class_teachers
      WHERE class_teachers.class_id = lesson_modules.class_id
        AND class_teachers.teacher_id = auth.uid()
    )
    OR (
      (get_my_role())::text = 'admin'
      AND EXISTS (
        SELECT 1 FROM classes
        WHERE classes.id = lesson_modules.class_id
          AND classes.tenant_id = get_my_tenant_id()
      )
    )
  );

CREATE POLICY "admin_manage_modules" ON public.lesson_modules
  FOR ALL
  USING (
    (get_my_role())::text = 'admin'
    AND EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = lesson_modules.class_id
        AND classes.tenant_id = get_my_tenant_id()
    )
  )
  WITH CHECK (
    (get_my_role())::text = 'admin'
    AND EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = lesson_modules.class_id
        AND classes.tenant_id = get_my_tenant_id()
    )
  );

CREATE POLICY "super_admin_all_modules" ON public.lesson_modules
  FOR ALL USING (is_super_admin());

-- ============================================================
-- POLICIES — module_documents
-- ============================================================

CREATE POLICY "student_view_docs" ON public.module_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lesson_modules lm
      JOIN class_students cs ON cs.class_id = lm.class_id
      WHERE lm.id = module_documents.module_id
        AND cs.student_id = auth.uid()
        AND lm.is_visible = true
    )
  );

CREATE POLICY "teacher_manage_docs" ON public.module_documents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM lesson_modules lm
      JOIN class_teachers ct ON ct.class_id = lm.class_id
      WHERE lm.id = module_documents.module_id
        AND ct.teacher_id = auth.uid()
    )
    OR (get_my_role())::text = ANY (ARRAY['admin', 'super_admin'])
  );

CREATE POLICY "admin_manage_docs" ON public.module_documents
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM lesson_modules lm
      JOIN classes c ON c.id = lm.class_id
      WHERE lm.id = module_documents.module_id
        AND c.tenant_id = get_my_tenant_id()
        AND (get_my_role())::text = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lesson_modules lm
      JOIN classes c ON c.id = lm.class_id
      WHERE lm.id = module_documents.module_id
        AND c.tenant_id = get_my_tenant_id()
        AND (get_my_role())::text = 'admin'
    )
  );

-- ============================================================
-- POLICIES — attendance_sessions / attendance_records
-- No policies defined yet — feature UI not built.
-- With RLS enabled and no policies, these tables are inaccessible
-- to all non-service-role callers (safe default).
-- Add policies here when the attendance feature is implemented.
-- ============================================================

-- ============================================================
-- POLICIES — invitations
-- ============================================================

CREATE POLICY "admin_manage_invitations" ON public.invitations
  FOR ALL USING (
    (get_my_role())::text = ANY (ARRAY['admin', 'super_admin'])
    AND (tenant_id = get_my_tenant_id() OR is_super_admin())
  );

-- ============================================================
-- POLICIES — audit_logs
-- ============================================================

CREATE POLICY "super_admin_all_logs" ON public.audit_logs
  FOR ALL USING (is_super_admin());

-- ============================================================
-- POLICIES — payments
-- ============================================================

CREATE POLICY "admin_view_own_payments" ON public.payments
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND (get_my_role())::text = 'admin'
  );

CREATE POLICY "super_admin_all_payments" ON public.payments
  FOR ALL USING (is_super_admin());
