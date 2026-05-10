-- WARNING: This schema is for context only and is not meant to be run directly.
-- It reflects the live DB state as of 2026-05-10.

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE public.tenants (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                  VARCHAR NOT NULL,
  slug                  VARCHAR NOT NULL UNIQUE,
  address               TEXT,
  city                  VARCHAR,
  phone                 VARCHAR,
  email                 VARCHAR,
  logo_url              TEXT,
  website_url           TEXT,
  is_active             BOOLEAN DEFAULT true,
  subscription_status   VARCHAR DEFAULT 'trial' CHECK (subscription_status IN ('trial','active','inactive','cancelled')),
  subscription_price    NUMERIC DEFAULT 500.00,
  subscription_interval VARCHAR DEFAULT 'yearly' CHECK (subscription_interval IN ('monthly','yearly')),
  trial_ends_at         TIMESTAMPTZ,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id),
  tenant_id    UUID REFERENCES public.tenants(id),
  role         VARCHAR NOT NULL CHECK (role IN ('super_admin','admin','teacher','student')),
  first_name   VARCHAR NOT NULL,
  last_name    VARCHAR NOT NULL,
  email        VARCHAR,
  avatar_url   TEXT,
  phone        VARCHAR,
  is_active    BOOLEAN DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.school_years (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name       VARCHAR NOT NULL,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.groups (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  school_year_id UUID NOT NULL REFERENCES public.school_years(id) ON DELETE CASCADE,
  name           VARCHAR(255) NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, school_year_id, name)
);

CREATE TABLE public.classes (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  school_year_id UUID NOT NULL REFERENCES public.school_years(id) ON DELETE CASCADE,
  group_id       UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  name           VARCHAR NOT NULL,
  description    TEXT,
  color          VARCHAR DEFAULT '#1B6B4A',
  icon           VARCHAR DEFAULT 'book',
  is_archived    BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.class_teachers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id    UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (class_id, teacher_id)
);

CREATE TABLE public.class_students (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id    UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (class_id, student_id)
);

CREATE TABLE public.assignments (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id              UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  created_by            UUID NOT NULL REFERENCES public.profiles(id),
  title                 VARCHAR NOT NULL,
  description           TEXT,
  due_date              TIMESTAMPTZ,
  max_score             INTEGER,
  allow_text_submission BOOLEAN DEFAULT true,
  allow_file_submission BOOLEAN DEFAULT true,
  is_published          BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.submissions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text_content  TEXT,
  status        VARCHAR DEFAULT 'submitted' CHECK (status IN ('draft','submitted','graded','returned')),
  submitted_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (assignment_id, student_id)
);

