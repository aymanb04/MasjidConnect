-- Undo 52: signed-in users read every profiles column again (Supabase's default
-- table-level grants, the pre-52 state). Re-opens finding #3. The app keeps
-- working either way: it reads contacts through get_profile_contacts (51).
-- No BEGIN/COMMIT: the bench runs this inside its own transaction.
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO anon, authenticated;
