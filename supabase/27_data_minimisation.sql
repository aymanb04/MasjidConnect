-- ============================================================
-- Migration 27 — data minimisation (Art. 5(1)(c) AVG)
-- ============================================================
-- Written 2026-09-02 during the legal/DPO review. Removes personal-data
-- surface that NOTHING in the application reads or writes. Verified by
-- grepping app/, components/ and lib/ before writing this file:
--
--   profiles.avatar_url  — referenced only by lib/types.ts and the anonymize
--                          route's scrub list. There is no upload UI and no
--                          display anywhere in the product. Yet the column
--                          existed alongside an `avatars` bucket provisioned
--                          for photographs of minors, for a feature that was
--                          never built. (Recorded as PUBLIC in the docs since
--                          2026-08-09; verified PRIVATE and empty on
--                          2026-09-03 — someone flipped it, or the original
--                          note was wrong. Removed either way: unused.)
--   profiles.last_seen_at — never written, never read. Behavioural metadata
--                          with no purpose, which is exactly what Art. 5(1)(c)
--                          asks us not to keep.
--
-- The formal privacyverklaring disclosed "profielfoto (optioneel)" as a
-- collected category. After this migration that disclosure is removed too —
-- claiming to collect what you do not collect is its own accuracy defect.
--
-- ORDERING: migration 26 (26_cross_tenant_write_sweep.sql) was applied to prod
-- on 2026-09-03, before this one. Both are now live.
--
-- ⚠️ DEPLOY ORDER: APPLY THIS MIGRATION *BEFORE* PUSHING THE CODE.
-- /api/user/archive now writes profiles.archived_at. If the code deploys while
-- the column does not exist yet, every archive action fails. The two DROPs are
-- order-independent (nothing reads those columns any more), but the ADD is not.
--
-- Idempotent: safe to run twice.

BEGIN;

-- ---- 1. Drop the unused columns ----------------------------------------
-- If either DROP fails with a dependency error, an RLS policy or view still
-- references the column. Find it with:
--   SELECT polname, polrelid::regclass FROM pg_policy
--    WHERE pg_get_expr(polqual, polrelid) ILIKE '%avatar_url%'
--       OR pg_get_expr(polwithcheck, polrelid) ILIKE '%avatar_url%';

ALTER TABLE public.profiles DROP COLUMN IF EXISTS avatar_url;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS last_seen_at;

-- ---- 1b. Add the one timestamp retention actually needs -----------------
-- The privacy statement now publishes retention periods that all start at
-- "uitschrijving" — but archiving only flipped is_active, so nothing recorded
-- WHEN it happened and no period could be computed, let alone enforced.
-- Set by /api/user/archive, cleared by /api/user/reactivate, read by
-- scripts/retention-report.mjs.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone;

COMMENT ON COLUMN public.profiles.archived_at IS
  'When this user was archived (uitgeschreven). Start of the retention clock published in the privacyverklaring. NULL for active users.';

-- Existing archived users predate this column: their clock starts now rather
-- than at an unknown past date. Deliberately conservative — it keeps data
-- slightly longer instead of deleting on a guessed date.
UPDATE public.profiles
   SET archived_at = now()
 WHERE is_active = false
   AND archived_at IS NULL;

COMMIT;

-- ---- 2. Remove the public `avatars` bucket — NOT IN SQL ------------------
-- This migration originally did `DELETE FROM storage.objects` here. Supabase
-- refuses it (2026-09-03):
--
--   ERROR: 42501: Direct deletion from storage tables is not allowed.
--          Use the Storage API instead.
--          CONTEXT: PL/pgSQL function storage.protect_delete()
--
-- The guard is right — deleting object rows in SQL leaves the actual files
-- orphaned in the backing store, which is the same class of bug this whole
-- review was about. Because the statement sat inside the transaction above,
-- the failure rolled back the column changes too.
--
-- The bucket is therefore removed out of band, via the Storage API:
--   scripts/drop-avatars-bucket.mjs   (lists first, refuses to delete if the
--                                      bucket turns out not to be empty)
-- or by hand: dashboard → Storage → avatars → Delete bucket.

-- ---- Verification -------------------------------------------------------
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'profiles'
--    AND column_name IN ('avatar_url', 'last_seen_at');   -- expect 0 rows
-- SELECT id, public FROM storage.buckets ORDER BY id;      -- expect no 'avatars'
--
-- Remaining public bucket after this migration: `tenant-logos` only, which
-- holds school logos (no personal data) and is public by design.
