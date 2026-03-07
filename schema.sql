-- Fresh schema for ONLINE ATTENDANCE
-- Run this file in the Supabase SQL Editor before running safe-admin-seed.sql

begin;

-- Enable pgcrypto for hashing/encryption helpers
create extension if not exists "pgcrypto";

-- Utility trigger to keep `updated_at` fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Employee profiles (main directory of users)
create table if not exists public.employee_profiles (
  id uuid primary key default gen_random_uuid(),
  employee_number text not null unique,
  email text not null,
  mobile_number text,
  -- Additional profile fields used by the frontend
  korean_name text,
  job_title text,
  nationality text,
  mobile_ksa text,
  mobile_home text,
  religion text,
  birthdate date,
  blood_type text,
  arrival_date date,
  contract_expiry date,
  full_name text not null,
  department text,
  designation text,
  site_location text,
  emergency_contact text,
  role text not null default 'employee',
  status text not null default 'active',
  -- login_password kept for backwards compat when employees login via legacy flows
  login_password text,
  admin_otp_enabled boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_employee_profiles_employee_number on public.employee_profiles (employee_number);
create index if not exists idx_employee_profiles_email on public.employee_profiles (email);

create trigger trg_employee_profiles_set_updated_at
  before update on public.employee_profiles
  for each row execute function public.set_updated_at();

-- Admin profiles: separate table for admin credentials and metadata
create table if not exists public.admin_profiles (
  id uuid primary key default gen_random_uuid(),
  admin_number text not null unique,
  -- optional link to employee_profiles.employee_number if admin is also an employee
  employee_number text,
  email text,
  full_name text,
  -- secure storage: store bcrypt/crypt hash in `admin_password_hash` and an encrypted export copy in `admin_password_enc`
  admin_password_hash text,
  admin_password_enc bytea,
  status text default 'active',
  mobile_number text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- link admin -> employee (if exists)
alter table if exists public.admin_profiles
  add constraint fk_admin_employee_number
    foreign key (employee_number) references public.employee_profiles (employee_number) on delete set null;

create index if not exists idx_admin_profiles_employee_number on public.admin_profiles (employee_number);
create index if not exists idx_admin_profiles_email on public.admin_profiles (email);

create trigger trg_admin_profiles_set_updated_at
  before update on public.admin_profiles
  for each row execute function public.set_updated_at();

-- Helper: verify admin password (email or admin_number lookup)
-- Note: relies on `admin_password_hash` storing a crypt() compatible hash (eg: crypt(pass, gen_salt('bf')) )
create or replace function public.verify_admin_password(identifier text, provided_password text)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select (case when admin_password_hash is not null and crypt(provided_password, admin_password_hash) = admin_password_hash then true else false end)
     from public.admin_profiles ap
     where ap.email = identifier or ap.admin_number = identifier
     limit 1), false);
$$;

-- Employee timesheets (uploaded CSVs upsert here)
create table if not exists public.employee_timesheets (
  id uuid primary key default gen_random_uuid(),
  employee_number text not null,
  full_name text,
  work_date date not null,
  clock_in timestamptz,
  clock_out timestamptz,
  hours numeric,
  status text default 'present',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (employee_number, work_date)
);

create index if not exists idx_employee_timesheets_employee_number on public.employee_timesheets (employee_number);
create index if not exists idx_employee_timesheets_work_date on public.employee_timesheets (work_date);

create trigger trg_employee_timesheets_set_updated_at
  before update on public.employee_timesheets
  for each row execute function public.set_updated_at();

-- Import log for timesheet uploads
create table if not exists public.employee_import_files (
  id uuid primary key default gen_random_uuid(),
  file_name text,
  uploaded_by text,
  uploaded_at timestamptz default now(),
  row_count int,
  is_active boolean default true
);

-- Simple feedback table
create table if not exists public.employee_feedback (
  id uuid primary key default gen_random_uuid(),
  employee_number text,
  message text,
  rating int,
  created_at timestamptz default now()
);

-- Useful indexes for lookups by employee_number
create index if not exists idx_feedback_employee_number on public.employee_feedback (employee_number);

commit;

-- Migration / usage notes:
-- 1) After running this file in Supabase, run `safe-admin-seed.sql` to insert a starter admin user (or INSERT manually into `public.admin_profiles`).
-- 2) To migrate existing plaintext `admin_password` values into the new secure columns, create and run a migration that:
--    - adds `admin_password_hash text` and `admin_password_enc bytea` to `public.admin_profiles` (or migrates from employee_profiles),
--    - sets `admin_password_hash = crypt(plaintext_password, gen_salt('bf'))`, and
--    - sets `admin_password_enc = pgp_sym_encrypt(plaintext_password::text, 'REPLACE_WITH_EXPORT_KEY')` (replace the placeholder with a strong secret stored securely).
-- 3) Do NOT commit the export key into source control. Store it as a Supabase secret/env var and use Edge Functions for exports.
-- 4) For production, enable Row Level Security (RLS) and create granular policies for each table and the anon/public role.

