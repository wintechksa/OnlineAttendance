-- Explicit first-admin bootstrap. No default credentials or export encryption key.
-- In the SQL editor, first set these session variables to YOUR real details:
-- SET app.bootstrap_number = 'YOUR_ADMIN_NUMBER';
-- SET app.bootstrap_email = 'you@example.com';
-- SET app.bootstrap_password = 'YOUR_UNIQUE_PASSWORD_OF_AT_LEAST_12_CHARACTERS';
-- Then run this file after schema.sql and portal-schema.sql.
begin;
do $$
declare
  v_number text := nullif(trim(current_setting('app.bootstrap_number', true)), '');
  v_email text := nullif(lower(trim(current_setting('app.bootstrap_email', true))), '');
  v_password text := current_setting('app.bootstrap_password', true);
begin
  if v_number is null or v_email is null or length(coalesce(v_password,'')) < 12 or octet_length(v_password) > 72 then
    raise exception 'Set your administrator number, email and unique password before bootstrapping.';
  end if;
  if exists(select 1 from public.admin_profiles) then raise exception 'An administrator already exists. Use the admin panel to manage accounts.'; end if;
  insert into public.employee_profiles(employee_number,email,full_name,role,status,login_password,login_password_hash,must_change_password)
  values(v_number,v_email,'Administrator','admin','active',null,extensions.crypt(v_password,extensions.gen_salt('bf',10)),true);
  insert into public.admin_profiles(admin_number,employee_number,email,full_name,status,admin_password_hash,must_change_password)
  values(v_number,v_number,v_email,'Administrator','active',extensions.crypt(v_password,extensions.gen_salt('bf',10)),true);
end;
$$;
commit;
RESET app.bootstrap_password;
