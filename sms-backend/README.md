# School Management System — Test Backend

Zero-dependency Node.js server (Node 18+). It serves the original app unchanged and provides the
shared `window.storage` API the app expects, so all roles on all devices see one live record.

## Run locally (laptop / school LAN)
```bash
SITE_PASSWORD='choose-a-password' node server.js
# open http://localhost:3000   (basic-auth user: tester)
# on a LAN, testers open http://<your-laptop-ip>:3000
```
Then sign in to the app with the seed accounts (e.g. `principal1` / `Password@123!`).

## Deploy with Docker (any VPS)
```bash
docker build -t sms-test .
docker run -d --name sms --restart unless-stopped -p 3000:3000 \
  -v sms-data:/data -e SITE_PASSWORD='choose-a-password' sms-test
```
Put it behind HTTPS (Caddy, nginx, or Cloudflare Tunnel). Basic auth over plain HTTP exposes the password.

## Deploy on Railway
See RAILWAY.md.

## Deploy on another PaaS (Render / Fly.io)
- Runtime: Node (or the Dockerfile), start command `node server.js`.
- **Attach a persistent disk and set `DATA_DIR` to its mount path.** Without it, data is lost on every redeploy.
- **Use a plan that does not sleep.** The app gives up on a slow first load after 4 s; the shim then
  refuses writes (data is safe) but the tester sees a red "not saved" banner until they reload.
- Set `SITE_PASSWORD`. Health check path: `/healthz`.

## Environment variables
| Var | Default | Purpose |
|---|---|---|
| `PORT` | 3000 | Listen port |
| `DATA_DIR` | ./data | Storage root (persistent disk!) |
| `SITE_USER` / `SITE_PASSWORD` | tester / (none) | Basic auth for site + API. Unset = open. |
| `HISTORY_KEEP` | 200 | Snapshots kept per key |

## Data safety
- Atomic writes (temp file + fsync + rename).
- Every overwrite of stale data, and at most one snapshot per minute otherwise, is saved in `data/history/`.
- `node scripts/restore.js` lists keys; `node scripts/restore.js dia-school-db-v1` lists snapshots;
  `node scripts/restore.js dia-school-db-v1 <file>` restores one. Stop the server first.
- `GET /api/export` downloads everything as JSON (log in via browser, same credentials).
- Back up `DATA_DIR` regularly (copy the folder).

## Known limitations (inherited from the app design)
1. The whole school database is one record rewritten on every save: **last write wins.** Two people
   editing at once can overwrite each other. Overwritten data is snapshotted, not merged.
2. The app loads data once at page load; other users' changes appear after a refresh.
3. Authentication is still client-side in the app (plain-text seed passwords in the bundle). The site-level
   basic auth is the real gate. Use synthetic data only.

## Tests
`npm test` starts a throwaway server and runs 24 API + shim checks.
