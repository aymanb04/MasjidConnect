-- ============================================================
-- Migration 14 — Student dossiers: details, families, notes, documents
-- Source: mosque feedback 2026-06-09 (FEEDBACK_BUILD_PLAN §B)
-- Requires: migration 13 (leerlingenbegeleiding role)
-- ============================================================
--
-- Access model:
--   admin                  → full CRUD, own tenant
--   leerlingenbegeleiding  → read all dossiers in tenant; add notes + documents
--   teacher                → read/write only for students they teach
--   student                → read own student_details row only (no notes/docs)
--   super_admin            → everything
--   Payments stay OUT of this scope entirely (see migration 15).
--
-- Idempotent. RUN IN: Supabase SQL editor.
-- ============================================================

-- ---- Tables ------------------------------------------------

CREATE TABLE IF NOT EXISTS public.families (
  id         uuid NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id  uuid NOT NULL,
  label      text NOT NULL,           -- e.g. family surname
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT families_pkey PRIMARY KEY (id),
  CONSTRAINT families_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.student_details (
  student_id              uuid NOT NULL,
  tenant_id               uuid NOT NULL,
  date_of_birth           date,
  gender                  text CHECK (gender IN ('m', 'f')),
  address                 text,
  parent_email            text,
  parent_phone            text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  family_id               uuid,
  created_at              timestamp with time zone DEFAULT now(),
  updated_at              timestamp with time zone DEFAULT now(),
  CONSTRAINT student_details_pkey PRIMARY KEY (student_id),
  CONSTRAINT student_details_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT student_details_tenant_id_fkey  FOREIGN KEY (tenant_id)  REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT student_details_family_id_fkey  FOREIGN KEY (family_id)  REFERENCES public.families(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.student_notes (
  id         uuid NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id  uuid NOT NULL,
  student_id uuid NOT NULL,
  author_id  uuid NOT NULL,
  body       text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT student_notes_pkey PRIMARY KEY (id),
  CONSTRAINT student_notes_tenant_id_fkey  FOREIGN KEY (tenant_id)  REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT student_notes_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT student_notes_author_id_fkey  FOREIGN KEY (author_id)  REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.student_documents (
  id          uuid NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL,
  student_id  uuid NOT NULL,
  doc_type    text NOT NULL DEFAULT 'other' CHECK (doc_type IN ('contract', 'disability', 'other')),
  file_name   text NOT NULL,
  file_url    text NOT NULL,           -- storage path, not a public URL
  note        text,
  uploaded_by uuid NOT NULL,
  created_at  timestamp with time zone DEFAULT now(),
  CONSTRAINT student_documents_pkey PRIMARY KEY (id),
  CONSTRAINT student_documents_tenant_id_fkey   FOREIGN KEY (tenant_id)   REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT student_documents_student_id_fkey  FOREIGN KEY (student_id)  REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT student_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_families_tenant            ON public.families(tenant_id);
CREATE INDEX IF NOT EXISTS idx_student_details_tenant     ON public.student_details(tenant_id);
CREATE INDEX IF NOT EXISTS idx_student_details_family     ON public.student_details(family_id);
CREATE INDEX IF NOT EXISTS idx_student_notes_student      ON public.student_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_student_notes_tenant       ON public.student_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_student_documents_student  ON public.student_documents(student_id);
CREATE INDEX IF NOT EXISTS idx_student_documents_tenant   ON public.student_documents(tenant_id);

ALTER TABLE public.families          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_details   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_notes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_documents ENABLE ROW LEVEL SECURITY;

-- updated_at trigger (function already exists)
DROP TRIGGER IF EXISTS student_details_updated_at ON public.student_details;
CREATE TRIGGER student_details_updated_at
  BEFORE UPDATE ON public.student_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---- RLS: families -----------------------------------------

DROP POLICY IF EXISTS staff_view_families ON public.families;
CREATE POLICY staff_view_families ON public.families
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT get_my_tenant_id())
    AND (SELECT get_my_role())::text = ANY (ARRAY['admin', 'leerlingenbegeleiding', 'teacher'])
  );

DROP POLICY IF EXISTS admin_manage_families ON public.families;
CREATE POLICY admin_manage_families ON public.families
  FOR ALL TO authenticated
  USING (
    (SELECT get_my_role())::text = 'admin'
    AND tenant_id = (SELECT get_my_tenant_id())
  )
  WITH CHECK (
    (SELECT get_my_role())::text = 'admin'
    AND tenant_id = (SELECT get_my_tenant_id())
  );

DROP POLICY IF EXISTS super_admin_all_families ON public.families;
CREATE POLICY super_admin_all_families ON public.families
  FOR ALL TO authenticated
  USING ((SELECT is_super_admin()));

-- ---- RLS: student_details ----------------------------------

-- Read: admin + counselor whole tenant; teacher only own students; student own row
DROP POLICY IF EXISTS read_student_details ON public.student_details;
CREATE POLICY read_student_details ON public.student_details
  FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin())
    OR student_id = (SELECT auth.uid())
    OR (
      tenant_id = (SELECT get_my_tenant_id())
      AND (
        (SELECT get_my_role())::text = ANY (ARRAY['admin', 'leerlingenbegeleiding'])
        OR EXISTS (
          SELECT 1 FROM class_students cs
          JOIN class_teachers ct ON ct.class_id = cs.class_id
          WHERE cs.student_id = student_details.student_id
            AND ct.teacher_id = (SELECT auth.uid())
        )
      )
    )
  );

-- Write: admin (tenant) or teacher of the student. Counselor is read-only here.
DROP POLICY IF EXISTS staff_write_student_details ON public.student_details;
CREATE POLICY staff_write_student_details ON public.student_details
  FOR ALL TO authenticated
  USING (
    (SELECT is_super_admin())
    OR (
      tenant_id = (SELECT get_my_tenant_id())
      AND (
        (SELECT get_my_role())::text = 'admin'
        OR EXISTS (
          SELECT 1 FROM class_students cs
          JOIN class_teachers ct ON ct.class_id = cs.class_id
          WHERE cs.student_id = student_details.student_id
            AND ct.teacher_id = (SELECT auth.uid())
        )
      )
    )
  )
  WITH CHECK (
    (SELECT is_super_admin())
    OR (
      tenant_id = (SELECT get_my_tenant_id())
      AND (
        (SELECT get_my_role())::text = 'admin'
        OR EXISTS (
          SELECT 1 FROM class_students cs
          JOIN class_teachers ct ON ct.class_id = cs.class_id
          WHERE cs.student_id = student_details.student_id
            AND ct.teacher_id = (SELECT auth.uid())
        )
      )
    )
  );

-- ---- RLS: student_notes (students have NO access) ----------

DROP POLICY IF EXISTS staff_read_student_notes ON public.student_notes;
CREATE POLICY staff_read_student_notes ON public.student_notes
  FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin())
    OR (
      tenant_id = (SELECT get_my_tenant_id())
      AND (
        (SELECT get_my_role())::text = ANY (ARRAY['admin', 'leerlingenbegeleiding'])
        OR EXISTS (
          SELECT 1 FROM class_students cs
          JOIN class_teachers ct ON ct.class_id = cs.class_id
          WHERE cs.student_id = student_notes.student_id
            AND ct.teacher_id = (SELECT auth.uid())
        )
      )
    )
  );

