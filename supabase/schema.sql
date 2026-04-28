-- ============================================================
-- MasjidConnect — Volledig Database Schema
-- Supabase / PostgreSQL
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TENANTS (Moskeeën)
-- ============================================================
CREATE TABLE tenants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(100) UNIQUE NOT NULL,        -- masjidconnect.be/slug
  address         TEXT,
  city            VARCHAR(100),
  phone           VARCHAR(50),
  email           VARCHAR(255),
  logo_url        TEXT,
  is_active       BOOLEAN DEFAULT true,
  subscription_status  VARCHAR(50) DEFAULT 'trial'
    CHECK (subscription_status IN ('trial','active','inactive','cancelled')),
  subscription_price   DECIMAL(10,2) DEFAULT 500.00,
  subscription_interval VARCHAR(20) DEFAULT 'yearly'
    CHECK (subscription_interval IN ('monthly','yearly')),
  trial_ends_at   TIMESTAMPTZ,
  notes           TEXT,                                -- super admin notities
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SCHOOL YEARS
-- ============================================================
CREATE TABLE school_years (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,   -- bijv. "2024-2025"
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROFILES (koppeling met Supabase auth.users)
-- ============================================================
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = super_admin
  role        VARCHAR(20) NOT NULL
    CHECK (role IN ('super_admin','admin','teacher','student')),
  first_name  VARCHAR(100) NOT NULL,
  last_name   VARCHAR(100) NOT NULL,
  avatar_url  TEXT,
  phone       VARCHAR(50),
  is_active   BOOLEAN DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CLASSES (Klassen)
-- ============================================================
CREATE TABLE classes (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_year_id UUID NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
  name           VARCHAR(255) NOT NULL,
  description    TEXT,
  color          VARCHAR(7) DEFAULT '#1B6B4A',
  icon           VARCHAR(50) DEFAULT 'book',
  is_archived    BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CLASS TEACHERS (many-to-many)
-- ============================================================
CREATE TABLE class_teachers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id    UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(class_id, teacher_id)
);

-- ============================================================
-- CLASS STUDENTS (many-to-many)
-- ============================================================
CREATE TABLE class_students (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id    UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(class_id, student_id)
);

-- ============================================================
-- ASSIGNMENTS (Huiswerk)
-- ============================================================
CREATE TABLE assignments (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id              UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  created_by            UUID NOT NULL REFERENCES profiles(id),
  title                 VARCHAR(255) NOT NULL,
  description           TEXT,
  due_date              TIMESTAMPTZ,
  max_score             INTEGER,                   -- NULL = geen score
  allow_text_submission BOOLEAN DEFAULT true,
  allow_file_submission BOOLEAN DEFAULT true,
  is_published          BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SUBMISSIONS (Ingediende taken)
-- ============================================================
CREATE TABLE submissions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES profiles(id),
  text_content  TEXT,
  status        VARCHAR(20) DEFAULT 'submitted'
    CHECK (status IN ('draft','submitted','graded','returned')),
  submitted_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(assignment_id, student_id)
);

-- ============================================================
-- SUBMISSION FILES
-- ============================================================
CREATE TABLE submission_files (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  file_name     VARCHAR(255) NOT NULL,
  file_url      TEXT NOT NULL,
  file_size     INTEGER,
  file_type     VARCHAR(100),
  uploaded_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SUBMISSION FEEDBACK
-- ============================================================
CREATE TABLE submission_feedback (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  teacher_id    UUID NOT NULL REFERENCES profiles(id),
  score         INTEGER,
  comment       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(submission_id, teacher_id)
);

-- ============================================================
-- LESSON MODULES
-- ============================================================
CREATE TABLE lesson_modules (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id    UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  created_by  UUID NOT NULL REFERENCES profiles(id),
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  is_visible  BOOLEAN DEFAULT true,
  order_index INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MODULE DOCUMENTS
-- ============================================================
CREATE TABLE module_documents (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module_id   UUID NOT NULL REFERENCES lesson_modules(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  file_name   VARCHAR(255) NOT NULL,
  file_url    TEXT NOT NULL,
  file_size   INTEGER,
  file_type   VARCHAR(100),
  order_index INTEGER DEFAULT 0,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ATTENDANCE (V2 — structuur al aanwezig)
-- ============================================================
CREATE TABLE attendance_sessions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id     UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id   UUID NOT NULL REFERENCES profiles(id),
  session_date DATE NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(class_id, session_date)
);

CREATE TABLE attendance_records (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id),
  status     VARCHAR(20) DEFAULT 'present'
    CHECK (status IN ('present','absent','late','excused')),
  note       TEXT,
  UNIQUE(session_id, student_id)
);

-- ============================================================
-- ANNOUNCEMENTS (V2 — structuur al aanwezig)
-- ============================================================
CREATE TABLE announcements (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  class_id     UUID REFERENCES classes(id) ON DELETE CASCADE,  -- NULL = alle klassen
  created_by   UUID NOT NULL REFERENCES profiles(id),
  title        VARCHAR(255) NOT NULL,
  content      TEXT NOT NULL,
  is_published BOOLEAN DEFAULT true,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INVITATIONS
-- ============================================================
CREATE TABLE invitations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       VARCHAR(255) NOT NULL,
  role        VARCHAR(20) NOT NULL CHECK (role IN ('admin','teacher','student')),
  class_id    UUID REFERENCES classes(id),
  token       VARCHAR(255) UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32),'hex'),
  invited_by  UUID NOT NULL REFERENCES profiles(id),
  accepted_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PAYMENTS (V2 — structuur al aanwezig)
-- ============================================================
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount          DECIMAL(10,2) NOT NULL,
  currency        VARCHAR(3) DEFAULT 'EUR',
  status          VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending','paid','failed','refunded')),
  stripe_id       VARCHAR(255),
  period_start    DATE,
  period_end      DATE,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID REFERENCES tenants(id),
  user_id     UUID REFERENCES profiles(id),
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id   UUID,
  metadata    JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_profiles_tenant       ON profiles(tenant_id);
CREATE INDEX idx_profiles_role         ON profiles(role);
CREATE INDEX idx_classes_tenant        ON classes(tenant_id);
CREATE INDEX idx_classes_school_year   ON classes(school_year_id);
CREATE INDEX idx_class_teachers_class  ON class_teachers(class_id);
CREATE INDEX idx_class_teachers_teacher ON class_teachers(teacher_id);
CREATE INDEX idx_class_students_class  ON class_students(class_id);
CREATE INDEX idx_class_students_student ON class_students(student_id);
CREATE INDEX idx_assignments_class     ON assignments(class_id);
CREATE INDEX idx_submissions_assignment ON submissions(assignment_id);
CREATE INDEX idx_submissions_student   ON submissions(student_id);
CREATE INDEX idx_lesson_modules_class  ON lesson_modules(class_id);
CREATE INDEX idx_invitations_token     ON invitations(token);
CREATE INDEX idx_invitations_email     ON invitations(email);
CREATE INDEX idx_audit_logs_tenant     ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user       ON audit_logs(user_id);

-- ============================================================
-- UPDATED AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated_at         BEFORE UPDATE ON tenants         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_profiles_updated_at        BEFORE UPDATE ON profiles        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_classes_updated_at         BEFORE UPDATE ON classes         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_assignments_updated_at     BEFORE UPDATE ON assignments     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_submissions_updated_at     BEFORE UPDATE ON submissions     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_lesson_modules_updated_at  BEFORE UPDATE ON lesson_modules  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_feedback_updated_at        BEFORE UPDATE ON submission_feedback FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- AUTO-CREATE PROFILE ON AUTH SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, first_name, last_name, role, tenant_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    (NEW.raw_user_meta_data->>'tenant_id')::UUID
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- HELPER FUNCTIONS (gebruikt in RLS policies)
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

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE tenants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_years         ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_teachers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_students       ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_files     ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_feedback  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_modules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs           ENABLE ROW LEVEL SECURITY;

-- TENANTS
CREATE POLICY "super_admin_all_tenants"   ON tenants USING (is_super_admin());
CREATE POLICY "admin_view_own_tenant"     ON tenants FOR SELECT USING (id = get_my_tenant_id());

-- SCHOOL YEARS
CREATE POLICY "super_admin_all_years"     ON school_years USING (is_super_admin());
CREATE POLICY "tenant_view_own_years"     ON school_years FOR SELECT USING (tenant_id = get_my_tenant_id());
CREATE POLICY "admin_manage_years"        ON school_years USING (get_my_role() = 'admin' AND tenant_id = get_my_tenant_id());

-- PROFILES
CREATE POLICY "super_admin_all_profiles"  ON profiles USING (is_super_admin());
CREATE POLICY "view_same_tenant_profiles" ON profiles FOR SELECT USING (tenant_id = get_my_tenant_id() OR id = auth.uid());
CREATE POLICY "update_own_profile"        ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "admin_manage_profiles"     ON profiles USING (get_my_role() = 'admin' AND tenant_id = get_my_tenant_id());

-- CLASSES
CREATE POLICY "super_admin_all_classes"   ON classes USING (is_super_admin());
CREATE POLICY "admin_manage_classes"      ON classes USING (get_my_role() = 'admin' AND tenant_id = get_my_tenant_id());
CREATE POLICY "teacher_view_own_classes"  ON classes FOR SELECT USING (
  tenant_id = get_my_tenant_id() AND (
    get_my_role() = 'admin' OR
    EXISTS (SELECT 1 FROM class_teachers WHERE class_id = classes.id AND teacher_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM class_students WHERE class_id = classes.id AND student_id = auth.uid())
  )
);

-- CLASS TEACHERS
CREATE POLICY "super_admin_class_teachers"  ON class_teachers USING (is_super_admin());
CREATE POLICY "admin_manage_class_teachers" ON class_teachers USING (
  get_my_role() = 'admin' AND
  EXISTS (SELECT 1 FROM classes WHERE id = class_teachers.class_id AND tenant_id = get_my_tenant_id())
);
CREATE POLICY "view_class_teachers"         ON class_teachers FOR SELECT USING (
  EXISTS (SELECT 1 FROM classes WHERE id = class_teachers.class_id AND tenant_id = get_my_tenant_id())
);

-- CLASS STUDENTS
CREATE POLICY "super_admin_class_students"  ON class_students USING (is_super_admin());
CREATE POLICY "admin_manage_class_students" ON class_students USING (
  get_my_role() = 'admin' AND
  EXISTS (SELECT 1 FROM classes WHERE id = class_students.class_id AND tenant_id = get_my_tenant_id())
);
CREATE POLICY "view_class_students"         ON class_students FOR SELECT USING (
  EXISTS (SELECT 1 FROM classes WHERE id = class_students.class_id AND tenant_id = get_my_tenant_id()) AND
  get_my_role() IN ('admin','teacher')
);
CREATE POLICY "student_view_own_enrollment" ON class_students FOR SELECT USING (student_id = auth.uid());

-- ASSIGNMENTS
CREATE POLICY "super_admin_all_assignments" ON assignments USING (is_super_admin());
CREATE POLICY "teacher_manage_assignments"  ON assignments USING (
  EXISTS (
    SELECT 1 FROM class_teachers ct
    JOIN classes c ON c.id = ct.class_id
    WHERE ct.teacher_id = auth.uid()
      AND c.tenant_id = get_my_tenant_id()
      AND assignments.class_id = c.id
  ) OR (get_my_role() = 'admin' AND EXISTS (
    SELECT 1 FROM classes WHERE id = assignments.class_id AND tenant_id = get_my_tenant_id()
  ))
);
CREATE POLICY "student_view_assignments"    ON assignments FOR SELECT USING (
  is_published = true AND
  EXISTS (SELECT 1 FROM class_students WHERE class_id = assignments.class_id AND student_id = auth.uid())
);

-- SUBMISSIONS
CREATE POLICY "super_admin_all_submissions" ON submissions USING (is_super_admin());
CREATE POLICY "student_manage_own_submissions" ON submissions USING (student_id = auth.uid());
CREATE POLICY "teacher_view_submissions"    ON submissions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM assignments a
    JOIN class_teachers ct ON ct.class_id = a.class_id
    WHERE a.id = submissions.assignment_id AND ct.teacher_id = auth.uid()
  ) OR (get_my_role() = 'admin')
);

