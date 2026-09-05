-- ============================================================
-- Migration 28 — drop the pupil home address (Art. 5(1)(c) AVG)
-- ============================================================
-- Written 2026-09-05, after the school answered the data-minimisation
-- questions put to them on 2026-09-04.
--
-- The school's coordinator confirmed the address field has not been used for
-- years and can be removed. (Names of client staff stay out of this repo — it
-- is public. The verbatim exchange is in legal/TODO.md, which is not.)
--
-- It was the highest-risk, lowest-value field in the schema: the home address
-- of a minor, rendered on the dossier page and read by no logic anywhere in the
-- application. Parent e-mail, parent phone and the emergency contact cover the
-- case the school actually needs. The controller has now confirmed there is no
-- purpose, and a field without a purpose cannot lawfully be kept.
--
-- The other two fields in that question were KEPT, both with a purpose the
-- school stated and which is now recorded rather than assumed:
--   · gender         — the school runs activities for boys and girls separately
--                       and filters on it
--   · date_of_birth  — some activities have an age limit and need the exact
--                       age; it also places a pupil in the right age band (the
--                       groups are literally 6-8 / 9-11 / 12-14 jaar)
--
-- Also removed from the published privacyverklaring and from
-- legal/privacyverklaring.md in the same change: continuing to disclose a
-- category we no longer collect is its own accuracy defect.
--
-- ⚠️ ORDER IS THE OPPOSITE OF MIGRATION 27. Deploy the code FIRST, then run
-- this. 27 ADDED a column the app writes, so the column had to exist before the
-- build that writes it went live. 28 DROPS a column the app stops writing: if
-- it is dropped while the previous build is still serving, every dossier save
-- fails (an UPSERT naming a dropped column errors) until the deploy catches up.
-- Deploying first is harmless the other way round — the new build simply never
-- touches the column while it still exists.
--
-- Irreversible: the addresses are gone. The real tenant holds no pupil rows
-- yet, and the demo tenant is fabricated, so nothing of value is lost today.
--
-- Idempotent: safe to run twice.

BEGIN;

ALTER TABLE public.student_details DROP COLUMN IF EXISTS address;

COMMIT;

-- ---- Verification -------------------------------------------------------
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'student_details'
--  ORDER BY ordinal_position;
-- Expect: student_id, tenant_id, date_of_birth, gender, parent_email,
--         parent_phone, emergency_contact_name, emergency_contact_phone,
--         family_id, created_at, updated_at  — and no `address`.