-- Insert: admin/counselor (tenant) or teacher of the student; always as self
DROP POLICY IF EXISTS staff_insert_student_notes ON public.student_notes;
CREATE POLICY staff_insert_student_notes ON public.student_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND (
      (SELECT is_super_admin())
      OR (
        tenant_id = (SELECT get_my_tenant_id())
        AND (
          (SELECT get_my_role())::text = ANY (ARRAY['admin', 'leerlingenbegeleiding'])
          OR EXISTS (
            SELECT 1 FROM class_students cs
            JOIN class_teachers ct ON ct.class_id = cs.class_id
            WHERE cs.student_id = student_notes.student_id
              AND ct.teacher_id = (SELECT auth.uid())
          )
        )
      )
    )
  );

-- Delete: own note, or admin in tenant
DROP POLICY IF EXISTS delete_student_notes ON public.student_notes;
CREATE POLICY delete_student_notes ON public.student_notes
  FOR DELETE TO authenticated
  USING (
    (SELECT is_super_admin())
    OR author_id = (SELECT auth.uid())
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND tenant_id = (SELECT get_my_tenant_id())
    )
  );

-- ---- RLS: student_documents (students have NO access) ------

DROP POLICY IF EXISTS staff_read_student_documents ON public.student_documents;
CREATE POLICY staff_read_student_documents ON public.student_documents
  FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin())
    OR (
      tenant_id = (SELECT get_my_tenant_id())
      AND (
        (SELECT get_my_role())::text = ANY (ARRAY['admin', 'leerlingenbegeleiding'])
        OR EXISTS (
          SELECT 1 FROM class_students cs
          JOIN class_teachers ct ON ct.class_id = cs.class_id
          WHERE cs.student_id = student_documents.student_id
            AND ct.teacher_id = (SELECT auth.uid())
        )
      )
    )
  );