CREATE TABLE public.submission_files (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  file_name     VARCHAR NOT NULL,
  file_url      TEXT NOT NULL,
  file_size     INTEGER,
  file_type     VARCHAR,
  uploaded_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.submission_feedback (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  teacher_id    UUID NOT NULL REFERENCES public.profiles(id),
  score         INTEGER,
  comment       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (submission_id)
);

CREATE TABLE public.lesson_modules (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id    UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  created_by  UUID NOT NULL REFERENCES public.profiles(id),
  title       VARCHAR NOT NULL,
  description TEXT,
  is_visible  BOOLEAN DEFAULT true,
  order_index INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.module_documents (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module_id   UUID NOT NULL REFERENCES public.lesson_modules(id) ON DELETE CASCADE,
  title       VARCHAR NOT NULL,
  file_name   VARCHAR NOT NULL,
  file_url    TEXT NOT NULL,
  file_size   INTEGER,
  file_type   VARCHAR,
  order_index INTEGER DEFAULT 0,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.announcements (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  class_id     UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  created_by   UUID NOT NULL REFERENCES public.profiles(id),
  title        VARCHAR NOT NULL,
  content      TEXT,
  is_published BOOLEAN DEFAULT true,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.invitations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email       VARCHAR NOT NULL,
  role        VARCHAR NOT NULL CHECK (role IN ('admin','teacher','student')),
  class_id    UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  token       VARCHAR NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex') UNIQUE,
  invited_by  UUID NOT NULL REFERENCES public.profiles(id),
  accepted_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.attendance_sessions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id     UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id   UUID NOT NULL REFERENCES public.profiles(id),
  session_date DATE NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.attendance_records (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id),
  status     VARCHAR DEFAULT 'present' CHECK (status IN ('present','absent','late','excused')),
  note       TEXT
);

CREATE TABLE public.payments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  amount       NUMERIC NOT NULL,
  currency     VARCHAR DEFAULT 'EUR',
  status       VARCHAR DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded')),
  stripe_id    VARCHAR,
  period_start DATE,
  period_end   DATE,
  paid_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID REFERENCES public.tenants(id),
  user_id     UUID REFERENCES public.profiles(id),
  action      VARCHAR NOT NULL,
  entity_type VARCHAR,
  entity_id   UUID,
  metadata    JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRIGGER: auto-create profile on auth user creation
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- HELPER FUNCTIONS (used in RLS policies)
-- ============================================================

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS VARCHAR AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Bypass RLS on junction tables to avoid infinite recursion
CREATE OR REPLACE FUNCTION am_i_teacher_of_class(cid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM class_teachers WHERE class_id = cid AND teacher_id = auth.uid())
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION am_i_student_of_class(cid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM class_students WHERE class_id = cid AND student_id = auth.uid())
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION am_i_member_of_group(gid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM classes c
    JOIN class_teachers ct ON ct.class_id = c.id AND ct.teacher_id = auth.uid()
    WHERE c.group_id = gid
    UNION
    SELECT 1 FROM classes c
    JOIN class_students cs ON cs.class_id = c.id AND cs.student_id = auth.uid()
    WHERE c.group_id = gid
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE tenants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_years         ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups               ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_teachers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_students       ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_files     ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_feedback  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_modules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs           ENABLE ROW LEVEL SECURITY;

-- TENANTS
CREATE POLICY "super_admin_all_tenants" ON tenants USING (is_super_admin());
CREATE POLICY "admin_view_own_tenant"   ON tenants FOR SELECT USING (id = get_my_tenant_id());

-- PROFILES
CREATE POLICY "super_admin_all_profiles"  ON profiles USING (is_super_admin());
CREATE POLICY "view_same_tenant_profiles" ON profiles FOR SELECT USING (tenant_id = get_my_tenant_id() OR id = auth.uid());
CREATE POLICY "update_own_profile"        ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "admin_manage_profiles"     ON profiles USING (get_my_role() = 'admin' AND tenant_id = get_my_tenant_id());

-- SCHOOL YEARS
CREATE POLICY "super_admin_all_years"  ON school_years USING (is_super_admin());
CREATE POLICY "tenant_view_own_years"  ON school_years FOR SELECT USING (tenant_id = get_my_tenant_id());
CREATE POLICY "admin_manage_years"     ON school_years USING (get_my_role() = 'admin' AND tenant_id = get_my_tenant_id());

-- GROUPS
CREATE POLICY "super_admin_all_groups" ON groups USING (is_super_admin());
CREATE POLICY "admin_manage_groups"    ON groups USING (get_my_role() = 'admin' AND tenant_id = get_my_tenant_id());
CREATE POLICY "member_view_groups"     ON groups FOR SELECT USING (
  tenant_id = get_my_tenant_id() AND (get_my_role() = 'admin' OR am_i_member_of_group(id))
);

-- CLASSES
CREATE POLICY "super_admin_all_classes" ON classes USING (is_super_admin());
CREATE POLICY "admin_manage_classes"    ON classes USING (get_my_role() = 'admin' AND tenant_id = get_my_tenant_id());
CREATE POLICY "member_view_own_classes" ON classes FOR SELECT USING (
  tenant_id = get_my_tenant_id() AND (
    get_my_role() = 'admin' OR
    am_i_teacher_of_class(id) OR
    am_i_student_of_class(id)
  )
);

-- CLASS TEACHERS
CREATE POLICY "super_admin_class_teachers"  ON class_teachers USING (is_super_admin());
CREATE POLICY "admin_manage_class_teachers" ON class_teachers USING (is_super_admin() OR get_my_role() = 'admin');
CREATE POLICY "view_class_teachers"         ON class_teachers FOR SELECT USING (
  is_super_admin() OR get_my_role() = 'admin' OR
  teacher_id = auth.uid() OR
  am_i_student_of_class(class_id)
);

-- CLASS STUDENTS
CREATE POLICY "super_admin_class_students"  ON class_students USING (is_super_admin());
CREATE POLICY "admin_manage_class_students" ON class_students USING (is_super_admin() OR get_my_role() = 'admin');
CREATE POLICY "view_class_students"         ON class_students FOR SELECT USING (
  is_super_admin() OR get_my_role() = 'admin' OR
  student_id = auth.uid() OR
  am_i_teacher_of_class(class_id)
);

-- ASSIGNMENTS
CREATE POLICY "super_admin_all_assignments" ON assignments USING (is_super_admin());
CREATE POLICY "admin_manage_assignments"    ON assignments USING (
  get_my_role() = 'admin' AND EXISTS (SELECT 1 FROM classes WHERE id = assignments.class_id AND tenant_id = get_my_tenant_id())
);
CREATE POLICY "teacher_manage_assignments"  ON assignments USING (
  am_i_teacher_of_class(class_id)
);
CREATE POLICY "student_view_assignments"    ON assignments FOR SELECT USING (
  is_published = true AND am_i_student_of_class(class_id)
);

-- SUBMISSIONS
CREATE POLICY "super_admin_all_submissions"  ON submissions USING (is_super_admin());
CREATE POLICY "student_manage_own"           ON submissions USING (student_id = auth.uid());
CREATE POLICY "teacher_view_submissions"     ON submissions FOR SELECT USING (am_i_teacher_of_class(
  (SELECT class_id FROM assignments WHERE id = submissions.assignment_id)
));
CREATE POLICY "teacher_update_submissions"   ON submissions FOR UPDATE USING (am_i_teacher_of_class(
  (SELECT class_id FROM assignments WHERE id = submissions.assignment_id)
));
CREATE POLICY "admin_view_submissions"       ON submissions FOR SELECT USING (
  get_my_role() = 'admin' AND EXISTS (
    SELECT 1 FROM assignments a JOIN classes c ON c.id = a.class_id
    WHERE a.id = submissions.assignment_id AND c.tenant_id = get_my_tenant_id()
  )
);

-- SUBMISSION FEEDBACK
CREATE POLICY "super_admin_all_feedback"  ON submission_feedback USING (is_super_admin());
CREATE POLICY "teacher_manage_feedback"   ON submission_feedback USING (teacher_id = auth.uid());
CREATE POLICY "student_view_own_feedback" ON submission_feedback FOR SELECT USING (
  EXISTS (SELECT 1 FROM submissions WHERE id = submission_feedback.submission_id AND student_id = auth.uid())
);

-- ANNOUNCEMENTS
CREATE POLICY "super_admin_all_announcements" ON announcements USING (is_super_admin());
CREATE POLICY "admin_manage_announcements"    ON announcements USING (
  get_my_role() = 'admin' AND tenant_id = get_my_tenant_id()
);
CREATE POLICY "teacher_manage_own_announcements" ON announcements USING (
  get_my_role() = 'teacher' AND created_by = auth.uid() AND tenant_id = get_my_tenant_id()
);
CREATE POLICY "view_tenant_announcements" ON announcements FOR SELECT USING (
  tenant_id = get_my_tenant_id() AND (
    class_id IS NULL OR am_i_teacher_of_class(class_id) OR am_i_student_of_class(class_id)
  )
);

-- INVITATIONS
CREATE POLICY "super_admin_all_invitations" ON invitations USING (is_super_admin());
CREATE POLICY "admin_manage_invitations"    ON invitations USING (
  get_my_role() = 'admin' AND tenant_id = get_my_tenant_id()
);

-- LESSON MODULES
CREATE POLICY "super_admin_all_modules"  ON lesson_modules USING (is_super_admin());
CREATE POLICY "teacher_manage_modules"   ON lesson_modules USING (am_i_teacher_of_class(class_id));
CREATE POLICY "student_view_modules"     ON lesson_modules FOR SELECT USING (
  is_visible = true AND am_i_student_of_class(class_id)
);
CREATE POLICY "admin_manage_modules"     ON lesson_modules USING (
  get_my_role() = 'admin' AND EXISTS (SELECT 1 FROM classes WHERE id = lesson_modules.class_id AND tenant_id = get_my_tenant_id())
);

-- MODULE DOCUMENTS
CREATE POLICY "view_module_docs"   ON module_documents FOR SELECT USING (
  EXISTS (SELECT 1 FROM lesson_modules lm WHERE lm.id = module_documents.module_id AND (am_i_teacher_of_class(lm.class_id) OR am_i_student_of_class(lm.class_id)))
);
CREATE POLICY "teacher_manage_docs" ON module_documents USING (
  EXISTS (SELECT 1 FROM lesson_modules lm WHERE lm.id = module_documents.module_id AND am_i_teacher_of_class(lm.class_id))
);

-- ATTENDANCE
CREATE POLICY "super_admin_all_attendance"  ON attendance_sessions USING (is_super_admin());
CREATE POLICY "teacher_manage_attendance"   ON attendance_sessions USING (teacher_id = auth.uid());
CREATE POLICY "admin_view_attendance"       ON attendance_sessions FOR SELECT USING (
  get_my_role() = 'admin' AND EXISTS (SELECT 1 FROM classes WHERE id = attendance_sessions.class_id AND tenant_id = get_my_tenant_id())
);
CREATE POLICY "super_admin_all_records"     ON attendance_records USING (is_super_admin());
CREATE POLICY "teacher_manage_records"      ON attendance_records USING (
  EXISTS (SELECT 1 FROM attendance_sessions WHERE id = attendance_records.session_id AND teacher_id = auth.uid())
);
CREATE POLICY "student_view_own_records"    ON attendance_records FOR SELECT USING (student_id = auth.uid());

-- PAYMENTS
CREATE POLICY "super_admin_all_payments" ON payments USING (is_super_admin());
CREATE POLICY "admin_view_own_payments"  ON payments FOR SELECT USING (
  get_my_role() = 'admin' AND tenant_id = get_my_tenant_id()
);

-- AUDIT LOGS
CREATE POLICY "super_admin_all_logs" ON audit_logs USING (is_super_admin());
CREATE POLICY "admin_view_own_logs"  ON audit_logs FOR SELECT USING (
  get_my_role() = 'admin' AND tenant_id = get_my_tenant_id()
);
