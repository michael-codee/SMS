"use strict";
/*
 * Platform administration: adding schools, switching them off, and recovering a school's
 * Proprietor account. Only platform administrators reach these functions.
 */
const db = require("./db");
const auth = require("./auth");
const settingsLib = require("./settings");
const { bad, notFound, str, newId, imageDataUrl } = require("./util");
const crypto = require("node:crypto");

const CODE_RE = /^[A-Za-z0-9-]{2,20}$/;

async function listSchools() {
  const r = await db.query(
    `SELECT s.id, s.code, s.name, s.active, s.created_at AS "createdAt",
            (SELECT count(*)::int FROM pupils p WHERE p.school_id = s.id AND p.active) AS pupils,
            (SELECT count(*)::int FROM users u WHERE u.school_id = s.id) AS accounts,
            (SELECT max(at) FROM audit_log a WHERE a.school_id = s.id) AS "lastActivity"
       FROM schools s ORDER BY s.name`);
  return r.rows;
}

async function createSchool(admin, body, ip) {
  const code = str(body.code, "School code", { max: 20, required: true });
  if (!CODE_RE.test(code)) throw bad("School code uses 2 to 20 letters, digits or dashes, e.g. TISL.");
  const name = str(body.name, "School name", { max: 120, required: true });
  const proprietorName = str(body.proprietorName, "Proprietor's name", { max: 120, required: true });
  const proprietorUsername = str(body.proprietorUsername, "Proprietor's username", { max: 40, required: true });
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(proprietorUsername)) throw bad("Usernames use 3 to 40 letters, digits, dots, dashes or underscores.");
  const logo = imageDataUrl(body.logo, "Logo");
  const withDemo = body.demo === true;

  const id = crypto.randomUUID();
  const temp = auth.generateTempPassword();
  const hash = await auth.hashPassword(temp);
  const settings = settingsLib.sanitize({
    motto: body.motto || "", location: body.location || "", admissionPrefix: code.toUpperCase(),
  }, {});

  await db.tx(async (c) => {
    const exists = await c.query("SELECT 1 FROM schools WHERE lower(code) = lower($1)", [code]);
    if (exists.rowCount) throw bad(`A school with code ${code} already exists.`);
    await c.query("INSERT INTO schools (id, code, name, settings, logo) VALUES ($1,$2,$3,$4,$5)", [id, code, name, settings, logo]);
    for (const [i, n] of settingsLib.DEFAULT_CLASSES.entries()) {
      await c.query("INSERT INTO classes (id, school_id, name, sort) VALUES ($1,$2,$3,$4)", [newId("C"), id, n, i]);
    }
    for (const [i, n] of settingsLib.DEFAULT_SUBJECTS.entries()) {
      await c.query("INSERT INTO subjects (id, school_id, name, sort) VALUES ($1,$2,$3,$4)", [newId("S"), id, n, i]);
    }
    await c.query(
      `INSERT INTO users (id, school_id, username, password_hash, role, name, title, must_change_password) VALUES ($1,$2,$3,$4,'proprietor',$5,'Proprietor',true)`,
      [newId("U"), id, proprietorUsername, hash, proprietorName]);
    if (withDemo) await seedDemo(c, id, settings);
    await auth.audit(id, `${admin.name} (Platform admin)`, "Created school", `${name} (${code})${withDemo ? " with sample data" : ""}`, ip, c);
    await auth.audit(null, `${admin.name} (Platform admin)`, "Created school", `${name} (${code})`, ip, c);
  });
  return { id, code, proprietorUsername, tempPassword: temp };
}

async function setActive(admin, schoolId, active, ip) {
  const r = await db.query("UPDATE schools SET active = $2 WHERE id = $1 RETURNING name, code", [schoolId, active === true]);
  if (!r.rows[0]) throw notFound("School not found.");
  if (!active) await db.query("DELETE FROM sessions WHERE school_id = $1", [schoolId]);
  await auth.audit(null, `${admin.name} (Platform admin)`, active ? "Enabled school" : "Disabled school", `${r.rows[0].name} (${r.rows[0].code})`, ip);
  await auth.audit(schoolId, `${admin.name} (Platform admin)`, active ? "Enabled school" : "Disabled school", "", ip);
}

/* Give a school's Proprietor a new temporary password (e.g. they forgot theirs or got locked out). */
async function resetProprietor(admin, schoolId, ip) {
  const u = (await db.query(
    "SELECT id, username, name FROM users WHERE school_id = $1 AND role = 'proprietor' ORDER BY created_at LIMIT 1", [schoolId])).rows[0];
  if (!u) throw notFound("That school has no Proprietor account.");
  const temp = auth.generateTempPassword();
  await db.query("UPDATE users SET password_hash = $2, must_change_password = true, locked = false, failed_attempts = 0, active = true WHERE id = $1",
    [u.id, await auth.hashPassword(temp)]);
  await db.query("DELETE FROM sessions WHERE user_id = $1", [u.id]);
  await auth.audit(schoolId, `${admin.name} (Platform admin)`, "Reset Proprietor password", u.username, ip);
  return { username: u.username, name: u.name, tempPassword: temp };
}