DROP POLICY IF EXISTS staff_insert_student_documents ON public.student_documents;
CREATE POLICY staff_insert_student_documents ON public.student_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    AND (
      (SELECT is_super_admin())
      OR (
        tenant_id = (SELECT get_my_tenant_id())
        AND (
          (SELECT get_my_role())::text = ANY (ARRAY['admin', 'leerlingenbegeleiding'])
          OR EXISTS (
            SELECT 1 FROM class_students cs
            JOIN class_teachers ct ON ct.class_id = cs.class_id
            WHERE cs.student_id = student_documents.student_id
              AND ct.teacher_id = (SELECT auth.uid())
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS delete_student_documents ON public.student_documents;
CREATE POLICY delete_student_documents ON public.student_documents
  FOR DELETE TO authenticated
  USING (
    (SELECT is_super_admin())
    OR uploaded_by = (SELECT auth.uid())
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND tenant_id = (SELECT get_my_tenant_id())
    )
  );

-- ---- Storage: private bucket student-documents -------------
-- Path: {tenant_id}/{student_id}/{ts}_{name} → foldername[1]=tenant, [2]=student
-- Students get NO storage access (staff-facing dossier documents).
-- ⚠️ Inside EXISTS subqueries the path MUST be storage.objects.name (see mig 12).

INSERT INTO storage.buckets (id, name, public)
VALUES ('student-documents', 'student-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS student_docs_select ON storage.objects;
CREATE POLICY student_docs_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'student-documents'
    AND (
      (SELECT is_super_admin())
      OR (
        (storage.foldername(name))[1] = (SELECT get_my_tenant_id())::text
        AND (
          (SELECT get_my_role())::text = ANY (ARRAY['admin', 'leerlingenbegeleiding'])
          OR EXISTS (
            SELECT 1 FROM class_students cs
            JOIN class_teachers ct ON ct.class_id = cs.class_id
            WHERE cs.student_id = ((storage.foldername(storage.objects.name))[2])::uuid
              AND ct.teacher_id = (SELECT auth.uid())
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS student_docs_insert ON storage.objects;
CREATE POLICY student_docs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'student-documents'
    AND (
      (SELECT is_super_admin())
      OR (
        (storage.foldername(name))[1] = (SELECT get_my_tenant_id())::text
        AND (
          (SELECT get_my_role())::text = ANY (ARRAY['admin', 'leerlingenbegeleiding'])
          OR EXISTS (
            SELECT 1 FROM class_students cs
            JOIN class_teachers ct ON ct.class_id = cs.class_id
            WHERE cs.student_id = ((storage.foldername(storage.objects.name))[2])::uuid
              AND ct.teacher_id = (SELECT auth.uid())
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS student_docs_delete ON storage.objects;
CREATE POLICY student_docs_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'student-documents'
    AND (
      (SELECT is_super_admin())
      OR (
        (storage.foldername(name))[1] = (SELECT get_my_tenant_id())::text
        AND (SELECT get_my_role())::text = 'admin'
      )
      OR owner = (SELECT auth.uid())
    )
  );

-- ============================================================
-- VERIFICATION
-- ============================================================
-- select tablename, policyname, cmd from pg_policies
--   where tablename in ('families','student_details','student_notes','student_documents')
--   or (tablename='objects' and policyname like 'student_docs_%')
-- order by tablename, policyname;
