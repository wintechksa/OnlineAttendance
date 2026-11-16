-- Reproducible portal contract for a fresh install, after schema.sql.
-- Existing production installations already have this contract; do not reseed users.
begin;
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to service_role;
alter table public.employee_profiles add column if not exists login_password_hash text;
alter table public.employee_profiles add column if not exists must_change_password boolean not null default false;
alter table public.admin_profiles add column if not exists must_change_password boolean not null default false;
create table if not exists public.portal_sessions (
  token_hash text primary key, employee_number text not null, role text not null check(role in ('admin','employee')),
  admin_number text, expires_at timestamptz not null, created_at timestamptz not null default now()
);
create table if not exists app_private.login_attempts (
  id bigint generated always as identity primary key, identifier text not null,
  attempted_at timestamptz not null default now(), success boolean not null default false
);
create index if not exists oa_login_attempts_identifier on app_private.login_attempts(identifier,attempted_at);
alter table public.portal_sessions enable row level security;
alter table app_private.login_attempts enable row level security;
revoke all on public.portal_sessions from public, anon, authenticated;
grant all on public.portal_sessions, app_private.login_attempts to service_role;
grant usage, select on all sequences in schema app_private to service_role;
CREATE OR REPLACE FUNCTION app_private.session_identity(p_token text, p_required_role text DEFAULT NULL::text)
 RETURNS TABLE(employee_number text, role text, admin_number text)
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
  select s.employee_number, s.role, s.admin_number
  from public.portal_sessions s
  where s.token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex')
    and s.expires_at > now()
    and (p_required_role is null or s.role = p_required_role)
  limit 1
$function$
;
revoke all on function app_private.session_identity(text,text) from public, anon, authenticated;
grant execute on function app_private.session_identity(text,text) to service_role;
CREATE OR REPLACE FUNCTION public.portal_login(p_identifier text, p_password text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare
  v_identifier text := lower(trim(coalesce(p_identifier,'')));
  v_employee text; v_admin text; v_role text; v_name text; v_email text;
  v_job text; v_nationality text; v_hash text; v_status text; v_change boolean := false;
  v_token text;
begin
  delete from public.portal_sessions where expires_at <= now();
  delete from app_private.login_attempts where attempted_at < now() - interval '1 day';
  if (select count(*) from app_private.login_attempts where identifier=v_identifier and not success and attempted_at > now()-interval '15 minutes') >= 8 then
    raise exception 'Too many failed attempts. Try again in 15 minutes.';
  end if;

  select coalesce(ap.employee_number,ap.admin_number), ap.admin_number, 'admin', coalesce(ep.full_name,ap.full_name,ap.admin_number),
         coalesce(ep.email,ap.email), ep.job_title, ep.nationality, ap.admin_password_hash, ap.status, ap.must_change_password
  into v_employee,v_admin,v_role,v_name,v_email,v_job,v_nationality,v_hash,v_status,v_change
  from public.admin_profiles ap left join public.employee_profiles ep on ep.employee_number=ap.employee_number
  where lower(ap.admin_number)=v_identifier or lower(coalesce(ap.email,''))=v_identifier
  limit 1;

  if v_hash is null then
    select ep.employee_number,null,'employee',ep.full_name,ep.email,ep.job_title,ep.nationality,ep.login_password_hash,ep.status,ep.must_change_password
    into v_employee,v_admin,v_role,v_name,v_email,v_job,v_nationality,v_hash,v_status,v_change
    from public.employee_profiles ep
    where lower(ep.employee_number)=v_identifier or lower(coalesce(ep.email,''))=v_identifier
    limit 1;
  end if;

  if v_hash is null or lower(coalesce(v_status,'active')) <> 'active' or extensions.crypt(coalesce(p_password,''),v_hash) <> v_hash then
    insert into app_private.login_attempts(identifier,success) values(v_identifier,false);
    raise exception 'Invalid username/email or password.';
  end if;
  insert into app_private.login_attempts(identifier,success) values(v_identifier,true);
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.portal_sessions(token_hash,employee_number,role,admin_number,expires_at)
  values(encode(extensions.digest(v_token,'sha256'),'hex'),v_employee,v_role,v_admin,now()+interval '8 hours');
  return jsonb_build_object('session_token',v_token,'employee_number',v_employee,'full_name',v_name,'email',v_email,
    'role',v_role,'job_title',v_job,'nationality',v_nationality,'must_change_password',coalesce(v_change,false));
end $function$
;
revoke all on function public.portal_login(text,text) from public, anon, authenticated;
grant execute on function public.portal_login(text,text) to service_role;
CREATE OR REPLACE FUNCTION public.portal_logout(p_token text)
 RETURNS void
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$ delete from public.portal_sessions where token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex') $function$
;
revoke all on function public.portal_logout(text) from public, anon, authenticated;
grant execute on function public.portal_logout(text) to service_role;
CREATE OR REPLACE FUNCTION public.portal_change_password(p_token text, p_current_password text, p_new_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$ declare v_identity record; v_hash text; begin
  select * into v_identity from app_private.session_identity(p_token,null);if v_identity.employee_number is null then raise exception 'Session expired.';end if;if length(coalesce(p_new_password,''))<8 then raise exception 'Password must contain at least 8 characters.';end if;
  if v_identity.role='admin' then select admin_password_hash into v_hash from public.admin_profiles where admin_number=v_identity.admin_number;if v_hash is null or extensions.crypt(coalesce(p_current_password,''),v_hash)<>v_hash then raise exception 'Current password is incorrect.';end if;update public.admin_profiles set admin_password_hash=extensions.crypt(p_new_password,extensions.gen_salt('bf')),must_change_password=false,updated_at=now() where admin_number=v_identity.admin_number;
  else select login_password_hash into v_hash from public.employee_profiles where employee_number=v_identity.employee_number;if v_hash is null or extensions.crypt(coalesce(p_current_password,''),v_hash)<>v_hash then raise exception 'Current password is incorrect.';end if;update public.employee_profiles set login_password_hash=extensions.crypt(p_new_password,extensions.gen_salt('bf')),login_password=null,must_change_password=false,updated_at=now() where employee_number=v_identity.employee_number;end if;
end $function$
;
revoke all on function public.portal_change_password(text,text,text) from public, anon, authenticated;
grant execute on function public.portal_change_password(text,text,text) to service_role;
commit;
