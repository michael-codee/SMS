"use strict";
/* What each role can see and do inside one school. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers");

let env, S, data, people = {};

test.before(async () => {
  env = await setup();
  S = await env.school("GAMMA", { demo: true });
  data = await S.browser.data();
  const jss1 = data.classes.find((c) => c.name === "JSS1");
  const jss2 = data.classes.find((c) => c.name === "JSS2");
  const t1 = data.teachers.find((t) => t.classId === jss1.id);
  const kid1 = data.pupils.find((p) => p.classId === jss1.id);
  const kid2 = data.pupils.find((p) => p.classId === jss2.id);
  people.ids = { jss1: jss1.id, jss2: jss2.id, t1: t1.id, kid1: kid1.id, kid2: kid2.id };

  const mk = async (body, pass) => {
    const r = await S.browser.ok("createAccount", body);
    return env.signIn("GAMMA", body.username, r.tempPassword, pass);
  };
  people.teacher = await mk({ role: "teacher", name: t1.name, username: "teach1", teacherId: t1.id }, "Teacher-Pass-1");
  people.parent = await mk({ role: "parent", name: "Parent One", username: "parent1", pupilIds: [kid1.id] }, "Parent-Pass-1");
  people.pupil = await mk({ role: "pupil", name: kid1.name, username: "pupil1", pupilId: kid1.id }, "Pupil-Pass-11");
  people.bursar = await mk({ role: "bursar", name: "Bursar One", username: "bursar1" }, "Bursar-Pass-1");
  people.principal = await mk({ role: "principal", name: "Principal One", username: "princ1" }, "Princ-Pass-11");
  people.exam = await mk({ role: "examofficer", name: "Exam Officer", username: "exam1" }, "Exams-Pass-11");
});
test.after(async () => { if (env) await env.teardown(); });

test("a parent sees only their own child, and no staff-only information", async () => {
  const d = await people.parent.data();
  assert.deepEqual(d.pupils.map((p) => p.id), [people.ids.kid1]);
  assert.deepEqual(d.users, []);
  assert.deepEqual(d.auditLog, []);
  assert.deepEqual(d.payments, []);
  assert.deepEqual(Object.keys(d.fees), [people.ids.kid1]);
  for (const k of Object.keys(d.grades)) assert.ok(k.startsWith(people.ids.kid1 + "|"), k);
  assert.ok(d.teachers.length === 0);
  // class position comes ready-made, without classmates' marks
  assert.ok(Object.keys(d.rankings).some((k) => k.startsWith(people.ids.kid1)));
  // other children's photos are refused
  assert.equal((await people.parent.get(`/api/photo/pupil/${people.ids.kid2}`)).status, 404);
});

test("a pupil sees only themselves", async () => {
  const d = await people.pupil.data();
  assert.deepEqual(d.pupils.map((p) => p.id), [people.ids.kid1]);
  assert.deepEqual(d.fees, {});
  assert.deepEqual(d.users, []);
});

test("a teacher sees only their own class", async () => {
  const d = await people.teacher.data();
  assert.ok(d.pupils.length > 0);
  assert.ok(d.pupils.every((p) => p.classId === people.ids.jss1));
  assert.deepEqual(d.teachers.map((t) => t.id), [people.ids.t1]);
  assert.deepEqual(d.fees, {});
  assert.deepEqual(d.users, []);
  assert.equal(d.pupils[0].address, undefined, "teachers get class lists, not home addresses");
});

test("a bursar sees fees and payments but no marks", async () => {
  const d = await people.bursar.data();
  assert.ok(d.pupils.length > 1);
  assert.deepEqual(d.grades, {});
  assert.ok(Object.keys(d.fees).length > 0);
  assert.ok(d.payments.length > 0);
  assert.deepEqual(d.users, []);
});

test("the exam officer sees question papers but no pupils", async () => {
  const d = await people.exam.data();
  assert.deepEqual(d.pupils, []);
  assert.deepEqual(d.grades, {});
  assert.ok(Array.isArray(d.questionSubmissions));
});

test("each role is refused actions outside its job", async () => {
  const deny = async (who, name, body) => {
    const r = await people[who].action(name, body);
    assert.equal(r.status, 403, `${who} ${name}: ${r.status} ${r.text}`);
  };
  await deny("teacher", "recordPayment", { pupilId: people.ids.kid1, amount: 10 });
  await deny("teacher", "createAccount", { role: "proprietor", name: "x", username: "xx1" });
  await deny("parent", "saveGrade", { pupilId: people.ids.kid1, subject: "Business Studies", scores: { exam: 60 } });
  await deny("parent", "postAnnouncement", { text: "hi" });
  await deny("pupil", "saveComment", { pupilId: people.ids.kid1, term: "Term 1", teacherComment: "great" });
  await deny("bursar", "saveGrade", { pupilId: people.ids.kid1, subject: "Business Studies", scores: { exam: 60 } });
  await deny("bursar", "updateSettings", { patch: { currency: "$" } });
  await deny("exam", "registerPupil", { name: "x" });
  await deny("principal", "resetPassword", { userId: "anything" });
  await deny("teacher", "reviewQuestion", { id: "x", status: "Approved" });
  // a teacher cannot mark another class
  await deny("teacher", "saveGrade", { pupilId: people.ids.kid2, subject: "History", scores: { exam: 60 } });
  await deny("teacher", "saveAttendance", { classId: people.ids.jss2, statusMap: { [people.ids.kid2]: "present" } });
  // a teacher cannot write the principal's comment
  await deny("teacher", "saveComment", { pupilId: people.ids.kid1, term: "Term 1", principalComment: "x" });
});

test("a teacher enters scores; values are checked against the school's limits", async () => {
  const subject = (await people.teacher.data()).teachers[0].subjects[0];
  const tooHigh = await people.teacher.action("saveGrade", { pupilId: people.ids.kid1, subject, scores: { classwork: 25, test1: 5, test2: 5, exam: 50 } });
  assert.equal(tooHigh.status, 400);
  await people.teacher.ok("saveGrade", { pupilId: people.ids.kid1, subject, scores: { classwork: 18, test1: 9, test2: 8, exam: 55 } });
  const d = await people.parent.data();
  const key = Object.keys(d.grades).find((k) => k.startsWith(`${people.ids.kid1}|${subject}|`) && k.includes(d.settings.currentTerm));
  assert.deepEqual(d.grades[key], { classwork: 18, test1: 9, test2: 8, exam: 55 });
});

test("teacher and principal comments appear on the report card", async () => {
  const term = data.settings.currentTerm;
  await people.teacher.ok("saveComment", { pupilId: people.ids.kid1, term, teacherComment: "Works hard." });
  await people.principal.ok("saveComment", { pupilId: people.ids.kid1, term, principalComment: "Well done." });
  const d = await people.parent.data();
  assert.deepEqual(d.comments[`${people.ids.kid1}|${term}`], { teacher: "Works hard.", principal: "Well done." });
});

test("attendance: marking the same day twice replaces it instead of double counting", async () => {
  const kids = (await people.teacher.data()).pupils;
  const map = Object.fromEntries(kids.map((k) => [k.id, "present"]));
  await people.teacher.ok("saveAttendance", { classId: people.ids.jss1, statusMap: map });
  map[people.ids.kid1] = "absent";
  await people.teacher.ok("saveAttendance", { classId: people.ids.jss1, statusMap: map });
  const d = await people.parent.data();
  assert.deepEqual(d.attendance[people.ids.kid1], { present: 0, total: 1 });
});

test("payments: receipt numbers, balances, and the parent's view of the balance", async () => {
  const before = (await people.parent.data()).fees[people.ids.kid1];
  await people.bursar.ok("setFee", { pupilId: people.ids.kid1, amount: 5000 });
  const r1 = await people.bursar.ok("recordPayment", { pupilId: people.ids.kid1, amount: 1200, note: "first" });
  const r2 = await people.bursar.ok("recordPayment", { pupilId: people.ids.kid1, amount: 300 });
  assert.notEqual(r1.receiptNo, r2.receiptNo);
  const after = (await people.parent.data()).fees[people.ids.kid1];
  assert.equal(after.termFee, 5000);
  assert.equal(after.paid, before.paid + 1500);
  assert.equal((await people.bursar.action("recordPayment", { pupilId: people.ids.kid1, amount: -5 })).status, 400);
});

test("two people saving at the same moment do not overwrite each other", async () => {
  const subject = (await people.teacher.data()).teachers[0].subjects[0];
  const kids = (await people.teacher.data()).pupils;
  await Promise.all([
    ...kids.map((k, i) => people.teacher.ok("saveGrade", { pupilId: k.id, subject, scores: { classwork: 10, test1: 5, test2: 5, exam: 30 + i } })),
    people.bursar.ok("recordPayment", { pupilId: people.ids.kid2, amount: 50 }),
    people.principal.ok("postAnnouncement", { text: "Sports day on Friday" }),
    S.browser.ok("registerPupil", { name: "Same Time Pupil", classId: people.ids.jss2 }),
  ]);
  const d = await S.browser.data();
  for (const [i, k] of kids.entries()) {
    assert.equal(d.grades[`${k.id}|${subject}|${d.settings.currentTerm}|${d.settings.currentYear}`].exam, 30 + i);
  }
  assert.ok(d.announcements.some((a) => a.text === "Sports day on Friday"));
  assert.ok(d.pupils.some((p) => p.name === "Same Time Pupil"));
});

test("exam questions go from teacher to exam officer and back", async () => {
  const subject = (await people.teacher.data()).teachers[0].subjects[0];
  await people.teacher.ok("submitQuestion", { subject, title: "Mid-term test", content: "1. Define trade.", marks: 20 });
  const q = (await people.exam.data()).questionSubmissions.find((x) => x.title === "Mid-term test");
  assert.equal(q.status, "Pending");
  await people.exam.ok("reviewQuestion", { id: q.id, status: "Approved", comment: "Good paper" });
  const mine = (await people.teacher.data()).questionSubmissions.find((x) => x.id === q.id);
  assert.equal(mine.status, "Approved");
  assert.equal(mine.comment, "Good paper");
});

test("a disabled account is signed out at once", async () => {
  const d = await S.browser.data();
  const u = d.users.find((x) => x.username === "exam1");
  await S.browser.ok("toggleAccountActive", { userId: u.id });
  assert.equal((await people.exam.get("/api/data")).status, 401);
  const r = await new env.Browser(env.base).post("/api/login", { schoolCode: "GAMMA", username: "exam1", password: "Exams-Pass-11" });
  assert.equal(r.status, 403);
});

test("a pupil or staff record can only have one login", async () => {
  const r = await S.browser.action("createAccount", { role: "pupil", name: "x", username: "pupil1again", pupilId: people.ids.kid1 });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /already has an account/);
});
