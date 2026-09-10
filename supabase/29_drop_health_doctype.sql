-- ============================================================
-- Migration 29 — remove the "zorg/beperking" document type
-- ============================================================
-- Written 2026-09-10. The dossier offered three document types: contract,
-- disability ("Zorg/beperking") and other. The middle one is the only reason
-- this platform processes special-category data under Art. 9 AVG.
--
-- It was never used. Zero rows in student_documents, in any tenant, ever —
-- the same test that removed the pupil's home address (28), the avatar column
-- and last_seen_at (27). The school confirmed it does not use it and does not
-- plan to.
--
-- What the removal buys, beyond one dropdown entry:
--   · no Art. 9 data by design, so no explicit-consent chain to obtain,
--     evidence, or honour a withdrawal of;
--   · the DPIA case weakens materially — special-category data was one of the
--     strongest criteria pushing it toward mandatory;
--   · the parent information sheet and the consent form both lose their most
--     legally delicate section, the one still carrying a [JURIDISCH NA TE
--     KIJKEN] flag.
--
-- What it does NOT do, stated plainly so nobody claims more than is true: a
-- teacher can still type something medical into a note, or upload a doctor's
-- letter under "Overig". That is a user acting outside the school's
-- instructions — the controller's responsibility, managed by policy. The
-- difference is that the product no longer *invites and structures* health
-- data, which is what makes processing "systematic" in the Art. 9 sense.
--
-- ⚠️ DEPLOY THE CODE FIRST, then run this — same order as migration 28. The
-- constraint gets stricter, so an older build still offering the option would
-- hit a constraint violation on save. The new build never sends the value.
--
-- Idempotent: safe to run twice.

BEGIN;

-- Fails loudly rather than silently discarding data if the assumption is wrong.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.student_documents WHERE doc_type = 'disability';
  IF n > 0 THEN
    RAISE EXCEPTION 'Er bestaan % document(en) van het type disability. Verplaats of verwijder ze eerst.', n;
  END IF;
END $$;

ALTER TABLE public.student_documents
  DROP CONSTRAINT IF EXISTS student_documents_doc_type_check;

ALTER TABLE public.student_documents
  ADD CONSTRAINT student_documents_doc_type_check
  CHECK (doc_type IN ('contract', 'other'));

COMMIT;

-- ---- Verification -------------------------------------------------------
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conname = 'student_documents_doc_type_check';
-- Expect: CHECK (doc_type = ANY (ARRAY['contract'::text, 'other'::text]))
