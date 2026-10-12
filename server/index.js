"use strict";
/*
 * School Management System server.
 *
 * Environment variables (see README.md):
 *   DATABASE_URL               PostgreSQL connection string (required)
 *   PORT                       default 3000
 *   PLATFORM_ADMIN_USERNAME    first start only: creates the platform administrator
 *   PLATFORM_ADMIN_PASSWORD    first start only (at least 8 characters)
 *   PLATFORM_ADMIN_RESET=1     with the two above: resets that administrator's password, then remove it
 *   TRUST_PROXY=1              behind a proxy that sets X-Forwarded-* (automatic on Railway)
 *   COOKIE_SECURE=1            always mark the sign-in cookie Secure
 */
const http = require("node:http");
const db = require("./db");
const auth = require("./auth");
const backup = require("./backup");
const { handler } = require("./app");
const { status, explain } = require("./status");

const PORT = Number(process.env.PORT || 3000);
const SNAPSHOT_EVERY_MS = 24 * 3600 * 1000;

async function dailySnapshots() {
  const schools = (await db.query("SELECT id FROM schools WHERE active")).rows;
  for (const s of schools) {
    const last = (await db.query("SELECT max(created_at) AS t FROM snapshots WHERE school_id = $1 AND reason = 'daily'", [s.id])).rows[0].t;
    if (last && Date.now() - new Date(last).getTime() < SNAPSHOT_EVERY_MS - 60 * 1000) continue;
    try {
      await db.withSchool(s.id, (c) => backup.snapshot(c, s.id, "daily"));
    } catch (e) {
      console.error(`[backup] daily snapshot failed for school ${s.id}:`, e.message);
    }
  }
  await db.query("DELETE FROM sessions WHERE expires_at < now()");
}

/* Connect and prepare the database, retrying until it works. */
async function prepare() {
  for (let attempt = 1; ; attempt++) {
    try {
      if (!db.connected()) db.connect(process.env.DATABASE_URL);
      await db.migrate();
      break;
    } catch (e) {
      status.problem = explain(e);
      console.error(`[sms] not ready (attempt ${attempt}): ${e.message}`);
      console.error(`[sms] ${status.problem}`);
      await new Promise((r) => setTimeout(r, Math.min(30000, 2000 * attempt)));
    }
  }
  try {
    await auth.bootstrapPlatformAdmin();
  } catch (e) {
    status.adminProblem = e.message;
    console.error(`[auth] platform administrator not created: ${e.message}`);
  }
  status.ready = true;
  status.problem = null;
  console.log("[sms] ready");
}

async function main() {
  const server = http.createServer(handler);
  server.headersTimeout = 30000;
  server.requestTimeout = 120000;
  server.listen(PORT, () => console.log(`[sms] listening on port ${PORT}`));

  await prepare();

  dailySnapshots().catch((e) => console.error("[backup]", e.message));
  setInterval(() => dailySnapshots().catch((e) => console.error("[backup]", e.message)), 3600 * 1000).unref();

  const stop = () => {
    console.log("[sms] shutting down");
    server.close(() => db.close().then(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10000).unref();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

main().catch((e) => {
  console.error("[sms] failed to start:", e.message);
  process.exit(1);
});
