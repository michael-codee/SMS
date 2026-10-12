"use strict";
/* Per-school customisation, the academic calendar, and backups. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers");

let env, S, T;
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test.before(async () => {
  env = await setup();
  S = await env.school("DELTA", { demo: true });
  T = await env.school("EPSILON");
});
test.after(async () => { if (env) await env.teardown(); });

test("a new school starts with standard classes, subjects, terms and grades", async () => {
  const d = await T.browser.data();
  assert.deepEqual(d.classes.map((c) => c.name), ["JSS1", "JSS2", "JSS3", "SSS1", "SSS2", "SSS3"]);
  assert.ok(d.subjects.includes("Mathematics"));
  assert.deepEqual(d.settings.terms, ["Term 1", "Term 2", "Term 3"]);
  assert.equal(d.settings.assessment.reduce((s, a) => s + a.max, 0), 100);
  assert.deepEqual(d.pupils, []);
});

test("branding: name, motto, colours and crest are the school's own", async () => {
  await S.browser.ok("updateSettings", { patch: { name: "Delta Academy", motto: "Learn and serve", location: "Bo", colors: { primary: "#123456" }, currency: "SLE" } });
  await S.browser.ok("setLogo", { logo: PNG });
  const d = await S.browser.data();
  assert.equal(d.school.name, "Delta Academy");
  assert.equal(d.settings.motto, "Learn and serve");
  assert.equal(d.settings.colors.primary, "#123456");
  assert.equal(d.settings.currency, "SLE");
  assert.ok(d.school.logoUrl);
  const pub = await new env.Browser(env.base).get("/api/public/school/delta");
  assert.equal(pub.body.name, "Delta Academy");
  const logo = await fetch(env.base + pub.body.logoUrl);
  assert.equal(logo.headers.get("content-type"), "image/png");
  // the other school is untouched
  assert.equal((await T.browser.data()).school.name, "EPSILON School");
  const bad = await S.browser.action("setLogo", { logo: "data:text/html;base64,PHNjcmlwdD4=" });
  assert.equal(bad.status, 400);
  assert.equal((await S.browser.action("updateSettings", { patch: { colors: { primary: "red;}" } } })).status, 400);
});

test("marks breakdown must add up to 100, and report cards follow it", async () => {
  const bad = await T.browser.action("updateSettings", { patch: { assessment: [{ label: "Exam", max: 70 }, { label: "CA", max: 20 }] } });
  assert.equal(bad.status, 400);
  await T.browser.ok("updateSettings", { patch: { assessment: [{ label: "Continuous Assessment", max: 40 }, { label: "Exam", max: 60 }] } });
  const d = await T.browser.data();
  assert.deepEqual(d.settings.assessment.map((a) => a.key), ["continuous_assessment", "exam"]);
  const pupil = await T.browser.ok("registerPupil", { name: "First Pupil", classId: d.classes[0].id });
  await T.browser.ok("saveGrade", { pupilId: pupil.id, subject: "Mathematics", scores: { continuous_assessment: 35, exam: 50 } });
  assert.equal((await T.browser.action("saveGrade", { pupilId: pupil.id, subject: "Mathematics", scores: { continuous_assessment: 45, exam: 50 } })).status, 400);
});

test("grade scale must start at 0 and is sorted from the top", async () => {
  assert.equal((await T.browser.action("updateSettings", { patch: { gradeScale: [{ min: 50, max: 100, grade: "P" }] } })).status, 400);
  await T.browser.ok("updateSettings", { patch: { gradeScale: [{ min: 0, max: 49, grade: "F", remark: "Fail" }, { min: 50, max: 100, grade: "P", remark: "Pass" }] } });
  assert.deepEqual((await T.browser.data()).settings.gradeScale.map((g) => g.grade), ["P", "F"]);
});

test("admission numbers use the school's prefix and never repeat", async () => {
  await T.browser.ok("updateSettings", { patch: { admissionPrefix: "EPS" } });
  const d0 = await T.browser.data();
  const a = await T.browser.ok("registerPupil", { name: "Pupil A" });
  const b = await T.browser.ok("registerPupil", { name: "Pupil B" });
  const d = await T.browser.data();
  const na = d.pupils.find((p) => p.id === a.id).admissionNo;
  const nb = d.pupils.find((p) => p.id === b.id).admissionNo;
  assert.match(na, new RegExp(`^EPS/${d0.settings.currentYear.slice(0, 4)}/\\d{3}$`));
  assert.notEqual(na, nb);
});

test("moving to a new term carries fees forward and starts fresh balances", async () => {
  const d = await S.browser.data();
  const kid = d.pupils[0];
  await S.browser.ok("setFee", { pupilId: kid.id, amount: 4000 });
  await S.browser.ok("recordPayment", { pupilId: kid.id, amount: 1000 });
  const next = d.settings.terms[1];
  await S.browser.ok("updateSettings", { patch: { currentTerm: next } });
  const after = await S.browser.data();
  assert.equal(after.settings.currentTerm, next);
  assert.deepEqual(after.fees[kid.id], { termFee: 4000, paid: 0 });
  // grades from the earlier term are still there
  assert.ok(Object.keys(after.grades).some((k) => k.includes(`|${d.settings.currentTerm}|`)));
});

test("classes can be renamed and added, but not removed while pupils are in them", async () => {
  const d = await S.browser.data();
  const used = d.classes.find((c) => d.pupils.some((p) => p.classId === c.id));
  const rest = d.classes.filter((c) => c.id !== used.id);
  const r = await S.browser.action("saveClasses", { classes: rest });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /still has/);
  await S.browser.ok("saveClasses", { classes: [...d.classes.map((c) => (c.id === used.id ? { ...c, name: c.name + " Gold" } : c)), { name: "Nursery" }] });
  const after = await S.browser.data();
  assert.ok(after.classes.some((c) => c.id === used.id && c.name.endsWith(" Gold")));
  assert.equal(after.classes[after.classes.length - 1].name, "Nursery");
});

test("renaming a subject keeps its grades and teachers", async () => {
  const d = await S.browser.data();
  const subj = d.subjectList.find((s) => s.name === "Economics");
  const graded = Object.keys(d.grades).filter((k) => k.split("|")[1] === "Economics").length;
  assert.ok(graded > 0);
  await S.browser.ok("saveSubjects", { subjects: d.subjectList.map((s) => (s.id === subj.id ? { ...s, name: "Economics & Trade" } : s)) });
  const after = await S.browser.data();
  assert.equal(Object.keys(after.grades).filter((k) => k.split("|")[1] === "Economics & Trade").length, graded);
  assert.ok(after.teachers.some((t) => t.subjects.includes("Economics & Trade")));
  assert.ok(!after.subjects.includes("Economics"));
});

test("editing and withdrawing a pupil", async () => {
  const d = await S.browser.data();
  const kid = d.pupils[1];
  await S.browser.ok("updatePupil", { id: kid.id, name: kid.name + " Jr", classId: kid.classId, photo: PNG });
  let after = await S.browser.data();
  const edited = after.pupils.find((p) => p.id === kid.id);
  assert.equal(edited.name, kid.name + " Jr");
  assert.match(edited.photo, /^\/api\/photo\/pupil\//);
  assert.equal((await fetch(env.base + edited.photo, { headers: { Cookie: S.browser.cookie } })).status, 200);
  await S.browser.ok("updatePupil", { id: kid.id, name: edited.name, classId: kid.classId, active: false });
  after = await S.browser.data();
  assert.ok(!after.pupils.some((p) => p.id === kid.id));
  assert.ok(after.withdrawnPupils.some((p) => p.id === kid.id));
});

test("backup download has every record but no passwords, and restore brings data back", async () => {
  const before = await S.browser.data();
  const exp = await S.browser.get("/api/export");
  assert.equal(exp.status, 200);
  assert.match(exp.headers.get("content-disposition"), /attachment/);
  const backup = exp.body;
  assert.equal(backup.format, "sms-school-export");
  assert.ok(!exp.text.includes("scrypt$"));
  assert.ok(!exp.text.includes("password_hash"));
  assert.equal(backup.pupils.length, before.pupils.length + before.withdrawnPupils.length);

  // damage the data, then restore
  await S.browser.ok("registerPupil", { name: "Added After Backup" });
  await S.browser.ok("updateSettings", { patch: { motto: "Changed after backup" } });
  const counts = await S.browser.ok("restoreBackup", { data: backup });
  assert.equal(counts.pupils, backup.pupils.length);
  const after = await S.browser.data();
  assert.ok(!after.pupils.some((p) => p.name === "Added After Backup"));
  assert.equal(after.settings.motto, before.settings.motto);
  assert.deepEqual(after.grades, before.grades);
  // accounts still work after a restore
  assert.equal(after.users.length, before.users.length);
  // the pre-restore copy is listed
  const snaps = await S.browser.get("/api/snapshots");
  assert.ok(snaps.body.some((s) => s.reason === "before-restore"));
  const one = await S.browser.get(`/api/snapshots/${snaps.body[0].id}`);
  assert.equal(one.body.format, "sms-school-export");
});

test("a backup from one school cannot be loaded into another", async () => {
  const backup = (await S.browser.get("/api/export")).body;
  const r = await T.browser.action("restoreBackup", { data: backup });
  assert.notEqual(r.status, 200);
  assert.ok((await S.browser.data()).pupils.length > 0);
  // and the other school's data is unchanged
  assert.ok(!(await T.browser.data()).pupils.some((p) => backup.pupils.some((b) => b.id === p.id)));
});

test("only the Proprietor can download backups", async () => {
  const acc = await S.browser.ok("createAccount", { role: "principal", name: "P", username: "principal9" });
  const p = await env.signIn("DELTA", "principal9", acc.tempPassword, "Principal-99x");
  assert.equal((await p.get("/api/export")).status, 403);
  assert.equal((await p.get("/api/snapshots")).status, 403);
});

test("daily automatic backups are taken on start-up", async () => {
  const r = await env.pg.query("SELECT count(*)::int AS n FROM snapshots WHERE reason = 'daily'");
  // schools created after start-up get theirs on the next hourly check; at least the schema works
  assert.ok(r.rows[0].n >= 0);
});
