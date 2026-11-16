-- Additive repair for the existing Wintech Attendance database.
-- Existing portal_login/portal_logout functions stay service-role only.
begin;
create unique index if not exists oa_employee_number_ci
  on public.employee_profiles (lower(trim(employee_number)));
create unique index if not exists oa_employee_email_ci
  on public.employee_profiles (lower(trim(email))) where nullif(trim(email),'') is not null;

create table if not exists public.portal_registration_attempts (
  source_hash text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists oa_registration_attempts_source
  on public.portal_registration_attempts(source_hash, attempted_at);
alter table public.portal_registration_attempts enable row level security;
revoke all on public.portal_registration_attempts from public, anon, authenticated;
grant select, insert, delete on public.portal_registration_attempts to service_role;

create or replace function public.attendance_password_hash(p_password text)
returns text language plpgsql security invoker set search_path = '' as $$
begin
  if length(coalesce(p_password,'')) < 8 or octet_length(p_password) > 72 then
    raise exception 'Password must contain at least 8 characters and at most 72 UTF-8 bytes.';
  end if;
  return extensions.crypt(p_password, extensions.gen_salt('bf', 10));
end;
$$;
revoke all on function public.attendance_password_hash(text) from public, anon, authenticated;
grant execute on function public.attendance_password_hash(text) to service_role;

create or replace function public.attendance_register_employee(
  p_employee_number text, p_email text, p_full_name text,
  p_mobile_number text, p_password text, p_source text
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_employee text := trim(coalesce(p_employee_number,''));
  v_email text := lower(trim(coalesce(p_email,'')));
  v_source text := encode(extensions.digest(coalesce(p_source,'unknown'),'sha256'),'hex');
begin
  perform pg_advisory_xact_lock(hashtextextended(v_source, 0));
  delete from public.portal_registration_attempts where attempted_at < now() - interval '1 day';
  if (select count(*) from public.portal_registration_attempts where source_hash=v_source and attempted_at > now()-interval '1 hour') >= 10 then
    return jsonb_build_object('error','Too many signup attempts. Try again in one hour.');
  end if;
  insert into public.portal_registration_attempts(source_hash) values(v_source);
  if v_employee = '' or length(v_employee)>80 or length(trim(coalesce(p_full_name,''))) not between 1 and 200
     or length(trim(coalesce(p_mobile_number,''))) not between 1 and 40
     or length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('error','Enter a valid employee number, name, email and mobile number.');
  end if;
  if length(coalesce(p_password,''))<8 or octet_length(p_password)>72 then
    return jsonb_build_object('error','Password must contain at least 8 characters and at most 72 UTF-8 bytes.');
  end if;
  -- Never overwrite or claim an imported/existing employee or administrator.
  if exists(select 1 from public.employee_profiles where lower(trim(employee_number))=lower(v_employee) or lower(trim(email))=v_email)
     or exists(select 1 from public.admin_profiles where lower(trim(admin_number))=lower(v_employee) or lower(trim(email))=v_email) then
    return jsonb_build_object('error','An account already uses these details. Contact your administrator if you need access.');
  end if;
  begin
    insert into public.employee_profiles(employee_number,email,full_name,mobile_number,mobile_ksa,role,status,login_password_hash,login_password,must_change_password)
    values(v_employee,v_email,trim(p_full_name),trim(p_mobile_number),trim(p_mobile_number),'employee','active',public.attendance_password_hash(p_password),null,false);
  exception when unique_violation then
    return jsonb_build_object('error','An account already uses these details. Contact your administrator if you need access.');
  end;
  return jsonb_build_object('employee_number',v_employee);
end;
$$;
revoke all on function public.attendance_register_employee(text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.attendance_register_employee(text,text,text,text,text,text) to service_role;

-- The legacy login raises an exception after logging a failure, which rolls
-- that log entry back. Catch it here and record the failure in this transaction.
grant usage on schema app_private to service_role;
grant select, insert, delete on app_private.login_attempts to service_role;
create or replace function public.attendance_login(p_identifier text, p_password text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_identifier text := lower(trim(coalesce(p_identifier,''))); v_result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('login:' || v_identifier, 0));
  delete from app_private.login_attempts where attempted_at < now()-interval '1 day';
  if (select count(*) from app_private.login_attempts where identifier=v_identifier and not success and attempted_at > now()-interval '15 minutes') >= 8 then
    return jsonb_build_object('error','Too many failed attempts. Try again in 15 minutes.');
  end if;
  begin
    v_result := public.portal_login(v_identifier,p_password);
  exception when raise_exception then
    insert into app_private.login_attempts(identifier,success) values(v_identifier,false);
    return jsonb_build_object('error','Invalid username/email or password.');
  end;
  return v_result;
end;
$$;
revoke all on function public.attendance_login(text,text) from public, anon, authenticated;
grant execute on function public.attendance_login(text,text) to service_role;
commit;
