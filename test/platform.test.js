"use strict";
/* The platform administration menu: system and security settings, administrators, and sign-ins. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, Browser } = require("./helpers");

let env;
test.before(async () => { env = await setup(); });
test.after(async () => { if (env) await env.teardown(); });

async function signInAdmin(username, password) {
  const b = new Browser(env.base);
  const r = await b.post("/api/platform/login", { username, password });
  return { b, r };
}

test("system settings: the notice and help contact reach every school's sign-in page, and changes are logged", async () => {
  const bad = await env.admin.post("/api/platform/settings", { patch: { notice: "x".repeat(301) } });
  assert.equal(bad.status, 400);
  const r = await env.admin.post("/api/platform/settings", { patch: { notice: "Maintenance on Saturday", supportContact: "Call 076 000 000" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.notice, "Maintenance on Saturday");
  const pub = await new Browser(env.base).get("/api/public/notice");
  assert.deepEqual(pub.body, { notice: "Maintenance on Saturday", supportContact: "Call 076 000 000" });
  const audit = (await env.admin.get("/api/platform/audit")).body;
  assert.ok(audit.some((a) => a.action === "Changed platform settings" && /notice/.test(a.details)));
  const info = (await env.admin.get("/api/platform/system")).body;
  assert.equal(typeof info.version, "string");
  assert.equal(typeof info.schools, "number");
});

test("settings and administrator pages are for platform administrators only", async () => {
  const anon = new Browser(env.base);
  for (const url of ["/api/platform/settings", "/api/platform/system", "/api/platform/admins", "/api/platform/sessions"]) {
    assert.equal((await anon.get(url)).status, 401, url);
  }
  const school = await env.school("GATE");
  assert.equal((await school.browser.get("/api/platform/settings")).status, 403);
  assert.equal((await school.browser.post("/api/platform/settings", { patch: { notice: "hi" } })).status, 403);
});

test("a new administrator must choose their own password before doing anything else", async () => {
  const add = await env.admin.post("/api/platform/admins", { name: "Second Admin", username: "second" });
  assert.equal(add.status, 200);
  assert.equal((await env.admin.post("/api/platform/admins", { name: "Again", username: "SECOND" })).status, 400);

  const { b, r } = await signInAdmin("second", add.body.tempPassword);
  assert.equal(r.status, 200);
  assert.equal((await b.get("/api/platform/me")).body.mustChangePassword, true);
  assert.equal((await b.get("/api/platform/schools")).status, 403);
  assert.equal((await b.post("/api/platform/password", { current: add.body.tempPassword, next: "Blue-River-Gate-77" })).status, 200);
  assert.equal((await b.get("/api/platform/me")).body.mustChangePassword, false);
  assert.equal((await b.get("/api/platform/schools")).status, 200);

  const list = (await b.get("/api/platform/admins")).body;
  assert.equal(list.length, 2);
  assert.equal(list.find((a) => a.username === "second").you, true);
});

test("administrators reset or remove each other, never themselves", async () => {
  const me = (await env.admin.get("/api/platform/me")).body;
  assert.equal((await env.admin.post(`/api/platform/admins/${me.id}/reset`)).status, 400);
  assert.equal((await env.admin.post(`/api/platform/admins/${me.id}/remove`)).status, 400);

  const other = (await env.admin.get("/api/platform/admins")).body.find((a) => a.username === "second");
  const { b } = await signInAdmin("second", "Blue-River-Gate-77");
  const reset = await env.admin.post(`/api/platform/admins/${other.id}/reset`);
  assert.equal(reset.status, 200);
  assert.equal((await b.get("/api/platform/me")).status, 401, "their sessions end");
  assert.equal((await signInAdmin("second", "Blue-River-Gate-77")).r.status, 401, "old password stops working");
  assert.equal((await signInAdmin("second", reset.body.tempPassword)).r.status, 200);

  assert.equal((await env.admin.post(`/api/platform/admins/${other.id}/remove`)).status, 200);
  assert.equal((await signInAdmin("second", reset.body.tempPassword)).r.status, 401);
});

test("security settings: administrator lockout and the shortest password allowed", async () => {
  assert.equal((await env.admin.post("/api/platform/settings", { patch: { adminLockoutThreshold: 2 } })).status, 400);
  assert.equal((await env.admin.post("/api/platform/settings", { patch: { adminLockoutThreshold: 3, minPasswordLength: 12 } })).status, 200);

  const add = await env.admin.post("/api/platform/admins", { name: "Third Admin", username: "third" });
  const { b } = await signInAdmin("third", add.body.tempPassword);
  const short = await b.post("/api/platform/password", { current: add.body.tempPassword, next: "Short-Pw-1" });
  assert.equal(short.status, 400);
  assert.match(short.body.error, /12 characters/);
  assert.equal((await b.post("/api/platform/password", { current: add.body.tempPassword, next: "Green-Hill-Lamp-88" })).status, 200);

  for (let i = 0; i < 3; i++) await signInAdmin("third", "wrong-password-x");
  const locked = await signInAdmin("third", "Green-Hill-Lamp-88");
  assert.equal(locked.r.status, 423);

  await env.admin.post("/api/platform/settings", { patch: { minPasswordLength: 8, adminLockoutThreshold: 10 } });
});

test("new schools start with the platform's security defaults", async () => {
  await env.admin.post("/api/platform/settings", { patch: { newSchoolSessionTimeoutMinutes: 45, newSchoolLockoutThreshold: 7 } });
  const s = await env.school("DFLT");
  const settings = (await env.pg.query("SELECT settings FROM schools WHERE id = $1", [s.id])).rows[0].settings;
  assert.equal(settings.sessionTimeoutMinutes, 45);
  assert.equal(settings.lockoutThreshold, 7);
  assert.equal(settings.colors.primary, "#12355B");
});

test("signing out other devices keeps only this one", async () => {
  const me = (await env.admin.get("/api/platform/me")).body;
  const other = await signInAdmin(me.username, "Platform-Pass-2026");
  assert.equal(other.r.status, 200);
  const sessions = (await env.admin.get("/api/platform/sessions")).body;
  assert.ok(sessions.length >= 2);
  assert.equal(sessions.filter((s) => s.current).length, 1);
  assert.equal((await env.admin.post("/api/platform/sessions/sign-out-others")).status, 200);
  assert.equal((await other.b.get("/api/platform/me")).status, 401);
  assert.equal((await env.admin.get("/api/platform/sessions")).body.length, 1);
});