-- SUBMISSION FILES
CREATE POLICY "student_manage_own_files"    ON submission_files USING (
  EXISTS (SELECT 1 FROM submissions WHERE id = submission_files.submission_id AND student_id = auth.uid())
);
CREATE POLICY "teacher_view_submission_files" ON submission_files FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN class_teachers ct ON ct.class_id = a.class_id
    WHERE s.id = submission_files.submission_id AND ct.teacher_id = auth.uid()
  ) OR get_my_role() IN ('admin','super_admin')
);

-- SUBMISSION FEEDBACK
CREATE POLICY "teacher_manage_feedback"     ON submission_feedback USING (teacher_id = auth.uid() OR get_my_role() = 'admin');
CREATE POLICY "student_view_own_feedback"   ON submission_feedback FOR SELECT USING (
  EXISTS (SELECT 1 FROM submissions WHERE id = submission_feedback.submission_id AND student_id = auth.uid())
);

-- LESSON MODULES
CREATE POLICY "super_admin_all_modules"     ON lesson_modules USING (is_super_admin());
CREATE POLICY "teacher_manage_modules"      ON lesson_modules USING (
  EXISTS (SELECT 1 FROM class_teachers WHERE class_id = lesson_modules.class_id AND teacher_id = auth.uid())
  OR (get_my_role() = 'admin' AND EXISTS (
    SELECT 1 FROM classes WHERE id = lesson_modules.class_id AND tenant_id = get_my_tenant_id()
  ))
);
CREATE POLICY "student_view_visible_modules" ON lesson_modules FOR SELECT USING (
  is_visible = true AND
  EXISTS (SELECT 1 FROM class_students WHERE class_id = lesson_modules.class_id AND student_id = auth.uid())
);