/* Sample people and marks, for training and demonstrations only. */
async function seedDemo(c, sid, settings) {
  const classes = (await c.query("SELECT id, name FROM classes WHERE school_id = $1 ORDER BY sort", [sid])).rows;
  const cls = (n) => classes.find((x) => x.name === n).id;
  const T = [
    ["Mrs. Aminata Sesay", "JSS1", ["Religious Moral Education (RME)", "Physical Health Education (PHE)", "Business Studies"]],
    ["Mr. Samuel Koroma", "JSS2", ["History", "Economics"]],
    ["Mrs. Fatmata Bangura", "JSS3", ["Biology", "Chemistry"]],
    ["Mr. Ibrahim Kamara", "SSS1", ["Physics", "Economics"]],
    ["Mrs. Adama Conteh", "SSS2", ["Business Management", "Cost Accounting"]],
    ["Mr. Foday Sesay", "SSS3", ["Economics", "History"]],
  ];
  const P = [
    ["Fatmata Kamara", "JSS1", "Mrs. Isatu Kamara", 3500, 3500], ["Ibrahim Bangura", "JSS1", "Mr. Alie Bangura", 3500, 1500],
    ["Mariama Conteh", "JSS2", "Mrs. Adama Conteh", 3500, 3500], ["Abdul Sesay", "JSS2", "Mrs. Isatu Kamara", 3200, 3200],
    ["Isata Turay", "JSS3", "Mr. Foday Turay", 3200, 800], ["Mohamed Kargbo", "SSS1", "Mrs. Yeanoh Kargbo", 3800, 3800],
    ["Aminata Koroma", "SSS2", "Mr. Sorie Koroma", 3800, 1900], ["Foday Kamara", "SSS3", "Mrs. Isatu Kamara", 4200, 2000],
  ];
  const tIds = {};
  for (const [name, c1, subjects] of T) {
    const id = newId("T");
    tIds[c1] = { id, subjects };
    await c.query("INSERT INTO teachers (id, school_id, name, class_id, subjects) VALUES ($1,$2,$3,$4,$5)", [id, sid, name, cls(c1), subjects]);
  }
  const yr = settings.currentYear;
  let seq = 1;
  for (const [name, c1, parent, fee, paid] of P) {
    const id = newId("P");
    await c.query("INSERT INTO pupils (id, school_id, name, admission_no, class_id, parent_name) VALUES ($1,$2,$3,$4,$5,$6)",
      [id, sid, name, `${settings.admissionPrefix}/${yr.slice(0, 4)}/${String(seq++).padStart(3, "0")}`, cls(c1), parent]);
    await c.query("INSERT INTO fees (school_id, pupil_id, term, year, amount) VALUES ($1,$2,$3,$4,$5)", [sid, id, settings.currentTerm, yr, fee]);
    if (paid) {
      await c.query("INSERT INTO payments (id, school_id, pupil_id, amount, term, year, note, receipt_no, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Sample data')",
        [newId("PAY"), sid, id, paid, settings.currentTerm, yr, paid === fee ? "Full term payment" : "Part payment", `R${String(seq).padStart(5, "0")}`]);
    }
    for (const subject of tIds[c1].subjects) {
      const rnd = (max) => Math.round(max * (0.55 + Math.random() * 0.4));
      await c.query("INSERT INTO grades (school_id, pupil_id, subject, term, year, scores) VALUES ($1,$2,$3,$4,$5,$6)",
        [sid, id, subject, settings.currentTerm, yr, { classwork: rnd(20), test1: rnd(10), test2: rnd(10), exam: rnd(60) }]);
    }
  }
  await c.query("UPDATE schools SET next_admission_seq = $2, next_receipt_seq = $2 WHERE id = $1", [sid, seq]);
  await c.query("INSERT INTO announcements (id, school_id, author, text) VALUES ($1,$2,'School Office','Welcome! This school was created with sample data for training. Delete or replace it before real use.')",
    [newId("A"), sid]);
}

async function changeOwnPassword(admin, current, next) {
  const u = (await db.query("SELECT * FROM platform_admins WHERE id = $1", [admin.id])).rows[0];
  if (!u || !(await auth.verifyPassword(String(current || ""), u.password_hash))) throw bad("Your current password is not correct.");
  auth.checkNewPassword(next, u.username);
  await db.query("UPDATE platform_admins SET password_hash = $2 WHERE id = $1", [u.id, await auth.hashPassword(next)]);
}

async function platformAudit() {
  return (await db.query("SELECT id::text, at AS timestamp, actor, action, details FROM audit_log WHERE school_id IS NULL ORDER BY at DESC LIMIT 300")).rows;
}

module.exports = { listSchools, createSchool, setActive, resetProprietor, changeOwnPassword, platformAudit };
