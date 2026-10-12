"use strict";
/*
 * Test harness: a throwaway PostgreSQL database and a real server process per test file.
 * Needs TEST_DATABASE_URL pointing at a PostgreSQL server where this user may create databases,
 * e.g. postgres://postgres@localhost:5432/postgres
 */
const { spawn } = require("node:child_process");
const path = require("node:path");
const crypto = require("node:crypto");
const { Client } = require("pg");

const ADMIN_URL = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/postgres";
const ADMIN_USER = "platformadmin";
const ADMIN_PASS = "Platform-Pass-2026";

async function createDatabase() {
  const name = "sms_test_" + crypto.randomBytes(4).toString("hex");
  const c = new Client({ connectionString: ADMIN_URL });
  await c.connect();
  await c.query(`CREATE DATABASE ${name}`);
  await c.end();
  const u = new URL(ADMIN_URL);
  u.pathname = "/" + name;
  return { name, url: u.toString() };
}

async function dropDatabase(name) {
  const c = new Client({ connectionString: ADMIN_URL });
  await c.connect();
  await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await c.end();
}

function startServer(dbUrl, port, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(__dirname, "..", "server", "index.js")], {
      env: { ...process.env, DATABASE_URL: dbUrl, PORT: String(port), PLATFORM_ADMIN_USERNAME: ADMIN_USER, PLATFORM_ADMIN_PASSWORD: ADMIN_PASS, RAILWAY_ENVIRONMENT: "", TRUST_PROXY: "", ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    const onData = (d) => {
      out += d.toString();
      if (out.includes("listening on port")) resolve({ proc, logs: () => out });
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", (d) => { out += d.toString(); });
    proc.on("exit", (code) => reject(new Error(`server exited (${code}):\n${out}`)));
    setTimeout(() => reject(new Error("server did not start:\n" + out)), 15000);
  });
}

/* A browser-like client: keeps its own cookie, sends the request header the app sends. */
class Browser {
  constructor(base) {
    this.base = base;
    this.cookie = "";
  }
  async req(method, url, body, headers = {}) {
    const h = { "X-SMS-Request": "1", ...headers };
    if (this.cookie) h.Cookie = this.cookie;
    if (body !== undefined) h["Content-Type"] = "application/json";
    const res = await fetch(this.base + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    const set = res.headers.get("set-cookie");
    if (set) {
      const v = set.split(";")[0];
      this.cookie = v.endsWith("=") ? "" : v;
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
    return { status: res.status, body: json, text, headers: res.headers, setCookie: set };
  }
  get(url, headers) { return this.req("GET", url, undefined, headers); }
  post(url, body, headers) { return this.req("POST", url, body === undefined ? {} : body, headers); }
  async action(name, body) {
    const r = await this.post(`/api/action/${name}`, body);
    return r;
  }
  async ok(name, body) {
    const r = await this.action(name, body);
    if (r.status !== 200) throw new Error(`${name} failed: ${r.status} ${r.text}`);
    return r.body.result;
  }
  async data() {
    const r = await this.get("/api/data");
    if (r.status !== 200) throw new Error(`data failed: ${r.status} ${r.text}`);
    return r.body;
  }
}

/* Spin up a database and server; returns helpers for signing people in. */
async function setup(extraEnv) {
  const db = await createDatabase();
  const port = 4100 + Math.floor(Math.random() * 800);
  const server = await startServer(db.url, port, extraEnv);
  const base = `http://127.0.0.1:${port}`;
  const pg = new Client({ connectionString: db.url });
  await pg.connect();

  const admin = new Browser(base);
  const r = await admin.post("/api/platform/login", { username: ADMIN_USER, password: ADMIN_PASS });
  if (r.status !== 200) throw new Error("platform login failed: " + r.text);

  /* Create a school and return a signed-in Proprietor who has already chosen a password. */
  async function school(code, { demo = false } = {}) {
    const c = await admin.post("/api/platform/schools", { code, name: `${code} School`, proprietorName: `Owner of ${code}`, proprietorUsername: "owner", demo });
    if (c.status !== 200) throw new Error("create school failed: " + c.text);
    const b = new Browser(base);
    const l = await b.post("/api/login", { schoolCode: code, username: "owner", password: c.body.tempPassword });
    if (l.status !== 200) throw new Error("login failed: " + l.text);
    const p = await b.post("/api/password", { current: c.body.tempPassword, next: "Head-Pass-123" });
    if (p.status !== 200) throw new Error("password change failed: " + p.text);
    return { browser: b, id: c.body.id, code };
  }

  /* Sign in as a newly created account and set its password. */
  async function signIn(code, username, tempPassword, newPassword = "Member-Pass-123") {
    const b = new Browser(base);
    const l = await b.post("/api/login", { schoolCode: code, username, password: tempPassword });
    if (l.status !== 200) throw new Error("login failed: " + l.text);
    const p = await b.post("/api/password", { current: tempPassword, next: newPassword });
    if (p.status !== 200) throw new Error("password change failed: " + p.text);
    return b;
  }

  async function teardown() {
    server.proc.kill("SIGTERM");
    await new Promise((res) => server.proc.once("exit", res));
    await pg.end();
    await dropDatabase(db.name);
  }

  return { base, admin, school, signIn, pg, dbUrl: db.url, teardown, Browser, logs: server.logs };
}

module.exports = { setup, Browser };
