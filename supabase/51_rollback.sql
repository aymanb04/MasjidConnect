-- Undo 51. Roll back the app first: lib/profile-contacts.ts calls this function.
-- No BEGIN/COMMIT: the bench runs this inside its own transaction.
DROP FUNCTION IF EXISTS public.get_profile_contacts(uuid[]);
