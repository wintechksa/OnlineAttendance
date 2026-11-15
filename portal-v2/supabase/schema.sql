-- WINTECH Employee Timesheet Portal
-- Run in a fresh Supabase project SQL editor. Review before applying to production.

create extension if not exists pgcrypto;
create schema if not exists private;

do $$ begin
  create type public.app_role as enum ('employee', 'reviewer', 'admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.period_status as enum ('open', 'locked');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.correction_status as enum ('pending', 'approved', 'rejected', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.ts_departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.ts_work_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  regular_minutes integer not null check (regular_minutes in (480, 600, 720)),
  created_at timestamptz not null default now()
);

create table if not exists public.ts_employee_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  employee_number text not null unique check (employee_number = upper(employee_number)),
  full_name text not null check (length(trim(full_name)) >= 2),
  department_id uuid not null references public.ts_departments(id),
  work_category_id uuid not null references public.ts_work_categories(id),
  timestation_employee_id text unique,
  role public.app_role not null default 'employee',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ts_pay_periods (
  id uuid primary key default gen_random_uuid(),
  starts_on date not null,
  ends_on date not null,
  cutoff_at timestamptz not null,
  status public.period_status not null default 'open',
  created_at timestamptz not null default now(),
  constraint pay_period_dates_valid check (starts_on <= ends_on),
  constraint pay_period_unique unique (starts_on, ends_on)
);

create table if not exists public.ts_holidays (
  holiday_date date primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ts_timesheet_settings (
  id boolean primary key default true check (id),
  break_minutes integer not null default 60 check (break_minutes between 0 and 240),
  timestation_already_deducts_break boolean not null default true,
  timezone text not null default 'Asia/Riyadh',
  updated_at timestamptz not null default now()
);

create table if not exists public.ts_attendance_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.ts_employee_profiles(user_id) on delete cascade,
  work_date date not null,
  am_in time,
  am_out time,
  pm_in time,
  pm_out time,
  source_shift_ids text[] not null default '{}',
  source_reported_minutes integer not null default 0 check (source_reported_minutes >= 0),
  break_deducted_minutes integer not null default 0 check (break_deducted_minutes >= 0),
  basic_minutes integer not null default 0 check (basic_minutes >= 0),
  overtime_minutes integer not null default 0 check (overtime_minutes >= 0),
  total_minutes integer generated always as (basic_minutes + overtime_minutes) stored,
  is_friday boolean not null default false,
  is_holiday boolean not null default false,
  source text not null default 'timestation' check (source in ('timestation', 'approved_correction', 'manual_import')),
  synced_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, work_date)
);

create table if not exists public.ts_correction_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null default auth.uid() references public.ts_employee_profiles(user_id) on delete cascade,
  work_date date not null,
  reason text not null check (length(trim(reason)) between 5 and 1000),
  requested_changes jsonb not null default '{}'::jsonb,
  status public.correction_status not null default 'pending',
  reviewer_id uuid references public.ts_employee_profiles(user_id),
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint correction_review_consistent check (
    (status = 'pending' and reviewer_id is null and reviewed_at is null)
    or status = 'cancelled'
    or (status in ('approved', 'rejected') and reviewer_id is not null and reviewed_at is not null)
  )
);

create table if not exists public.ts_timesheet_confirmations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null default auth.uid() references public.ts_employee_profiles(user_id) on delete cascade,
  pay_period_id uuid not null references public.ts_pay_periods(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  employee_note text,
  unique (employee_id, pay_period_id)
);

create table if not exists public.ts_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity_table text not null,
  entity_id text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ts_sync_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references public.ts_employee_profiles(user_id),
  starts_on date not null,
  ends_on date not null,
  employee_count integer not null default 0,
  entry_count integer not null default 0,
  status text not null check (status in ('running', 'completed', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists attendance_employee_date_idx on public.ts_attendance_entries(employee_id, work_date desc);
create index if not exists corrections_employee_date_idx on public.ts_correction_requests(employee_id, work_date desc);
create index if not exists corrections_pending_idx on public.ts_correction_requests(status, created_at) where status = 'pending';
create index if not exists ts_profiles_department_idx on public.ts_employee_profiles(department_id);
create index if not exists ts_profiles_category_idx on public.ts_employee_profiles(work_category_id);
create index if not exists ts_corrections_reviewer_idx on public.ts_correction_requests(reviewer_id);
create index if not exists ts_confirmations_period_idx on public.ts_timesheet_confirmations(pay_period_id);
create index if not exists ts_sync_requested_by_idx on public.ts_sync_runs(requested_by);

create or replace function private.is_reviewer_or_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ts_employee_profiles p
    where p.user_id = (select auth.uid()) and p.active and p.role in ('reviewer', 'admin')
  );
$$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ts_employee_profiles p
    where p.user_id = (select auth.uid()) and p.active and p.role = 'admin'
  );
$$;

