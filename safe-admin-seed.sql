-- Safe first-admin seed for this demo project (plaintext password model)
-- 1) Replace the values below
-- 2) Run in Supabase SQL Editor after schema.sql

begin;


insert into public.admin_profiles (
  admin_number,
  email,
  full_name,
  admin_password_hash,
  admin_password_enc,
  status,
  mobile_number
)
values (
  'WT-S-004',
  'pereymnrd24@gmail.com',
  'ADMINISTRATOR',
  crypt('Admin@123', gen_salt('bf')),
  pgp_sym_encrypt('Admin@123', 'ZHTUeB1fpNz86XaJJK/fx00R2lEOi+jy61WWzd8YMuicgahLQJcKFh0RXMKgvETr'),
  'active',
  '+966567061752'
)
on conflict (admin_number)
do update set
  email = excluded.email,
  full_name = excluded.full_name,
  status = 'active',
  admin_password_hash = coalesce(public.admin_profiles.admin_password_hash, excluded.admin_password_hash),
  admin_password_enc = coalesce(public.admin_profiles.admin_password_enc, excluded.admin_password_enc),
  mobile_number = excluded.mobile_number;

-- Ensure a matching employee_profiles row exists for admin users
insert into public.employee_profiles (
  employee_number,
  email,
  full_name,
  role,
  login_password,
  status,
  created_at,
  updated_at
)
values (
  'WT-S-004',
  'pereymnrd24@gmail.com',
  'ADMINISTRATOR',
  'admin',
  'Admin@123',
  'active',
  now(),
  now()
)
on conflict (employee_number) do update set
  email = excluded.email,
  full_name = excluded.full_name,
  role = 'admin',
  login_password = coalesce(public.employee_profiles.login_password, excluded.login_password),
  status = 'active',
  updated_at = now();

commit;

-- Optional verification
-- select employee_number, email, role, status, admin_otp_enabled
-- from public.employee_profiles
-- where employee_number = 'WT-S-004';