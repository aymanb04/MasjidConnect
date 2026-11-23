-- Undo 51. Roll back the app first: lib/profile-contacts.ts calls this function.
-- If 52 is applied, roll that back first too (52 leaves the app no other way to
-- read contact details).
-- No BEGIN/COMMIT: the bench runs this inside its own transaction.
DROP FUNCTION IF EXISTS public.get_profile_contacts(uuid[]);
