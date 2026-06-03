-- ============================================================
-- Migration 10 — Terms & privacy acceptance tracking
-- ============================================================
-- Records when a user accepted the Voorwaarden (privacyverklaring +
-- gebruikersovereenkomst) and which version they accepted.
--
-- The app gates the dashboard: a logged-in user whose terms_accepted_at is
-- null, or whose terms_version is older than the current version, is routed
-- to /akkoord before they can use the app.
--
-- No new RLS policy is needed: the existing "update_own_profile" policy
-- already lets a user update their own row as long as role/tenant_id are
-- unchanged, so writing these two columns passes the WITH CHECK.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS terms_version     integer NOT NULL DEFAULT 0;
