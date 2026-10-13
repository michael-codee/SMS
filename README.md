# Elite Smart School Systems

One web app that many schools use at the same time. Each school signs in with its own **school code**, sees only its own records, and sets its own name, crest, colours, terms, classes, subjects, marks breakdown and grade scale.

## What is in this repository

| Folder | What it holds |
|---|---|
| `server/` | The server (Node.js, no framework). Sign-in, permissions, and every change to school data. |
| `server/migrations/` | The database layout. Applied automatically when the server starts. |
| `web/src/` | The screens (React). Built into `web/dist/` by `npm run build`. |
| `test/` | Automatic checks for security, roles and school setup. |

## Who can do what

- **Platform administrator** (at `/platform`): cannot see pupil records. Its menu has:
  - **Manage schools**: add a school, switch it off or on, give a locked-out Proprietor a new temporary password.
  - **Platform activity**: every administrator sign-in and change, searchable.
  - **System settings**: a notice shown to every school (for example planned maintenance), the help contact on the sign-in page, and how the system is running.
  - **Security settings**: when administrators are signed out and locked out, the shortest password allowed for every account, the sign-out and lockout rules new schools start with, and the devices you are signed in on.
  - **Password & sign out**: change your password, add other platform administrators, reset their passwords or remove them, and sign out.
- **Proprietor**: everything inside their school, including School Setup, accounts, backups and restore.
- **Principal, Teacher, Bursar, Exam Officer, Parent, Pupil**: only what their job needs. A teacher sees their own class; a parent sees their own children; a bursar sees fees but not marks.

## Security in short

- Passwords are stored scrambled (scrypt). Nobody, including the administrator, can read them.
- New accounts get a temporary password and must choose their own before doing anything.
- Accounts lock after a school-chosen number of wrong passwords; sign-in attempts are also limited per network address.
- Sessions end after the school's idle time limit and always after 12 hours.
- Every school's rows are fenced off twice: by the server's own checks, and by the database itself (PostgreSQL row-level security).
- Every change is written to an activity log the Proprietor can read.
- A copy of each school's data is taken automatically once a day (last 30 kept), and before every restore.

## Settings (environment variables)

| Name | Needed? | What it does |
|---|---|---|
| `DATABASE_URL` | Yes | The PostgreSQL connection address. |
| `PLATFORM_ADMIN_USERNAME` | First start | Creates the platform administrator. |
| `PLATFORM_ADMIN_PASSWORD` | First start | That administrator's password (at least 8 characters). |
| `PLATFORM_ADMIN_NAME` | No | Display name for the administrator. |
| `PLATFORM_ADMIN_RESET` | No | Set to `1` with the two above to reset a forgotten administrator password, restart, then remove it. Another platform administrator can also do this under **Password & sign out**. |
| `PORT` | No | Defaults to 3000. Railway sets it for you. |
| `TRUST_PROXY` | No | `1` when behind a proxy that sets `X-Forwarded-*`. Automatic on Railway. |
| `COOKIE_SECURE` | No | `1` to always mark the sign-in cookie as HTTPS-only. |
| `DATABASE_CA_CERT` | No | The database's CA certificate (PEM text). When set, the server checks the database's certificate as well as encrypting. |
| `PGSSL` | No | `1` to connect to the database over SSL (or put `sslmode=require` in the address). |
| `PG_POOL_MAX` | No | Most database connections at once (default 10). |

## Run it on Railway

1. In Railway, create a project from this GitHub repository.
2. Add a **PostgreSQL** database to the same project.
3. On the app service, open **Variables** and add:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `PLATFORM_ADMIN_USERNAME` = a username you choose
   - `PLATFORM_ADMIN_PASSWORD` = a long password you keep safe
4. Under **Settings**, set the health check path to `/healthz` and generate a public domain.
5. Railway builds the `Dockerfile` and starts the server. No volume is needed; everything lives in PostgreSQL.
6. Open `https://<your-domain>/platform`, sign in, and add the first school. Give the Proprietor the web address, school code, username and temporary password that appear.

Each school can then use `https://<your-domain>/?school=<CODE>`, which fills in the school code for them.

### If something is not set up right

The server stays online even when a setting is wrong, so the health check passes. Open the site and it says what to fix, for example a missing `DATABASE_URL`. A rejected `PLATFORM_ADMIN_PASSWORD` (too short, too common, or containing the username) is explained on the `/platform` sign-in page. The deploy logs show the same messages.

## Use Supabase as the database (instead of Railway's PostgreSQL)

Supabase runs PostgreSQL, so nothing in the app changes. Railway (or any host) still runs the app itself.

1. Create a Supabase project. Choose the region closest to the schools and write down the database password.
2. In Supabase, click **Connect** and copy the **Session pooler** connection string (port 5432). Replace `[YOUR-PASSWORD]` with the database password. The direct connection string does not work from Railway.
3. In Railway, set the app's `DATABASE_URL` to that string. Remove Railway's PostgreSQL service if you added one.
4. Optional: to also check the database's certificate, download it from Supabase (**Project Settings**, **Database**, **SSL Configuration**) and paste its text into `DATABASE_CA_CERT`.

On Supabase, the connection is always encrypted. The server also removes the access Supabase's public web API (the `anon` and `authenticated` roles) gets to new tables, every time it starts, and the database rules show those roles nothing. Never put the app's tables behind Supabase's API keys. The Supabase free plan pauses idle projects and keeps no backups, so use a paid plan for real pupil records.

## Install it like software

Once the site is live on HTTPS, anyone can install it: an **Install app** button appears on the sign-in page and in the menu (on iPhone and iPad: Share, then **Add to Home Screen**). It then opens from a desktop or home-screen icon in its own window, named after the school, and updates itself. It needs the internet; without it, it shows a "No internet connection" screen. Only the app's own files are kept on the device, never school records.

## Database user

The server creates a database role called `sms_app` and switches to it for every school request, so the database itself enforces the walls between schools. That needs a database user that may create roles (Railway's default `postgres` user can). If it cannot, the server still starts and still separates schools in its own code, and the platform page shows a warning.

## Work on it locally

You need Node.js 22 or newer and PostgreSQL.

```bash
npm install
DATABASE_URL=postgres://postgres@localhost:5432/sms \
PLATFORM_ADMIN_USERNAME=admin PLATFORM_ADMIN_PASSWORD='choose-a-password' \
npm run dev
```

Then open http://localhost:3000/platform.

## Run the checks

```bash
TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm test
```

Each test file creates its own temporary database and removes it afterwards. The same checks run on GitHub for every change.

## Backups

- **Automatic**: once a day per school, kept for 30 days, listed under *Security & Backups*.
- **Download**: the Proprietor can download the whole school as a file at any time. Keep these somewhere safe; they contain pupil records (but never passwords).
- **Restore**: upload a downloaded file under *Security & Backups*. Accounts are kept; a copy of the current data is saved first.
- Also turn on Railway's own PostgreSQL backups for the whole database.
