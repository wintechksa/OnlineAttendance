-- Adds employee self-registration approval states without exposing privileged writes.
alter table public.ts_employee_profiles
  alter column department_id drop not null,
  alter column work_category_id drop not null,
  add column if not exists status text not null default 'active'
    check (status in ('pending', 'active', 'rejected', 'exited')),
  add column if not exists approved_by uuid references public.ts_employee_profiles(user_id) on delete set null,
  add column if not exists approved_at timestamptz;

create index if not exists ts_profiles_status_idx
  on public.ts_employee_profiles(status, created_at desc);
create index if not exists ts_profiles_approved_by_idx on public.ts_employee_profiles(approved_by);

create or replace function private.is_active_employee()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ts_employee_profiles p
    where p.user_id = (select auth.uid()) and p.active and p.status = 'active'
  );
$$;

create or replace function private.is_reviewer_or_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ts_employee_profiles p
    where p.user_id = (select auth.uid()) and p.active and p.status = 'active'
      and p.role in ('reviewer', 'admin')
  );
$$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ts_employee_profiles p
    where p.user_id = (select auth.uid()) and p.active and p.status = 'active' and p.role = 'admin'
  );
$$;

revoke all on function private.is_active_employee() from public, anon;
grant execute on function private.is_active_employee() to authenticated;

drop policy if exists "employee reads own attendance" on public.ts_attendance_entries;
create policy "employee reads own attendance" on public.ts_attendance_entries for select to authenticated
using (((select auth.uid()) = employee_id and (select private.is_active_employee())) or (select private.is_reviewer_or_admin()));

drop policy if exists "employee reads own corrections" on public.ts_correction_requests;
create policy "employee reads own corrections" on public.ts_correction_requests for select to authenticated
using (((select auth.uid()) = employee_id and (select private.is_active_employee())) or (select private.is_reviewer_or_admin()));

drop policy if exists "employee requests correction before cutoff" on public.ts_correction_requests;
create policy "employee requests correction before cutoff" on public.ts_correction_requests for insert to authenticated
with check (
  (select auth.uid()) = employee_id and (select private.is_active_employee())
  and status = 'pending' and reviewer_id is null
  and exists (
    select 1 from public.ts_pay_periods pp
    where work_date between pp.starts_on and pp.ends_on
      and pp.status = 'open' and now() <= pp.cutoff_at
  )
);

drop policy if exists "correction updates by owner or reviewer" on public.ts_correction_requests;
create policy "correction updates by owner or reviewer" on public.ts_correction_requests for update to authenticated
using (
  status = 'pending'
  and (((select auth.uid()) = employee_id and (select private.is_active_employee())) or (select private.is_reviewer_or_admin()))
)
with check (
  ((select auth.uid()) = employee_id and (select private.is_active_employee())
    and status = 'cancelled' and reviewer_id is null and reviewed_at is null)
  or ((select private.is_reviewer_or_admin()) and status in ('approved', 'rejected')
    and reviewer_id = (select auth.uid()) and reviewed_at is not null)
);

drop policy if exists "employee reads own confirmations" on public.ts_timesheet_confirmations;
create policy "employee reads own confirmations" on public.ts_timesheet_confirmations for select to authenticated
using (((select auth.uid()) = employee_id and (select private.is_active_employee())) or (select private.is_reviewer_or_admin()));

drop policy if exists "employee confirms open period" on public.ts_timesheet_confirmations;
create policy "employee confirms open period" on public.ts_timesheet_confirmations for insert to authenticated
with check (
  (select auth.uid()) = employee_id and (select private.is_active_employee())
  and exists (select 1 from public.ts_pay_periods pp where pp.id = pay_period_id
    and pp.status = 'open' and now() <= pp.cutoff_at)
);