revoke all on function private.is_reviewer_or_admin() from public, anon;
revoke all on function private.is_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_reviewer_or_admin() to authenticated;
grant execute on function private.is_admin() to authenticated;

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function private.write_audit_log()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.ts_audit_log(actor_id, action, entity_table, entity_id, before_data, after_data)
  values (
    (select auth.uid()), TG_OP, TG_TABLE_NAME,
    coalesce((case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', ''),
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists employee_profiles_updated_at on public.ts_employee_profiles;
create trigger employee_profiles_updated_at before update on public.ts_employee_profiles for each row execute function private.set_updated_at();
drop trigger if exists attendance_updated_at on public.ts_attendance_entries;
create trigger attendance_updated_at before update on public.ts_attendance_entries for each row execute function private.set_updated_at();
drop trigger if exists corrections_updated_at on public.ts_correction_requests;
create trigger corrections_updated_at before update on public.ts_correction_requests for each row execute function private.set_updated_at();
drop trigger if exists audit_attendance on public.ts_attendance_entries;
create trigger audit_attendance after insert or update or delete on public.ts_attendance_entries for each row execute function private.write_audit_log();
drop trigger if exists audit_corrections on public.ts_correction_requests;
create trigger audit_corrections after insert or update or delete on public.ts_correction_requests for each row execute function private.write_audit_log();

alter table public.ts_departments enable row level security;
alter table public.ts_work_categories enable row level security;
alter table public.ts_employee_profiles enable row level security;
alter table public.ts_pay_periods enable row level security;
alter table public.ts_holidays enable row level security;
alter table public.ts_timesheet_settings enable row level security;
alter table public.ts_attendance_entries enable row level security;
alter table public.ts_correction_requests enable row level security;
alter table public.ts_timesheet_confirmations enable row level security;
alter table public.ts_audit_log enable row level security;
alter table public.ts_sync_runs enable row level security;

-- Reset grants only on the new portal tables; leave the legacy prototype untouched.
revoke all on public.ts_departments, public.ts_work_categories, public.ts_employee_profiles,
  public.ts_pay_periods, public.ts_holidays, public.ts_timesheet_settings,
  public.ts_attendance_entries, public.ts_correction_requests,
  public.ts_timesheet_confirmations, public.ts_audit_log, public.ts_sync_runs
from anon, authenticated;
grant select on public.ts_departments, public.ts_work_categories, public.ts_pay_periods, public.ts_holidays to authenticated;
grant select on public.ts_employee_profiles, public.ts_attendance_entries, public.ts_correction_requests, public.ts_timesheet_confirmations to authenticated;
grant insert on public.ts_correction_requests, public.ts_timesheet_confirmations to authenticated;
grant update on public.ts_correction_requests to authenticated;
grant usage, select on all sequences in schema public to service_role;

create policy "authenticated read departments" on public.ts_departments for select to authenticated using (true);
create policy "authenticated read categories" on public.ts_work_categories for select to authenticated using (true);
create policy "authenticated read pay periods" on public.ts_pay_periods for select to authenticated using (true);
create policy "authenticated read holidays" on public.ts_holidays for select to authenticated using (true);

create policy "employee reads own profile" on public.ts_employee_profiles for select to authenticated
using ((select auth.uid()) = user_id or (select private.is_reviewer_or_admin()));

create policy "employee reads own attendance" on public.ts_attendance_entries for select to authenticated
using ((select auth.uid()) = employee_id or (select private.is_reviewer_or_admin()));

create policy "employee reads own corrections" on public.ts_correction_requests for select to authenticated
using ((select auth.uid()) = employee_id or (select private.is_reviewer_or_admin()));

create policy "employee requests correction before cutoff" on public.ts_correction_requests for insert to authenticated
with check (
  (select auth.uid()) = employee_id
  and status = 'pending' and reviewer_id is null
  and exists (
    select 1 from public.ts_pay_periods pp
    where work_date between pp.starts_on and pp.ends_on
      and pp.status = 'open' and now() <= pp.cutoff_at
  )
);

create policy "correction updates by owner or reviewer" on public.ts_correction_requests for update to authenticated
using (
  status = 'pending'
  and ((select auth.uid()) = employee_id or (select private.is_reviewer_or_admin()))
)
with check (
  (
    (select auth.uid()) = employee_id
    and status = 'cancelled' and reviewer_id is null and reviewed_at is null
  )
  or (
    (select private.is_reviewer_or_admin())
    and status in ('approved', 'rejected')
    and reviewer_id = (select auth.uid()) and reviewed_at is not null
  )
);

create policy "employee reads own confirmations" on public.ts_timesheet_confirmations for select to authenticated
using ((select auth.uid()) = employee_id or (select private.is_reviewer_or_admin()));

create policy "employee confirms open period" on public.ts_timesheet_confirmations for insert to authenticated
with check (
  (select auth.uid()) = employee_id
  and exists (select 1 from public.ts_pay_periods pp where pp.id = pay_period_id and pp.status = 'open' and now() <= pp.cutoff_at)
);

-- No browser policies exist for audit_log, sync_runs, settings, or attendance writes.
-- Server-side service_role performs sync and approved corrections; it must never reach the browser.
create policy "settings blocked from browser" on public.ts_timesheet_settings for select to authenticated using (false);
create policy "audit blocked from browser" on public.ts_audit_log for select to authenticated using (false);
create policy "sync runs blocked from browser" on public.ts_sync_runs for select to authenticated using (false);

insert into public.ts_timesheet_settings (id) values (true) on conflict (id) do nothing;

comment on table public.ts_audit_log is 'Server/reviewer audit trail; intentionally unavailable through browser RLS.';
comment on column public.ts_employee_profiles.timestation_employee_id is 'TimeStation internal employee ID used only by the server-side sync.';
comment on column public.ts_attendance_entries.source_reported_minutes is 'TimeStation total_minutes before any portal-side break rule.';

