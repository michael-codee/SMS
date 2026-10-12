"use strict";
/*
 * Database access. PostgreSQL via `pg`.
 *
 *   query(sql, params)          run as the table owner (sign-in, platform admin, migrations)
 *   withSchool(schoolId, fn)    run fn(client) in one transaction, as role sms_app, bound to one school.
 *                               Row-level security then hides every other school's rows.
 *   tx(fn)                      plain owner transaction
 */
const fs = require("node:fs");
const path = require("node:path");
const { Pool, types } = require("pg");

// numeric -> JS number (fees and payments are well inside double precision for this use)
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// date -> "YYYY-MM-DD" string, never shifted by time zone
types.setTypeParser(1082, (v) => v);

let pool = null;
let canSetRole = false;

function connect(connectionString) {
  if (!connectionString) throw new Error("DATABASE_URL is not set. See README.md.");
  const needsSsl = /sslmode=require/.test(connectionString) || process.env.PGSSL === "1";
  pool = new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 10),
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    idleTimeoutMillis: 30000,
  });
  pool.on("error", (e) => console.error("[db] idle client error:", e.message));
  return pool;
}

function getPool() {
  if (!pool) throw new Error("database not connected");
  return pool;
}

async function query(sql, params) {
  return getPool().query(sql, params);
}

async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

async function withSchool(schoolId, fn) {
  if (!schoolId) throw new Error("withSchool: no school");
  return tx(async (client) => {
    await client.query("SELECT set_config('app.school_id', $1, true)", [schoolId]);
    if (canSetRole) await client.query("SET LOCAL ROLE sms_app");
    return fn(client);
  });
}

async function migrate() {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const dir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const done = new Set((await query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    await tx(async (c) => {
      // one migration at a time, even if two app instances start together
      await c.query("SELECT pg_advisory_xact_lock(4711)");
      const again = await c.query("SELECT 1 FROM schema_migrations WHERE name = $1", [f]);
      if (again.rowCount) return;
      await c.query(sql);
      await c.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
    });
    console.log(`[db] applied migration ${f}`);
  }
  canSetRole = await probeRole();
  if (!canSetRole) {
    console.warn("[db] WARNING: cannot switch to role sms_app; database-level school isolation is OFF. " +
      "The app's own school filters still apply. Use a database user with CREATEROLE to enable it.");
  }
}

async function probeRole() {
  try {
    await tx(async (c) => { await c.query("SET LOCAL ROLE sms_app"); });
    return true;
  } catch (e) {
    return false;
  }
}

function rowSecurityEnabled() {
  return canSetRole;
}

async function close() {
  if (pool) await pool.end();
  pool = null;
}

module.exports = { connect, query, tx, withSchool, migrate, close, getPool, rowSecurityEnabled };
