-- ============================================================
-- Migration 22 — tenant square icon
--
-- A tenant's `logo_url` is often a wide banner (icon + wordmark),
-- which looks tiny/cropped in the small square sidebar slot. Add a
-- separate optional square-icon URL for those small slots; the full
-- logo keeps being used where there's width (rapport, etc.).
--
-- Rendering fallback (client): logo_icon_url → contain(logo_url) → glyph.
--
-- Apply in the Supabase SQL editor. Reversible: DROP COLUMN.
-- ============================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS logo_icon_url text;

-- No RLS change: tenants policies already cover all columns.
-- ============================================================
-- Rollback:  ALTER TABLE public.tenants DROP COLUMN logo_icon_url;
-- ============================================================
