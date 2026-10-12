"use strict";
/*
 * Hosts such as Supabase give new tables to roles of their own ("anon", "authenticated") for a public
 * web API. Those roles must not see any school's records, nor the administrators table.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("pg");
const { startServer, createDatabase, dropDatabase, Browser } = require("./helpers");
const { sslOptions } = require("../server/db");

let db, server, pg;

test.before(async () => {
  db = await createDatabase();
  pg = new Client({ connectionString: db.url });
  await pg.connect();
  // what Supabase sets up before any app tables exist
  await pg.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  END $$`);
  await pg.query("GRANT USAGE ON SCHEMA public TO anon, authenticated");
  await pg.query("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated");
  const port = 4900 + Math.floor(Math.random() * 90);
  server = await startServer(db.url, port, { PLATFORM_ADMIN_USERNAME: "platformadmin", PLATFORM_ADMIN_PASSWORD: "Platform-Pass-2026" });
  const admin = new Browser(`http://127.0.0.1:${port}`);
  await admin.post("/api/platform/login", { username: "platformadmin", password: "Platform-Pass-2026" });
  const r = await admin.post("/api/platform/schools", { code: "ZETA", name: "Zeta", proprietorName: "Owner", proprietorUsername: "owner", demo: true });
  assert.equal(r.status, 200);
});

test.after(async () => {
  if (server) { server.proc.kill("SIGTERM"); await new Promise((res) => server.proc.once("exit", res)); }
  if (pg) await pg.end();
  if (db) await dropDatabase(db.name);
});

async function asRole(role, sql) {
  await pg.query("BEGIN");
  try {
    await pg.query(`SET LOCAL ROLE ${role}`);
    return await pg.query(sql);
  } finally {
    await pg.query("ROLLBACK");
  }
}

test("the public API roles have no access to any table", async () => {
  for (const role of ["anon", "authenticated"]) {
    for (const table of ["pupils", "users", "grades", "platform_admins", "schools", "sessions"]) {
      await assert.rejects(asRole(role, `SELECT * FROM ${table}`), /permission denied/, `${role} ${table}`);
    }
  }
});

test("even if access were granted again, the database rules show other roles nothing", async () => {
  await pg.query("GRANT SELECT ON pupils, platform_admins, schools TO anon");
  try {
    assert.ok((await pg.query("SELECT count(*)::int AS n FROM pupils")).rows[0].n > 0);
    for (const table of ["pupils", "platform_admins", "schools"]) {
      assert.equal((await asRole("anon", `SELECT * FROM ${table}`)).rowCount, 0, table);
    }
  } finally {
    await pg.query("REVOKE SELECT ON pupils, platform_admins, schools FROM anon");
  }
});

test("Supabase addresses get an encrypted connection without the driver's strict certificate rule", () => {
  const o = sslOptions("postgresql://postgres.ref:pw@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require");
  assert.deepEqual(o.ssl, { rejectUnauthorized: false });
  assert.ok(!o.connectionString.includes("sslmode"));
  assert.ok(o.connectionString.includes("pooler.supabase.com:5432"));
  assert.equal(sslOptions("postgresql://postgres:pw@postgres.railway.internal:5432/railway").ssl, undefined);
  assert.deepEqual(sslOptions("postgres://u:p@db.example.com/x?sslmode=require").ssl, { rejectUnauthorized: false });
});
