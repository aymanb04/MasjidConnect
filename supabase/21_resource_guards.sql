-- ============================================================
-- Migration 21 — resource guards (small-tier safety backstops)
--
-- Cheap, reversible, server-side limits so client-side caps are also
-- enforced by the database/storage layer. Rationale and the broader
-- capacity plan live in the internal ops notes (not in this repo).
--
-- Apply in the Supabase SQL editor. Fully reversible (see footer).
-- ============================================================

-- ── 1. Server-side file-size caps ───────────────────────────
-- Mirror the client upload limits at the bucket level so Storage
-- itself rejects an oversized object (HTTP 413) regardless of client.
UPDATE storage.buckets SET file_size_limit = 20971520 WHERE id = 'submission-files';   -- 20 MB
UPDATE storage.buckets SET file_size_limit = 20971520 WHERE id = 'module-documents';   -- 20 MB
UPDATE storage.buckets SET file_size_limit = 10485760 WHERE id = 'student-documents';  -- 10 MB
UPDATE storage.buckets SET file_size_limit = 10485760 WHERE id = 'student-reports';    -- 10 MB (dormant)

-- Public + currently unused (no UI, no insert policy → writes denied today).
-- Cap them now so if the avatar/logo feature is ever wired up, an uncapped
-- public bucket can't ship by accident. Whoever adds the insert policy should
-- re-confirm the limit then.
UPDATE storage.buckets SET file_size_limit = 2097152  WHERE id = 'avatars';             -- 2 MB
UPDATE storage.buckets SET file_size_limit = 2097152  WHERE id = 'tenant-logos';        -- 2 MB

-- ── 2. Bound any single runaway query ───────────────────────
-- Caps one expensive statement from pinning shared IO. Every real
-- query here is sub-second (even the year-transition runs many small
-- per-class statements, not one big one), so 10s is a ~10x margin.
-- idle_in_transaction releases connections a stuck client leaves open.
-- NOTE: if the verify query below shows an existing tighter value,
-- keep the tighter one — do not loosen.
ALTER ROLE authenticated SET statement_timeout = '10s';
ALTER ROLE authenticated SET idle_in_transaction_session_timeout = '30s';

-- Reload so the ALTER ROLE settings take effect on new connections.
-- (New PostgREST connections pick them up; existing ones roll over.)
NOTIFY pgrst, 'reload config';

-- ============================================================
-- Verify:
--   SELECT id, file_size_limit FROM storage.buckets ORDER BY id;
--   SELECT rolname, rolconfig FROM pg_roles WHERE rolname = 'authenticated';
--
-- Rollback:
--   UPDATE storage.buckets SET file_size_limit = NULL
--     WHERE id IN ('submission-files','module-documents','student-documents','student-reports');
--   ALTER ROLE authenticated RESET statement_timeout;
--   ALTER ROLE authenticated RESET idle_in_transaction_session_timeout;
-- ============================================================
