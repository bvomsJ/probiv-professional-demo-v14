# Supabase setup — PROBIV static frontend

## What this version does
- Uses the Supabase JS v2 browser client and the project's public publishable key.
- Login is through Supabase Auth (email + password).
- Signup is gated by an invitation code validated inside a database trigger; codes are not readable by anonymous clients.
- The existing editor UI keeps its appearance and writes its public site state to `public.app_state` only for a profile with role `admin`.
- Invitation editor changes are sent through `admin_replace_invites(jsonb)`, which checks the admin role server-side.
- Public JSON state strips `adminAuth`, invitation codes, and password hashes before upload.
- The GitHub Pages workflow publishes the new config and adapter files.

## Important architecture note
This is a compatibility bridge for the current legacy UI, which represents its content as one `DEMO_DB` object. It is **not** a full normalized migration of every forum action into `profiles/categories/threads/posts`. Creating and replying to topics, reactions, user management, and some legacy UI operations may still use the local compatibility model; do not treat the project as production-ready until those flows are individually migrated and tested. Do not place real personal, financial, or sensitive data in the demo state.

## Apply the schema
1. Open Supabase Dashboard → SQL Editor → New query.
2. Copy all of `supabase/001_schema.sql` into the editor and run it once.
3. In Authentication → URL Configuration, set Site URL to the published GitHub Pages URL, for example `https://OWNER.github.io/REPOSITORY/`, and add that URL to Redirect URLs.
4. In Authentication → Providers, keep Email enabled. Configure email confirmation according to your preference.
5. In SQL Editor, create an invitation for yourself. Replace the code with a private code you choose; do not commit this SQL with the actual code to GitHub:

```sql
insert into public.invites(code, label, active, max_uses, uses)
values ('CHOOSE-A-PRIVATE-CODE', 'Initial administrator setup', true, 1, 0);
```

6. Open the published registration page and create your account with that invitation code. If email confirmation is enabled, confirm your email and then sign in.
7. Promote your account to administrator in SQL Editor, replacing the email:

```sql
update public.profiles p
set role = 'admin'
from auth.users u
where p.id = u.id and lower(u.email) = lower('YOUR_ADMIN_EMAIL');
```

8. Sign in again and open `admin.html`. The role check comes from the database; the RLS policy is the actual write boundary.

## Configuration
`supabase-config.js` contains only the Project URL and public publishable key. These values are expected to be visible in a browser and are not privileged credentials. Never use `service_role`, `sb_secret_...`, a database password, or an access token in frontend code or GitHub.

## Deploy to GitHub Pages
1. Upload the project contents (including `.github/workflows/pages.yml`, `supabase-config.js`, `supabase-adapter.js`, and `supabase/001_schema.sql`) to the repository's `main` branch.
2. In GitHub → Settings → Pages, select GitHub Actions as the build/deployment source.
3. Wait for the `Deploy static site to GitHub Pages` workflow. It runs the static checks and then deploys.
4. Test login, invitation signup, email confirmation (if enabled), admin role check, saving a setting, opening the site in a second browser, and confirming the setting appears there.

## What has not been verified
The SQL has not been run against the live project from this environment. No live Supabase API calls or real Auth/RLS integration tests were performed here. The automated checks below are local static/syntax/integrity tests only. After applying SQL, run the manual integration checks above before using the site with real users.
