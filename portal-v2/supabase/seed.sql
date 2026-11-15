insert into public.ts_departments (name) values
  ('ADMIN'), ('BUS DRIVER'), ('CONSTRUCTION'), ('DRIVERS'), ('EQUIPMENT'),
  ('QA/QC'), ('SAFETY'), ('HDEC'), ('MARJAN')
on conflict (name) do nothing;

insert into public.ts_work_categories (name, regular_minutes) values
  ('Workers', 480), ('Staff', 600), ('Safety', 720)
on conflict (name) do update set regular_minutes = excluded.regular_minutes;

insert into public.ts_pay_periods (starts_on, ends_on, cutoff_at, status) values
  ('2026-11-01', '2026-11-30', '2026-11-30 17:00:00+03', 'open')
on conflict (starts_on, ends_on) do nothing;

insert into public.ts_holidays (holiday_date, name) values
  ('2026-09-23', 'Saudi National Day')
on conflict (holiday_date) do nothing;

-- Demo employee data is intentionally not inserted here because every profile must be
-- tied to a real Supabase Auth user. Use scripts/provision-user.mjs after creating accounts.
