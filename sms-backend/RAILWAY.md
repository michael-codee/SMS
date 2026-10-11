# Deploying on Railway

1. Put this folder in a GitHub repo (the `data/` folder is git-ignored) — or use the Railway CLI (`railway up`).
2. Railway dashboard -> New Project -> Deploy from GitHub repo -> select it. Railway builds the included Dockerfile.
3. Open the service -> Variables, add:
   - `SITE_PASSWORD` = a strong password (optional `SITE_USER`, default `tester`)
4. Add a volume: right-click the project canvas (or Cmd/Ctrl+K) -> Volume -> attach to the service,
   mount path `/data`. The server automatically uses `RAILWAY_VOLUME_MOUNT_PATH`, so no `DATA_DIR` is needed.
5. Service -> Settings -> Networking -> Generate Domain (HTTPS is included).
6. Settings -> Deploy -> Healthcheck path `/healthz`. Make sure serverless / "App Sleeping" is OFF.
7. Open the generated URL, log in with `tester` + your password, then sign in to the app (e.g. `principal1`).

Backups: use Railway volume backups, and/or download `/api/export` from a logged-in browser, and/or
`railway volume files download` (see Railway docs).