-- MODULE DOCUMENTS
CREATE POLICY "teacher_manage_docs"         ON module_documents USING (
  EXISTS (
    SELECT 1 FROM lesson_modules lm
    JOIN class_teachers ct ON ct.class_id = lm.class_id
    WHERE lm.id = module_documents.module_id AND ct.teacher_id = auth.uid()
  ) OR get_my_role() IN ('admin','super_admin')
);
CREATE POLICY "student_view_docs"           ON module_documents FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM lesson_modules lm
    JOIN class_students cs ON cs.class_id = lm.class_id
    WHERE lm.id = module_documents.module_id AND cs.student_id = auth.uid() AND lm.is_visible = true
  )
);

-- INVITATIONS
CREATE POLICY "admin_manage_invitations"    ON invitations USING (
  get_my_role() IN ('admin','super_admin') AND tenant_id = get_my_tenant_id()
);
CREATE POLICY "super_admin_all_invitations" ON invitations USING (is_super_admin());

-- PAYMENTS
CREATE POLICY "super_admin_all_payments"    ON payments USING (is_super_admin());
CREATE POLICY "admin_view_own_payments"     ON payments FOR SELECT USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'admin');

-- AUDIT LOGS
CREATE POLICY "super_admin_all_logs"        ON audit_logs USING (is_super_admin());

-- ============================================================
-- STORAGE BUCKETS (uitvoeren via Supabase dashboard of API)
-- ============================================================
-- Bucket: submission-files  (private)
-- Bucket: module-documents  (private)
-- Bucket: avatars           (public)
-- Bucket: tenant-logos      (public)
