-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.announcements (
                                      id uuid NOT NULL DEFAULT uuid_generate_v4(),
                                      tenant_id uuid NOT NULL,
                                      class_id uuid,
                                      created_by uuid NOT NULL,
                                      title character varying NOT NULL,
                                      content text,
                                      is_published boolean DEFAULT true,
                                      published_at timestamp with time zone DEFAULT now(),
                                      created_at timestamp with time zone DEFAULT now(),
                                      CONSTRAINT announcements_pkey PRIMARY KEY (id),
                                      CONSTRAINT announcements_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
                                      CONSTRAINT announcements_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id),
                                      CONSTRAINT announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.assignments (
                                    id uuid NOT NULL DEFAULT uuid_generate_v4(),
                                    class_id uuid NOT NULL,
                                    created_by uuid NOT NULL,
                                    title character varying NOT NULL,
                                    description text,
                                    due_date timestamp with time zone,
                                    max_score integer,
                                    allow_text_submission boolean DEFAULT true,
                                    allow_file_submission boolean DEFAULT true,
                                    is_published boolean DEFAULT true,
                                    created_at timestamp with time zone DEFAULT now(),
                                    updated_at timestamp with time zone DEFAULT now(),
                                    CONSTRAINT assignments_pkey PRIMARY KEY (id),
                                    CONSTRAINT assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id),
                                    CONSTRAINT assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.attendance_records (
                                           id uuid NOT NULL DEFAULT uuid_generate_v4(),
                                           session_id uuid NOT NULL,
                                           student_id uuid NOT NULL,
                                           status character varying DEFAULT 'present'::character varying CHECK (status::text = ANY (ARRAY['present'::character varying, 'absent'::character varying, 'late'::character varying, 'excused'::character varying]::text[])),
                                           note text,
                                           CONSTRAINT attendance_records_pkey PRIMARY KEY (id),
                                           CONSTRAINT attendance_records_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.attendance_sessions(id),
                                           CONSTRAINT attendance_records_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.attendance_sessions (
                                            id uuid NOT NULL DEFAULT uuid_generate_v4(),
                                            class_id uuid NOT NULL,
                                            teacher_id uuid NOT NULL,
                                            session_date date NOT NULL,
                                            notes text,
                                            created_at timestamp with time zone DEFAULT now(),
                                            CONSTRAINT attendance_sessions_pkey PRIMARY KEY (id),
                                            CONSTRAINT attendance_sessions_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id),
                                            CONSTRAINT attendance_sessions_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.audit_logs (
                                   id uuid NOT NULL DEFAULT uuid_generate_v4(),
                                   tenant_id uuid,
                                   user_id uuid,
                                   action character varying NOT NULL,
                                   entity_type character varying,
                                   entity_id uuid,
                                   metadata jsonb,
                                   ip_address inet,
                                   created_at timestamp with time zone DEFAULT now(),
                                   CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
                                   CONSTRAINT audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
                                   CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.class_sessions (
                                       id uuid NOT NULL DEFAULT uuid_generate_v4(),
                                       class_id uuid NOT NULL,
                                       tenant_id uuid NOT NULL,
                                       day_of_week smallint NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
                                       start_time time without time zone NOT NULL,
                                       end_time time without time zone NOT NULL,
                                       location character varying,
                                       created_at timestamp with time zone DEFAULT now(),
                                       CONSTRAINT class_sessions_pkey PRIMARY KEY (id),
                                       CONSTRAINT class_sessions_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id),
                                       CONSTRAINT class_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
);
CREATE TABLE public.class_students (
                                       id uuid NOT NULL DEFAULT uuid_generate_v4(),
                                       class_id uuid NOT NULL,
                                       student_id uuid NOT NULL,
                                       enrolled_at timestamp with time zone DEFAULT now(),
                                       CONSTRAINT class_students_pkey PRIMARY KEY (id),
                                       CONSTRAINT class_students_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id),
                                       CONSTRAINT class_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.class_teachers (
                                       id uuid NOT NULL DEFAULT uuid_generate_v4(),
                                       class_id uuid NOT NULL,
                                       teacher_id uuid NOT NULL,
                                       assigned_at timestamp with time zone DEFAULT now(),
                                       CONSTRAINT class_teachers_pkey PRIMARY KEY (id),
                                       CONSTRAINT class_teachers_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id),
                                       CONSTRAINT class_teachers_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.classes (
                                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                                tenant_id uuid NOT NULL,
                                school_year_id uuid NOT NULL,
                                name character varying NOT NULL,
                                description text,
                                color character varying DEFAULT '#1B6B4A'::character varying,
                                icon character varying DEFAULT 'book'::character varying,
                                is_archived boolean DEFAULT false,
                                created_at timestamp with time zone DEFAULT now(),
                                updated_at timestamp with time zone DEFAULT now(),
                                group_id uuid,
                                CONSTRAINT classes_pkey PRIMARY KEY (id),
                                CONSTRAINT classes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
                                CONSTRAINT classes_school_year_id_fkey FOREIGN KEY (school_year_id) REFERENCES public.school_years(id),
                                CONSTRAINT classes_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id)
);
CREATE TABLE public.groups (
                               id uuid NOT NULL DEFAULT uuid_generate_v4(),
                               tenant_id uuid NOT NULL,
                               school_year_id uuid NOT NULL,
                               name character varying NOT NULL,
                               created_at timestamp with time zone DEFAULT now(),
                               CONSTRAINT groups_pkey PRIMARY KEY (id),
                               CONSTRAINT groups_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
                               CONSTRAINT groups_school_year_id_fkey FOREIGN KEY (school_year_id) REFERENCES public.school_years(id)
);
CREATE TABLE public.invitations (
                                    id uuid NOT NULL DEFAULT uuid_generate_v4(),
                                    tenant_id uuid NOT NULL,
                                    email character varying NOT NULL,
                                    role character varying NOT NULL CHECK (role::text = ANY (ARRAY['admin'::character varying, 'teacher'::character varying, 'student'::character varying]::text[])),
  class_id uuid,
  token character varying NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'::text) UNIQUE,
  invited_by uuid NOT NULL,
  accepted_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '7 days'::interval),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT invitations_pkey PRIMARY KEY (id),
  CONSTRAINT invitations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT invitations_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id),
  CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.lesson_modules (
                                       id uuid NOT NULL DEFAULT uuid_generate_v4(),
                                       class_id uuid NOT NULL,
                                       created_by uuid NOT NULL,
                                       title character varying NOT NULL,
                                       description text,
                                       is_visible boolean DEFAULT true,
                                       order_index integer DEFAULT 0,
                                       created_at timestamp with time zone DEFAULT now(),
                                       updated_at timestamp with time zone DEFAULT now(),
                                       CONSTRAINT lesson_modules_pkey PRIMARY KEY (id),
                                       CONSTRAINT lesson_modules_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id),
                                       CONSTRAINT lesson_modules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.module_documents (
                                         id uuid NOT NULL DEFAULT uuid_generate_v4(),
                                         module_id uuid NOT NULL,
                                         title character varying NOT NULL,
                                         file_name character varying NOT NULL,
                                         file_url text NOT NULL,
                                         file_size integer,
                                         file_type character varying,
                                         order_index integer DEFAULT 0,
                                         uploaded_at timestamp with time zone DEFAULT now(),
                                         CONSTRAINT module_documents_pkey PRIMARY KEY (id),
                                         CONSTRAINT module_documents_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.lesson_modules(id)
);
CREATE TABLE public.payments (
                                 id uuid NOT NULL DEFAULT uuid_generate_v4(),
                                 tenant_id uuid NOT NULL,
                                 amount numeric NOT NULL,
                                 currency character varying DEFAULT 'EUR'::character varying,
                                 status character varying DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'paid'::character varying, 'failed'::character varying, 'refunded'::character varying]::text[])),
                                 stripe_id character varying,
                                 period_start date,
                                 period_end date,
                                 paid_at timestamp with time zone,
                                 created_at timestamp with time zone DEFAULT now(),
                                 CONSTRAINT payments_pkey PRIMARY KEY (id),
                                 CONSTRAINT payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
);
CREATE TABLE public.profiles (
                                 id uuid NOT NULL,
                                 tenant_id uuid,
                                 role character varying NOT NULL CHECK (role::text = ANY (ARRAY['super_admin'::character varying, 'admin'::character varying, 'teacher'::character varying, 'student'::character varying]::text[])),
  first_name character varying NOT NULL,
  last_name character varying NOT NULL,
  avatar_url text,
  phone character varying,
  is_active boolean DEFAULT true,
  last_seen_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  email character varying,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.school_years (
                                     id uuid NOT NULL DEFAULT uuid_generate_v4(),
                                     tenant_id uuid NOT NULL,
                                     name character varying NOT NULL,
                                     start_date date NOT NULL,
                                     end_date date NOT NULL,
                                     is_active boolean DEFAULT true,
                                     created_at timestamp with time zone DEFAULT now(),
                                     CONSTRAINT school_years_pkey PRIMARY KEY (id),
                                     CONSTRAINT school_years_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
);
CREATE TABLE public.submission_feedback (
                                            id uuid NOT NULL DEFAULT uuid_generate_v4(),
                                            submission_id uuid NOT NULL UNIQUE,
                                            teacher_id uuid NOT NULL,
                                            score integer,
                                            comment text,
                                            created_at timestamp with time zone DEFAULT now(),
                                            updated_at timestamp with time zone DEFAULT now(),
                                            CONSTRAINT submission_feedback_pkey PRIMARY KEY (id),
                                            CONSTRAINT submission_feedback_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id),
                                            CONSTRAINT submission_feedback_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.submission_files (
                                         id uuid NOT NULL DEFAULT uuid_generate_v4(),
                                         submission_id uuid NOT NULL,
                                         file_name character varying NOT NULL,
                                         file_url text NOT NULL,
                                         file_size integer,
                                         file_type character varying,
                                         uploaded_at timestamp with time zone DEFAULT now(),
                                         CONSTRAINT submission_files_pkey PRIMARY KEY (id),
                                         CONSTRAINT submission_files_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id)
);
CREATE TABLE public.submissions (
                                    id uuid NOT NULL DEFAULT uuid_generate_v4(),
                                    assignment_id uuid NOT NULL,
                                    student_id uuid NOT NULL,
                                    text_content text,
                                    status character varying DEFAULT 'submitted'::character varying CHECK (status::text = ANY (ARRAY['draft'::character varying, 'submitted'::character varying, 'graded'::character varying, 'returned'::character varying]::text[])),
                                    submitted_at timestamp with time zone DEFAULT now(),
                                    updated_at timestamp with time zone DEFAULT now(),
                                    CONSTRAINT submissions_pkey PRIMARY KEY (id),
                                    CONSTRAINT submissions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignments(id),
                                    CONSTRAINT submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.tenants (
                                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                                name character varying NOT NULL,
                                slug character varying NOT NULL UNIQUE,
                                address text,
                                city character varying,
                                phone character varying,
                                email character varying,
                                logo_url text,
                                is_active boolean DEFAULT true,
                                subscription_status character varying DEFAULT 'trial'::character varying CHECK (subscription_status::text = ANY (ARRAY['trial'::character varying, 'active'::character varying, 'inactive'::character varying, 'cancelled'::character varying]::text[])),
                                subscription_price numeric DEFAULT 500.00,
                                subscription_interval character varying DEFAULT 'yearly'::character varying CHECK (subscription_interval::text = ANY (ARRAY['monthly'::character varying, 'yearly'::character varying]::text[])),
                                trial_ends_at timestamp with time zone,
                                notes text,
                                created_at timestamp with time zone DEFAULT now(),
                                updated_at timestamp with time zone DEFAULT now(),
                                website_url text,
                                CONSTRAINT tenants_pkey PRIMARY KEY (id)
);

---POLICIES---
[
  {
    "schemaname": "public",
    "tablename": "announcements",
    "policyname": "admin_manage_announcements",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "(((get_my_role())::text = 'admin'::text) AND (tenant_id = get_my_tenant_id()))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "announcements",
    "policyname": "announcements_delete",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "DELETE",
    "qual": "((created_by = auth.uid()) OR ((( SELECT profiles.role\n   FROM profiles\n  WHERE (profiles.id = auth.uid())))::text = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::text[])))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "announcements",
    "policyname": "announcements_insert",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "((created_by = auth.uid()) AND (tenant_id = ( SELECT profiles.tenant_id\n   FROM profiles\n  WHERE (profiles.id = auth.uid()))) AND (((( SELECT profiles.role\n   FROM profiles\n  WHERE (profiles.id = auth.uid())))::text = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::text[])) OR ((class_id IS NOT NULL) AND (class_id IN ( SELECT class_teachers.class_id\n   FROM class_teachers\n  WHERE (class_teachers.teacher_id = auth.uid()))))))"
  },
  {
    "schemaname": "public",
    "tablename": "announcements",
    "policyname": "announcements_read",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "((tenant_id = ( SELECT profiles.tenant_id\n   FROM profiles\n  WHERE (profiles.id = auth.uid()))) AND ((class_id IS NULL) OR (class_id IN ( SELECT class_students.class_id\n   FROM class_students\n  WHERE (class_students.student_id = auth.uid())\nUNION\n SELECT class_teachers.class_id\n   FROM class_teachers\n  WHERE (class_teachers.teacher_id = auth.uid())))))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "announcements",
    "policyname": "student_read_announcements",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "((tenant_id = get_my_tenant_id()) AND ((class_id IS NULL) OR (EXISTS ( SELECT 1\n   FROM class_students\n  WHERE ((class_students.class_id = announcements.class_id) AND (class_students.student_id = auth.uid()))))))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "announcements",
    "policyname": "super_admin_all_announcements",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "is_super_admin()",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "announcements",
    "policyname": "teacher_delete_own_announcements",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "DELETE",
    "qual": "(((get_my_role())::text = 'teacher'::text) AND (created_by = auth.uid()))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "announcements",
    "policyname": "teacher_post_announcements",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "(((get_my_role())::text = 'teacher'::text) AND (tenant_id = get_my_tenant_id()) AND (class_id IS NOT NULL) AND (EXISTS ( SELECT 1\n   FROM class_teachers\n  WHERE ((class_teachers.class_id = announcements.class_id) AND (class_teachers.teacher_id = auth.uid())))) AND (created_by = auth.uid()))"
  },
  {
    "schemaname": "public",
    "tablename": "announcements",
    "policyname": "teacher_read_announcements",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "((tenant_id = get_my_tenant_id()) AND ((class_id IS NULL) OR (EXISTS ( SELECT 1\n   FROM class_teachers\n  WHERE ((class_teachers.class_id = announcements.class_id) AND (class_teachers.teacher_id = auth.uid()))))))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "assignments",
    "policyname": "student_view_assignments",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "((is_published = true) AND (EXISTS ( SELECT 1\n   FROM class_students\n  WHERE ((class_students.class_id = assignments.class_id) AND (class_students.student_id = auth.uid())))))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "assignments",
    "policyname": "super_admin_all_assignments",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "is_super_admin()",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "assignments",
    "policyname": "teacher_manage_assignments",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "((EXISTS ( SELECT 1\n   FROM (class_teachers ct\n     JOIN classes c ON ((c.id = ct.class_id)))\n  WHERE ((ct.teacher_id = auth.uid()) AND (assignments.class_id = c.id) AND (c.tenant_id = get_my_tenant_id())))) OR (((get_my_role())::text = 'admin'::text) AND (EXISTS ( SELECT 1\n   FROM classes\n  WHERE ((classes.id = assignments.class_id) AND (classes.tenant_id = get_my_tenant_id()))))))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "audit_logs",
    "policyname": "super_admin_all_logs",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "is_super_admin()",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "class_sessions",
    "policyname": "admin_manage_sessions",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "(((get_my_role())::text = 'admin'::text) AND (tenant_id = get_my_tenant_id()))",
    "with_check": "(((get_my_role())::text = 'admin'::text) AND (tenant_id = get_my_tenant_id()))"
  },
  {
    "schemaname": "public",
    "tablename": "class_sessions",
    "policyname": "student_view_sessions",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "am_i_student_of_class(class_id)",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "class_sessions",
    "policyname": "super_admin_all_sessions",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "is_super_admin()",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "class_sessions",
    "policyname": "teacher_view_sessions",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "am_i_teacher_of_class(class_id)",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "class_students",
    "policyname": "admin_manage_class_students",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "(is_super_admin() OR (((get_my_role())::text = 'admin'::text) AND (EXISTS ( SELECT 1\n   FROM classes\n  WHERE ((classes.id = class_students.class_id) AND (classes.tenant_id = get_my_tenant_id()))))))",
    "with_check": "(is_super_admin() OR (((get_my_role())::text = 'admin'::text) AND (EXISTS ( SELECT 1\n   FROM classes\n  WHERE ((classes.id = class_students.class_id) AND (classes.tenant_id = get_my_tenant_id()))))))"
  },
  {
    "schemaname": "public",
    "tablename": "class_students",
    "policyname": "super_admin_class_students",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "is_super_admin()",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "class_students",
    "policyname": "teacher_view_class_students",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "((EXISTS ( SELECT 1\n   FROM (class_teachers ct\n     JOIN classes c ON ((c.id = ct.class_id)))\n  WHERE ((ct.teacher_id = auth.uid()) AND (ct.class_id = class_students.class_id) AND (c.tenant_id = get_my_tenant_id())))) OR ((get_my_role())::text = 'admin'::text))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "class_students",
    "policyname": "view_class_students",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "(is_super_admin() OR ((get_my_role())::text = 'admin'::text) OR (student_id = auth.uid()) OR am_i_teacher_of_class(class_id))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "class_teachers",
    "policyname": "admin_manage_class_teachers",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "(is_super_admin() OR (((get_my_role())::text = 'admin'::text) AND (EXISTS ( SELECT 1\n   FROM classes\n  WHERE ((classes.id = class_teachers.class_id) AND (classes.tenant_id = get_my_tenant_id()))))))",
    "with_check": "(is_super_admin() OR (((get_my_role())::text = 'admin'::text) AND (EXISTS ( SELECT 1\n   FROM classes\n  WHERE ((classes.id = class_teachers.class_id) AND (classes.tenant_id = get_my_tenant_id()))))))"
  },
  {
    "schemaname": "public",
    "tablename": "class_teachers",
    "policyname": "super_admin_class_teachers",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "is_super_admin()",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "class_teachers",
    "policyname": "view_class_teachers",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "(is_super_admin() OR ((get_my_role())::text = 'admin'::text) OR (teacher_id = auth.uid()) OR am_i_student_of_class(class_id))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "classes",
    "policyname": "admin_manage_classes",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "(((get_my_role())::text = 'admin'::text) AND (tenant_id = get_my_tenant_id()))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "classes",
    "policyname": "member_view_own_classes",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "((tenant_id = get_my_tenant_id()) AND (((get_my_role())::text = 'admin'::text) OR am_i_teacher_of_class(id) OR am_i_student_of_class(id)))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "classes",
    "policyname": "super_admin_all_classes",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "is_super_admin()",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "groups",
    "policyname": "admin_manage_groups",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "(((get_my_role())::text = 'admin'::text) AND (tenant_id = get_my_tenant_id()))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "groups",
    "policyname": "member_view_groups",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "((tenant_id = get_my_tenant_id()) AND (((get_my_role())::text = 'admin'::text) OR am_i_member_of_group(id)))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "groups",
    "policyname": "super_admin_all_groups",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "is_super_admin()",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "invitations",
    "policyname": "admin_manage_invitations",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "(((get_my_role())::text = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::text[])) AND ((tenant_id = get_my_tenant_id()) OR is_super_admin()))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "lesson_modules",
    "policyname": "admin_manage_modules",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "(((get_my_role())::text = 'admin'::text) AND (EXISTS ( SELECT 1\n   FROM classes\n  WHERE ((classes.id = lesson_modules.class_id) AND (classes.tenant_id = get_my_tenant_id())))))",
    "with_check": "(((get_my_role())::text = 'admin'::text) AND (EXISTS ( SELECT 1\n   FROM classes\n  WHERE ((classes.id = lesson_modules.class_id) AND (classes.tenant_id = get_my_tenant_id())))))"
  },
  {
    "schemaname": "public",
    "tablename": "lesson_modules",
    "policyname": "student_view_visible_modules",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "((is_visible = true) AND (EXISTS ( SELECT 1\n   FROM class_students\n  WHERE ((class_students.class_id = lesson_modules.class_id) AND (class_students.student_id = auth.uid())))))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "lesson_modules",
    "policyname": "super_admin_all_modules",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "is_super_admin()",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "lesson_modules",
    "policyname": "teacher_manage_modules",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "((EXISTS ( SELECT 1\n   FROM class_teachers\n  WHERE ((class_teachers.class_id = lesson_modules.class_id) AND (class_teachers.teacher_id = auth.uid())))) OR (((get_my_role())::text = 'admin'::text) AND (EXISTS ( SELECT 1\n   FROM classes\n  WHERE ((classes.id = lesson_modules.class_id) AND (classes.tenant_id = get_my_tenant_id()))))))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "module_documents",
    "policyname": "admin_manage_docs",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "(EXISTS ( SELECT 1\n   FROM (lesson_modules lm\n     JOIN classes c ON ((c.id = lm.class_id)))\n  WHERE ((lm.id = module_documents.module_id) AND (c.tenant_id = get_my_tenant_id()) AND ((get_my_role())::text = 'admin'::text))))",
    "with_check": "(EXISTS ( SELECT 1\n   FROM (lesson_modules lm\n     JOIN classes c ON ((c.id = lm.class_id)))\n  WHERE ((lm.id = module_documents.module_id) AND (c.tenant_id = get_my_tenant_id()) AND ((get_my_role())::text = 'admin'::text))))"
  },
  {
    "schemaname": "public",
    "tablename": "module_documents",
    "policyname": "student_view_docs",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "(EXISTS ( SELECT 1\n   FROM (lesson_modules lm\n     JOIN class_students cs ON ((cs.class_id = lm.class_id)))\n  WHERE ((lm.id = module_documents.module_id) AND (cs.student_id = auth.uid()) AND (lm.is_visible = true))))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "module_documents",
    "policyname": "teacher_manage_docs",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "((EXISTS ( SELECT 1\n   FROM (lesson_modules lm\n     JOIN class_teachers ct ON ((ct.class_id = lm.class_id)))\n  WHERE ((lm.id = module_documents.module_id) AND (ct.teacher_id = auth.uid())))) OR ((get_my_role())::text = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::text[])))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "payments",
    "policyname": "admin_view_own_payments",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "((tenant_id = get_my_tenant_id()) AND ((get_my_role())::text = 'admin'::text))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "payments",
    "policyname": "super_admin_all_payments",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "is_super_admin()",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "profiles",
    "policyname": "admin_manage_profiles",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "(((get_my_role())::text = 'admin'::text) AND (tenant_id = get_my_tenant_id()))",
    "with_check": "(((get_my_role())::text = 'admin'::text) AND (tenant_id = get_my_tenant_id()) AND ((role)::text = ANY ((ARRAY['student'::character varying, 'teacher'::character varying, 'admin'::character varying])::text[])))"
  },
  {
    "schemaname": "public",
    "tablename": "profiles",
    "policyname": "super_admin_all_profiles",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "is_super_admin()",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "profiles",
    "policyname": "update_own_profile",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "UPDATE",
    "qual": "(id = auth.uid())",
    "with_check": "((id = auth.uid()) AND ((role)::text = (( SELECT profiles_1.role\n   FROM profiles profiles_1\n  WHERE (profiles_1.id = auth.uid())))::text) AND (tenant_id = ( SELECT profiles_1.tenant_id\n   FROM profiles profiles_1\n  WHERE (profiles_1.id = auth.uid()))))"
  },
  {
    "schemaname": "public",
    "tablename": "profiles",
    "policyname": "view_own_profile",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "(id = auth.uid())",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "profiles",
    "policyname": "view_same_tenant_profiles",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "(tenant_id = get_my_tenant_id())",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "school_years",
    "policyname": "admin_manage_years",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "(((get_my_role())::text = 'admin'::text) AND (tenant_id = get_my_tenant_id()))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "school_years",
    "policyname": "super_admin_all_years",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "is_super_admin()",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "school_years",
    "policyname": "tenant_members_view_years",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "(tenant_id = get_my_tenant_id())",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "submission_feedback",
    "policyname": "admin_view_feedback",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "(((get_my_role())::text = 'admin'::text) AND (EXISTS ( SELECT 1\n   FROM ((submissions s\n     JOIN assignments a ON ((a.id = s.assignment_id)))\n     JOIN classes c ON ((c.id = a.class_id)))\n  WHERE ((s.id = submission_feedback.submission_id) AND (c.tenant_id = get_my_tenant_id())))))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "submission_feedback",
    "policyname": "student_view_own_feedback",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "(EXISTS ( SELECT 1\n   FROM submissions\n  WHERE ((submissions.id = submission_feedback.submission_id) AND (submissions.student_id = auth.uid()))))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "submission_feedback",
    "policyname": "teacher_manage_feedback",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "(((teacher_id = auth.uid()) OR ((get_my_role())::text = 'admin'::text)) AND (EXISTS ( SELECT 1\n   FROM ((submissions s\n     JOIN assignments a ON ((a.id = s.assignment_id)))\n     JOIN classes c ON ((c.id = a.class_id)))\n  WHERE ((s.id = submission_feedback.submission_id) AND (c.tenant_id = get_my_tenant_id())))))",
    "with_check": "(((teacher_id = auth.uid()) OR ((get_my_role())::text = 'admin'::text)) AND (EXISTS ( SELECT 1\n   FROM ((submissions s\n     JOIN assignments a ON ((a.id = s.assignment_id)))\n     JOIN classes c ON ((c.id = a.class_id)))\n  WHERE ((s.id = submission_feedback.submission_id) AND (c.tenant_id = get_my_tenant_id())))))"
  },
  {
    "schemaname": "public",
    "tablename": "submission_feedback",
    "policyname": "teacher_view_class_feedback",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "(EXISTS ( SELECT 1\n   FROM ((submissions s\n     JOIN assignments a ON ((a.id = s.assignment_id)))\n     JOIN class_teachers ct ON ((ct.class_id = a.class_id)))\n  WHERE ((s.id = submission_feedback.submission_id) AND (ct.teacher_id = auth.uid()))))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "submission_files",
    "policyname": "admin_view_submission_files",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "(((get_my_role())::text = 'admin'::text) AND (EXISTS ( SELECT 1\n   FROM ((submissions s\n     JOIN assignments a ON ((a.id = s.assignment_id)))\n     JOIN classes c ON ((c.id = a.class_id)))\n  WHERE ((s.id = submission_files.submission_id) AND (c.tenant_id = get_my_tenant_id())))))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "submission_files",
    "policyname": "student_manage_own_files",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "(EXISTS ( SELECT 1\n   FROM submissions\n  WHERE ((submissions.id = submission_files.submission_id) AND (submissions.student_id = auth.uid()))))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "submission_files",
    "policyname": "super_admin_all_submission_files",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "is_super_admin()",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "submission_files",
    "policyname": "teacher_view_submission_files",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "((EXISTS ( SELECT 1\n   FROM ((submissions s\n     JOIN assignments a ON ((a.id = s.assignment_id)))\n     JOIN class_teachers ct ON ((ct.class_id = a.class_id)))\n  WHERE ((s.id = submission_files.submission_id) AND (ct.teacher_id = auth.uid())))) OR ((get_my_role())::text = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::text[])))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "submissions",
    "policyname": "student_manage_own_submissions",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "(student_id = auth.uid())",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "submissions",
    "policyname": "super_admin_all_submissions",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "is_super_admin()",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "submissions",
    "policyname": "teacher_update_submissions",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "UPDATE",
    "qual": "((EXISTS ( SELECT 1\n   FROM (assignments a\n     JOIN class_teachers ct ON ((ct.class_id = a.class_id)))\n  WHERE ((a.id = submissions.assignment_id) AND (ct.teacher_id = auth.uid())))) OR ((get_my_role())::text = 'admin'::text))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "submissions",
    "policyname": "teacher_view_submissions",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "((EXISTS ( SELECT 1\n   FROM (assignments a\n     JOIN class_teachers ct ON ((ct.class_id = a.class_id)))\n  WHERE ((a.id = submissions.assignment_id) AND (ct.teacher_id = auth.uid())))) OR ((get_my_role())::text = 'admin'::text))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "tenants",
    "policyname": "admin_view_own_tenant",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "(id = get_my_tenant_id())",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "tenants",
    "policyname": "super_admin_all_tenants",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "ALL",
    "qual": "is_super_admin()",
    "with_check": null
  }
]