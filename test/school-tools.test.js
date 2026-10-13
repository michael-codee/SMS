"use strict";
/* School codes chosen by the system, pupil ID numbers, and the camera being allowed for ID photos. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, Browser } = require("./helpers");

let env, A;
test.before(async () => {
  env = await setup();
  A = await env.school("IDNO");
});
test.after(async () => { if (env) await env.teardown(); });

test("a new school gets an 8-digit code from the system, and pupil ID numbers start with its initials", async () => {
  const r = await env.admin.post("/api/platform/schools", { name: "The International School Ltd", proprietorName: "Owner", proprietorUsername: "owner" });
  assert.equal(r.status, 200);
  assert.match(r.body.code, /^[1-9][0-9]{7}$/);
  const b = new Browser(env.base);
  assert.equal((await b.post("/api/login", { schoolCode: r.body.code, username: "owner", password: r.body.tempPassword })).status, 200);
  await b.post("/api/password", { current: r.body.tempPassword, next: "Head-Pass-123" });
  const d = await b.data();
  assert.equal(d.school.code, r.body.code);
  assert.match(d.nextAdmissionNo, /^TISL\/\d{4}\/001$/);

  const again = await env.admin.post("/api/platform/schools", { name: "Second School", proprietorName: "Owner", proprietorUsername: "owner" });
  assert.notEqual(again.body.code, r.body.code);
});

test("ID numbers: the suggestion moves on when used, a typed number is kept, and duplicates are refused", async () => {
  const b = A.browser;
  const first = (await b.data()).nextAdmissionNo;
  const p1 = await b.ok("registerPupil", { name: "Pupil One", admissionNo: first });
  let d = await b.data();
  assert.equal(d.pupils.find((p) => p.id === p1.id).admissionNo, first);
  const second = d.nextAdmissionNo;
  assert.notEqual(second, first);

  const p2 = await b.ok("registerPupil", { name: "Pupil Two", admissionNo: "CUSTOM-77" });
  d = await b.data();
  assert.equal(d.pupils.find((p) => p.id === p2.id).admissionNo, "CUSTOM-77");
  assert.equal(d.nextAdmissionNo, second, "a typed number does not use up the suggestion");

  const dup = await b.action("registerPupil", { name: "Pupil Three", admissionNo: "custom-77" });
  assert.equal(dup.status, 400);
  assert.match(dup.body.error, /already used/);
  assert.equal((await b.action("registerPupil", { name: "Bad", admissionNo: "no spaces allowed" })).status, 400);

  // a number typed by hand that matches a future suggestion is skipped later
  const future = second.replace(/\d+$/, (n) => String(Number(n) + 1).padStart(n.length, "0"));
  await b.ok("registerPupil", { name: "Pupil Four", admissionNo: future });
  await b.ok("registerPupil", { name: "Pupil Five" });
  d = await b.data();
  assert.equal(d.pupils.find((p) => p.name === "Pupil Five").admissionNo, second);
  assert.notEqual(d.nextAdmissionNo, future);

  // the ID number can be changed later, but not to one already used
  await b.ok("updatePupil", { id: p2.id, name: "Pupil Two", admissionNo: "CUSTOM-78" });
  assert.equal((await b.action("updatePupil", { id: p2.id, name: "Pupil Two", admissionNo: first })).status, 400);
});

test("the camera may be used by this site only (for ID photos)", async () => {
  const r = await fetch(env.base + "/");
  assert.match(r.headers.get("permissions-policy"), /camera=\(self\)/);
  assert.match(r.headers.get("permissions-policy"), /microphone=\(\)/);
});
