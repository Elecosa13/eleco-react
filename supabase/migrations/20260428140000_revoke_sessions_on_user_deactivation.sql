-- Sécurité V1 — révocation sessions utilisateurs inactifs

create or replace function public.revoke_sessions_on_user_deactivation()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if old.actif is distinct from new.actif and new.actif = false then
    delete from auth.sessions
    where user_id = new.auth_user_id;

    insert into public.audit_logs (
      user_id,
      user_email,
      action,
      target_table,
      target_id,
      details,
      success,
      created_by_role
    )
    values (
      new.id,
      new.email,
      'user_sessions_revoked',
      'utilisateurs',
      new.id,
      jsonb_build_object('auth_user_id', new.auth_user_id),
      true,
      'admin'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_revoke_sessions_on_user_deactivation on public.utilisateurs;

create trigger trg_revoke_sessions_on_user_deactivation
after update of actif on public.utilisateurs
for each row
execute function public.revoke_sessions_on_user_deactivation();

create or replace function public.reject_inactive_user_access_token(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  user_is_active boolean;
begin
  select u.actif
  into user_is_active
  from public.utilisateurs u
  where u.auth_user_id = (event->>'user_id')::uuid
  limit 1;

  if coalesce(user_is_active, false) = false then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Compte désactivé. Contactez l''administrateur.'
      )
    );
  end if;

  return event;
end;
$$;

revoke all on function public.reject_inactive_user_access_token(jsonb) from public;
grant execute on function public.reject_inactive_user_access_token(jsonb) to supabase_auth_admin;