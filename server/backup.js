"use strict";
/*
 * Whole-school export, restore and automatic snapshots.
 * An export holds every school record (pupils, staff, grades, fees, ...). User accounts are listed
 * without password data, and a restore never touches accounts or passwords.
 */
const { bad } = require("./util");
const settingsLib = require("./settings");

const FORMAT = "sms-school-export";
const KEEP_DAILY = 30;

async function exportSchool(c, sid) {
  const q = async (sql) => (await c.query(sql, [sid])).rows;
  const school = (await c.query("SELECT code, name, settings, logo FROM schools WHERE id = $1", [sid])).rows[0];
  return {
    format: FORMAT,
    version: 2,
    exportedAt: new Date().toISOString(),
    school: { code: school.code, name: school.name, settings: settingsLib.full(school.settings), logo: school.logo },
    classes: await q("SELECT id, name, sort FROM classes WHERE school_id = $1 ORDER BY sort"),
    subjects: await q("SELECT id, name, sort FROM subjects WHERE school_id = $1 ORDER BY sort"),
    teachers: await q("SELECT id, name, class_id, subjects, address, telephone, dob, place_of_birth, qualifications, photo, active FROM teachers WHERE school_id = $1"),
    pupils: await q("SELECT id, name, admission_no, class_id, parent_name, address, telephone, dob, place_of_birth, photo, active FROM pupils WHERE school_id = $1"),
    users: await q("SELECT id, username, role, name, title, teacher_id, pupil_id, active FROM users WHERE school_id = $1"),
    parentChildren: await q("SELECT user_id, pupil_id FROM parent_children WHERE school_id = $1"),
    grades: await q("SELECT pupil_id, subject, term, year, scores FROM grades WHERE school_id = $1"),
    comments: await q("SELECT pupil_id, term, year, teacher_comment, principal_comment FROM report_comments WHERE school_id = $1"),
    attendance: await q("SELECT pupil_id, class_id, date::text AS date, year, present FROM attendance WHERE school_id = $1"),
    fees: await q("SELECT pupil_id, term, year, amount FROM fees WHERE school_id = $1"),
    payments: await q("SELECT id, pupil_id, amount, term, year, date::text AS date, note, receipt_no, recorded_by FROM payments WHERE school_id = $1"),
    announcements: await q("SELECT id, author, text, date::text AS date FROM announcements WHERE school_id = $1"),
    questionSubmissions: await q("SELECT id, teacher_id, teacher_name, class_id, subject, term, year, title, content, marks, status, comment, submitted_at FROM question_submissions WHERE school_id = $1"),
    auditLog: await q("SELECT at, actor, action, details FROM audit_log WHERE school_id = $1 ORDER BY at DESC LIMIT 2000"),
  };
}

function check(data) {
  if (!data || data.format !== FORMAT || data.version !== 2) throw bad("This file is not a backup exported from this system.");
  for (const k of ["classes", "subjects", "teachers", "pupils", "grades", "attendance", "fees", "payments", "announcements", "questionSubmissions"]) {
    if (!Array.isArray(data[k])) throw bad(`The backup is missing its ${k} list.`);
  }
}

