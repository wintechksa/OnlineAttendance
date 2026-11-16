# Online Attendance

Static employee/admin screens backed by the Wintech Attendance Supabase project.

## Run and test

Serve this directory over HTTP. Open `login.html`; public connection settings come from
`auth-config.js`. Do not open pages as `file://`. Never add a service-role key to a page,
query string, or browser storage.

```sh
node --test tests/*.test.cjs
```

## Existing production database

The repair uses the existing `portal_login`, `portal_change_password`, `portal_logout`,
and server-side session tables. Apply `attendance-auth.sql`, then deploy
`supabase/functions/attendance-portal/index.ts` as `attendance-portal` with JWT verification
enabled. The hosted function reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from its
server environment. The browser uses only the public anon key.

The deployed function must be available before publishing the updated pages.
RLS stays enabled; direct anonymous profile/password access is not required.
All data actions validate the server session, active account, role, and employee ownership.

## Fresh database

Run `schema.sql`, `portal-schema.sql`, and `attendance-auth.sql` in that order. Then follow
the explicit session-variable instructions in `safe-admin-seed.sql` to create the first
administrator with your own strong password. The seed refuses to overwrite an existing
administrator. Deploy the function and update the public project URL/anon key in
`auth-config.js` for your project.

## Accounts

- Signup creates a new employee account with a bcrypt password hash. Employee number
  and non-empty email are unique without regard to letter case. Signup never overwrites
  or claims an existing imported employee or administrator.
- Existing/imported employees without a password need an administrator to set a temporary
  password using **Admin Panel  Edit  Login Password**. Sign in, then change the temporary
  password on the profile page. Passwords require at least 8 characters and at most 72 UTF-8 bytes.
- Administrators can reset employee passwords but cannot read existing passwords or hashes.
- Password recovery is administrator-assisted. No browser-generated OTP is accepted as
  password-reset authorization, and no fake email-delivery success is shown.
- A server session lasts 8 hours. Logout revokes it; changing a password revokes the other
  sessions for the account. Password values are never trimmed or logged by the frontend.
- Employee imports use upsert and preserve existing passwords when the password column
  is blank. Administrator accounts are managed individually. Destructive replace imports
  are disabled to protect existing accounts.
- Attendance CSV supports quoted commas/newlines, escaped quotes, and UTF-8 BOM. Use
  `employee_number,full_name,work_date,clock_in,clock_out,hours,status,notes` headers and
  `YYYY-MM-DD` dates. Time-only values are interpreted in Saudi time (UTC+03:00).

## Validation

Automated tests cover form submission, repeated-submit prevention, temporary-password
redirects, error recovery, CSV parsing, and API authorization. The deployed API was also
verified with a disposable employee through signup  login  own profile  password
change  login  logout, including rejection of duplicate accounts and privilege escalation.
Administrator login/password change are verified in a database transaction that is rolled back.
