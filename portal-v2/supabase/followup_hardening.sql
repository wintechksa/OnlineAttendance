create index if not exists ts_profiles_department_idx on public.ts_employee_profiles(department_id);
create index if not exists ts_profiles_category_idx on public.ts_employee_profiles(work_category_id);
create index if not exists ts_corrections_reviewer_idx on public.ts_correction_requests(reviewer_id);
create index if not exists ts_confirmations_period_idx on public.ts_timesheet_confirmations(pay_period_id);
create index if not exists ts_sync_requested_by_idx on public.ts_sync_runs(requested_by);

drop policy if exists "employee cancels own pending correction" on public.ts_correction_requests;
drop policy if exists "reviewer decides pending correction" on public.ts_correction_requests;
drop policy if exists "correction updates by owner or reviewer" on public.ts_correction_requests;
create policy "correction updates by owner or reviewer" on public.ts_correction_requests for update to authenticated
using (
  status = 'pending'
  and ((select auth.uid()) = employee_id or (select private.is_reviewer_or_admin()))
)
with check (
  ((select auth.uid()) = employee_id and status = 'cancelled' and reviewer_id is null and reviewed_at is null)
  or ((select private.is_reviewer_or_admin()) and status in ('approved', 'rejected') and reviewer_id = (select auth.uid()) and reviewed_at is not null)
);

drop policy if exists "settings blocked from browser" on public.ts_timesheet_settings;
create policy "settings blocked from browser" on public.ts_timesheet_settings for select to authenticated using (false);
drop policy if exists "audit blocked from browser" on public.ts_audit_log;
create policy "audit blocked from browser" on public.ts_audit_log for select to authenticated using (false);
drop policy if exists "sync runs blocked from browser" on public.ts_sync_runs;
create policy "sync runs blocked from browser" on public.ts_sync_runs for select to authenticated using (false);
