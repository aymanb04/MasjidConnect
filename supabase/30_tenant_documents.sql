-- ============================================================
-- Migration 30 — schooldocumenten per tenant (schoolreglement e.a.)
-- ============================================================
-- Written 2026-09-11. De Kroon asked to put their schoolreglement in the app.
-- Built generically rather than as a "schoolreglement" feature: the next three
-- requests will be the schoolkalender, a brief over het inschrijvingsgeld and
-- the vakantieregeling, and those then cost nothing.
--
-- WHAT THIS RECORDS, AND WHAT IT DOES NOT
-- An acknowledgement here means: this signed-in person opened the app and
-- confirmed they read version N of this document, at this moment. It is NOT a
-- parent's signature, and nothing in the UI may present it as one — parents
-- have no accounts, some pupils are 16-17 and start on their own, and plenty of
-- parents are unreachable after enrolment. A record labelled "ouder getekend"
-- that a child clicked is worse than no record: it is exactly the evidence that
-- collapses when a parent disputes something.
--
-- That is fine legally. The binding agreement is the ENROLMENT, which a parent
-- already signed on paper. A schoolreglement is rules imposed under it, so what
-- the school needs to show is that people were informed — which is precisely
-- what this table holds.
--
-- School's decisions (2026-09-11): pupils who have not acknowledged are
-- FLAGGED, not blocked — the child is not the one who failed to read it — and
-- teachers may consult the document too.
--
-- Idempotent. RUN IN: Supabase SQL editor.

BEGIN;

-- ---- Tables -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_documents (
  id           uuid NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id    uuid NOT NULL,
  doc_type     text NOT NULL DEFAULT 'reglement'
    CHECK (doc_type IN ('reglement', 'kalender', 'brief', 'other')),
  title        text NOT NULL,
  file_name    text NOT NULL,
  file_url     text NOT NULL,          -- storage path, not a public URL
  -- Bumped whenever the file is replaced. Acknowledgements are recorded against
  -- the version, so a new reglement re-asks everyone automatically and nobody
  -- has to wonder which text a person actually saw.
  version      integer NOT NULL DEFAULT 1,
  requires_ack boolean NOT NULL DEFAULT true,
  is_published boolean NOT NULL DEFAULT true,
  uploaded_by  uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_documents_pkey PRIMARY KEY (id),
  CONSTRAINT tenant_documents_tenant_fkey FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT tenant_documents_uploader_fkey FOREIGN KEY (uploaded_by)
    REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.tenant_document_acks (
  id          uuid NOT NULL DEFAULT uuid_generate_v4(),
  -- tenant_id is denormalised on purpose: RLS that has to join another
  -- RLS-protected table silently returns nothing here (see the nested-join
  -- gotcha that has bitten this project repeatedly).
  tenant_id   uuid NOT NULL,
  document_id uuid NOT NULL,
  user_id     uuid NOT NULL,
  version     integer NOT NULL,
  acked_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_document_acks_pkey PRIMARY KEY (id),
  CONSTRAINT tenant_document_acks_unique UNIQUE (document_id, user_id, version),
  CONSTRAINT tenant_document_acks_doc_fkey FOREIGN KEY (document_id)
    REFERENCES public.tenant_documents(id) ON DELETE CASCADE,
  CONSTRAINT tenant_document_acks_user_fkey FOREIGN KEY (user_id)
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT tenant_document_acks_tenant_fkey FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_documents_tenant ON public.tenant_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_doc_acks_doc     ON public.tenant_document_acks(document_id);
CREATE INDEX IF NOT EXISTS idx_tenant_doc_acks_user    ON public.tenant_document_acks(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_doc_acks_tenant  ON public.tenant_document_acks(tenant_id);

DROP TRIGGER IF EXISTS tenant_documents_updated_at ON public.tenant_documents;
CREATE TRIGGER tenant_documents_updated_at
  BEFORE UPDATE ON public.tenant_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.tenant_documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_document_acks ENABLE ROW LEVEL SECURITY;

-- ---- RLS: tenant_documents ----------------------------------------------
-- Everyone in the tenant reads published documents; only admins manage them.

DROP POLICY IF EXISTS members_view_tenant_documents ON public.tenant_documents;
CREATE POLICY members_view_tenant_documents ON public.tenant_documents
  FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin())
    OR (tenant_id = (SELECT get_my_tenant_id()) AND is_published = true)
  );

DROP POLICY IF EXISTS admin_manage_tenant_documents ON public.tenant_documents;
CREATE POLICY admin_manage_tenant_documents ON public.tenant_documents
  FOR ALL TO authenticated
  USING (
    (SELECT is_super_admin())
    OR ((SELECT get_my_role())::text = 'admin' AND tenant_id = (SELECT get_my_tenant_id()))
  )
  WITH CHECK (
    (SELECT is_super_admin())
    OR ((SELECT get_my_role())::text = 'admin' AND tenant_id = (SELECT get_my_tenant_id()))
  );

-- ---- RLS: tenant_document_acks ------------------------------------------
-- A person may record their OWN acknowledgement and nobody else's — otherwise
-- the record proves nothing. Staff may read them, because the whole point is an
-- overview of who still has to.

DROP POLICY IF EXISTS own_insert_document_ack ON public.tenant_document_acks;
CREATE POLICY own_insert_document_ack ON public.tenant_document_acks
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND tenant_id = (SELECT get_my_tenant_id())
  );

DROP POLICY IF EXISTS view_document_acks ON public.tenant_document_acks;
CREATE POLICY view_document_acks ON public.tenant_document_acks
  FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin())
    OR user_id = (SELECT auth.uid())
    OR (
      tenant_id = (SELECT get_my_tenant_id())
      AND (SELECT get_my_role())::text = ANY (ARRAY['admin', 'teacher', 'leerlingenbegeleiding'])
    )
  );

-- Deliberately NO update/delete policy: an acknowledgement is a dated fact.
-- Removing one happens through GDPR erasure (lib/gdpr-erasure.ts, service role),
-- not through the app.

-- ---- Storage -------------------------------------------------------------
-- Path: {tenant_id}/{ts}_{name} → foldername[1] = tenant.
-- ⚠️ Inside EXISTS subqueries the path MUST be storage.objects.name (see mig 12).

INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-documents', 'tenant-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS tenant_docs_select ON storage.objects;
CREATE POLICY tenant_docs_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'tenant-documents'
    AND (
      (SELECT is_super_admin())
      OR (storage.foldername(name))[1] = (SELECT get_my_tenant_id())::text
    )
  );

DROP POLICY IF EXISTS tenant_docs_write ON storage.objects;
CREATE POLICY tenant_docs_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-documents'
    AND (storage.foldername(name))[1] = (SELECT get_my_tenant_id())::text
    AND (SELECT get_my_role())::text = ANY (ARRAY['admin', 'super_admin'])
  );

DROP POLICY IF EXISTS tenant_docs_delete ON storage.objects;
CREATE POLICY tenant_docs_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'tenant-documents'
    AND (storage.foldername(name))[1] = (SELECT get_my_tenant_id())::text
    AND (SELECT get_my_role())::text = ANY (ARRAY['admin', 'super_admin'])
  );

COMMIT;

-- 10 MB cap, in line with the other document buckets (migration 21).
UPDATE storage.buckets SET file_size_limit = 10485760 WHERE id = 'tenant-documents';

-- ---- Verification -------------------------------------------------------
-- SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'tenant-documents';
-- SELECT polname FROM pg_policy WHERE polrelid = 'public.tenant_documents'::regclass;
-- SELECT polname FROM pg_policy WHERE polrelid = 'public.tenant_document_acks'::regclass;
