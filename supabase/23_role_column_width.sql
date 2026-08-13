-- Migration 23 — widen the role columns so 'leerlingenbegeleiding' fits.
--
-- Bug found 2026-08-13. The live columns are character varying(20); the role
-- string 'leerlingenbegeleiding' is 21 characters. Every attempt to create a
-- counselor therefore failed inside the handle_new_user trigger with
-- "value too long for type character varying(20)", which GoTrue surfaced as a
-- generic 500 and /api/invite reported as "Uitnodiging kon niet worden
-- verzonden" — pointing at e-mail delivery rather than the database.
--
-- Consequence: the leerlingenbegeleiding role has been UNUSABLE since it was
-- introduced in migration 13. That is why PROJECT.md records it as "never
-- exercised, no demo account" — the account could not be created at all. The
-- CHECK constraints already list the value, so only the width was wrong, and
-- schema.sql shows an unbounded `character varying`, so the file and the live
-- database had drifted.
--
-- Affects: profiles.role and invitations.role (both verified varchar(20) in
-- prod on 2026-08-13). Widening is safe and non-destructive: no data is
-- rewritten, existing values are untouched, and the CHECK constraints stay in
-- force. Postgres takes a brief ACCESS EXCLUSIVE lock on each table.

ALTER TABLE public.profiles    ALTER COLUMN role TYPE character varying(50);
ALTER TABLE public.invitations ALTER COLUMN role TYPE character varying(50);

-- Verify: both should report 50.
SELECT table_name, column_name, character_maximum_length
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN ('profiles', 'invitations')
   AND column_name = 'role';
