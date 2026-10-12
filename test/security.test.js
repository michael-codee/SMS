"use strict";
/* Sign-in, sessions, request protection and the walls between schools. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers");

let env, A, B;

test.before(async () => {
  env = await setup();
  A = await env.school("ALPHA", { demo: true });
  B = await env.school("BETA", { demo: true });
});
test.after(async () => { if (env) await env.teardown(); });

test("health check and web page are served with security headers", async () => {
  const h = await fetch(env.base + "/healthz");
  assert.equal(h.status, 200);
  const page = await fetch(env.base + "/");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /script-src 'self'/);
  assert.equal(page.headers.get("x-frame-options"), "DENY");
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.match(await page.text(), /<div id="root">/);
});

test("signing in needs the right school code, username and password", async () => {
  const b = new env.Browser(env.base);
  for (const bad of [
    { schoolCode: "NOPE", username: "owner", password: "Head-Pass-123" },
    { schoolCode: "ALPHA", username: "nobody", password: "Head-Pass-123" },
    { schoolCode: "ALPHA", username: "owner", password: "wrong-password" },
    { schoolCode: "BETA", username: "owner", password: "wrong-password" },
  ]) {
    const r = await b.post("/api/login", bad);
    assert.equal(r.status, 401, JSON.stringify(bad));
    assert.equal(r.body.error, "School code, username or password is incorrect.");
  }
  const ok = await b.post("/api/login", { schoolCode: "alpha", username: "OWNER", password: "Head-Pass-123" });
  assert.equal(ok.status, 200);
  assert.match(ok.setCookie, /HttpOnly/);
  assert.match(ok.setCookie, /SameSite=Lax/);
  const d = await b.data();
  assert.equal(d.school.code, "ALPHA");
});

test("the session cookie is the only way in, and signing out ends it", async () => {
  const anon = new env.Browser(env.base);
  assert.equal((await anon.get("/api/data")).status, 401);
  const b = new env.Browser(env.base);
  await b.post("/api/login", { schoolCode: "ALPHA", username: "owner", password: "Head-Pass-123" });
  const stolen = b.cookie;
  await b.post("/api/logout");
  const replay = new env.Browser(env.base);
  replay.cookie = stolen;
  assert.equal((await replay.get("/api/data")).status, 401);
});

test("passwords are stored scrambled, never in plain text", async () => {
  const r = await env.pg.query("SELECT password_hash FROM users WHERE username = 'owner'");
  for (const row of r.rows) {
    assert.match(row.password_hash, /^scrypt\$/);
    assert.ok(!row.password_hash.includes("Head-Pass-123"));
  }
  const d = await A.browser.data();
  assert.ok(d.users.length > 0);
  for (const u of d.users) assert.equal(u.password_hash, undefined);
  assert.ok(!JSON.stringify(d).includes("scrypt$"));
});

test("an account locks after the school's limit of wrong passwords", async () => {
  const acc = await A.browser.ok("createAccount", { role: "bursar", name: "Lock Test", username: "locktest" });
  const b = new env.Browser(env.base);
  for (let i = 0; i < 4; i++) assert.equal((await b.post("/api/login", { schoolCode: "ALPHA", username: "locktest", password: "nope" })).status, 401);
  assert.equal((await b.post("/api/login", { schoolCode: "ALPHA", username: "locktest", password: "nope" })).status, 423);
  // even the right password is refused while locked
  assert.equal((await b.post("/api/login", { schoolCode: "ALPHA", username: "locktest", password: acc.tempPassword })).status, 423);
  const user = (await A.browser.data()).users.find((u) => u.username === "locktest");
  assert.equal(user.locked, true);
  await A.browser.ok("unlockAccount", { userId: user.id });
  assert.equal((await b.post("/api/login", { schoolCode: "ALPHA", username: "locktest", password: acc.tempPassword })).status, 200);
});

test("new accounts must change their temporary password before doing anything", async () => {
  const acc = await A.browser.ok("createAccount", { role: "principal", name: "Temp Principal", username: "tempprin" });
  const b = new env.Browser(env.base);
  await b.post("/api/login", { schoolCode: "ALPHA", username: "tempprin", password: acc.tempPassword });
  const d = await b.data();
  assert.equal(d.me.mustChangePassword, true);
  const blocked = await b.action("postAnnouncement", { text: "hello" });
  assert.equal(blocked.status, 403);
  assert.equal((await b.post("/api/password", { current: acc.tempPassword, next: "short" })).status, 400);
  assert.equal((await b.post("/api/password", { current: acc.tempPassword, next: "Principal-Pass-1" })).status, 200);
  assert.equal((await b.action("postAnnouncement", { text: "hello" })).status, 200);
});

test("changing a password signs out the person's other devices", async () => {
  const acc = await A.browser.ok("createAccount", { role: "bursar", name: "Two Devices", username: "twodev" });
  const phone = await env.signIn("ALPHA", "twodev", acc.tempPassword, "First-Pass-123");
  const laptop = new env.Browser(env.base);
  await laptop.post("/api/login", { schoolCode: "ALPHA", username: "twodev", password: "First-Pass-123" });
  assert.equal((await laptop.get("/api/data")).status, 200);
  assert.equal((await phone.post("/api/password", { current: "First-Pass-123", next: "Second-Pass-123" })).status, 200);
  assert.equal((await laptop.get("/api/data")).status, 401);
  assert.equal((await phone.get("/api/data")).status, 200);
});

test("idle sessions expire on the server", async () => {
  const b = new env.Browser(env.base);
  await b.post("/api/login", { schoolCode: "BETA", username: "owner", password: "Head-Pass-123" });
  assert.equal((await b.get("/api/data")).status, 200);
  await env.pg.query("UPDATE sessions SET last_seen_at = now() - interval '2 hours' WHERE school_id = $1", [B.id]);
  const r = await b.get("/api/data");
  assert.equal(r.status, 401);
  assert.equal(r.body.expired, true);
  // the shared test login for BETA was also expired; sign it in again for later tests
  await B.browser.post("/api/login", { schoolCode: "BETA", username: "owner", password: "Head-Pass-123" });
});

test("changes are refused without the app's request header or from another website", async () => {
  const noHeader = await fetch(env.base + "/api/action/postAnnouncement", {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: A.browser.cookie }, body: JSON.stringify({ text: "x" }),
  });
  assert.equal(noHeader.status, 403);
  const evil = await A.browser.post("/api/action/postAnnouncement", { text: "x" }, { Origin: "https://evil.example" });
  assert.equal(evil.status, 403);
  const plainForm = await fetch(env.base + "/api/login", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-SMS-Request": "1" }, body: "schoolCode=ALPHA",
  });
  assert.equal(plainForm.status, 415);
});

test("a school never sees another school's records", async () => {
  const a = await A.browser.data();
  const b = await B.browser.data();
  const aPupils = new Set(a.pupils.map((p) => p.id));
  assert.ok(a.pupils.length > 0 && b.pupils.length > 0);
  for (const p of b.pupils) assert.ok(!aPupils.has(p.id));
  assert.ok(a.users.every((u) => !b.users.some((x) => x.id === u.id)));
  assert.ok(!JSON.stringify(b).includes("ALPHA School"));
});

test("a school cannot change another school's records, even knowing their ids", async () => {
  const a = await A.browser.data();
  const aPupil = a.pupils[0];
  const aClass = a.classes[0];
  const aUser = a.users.find((u) => u.role === "proprietor");
  const attempts = [
    ["recordPayment", { pupilId: aPupil.id, amount: 100 }],
    ["setFee", { pupilId: aPupil.id, amount: 1 }],
    ["setFee", { classId: aClass.id, amount: 1 }],
    ["updatePupil", { id: aPupil.id, name: "Hacked" }],
    ["saveGrade", { pupilId: aPupil.id, subject: "Mathematics", scores: { exam: 1 } }],
    ["saveAttendance", { classId: aClass.id, statusMap: { [aPupil.id]: "absent" } }],
    ["resetPassword", { userId: aUser.id }],
    ["toggleAccountActive", { userId: aUser.id }],
    ["createAccount", { role: "parent", name: "Spy", username: "spy", pupilIds: [aPupil.id] }],
  ];
  for (const [name, body] of attempts) {
    const r = await B.browser.action(name, body);
    assert.ok([400, 404].includes(r.status), `${name} returned ${r.status}`);
  }
  const after = await A.browser.data();
  assert.equal(after.pupils.find((p) => p.id === aPupil.id).name, aPupil.name);
  assert.equal(after.users.find((u) => u.id === aUser.id).active, true);
  assert.equal((await B.browser.get(`/api/photo/pupil/${aPupil.id}`)).status, 404);
});

test("the database itself hides other schools' rows (row-level security)", async () => {
  const { Client } = require("pg");
  const c = new Client({ connectionString: env.dbUrl });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.school_id', $1, true)", [B.id]);
    await c.query("SET LOCAL ROLE sms_app");
    const r = await c.query("SELECT DISTINCT school_id FROM pupils");
    assert.deepEqual(r.rows.map((x) => x.school_id), [B.id]);
    const s = await c.query("SELECT id FROM schools");
    assert.deepEqual(s.rows.map((x) => x.id), [B.id]);
    await assert.rejects(c.query("INSERT INTO announcements (id, school_id, author, text) VALUES ('x', $1, 'x', 'x')", [A.id]));
    await c.query("ROLLBACK");
  } finally {
    await c.end();
  }
});

test("a switched-off school cannot sign in, and switching it on restores access", async () => {
  const off = await env.admin.post(`/api/platform/schools/${B.id}/active`, { active: false });
  assert.equal(off.status, 200);
  assert.equal((await B.browser.get("/api/data")).status, 401);
  const b = new env.Browser(env.base);
  assert.equal((await b.post("/api/login", { schoolCode: "BETA", username: "owner", password: "Head-Pass-123" })).status, 401);
  await env.admin.post(`/api/platform/schools/${B.id}/active`, { active: true });
  assert.equal((await b.post("/api/login", { schoolCode: "BETA", username: "owner", password: "Head-Pass-123" })).status, 200);
  B.browser = b;
});

test("platform pages refuse school accounts, and school data refuses platform admins", async () => {
  assert.equal((await A.browser.get("/api/platform/schools")).status, 403);
  assert.equal((await env.admin.get("/api/data")).status, 403);
});

test("the platform admin can give a locked-out Proprietor a new temporary password", async () => {
  const r = await env.admin.post(`/api/platform/schools/${B.id}/reset-proprietor`);
  assert.equal(r.status, 200);
  const b = await env.signIn("BETA", "owner", r.body.tempPassword, "Head-Pass-456");
  assert.equal((await b.data()).me.role, "proprietor");
  B.browser = b;
});
