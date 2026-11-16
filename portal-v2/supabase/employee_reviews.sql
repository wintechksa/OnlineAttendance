create table if not exists public.ts_employee_reviews (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null default auth.uid() references public.ts_employee_profiles(user_id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  review_text text not null check (length(trim(review_text)) between 5 and 800),
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ts_reviews_visible_idx on public.ts_employee_reviews(visible, created_at desc);
create index if not exists ts_reviews_employee_idx on public.ts_employee_reviews(employee_id, created_at desc);
drop trigger if exists reviews_updated_at on public.ts_employee_reviews;
create trigger reviews_updated_at before update on public.ts_employee_reviews for each row execute function private.set_updated_at();
alter table public.ts_employee_reviews enable row level security;
revoke all on public.ts_employee_reviews from anon, authenticated;
grant select, insert, update, delete on public.ts_employee_reviews to authenticated;
create policy "active employees read visible reviews" on public.ts_employee_reviews for select to authenticated
using ((select private.is_active_employee()) and (visible or employee_id = (select auth.uid())));
create policy "active employees post reviews" on public.ts_employee_reviews for insert to authenticated
with check ((select private.is_active_employee()) and employee_id = (select auth.uid()) and visible);
create policy "employees edit own reviews" on public.ts_employee_reviews for update to authenticated
using ((select private.is_active_employee()) and employee_id = (select auth.uid()))
with check ((select private.is_active_employee()) and employee_id = (select auth.uid()));
create policy "employees delete own reviews" on public.ts_employee_reviews for delete to authenticated
using (((select private.is_active_employee()) and employee_id = (select auth.uid())) or (select private.is_admin()));
