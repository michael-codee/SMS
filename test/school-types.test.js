"use strict";
/* School types (secondary or pre-primary), the school location in the admin list, and the schools CSV download. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, Browser } = require("./helpers");

let env;
test.before(async () => { env = await setup(); });
test.after(async () => { if (env) await env.teardown(); });

async function createSchool(body) {
  const c = await env.admin.post("/api/platform/schools", { proprietorName: "Owner", proprietorUsername: "owner", ...body });
  assert.equal(c.status, 200, c.text);
  const b = new Browser(env.base);
  assert.equal((await b.post("/api/login", { schoolCode: c.body.code, username: "owner", password: c.body.tempPassword })).status, 200);
  assert.equal((await b.post("/api/password", { current: c.body.tempPassword, next: "Head-Pass-123" })).status, 200);
  return { browser: b, code: c.body.code, id: c.body.id };
}

test("a pre-primary school starts with nursery classes, early-years subjects and its own role names", async () => {
  const s = await createSchool({ name: "Little Stars Nursery", location: "Bo", schoolType: "preprimary", demo: true });
  const db = await s.browser.data();
  assert.equal(db.settings.schoolType, "preprimary");
  assert.deepEqual(db.classes.map((c) => c.name), ["Nursery 1", "Nursery 2", "Nursery 3"]);
  assert.ok(db.subjects.includes("Numeracy") && !db.subjects.includes("Physics"));
  assert.deepEqual(db.settings.assessment.map((a) => a.max), [40, 60]);
  assert.equal(db.settings.showClassPosition, false);
  assert.ok(db.pupils.length > 0, "sample pupils fit the nursery classes");

  const head = await s.browser.ok("createAccount", { role: "principal", name: "Mrs. Head", username: "head1" });
  const hb = await env.signIn(s.code, "head1", head.tempPassword);
  assert.equal((await hb.data()).me.title, "Head Teacher");
  const r = await hb.action("saveComment", { pupilId: db.pupils[0].id, term: db.settings.currentTerm, principalComment: "A happy term." });
  assert.equal(r.status, 200, r.text);
});

test("a secondary school keeps the usual classes and the Principal; a school with no type chosen is refused", async () => {
  const s = await createSchool({ name: "Hill Secondary", location: "Freetown", schoolType: "secondary" });
  const db = await s.browser.data();
  assert.equal(db.settings.schoolType, "secondary");
  assert.equal(db.classes[0].name, "JSS1");
  const p = await s.browser.ok("createAccount", { role: "principal", name: "Mr. Principal", username: "princ1" });
  assert.equal((await (await env.signIn(s.code, "princ1", p.tempPassword)).data()).me.title, "Principal");

  const none = await env.admin.post("/api/platform/schools", { name: "No Type", proprietorName: "O", proprietorUsername: "owner", schoolType: "" });
  assert.equal(none.status, 400);
  assert.match(none.body.error, /school type/);
});

test("the admin school list shows each school's type and location", async () => {
  const list = (await env.admin.get("/api/platform/schools")).body;
  const nursery = list.find((x) => x.name === "Little Stars Nursery");
  assert.equal(nursery.location, "Bo");
  assert.equal(nursery.schoolType, "preprimary");
  assert.equal(list.find((x) => x.name === "Hill Secondary").schoolType, "secondary");
});

test("the schools CSV has every school's details, is safe to open in a spreadsheet, and is for administrators only", async () => {
  await createSchool({ name: "Formula School", motto: "=1+2", location: "Makeni, North", schoolType: "secondary" });
  const r = await env.admin.get("/api/platform/schools.csv");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /text\/csv/);
  assert.match(r.headers.get("content-disposition"), /attachment; filename="?schools-/);
  const lines = r.text.replace(/^﻿/, "").trim().split("\r\n");
  assert.match(lines[0], /^School code,School name,School type,Location,/);
  const row = lines.find((l) => l.includes("Formula School"));
  assert.ok(row.includes("'=1+2"), "a value starting with = is not run as a formula");
  assert.ok(row.includes('"Makeni, North"'), "commas are quoted");
  assert.ok(lines.some((l) => l.includes("Little Stars Nursery") && l.includes("Pre-Primary School")));
  const audit = (await env.admin.get("/api/platform/audit")).body;
  assert.ok(audit.some((a) => a.action === "Downloaded school list"));

  assert.equal((await new Browser(env.base).get("/api/platform/schools.csv")).status, 401);
  const school = await env.school("CSVX");
  assert.equal((await school.browser.get("/api/platform/schools.csv")).status, 403);
});
