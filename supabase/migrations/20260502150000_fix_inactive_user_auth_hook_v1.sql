-- Eleco V1 - fix Supabase Auth custom access token hook.
-- The real V1 utilisateurs table may not have auth_user_id. The hook must not
-- fail during login when that legacy column is absent.

CREATE OR REPLACE FUNCTION public.reject_inactive_user_access_token(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_email text;
  v_is_active boolean;
  v_has_auth_user_id boolean;
BEGIN
  v_user_id := NULLIF(event->>'user_id', '')::uuid;
  v_email := lower(NULLIF(event #>> '{claims,email}', ''));

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'utilisateurs'
      AND column_name = 'auth_user_id'
  )
  INTO v_has_auth_user_id;

  IF v_has_auth_user_id AND v_user_id IS NOT NULL THEN
    EXECUTE 'SELECT u.actif FROM public.utilisateurs u WHERE u.auth_user_id = $1 LIMIT 1'
    INTO v_is_active
    USING v_user_id;
  END IF;

  IF v_is_active IS NULL AND v_user_id IS NOT NULL THEN
    SELECT u.actif
    INTO v_is_active
    FROM public.utilisateurs u
    WHERE u.id = v_user_id
    LIMIT 1;
  END IF;

  IF v_is_active IS NULL AND v_email IS NOT NULL THEN
    SELECT bool_or(u.actif)
    INTO v_is_active
    FROM public.utilisateurs u
    WHERE lower(u.email) = v_email;
  END IF;

  IF COALESCE(v_is_active, false) = false THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Compte desactive. Contactez l''administrateur.'
      )
    );
  END IF;

  RETURN event;
END;
$$;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.reject_inactive_user_access_token(jsonb) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.reject_inactive_user_access_token(jsonb) TO supabase_auth_admin;