/* Replace this school's records with those in `data`. Runs inside the caller's transaction. */
async function restore(c, sid, data) {
  check(data);
  const del = (t) => c.query(`DELETE FROM ${t} WHERE school_id = $1`, [sid]);
  // children first
  for (const t of ["grades", "report_comments", "attendance", "fees", "payments", "announcements", "question_submissions", "parent_children"]) await del(t);
  await c.query("UPDATE users SET teacher_id = NULL, pupil_id = NULL WHERE school_id = $1", [sid]);
  for (const t of ["pupils", "teachers", "classes", "subjects"]) await del(t);

  const settings = settingsLib.sanitize(data.school && data.school.settings ? data.school.settings : {}, {});
  await c.query("UPDATE schools SET settings = $2 WHERE id = $1", [sid, settings]);

  for (const r of data.classes) await c.query("INSERT INTO classes (id, school_id, name, sort) VALUES ($1,$2,$3,$4)", [r.id, sid, r.name, r.sort || 0]);
  for (const r of data.subjects) await c.query("INSERT INTO subjects (id, school_id, name, sort) VALUES ($1,$2,$3,$4)", [r.id, sid, r.name, r.sort || 0]);
  for (const r of data.teachers) {
    await c.query(`INSERT INTO teachers (id, school_id, name, class_id, subjects, address, telephone, dob, place_of_birth, qualifications, photo, active)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [r.id, sid, r.name, r.class_id, r.subjects || [], r.address || "", r.telephone || "", r.dob || "", r.place_of_birth || "", r.qualifications || "", r.photo || null, r.active !== false]);
  }
  for (const r of data.pupils) {
    await c.query(`INSERT INTO pupils (id, school_id, name, admission_no, class_id, parent_name, address, telephone, dob, place_of_birth, photo, active)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [r.id, sid, r.name, r.admission_no, r.class_id, r.parent_name || "", r.address || "", r.telephone || "", r.dob || "", r.place_of_birth || "", r.photo || null, r.active !== false]);
  }
  for (const r of data.grades) {
    await c.query("INSERT INTO grades (school_id, pupil_id, subject, term, year, scores) VALUES ($1,$2,$3,$4,$5,$6)", [sid, r.pupil_id, r.subject, r.term, r.year, r.scores]);
  }
  for (const r of data.comments || []) {
    await c.query("INSERT INTO report_comments (school_id, pupil_id, term, year, teacher_comment, principal_comment) VALUES ($1,$2,$3,$4,$5,$6)",
      [sid, r.pupil_id, r.term, r.year, r.teacher_comment || "", r.principal_comment || ""]);
  }
  for (const r of data.attendance) {
    await c.query("INSERT INTO attendance (school_id, pupil_id, class_id, date, year, present) VALUES ($1,$2,$3,$4,$5,$6)", [sid, r.pupil_id, r.class_id, r.date, r.year, r.present]);
  }
  for (const r of data.fees) await c.query("INSERT INTO fees (school_id, pupil_id, term, year, amount) VALUES ($1,$2,$3,$4,$5)", [sid, r.pupil_id, r.term, r.year, r.amount]);
  for (const r of data.payments) {
    await c.query("INSERT INTO payments (id, school_id, pupil_id, amount, term, year, date, note, receipt_no, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [r.id, sid, r.pupil_id, r.amount, r.term, r.year, r.date, r.note || "", r.receipt_no, r.recorded_by || ""]);
  }
  for (const r of data.announcements) await c.query("INSERT INTO announcements (id, school_id, author, text, date) VALUES ($1,$2,$3,$4,$5)", [r.id, sid, r.author, r.text, r.date]);
  for (const r of data.questionSubmissions) {
    await c.query(`INSERT INTO question_submissions (id, school_id, teacher_id, teacher_name, class_id, subject, term, year, title, content, marks, status, comment, submitted_at)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [r.id, sid, r.teacher_id, r.teacher_name, r.class_id, r.subject, r.term, r.year, r.title, r.content, r.marks || 0, r.status, r.comment || "", r.submitted_at]);
  }
  // re-link accounts that existed in the backup
  for (const u of data.users || []) {
    await c.query(
      `UPDATE users SET teacher_id = (SELECT id FROM teachers WHERE school_id = $1 AND id = $3),
                        pupil_id = (SELECT id FROM pupils WHERE school_id = $1 AND id = $4)
        WHERE school_id = $1 AND id = $2`, [sid, u.id, u.teacher_id, u.pupil_id]);
  }
  for (const pc of data.parentChildren || []) {
    await c.query(
      `INSERT INTO parent_children (user_id, pupil_id, school_id)
       SELECT $2, $3, $1 WHERE EXISTS (SELECT 1 FROM users WHERE school_id = $1 AND id = $2) AND EXISTS (SELECT 1 FROM pupils WHERE school_id = $1 AND id = $3)
       ON CONFLICT DO NOTHING`, [sid, pc.user_id, pc.pupil_id]);
  }
  const seq = await c.query(
    `SELECT COALESCE(max(NULLIF(regexp_replace(admission_no, '^.*/', ''), '')::int), 0) + 1 AS n FROM pupils WHERE school_id = $1 AND admission_no ~ '/[0-9]+$'`, [sid]);
  const rseq = await c.query(`SELECT COALESCE(max(NULLIF(regexp_replace(receipt_no, '[^0-9]', '', 'g'), '')::int), 0) + 1 AS n FROM payments WHERE school_id = $1`, [sid]);
  await c.query("UPDATE schools SET next_admission_seq = GREATEST(next_admission_seq, $2), next_receipt_seq = GREATEST(next_receipt_seq, $3) WHERE id = $1", [sid, seq.rows[0].n, rseq.rows[0].n]);
  return { pupils: data.pupils.length, teachers: data.teachers.length };
}

async function snapshot(c, sid, reason) {
  const data = await exportSchool(c, sid);
  await c.query("INSERT INTO snapshots (school_id, reason, data) VALUES ($1,$2,$3)", [sid, reason, data]);
  await c.query(
    `DELETE FROM snapshots WHERE school_id = $1 AND id NOT IN (SELECT id FROM snapshots WHERE school_id = $1 ORDER BY created_at DESC LIMIT $2)`,
    [sid, KEEP_DAILY + 10]);
}

module.exports = { exportSchool, restore, snapshot, FORMAT };
