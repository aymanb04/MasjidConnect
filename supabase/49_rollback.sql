-- 49 rollback: restore handle_new_user exactly as migration 26 left it
-- (role + tenant_id from raw_user_meta_data, super_admin refused).
-- WARNING: this re-opens finding #1 of the 2026-11-21 review whenever e-mail
-- signups are switched on. Roll back the /api/invite change at the same time.
-- No BEGIN/COMMIT: one CREATE OR REPLACE is atomic, and the bench runs this
-- file inside its own transaction (scripts/rls-bench/45_signup.sql).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID := NULL;
  v_role      TEXT;
BEGIN
  IF (NEW.raw_user_meta_data->>'tenant_id') IS NOT NULL
     AND (NEW.raw_user_meta_data->>'tenant_id') != '' THEN
    v_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::UUID;
  END IF;

  -- Whitelist. Anything unknown or privileged degrades to 'student'.
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'student');
  IF v_role NOT IN ('student', 'teacher', 'admin', 'leerlingenbegeleiding') THEN
    v_role := 'student';
  END IF;

  INSERT INTO public.profiles (id, first_name, last_name, role, tenant_id, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    v_role,
    v_tenant_id,
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;
