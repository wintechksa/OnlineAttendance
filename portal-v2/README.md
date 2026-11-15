# WINTECH Employee Timesheet Portal

Secure, mobile-friendly employee timesheet portal for 100–300 employees. This repository contains a working frontend, Supabase schema/RLS, a server-only Cloudflare Pages Function for read-only TimeStation sync, sample data, and automated tests.

## Included now

- Employee ID + password sign-in backed by Supabase Auth. Employee IDs map to internal synthetic emails; employees never need to know or enter an email address.
- Nine departments: ADMIN, BUS DRIVER, CONSTRUCTION, DRIVERS, EQUIPMENT, QA/QC, SAFETY, HDEC, and MARJAN.
- Work categories: Workers (8h), Staff (10h), and Safety (12h).
- Timesheet columns: DATE, AM IN/OUT, PM IN/OUT, BASIC, OT, and TOTAL HRS.
- Friday and configured holidays classify all worked minutes as OT.
- Configurable full break deduction with a `timestation_already_deducts_break` switch to prevent double deduction.
- Employee correction requests, reviewer/admin decisions, and immutable audit records for attendance/correction changes.
- Employee confirmation restricted to an open pay period before cutoff.
- No salary or pay-rate fields.
- Demo mode when Supabase environment variables are absent.

## Security model

- The browser receives only the Supabase publishable key. It never receives the service role or TimeStation API key.
- Every public table has RLS enabled. Employees can read only their own profile, attendance, corrections, and confirmations. Reviewers/admins are checked against server-controlled profile data, not user-editable metadata.
- The TimeStation function accepts only `POST`, validates a real Supabase access token, checks reviewer/admin role, calls only TimeStation's read-only `GET /v1.2/shifts`, and limits each request to 31 days.
- Broad default grants are revoked before narrow grants are added.
- The previously shared TimeStation API key must be revoked and replaced. Never reuse it in this repository, browser variables, GitHub, screenshots, or chat.

## Local setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill only the two `VITE_` Supabase public values.
3. Start the UI: `npm run dev`
4. Without `.env`, use **Preview with sample data**.

Checks:

```text
npm run typecheck
npm test
npm run build
```

## Supabase setup (after account connection)

1. Create/select the Supabase project.
2. Review and run `supabase/schema.sql`, then `supabase/seed.sql`.
3. Disable public self-signup; employees should be provisioned by an administrator.
4. Provision each employee from a protected admin environment with `scripts/provision-user.mjs`.
5. Set real `timestation_employee_id` mappings on employee profiles.
6. Verify RLS using separate employee and reviewer test accounts before production use.

The provisioning script requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only in the current protected shell. Do not put the service key in `.env` if that file might be used by Vite.

## Cloudflare Pages setup (after account connection)

- Connect the GitHub repository to Cloudflare Pages.
- Build command: `npm run build`
- Output directory: `dist`
- Add server-side secrets: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and the newly rotated `TIMESTATION_API_KEY`.
- Add browser build variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Never prefix a secret with `VITE_`.

## Important MVP boundary

The schema records approval/rejection and audit history. An approved request does not silently rewrite attendance punches; a dedicated reviewer edit/apply screen should be added after WINTECH confirms the exact correction rules (which fields reviewers may change and whether corrected totals should replace or overlay TimeStation totals). This prevents an ambiguous correction from changing computed hours.

Current connection status (2026-11-15):

- GitHub: code published to `wintechksa/OnlineAttendance`, branch `timesheet-portal-v2`, folder `portal-v2/`.
- Supabase: secure schema and seed applied to the `Wintech Attendance` project.
- Cloudflare: deployment remains pending until browser authorization completes.
- TimeStation: not connected; the previously shared key must be revoked and a new key stored only as a Cloudflare secret.

