"use strict";
/*
 * Builds the school record a signed-in person is allowed to see, in the shape the web app uses.
 * This is the only way school data leaves the server, so each role gets exactly what its screens
 * need and nothing more: e.g. a parent gets only their own children, and nobody gets password data.
 */
const settingsLib = require("./settings");
const { actorLabel } = require("./auth");
const { suggestAdmissionNo } = require("./admission");

const ALL = ["proprietor", "principal", "bursar", "teacher", "pupil", "parent", "examofficer"];

function photoUrl(kind, row) {
  return row.has_photo ? `/api/photo/${kind}/${encodeURIComponent(row.id)}?v=${new Date(row.updated_at).getTime()}` : "";
}

function pupilOut(p, full) {
  const base = { id: p.id, name: p.name, admissionNo: p.admission_no, classId: p.class_id, parentName: p.parent_name, active: p.active };
  if (!full) return base;
  return { ...base, address: p.address, telephone: p.telephone, dob: p.dob, placeOfBirth: p.place_of_birth, photo: photoUrl("pupil", p) };
}

function teacherOut(t, full) {
  const base = { id: t.id, name: t.name, classId: t.class_id, subjects: t.subjects || [], active: t.active };
  if (!full) return base;
  return { ...base, address: t.address, telephone: t.telephone, dob: t.dob, placeOfBirth: t.place_of_birth, qualifications: t.qualifications, photo: photoUrl("teacher", t) };
}

/* Which pupils this person may see; null = every pupil in the school. */
async function visiblePupilIds(client, principal) {
  const u = principal.user;
  switch (u.role) {
    case "proprietor":
    case "principal":
    case "bursar":
    case "examofficer":
      return null;
    case "teacher": {
      if (!u.teacher_id) return [];
      const r = await client.query(
        `SELECT p.id FROM pupils p JOIN teachers t ON t.class_id = p.class_id AND t.id = $2
          WHERE p.school_id = $1`, [principal.schoolId, u.teacher_id]);
      return r.rows.map((x) => x.id);
    }
    case "pupil":
      return u.pupil_id ? [u.pupil_id] : [];
    case "parent":
      return u.pupil_ids || [];
    default:
      return [];
  }
}

async function canSeePupil(client, principal, pupilId) {
  const ids = await visiblePupilIds(client, principal);
  if (ids === null) return ["proprietor", "principal", "bursar"].includes(principal.user.role);
  return ids.includes(pupilId);
}

async function canSeeTeacher(client, principal, teacherId) {
  const role = principal.user.role;
  if (role === "proprietor" || role === "principal") return true;
  return role === "teacher" && principal.user.teacher_id === teacherId;
}

function gradeTotal(scores) {
  return Object.values(scores || {}).reduce((s, v) => s + (Number(v) || 0), 0);
}

/* Class positions, computed on the server so pupils and parents never receive classmates' marks. */
function rankings(pupilsByClass, gradeRows, terms, forIds) {
  const out = {};
  const byPupilTerm = new Map(); // pupil -> term -> [totals]
  const byPupilSubject = new Map(); // pupil -> subject -> [totals]
  for (const g of gradeRows) {
    const t = gradeTotal(g.scores);
    if (!byPupilTerm.has(g.pupil_id)) byPupilTerm.set(g.pupil_id, new Map());
    const m = byPupilTerm.get(g.pupil_id);
    if (!m.has(g.term)) m.set(g.term, []);
    m.get(g.term).push(t);
    if (!byPupilSubject.has(g.pupil_id)) byPupilSubject.set(g.pupil_id, new Map());
    const s = byPupilSubject.get(g.pupil_id);
    if (!s.has(g.subject)) s.set(g.subject, []);
    s.get(g.subject).push(t);
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : -1);
  for (const [, members] of pupilsByClass) {
    for (const term of [...terms, "combined"]) {
      const list = members
        .map((pid) => {
          if (term === "combined") {
            const subj = byPupilSubject.get(pid);
            return { pid, avg: subj ? avg([...subj.values()].map(avg)) : -1 };
          }
          return { pid, avg: avg((byPupilTerm.get(pid) && byPupilTerm.get(pid).get(term)) || []) };
        })
        .filter((r) => r.avg >= 0)
        .sort((a, b) => b.avg - a.avg);
      list.forEach((r, i) => {
        if (forIds.has(r.pid)) out[`${r.pid}|${term}`] = `${i + 1} of ${list.length}`;
      });
    }
  }
  return out;
}

async function build(client, principal) {
  const sid = principal.schoolId;
  const u = principal.user;
  const role = u.role;
  const school = (await client.query("SELECT id, code, name, settings, rev, logo IS NOT NULL AS has_logo FROM schools WHERE id = $1", [sid])).rows[0];
  const settings = settingsLib.full(school.settings);
  const year = settings.currentYear;

  const out = {
    rev: Number(school.rev),
    school: { id: school.id, code: school.code, name: school.name, logoUrl: school.has_logo ? `/api/public/logo/${encodeURIComponent(school.code)}?v=${school.rev}` : "" },
    settings,
    gradeScale: settings.gradeScale,
    me: {
      id: u.id, username: u.username, role, name: u.name, title: u.title, teacherId: u.teacher_id, pupilId: u.pupil_id,
      pupilIds: u.pupil_ids || [], mustChangePassword: u.must_change_password, actor: actorLabel(u),
    },
    classes: [], subjects: [], teachers: [], pupils: [], grades: {}, attendance: {}, lastMarked: {},
    fees: {}, payments: [], announcements: [], questionSubmissions: [], users: [], auditLog: [], comments: {}, rankings: {},
  };

  out.classes = (await client.query("SELECT id, name FROM classes WHERE school_id = $1 ORDER BY sort, name", [sid])).rows;
  const subjectRows = (await client.query("SELECT id, name FROM subjects WHERE school_id = $1 ORDER BY sort, name", [sid])).rows;
  out.subjects = subjectRows.map((r) => r.name);
  if (role === "proprietor") out.subjectList = subjectRows;

  // Teachers
  const teacherCols = "id, name, class_id, subjects, address, telephone, dob, place_of_birth, qualifications, active, updated_at, photo IS NOT NULL AS has_photo";
  if (role === "proprietor" || role === "principal") {
    out.teachers = (await client.query(`SELECT ${teacherCols} FROM teachers WHERE school_id = $1 ORDER BY name`, [sid])).rows.map((t) => teacherOut(t, true));
  } else if (role === "examofficer") {
    out.teachers = (await client.query(`SELECT ${teacherCols} FROM teachers WHERE school_id = $1 ORDER BY name`, [sid])).rows.map((t) => teacherOut(t, false));
  } else if (role === "teacher" && u.teacher_id) {
    out.teachers = (await client.query(`SELECT ${teacherCols} FROM teachers WHERE school_id = $1 AND id = $2`, [sid, u.teacher_id])).rows.map((t) => teacherOut(t, true));
  }
  // class teacher per class, as the original record had
  const firstTeacher = new Map();
  for (const t of out.teachers) if (t.classId && !firstTeacher.has(t.classId)) firstTeacher.set(t.classId, t.id);
  out.classes = out.classes.map((c) => ({ ...c, teacherId: firstTeacher.get(c.id) || null }));

  // Pupils
  const pupilIds = await visiblePupilIds(client, principal);
  const showPupils = true;
  const pupilCols = "id, name, admission_no, class_id, parent_name, address, telephone, dob, place_of_birth, active, updated_at, photo IS NOT NULL AS has_photo";
  let pupilRows = [];
  if (showPupils) {
    pupilRows = pupilIds === null
      ? (await client.query(`SELECT ${pupilCols} FROM pupils WHERE school_id = $1 AND active ORDER BY name`, [sid])).rows
      : (await client.query(`SELECT ${pupilCols} FROM pupils WHERE school_id = $1 AND id = ANY($2) ORDER BY name`, [sid, pupilIds])).rows;
  }
  const fullPupil = !["bursar", "teacher", "examofficer"].includes(role);
  out.pupils = pupilRows.map((p) => pupilOut(p, fullPupil));
  if (role === "proprietor") {
    out.nextAdmissionNo = await suggestAdmissionNo(client, school);
    out.withdrawnPupils = (await client.query(`SELECT ${pupilCols} FROM pupils WHERE school_id = $1 AND NOT active ORDER BY name`, [sid])).rows.map((p) => pupilOut(p, true));
  }
  const ids = pupilRows.map((p) => p.id);
  const idSet = new Set(ids);

  // Pupils and parents only see classes they belong to
  if (role === "pupil" || role === "parent") {
    const cls = new Set(out.pupils.map((p) => p.classId));
    out.classes = out.classes.filter((c) => cls.has(c.id));
  }

  // Grades, comments, attendance: everyone except the bursar (the exam officer prints report cards)
  if (role !== "bursar" && ids.length) {
    const grades = (await client.query(
      `SELECT pupil_id, subject, term, year, scores FROM grades WHERE school_id = $1 AND year = $2 AND pupil_id = ANY($3)`, [sid, year, ids])).rows;
    for (const g of grades) out.grades[`${g.pupil_id}|${g.subject}|${g.term}|${g.year}`] = g.scores;

    const comments = (await client.query(
      `SELECT pupil_id, term, teacher_comment, principal_comment FROM report_comments WHERE school_id = $1 AND year = $2 AND pupil_id = ANY($3)`, [sid, year, ids])).rows;
    for (const c of comments) out.comments[`${c.pupil_id}|${c.term}`] = { teacher: c.teacher_comment, principal: c.principal_comment };

    const att = (await client.query(
      `SELECT pupil_id, count(*) FILTER (WHERE present)::int AS present, count(*)::int AS total
         FROM attendance WHERE school_id = $1 AND year = $2 AND pupil_id = ANY($3) GROUP BY pupil_id`, [sid, year, ids])).rows;
    for (const a of att) out.attendance[a.pupil_id] = { present: a.present, total: a.total };

    const last = (await client.query(
      `SELECT class_id, max(date)::text AS d FROM attendance WHERE school_id = $1 AND pupil_id = ANY($2) GROUP BY class_id`, [sid, ids])).rows;
    for (const l of last) if (l.class_id) out.lastMarked[l.class_id] = l.d;

    if (role === "pupil" || role === "parent") {
      // positions need the whole class, computed here and only the result is sent
      const classIds = [...new Set(out.pupils.map((p) => p.classId).filter(Boolean))];
      const mates = (await client.query(`SELECT id, class_id FROM pupils WHERE school_id = $1 AND active AND class_id = ANY($2)`, [sid, classIds])).rows;
      const byClass = new Map();
      for (const m of mates) {
        if (!byClass.has(m.class_id)) byClass.set(m.class_id, []);
        byClass.get(m.class_id).push(m.id);
      }
      const classGrades = (await client.query(
        `SELECT pupil_id, subject, term, scores FROM grades WHERE school_id = $1 AND year = $2 AND pupil_id = ANY($3)`, [sid, year, mates.map((m) => m.id)])).rows;
      out.rankings = settings.showClassPosition ? rankings(byClass, classGrades, settings.terms, idSet) : {};
    }
  }

  // Fees and payments: proprietor, principal, bursar, parent (own children)
  if (["proprietor", "principal", "bursar", "parent"].includes(role) && ids.length) {
    const fees = (await client.query(
      `SELECT pupil_id, amount FROM fees WHERE school_id = $1 AND term = $2 AND year = $3 AND pupil_id = ANY($4)`, [sid, settings.currentTerm, year, ids])).rows;
    const paid = (await client.query(
      `SELECT pupil_id, sum(amount)::float AS paid FROM payments WHERE school_id = $1 AND term = $2 AND year = $3 AND pupil_id = ANY($4) GROUP BY pupil_id`,
      [sid, settings.currentTerm, year, ids])).rows;
    for (const id of ids) out.fees[id] = { termFee: 0, paid: 0 };
    for (const f of fees) out.fees[f.pupil_id].termFee = f.amount;
    for (const p of paid) out.fees[p.pupil_id].paid = p.paid;
    if (role !== "parent") {
      out.payments = (await client.query(
        `SELECT id, pupil_id AS "pupilId", amount, date::text AS date, note, receipt_no AS "receiptNo", term, year, recorded_by AS "recordedBy"
           FROM payments WHERE school_id = $1 AND year = $2 ORDER BY created_at`, [sid, year])).rows;
    }
  }

  // Announcements: everyone
  out.announcements = (await client.query(
    `SELECT id, author, date::text AS date, text FROM announcements WHERE school_id = $1 ORDER BY created_at DESC LIMIT 200`, [sid])).rows;

  // Exam questions: exam officer sees all, teacher sees own
  if (role === "examofficer" || role === "teacher") {
    const r = await client.query(
      `SELECT id, teacher_id AS "teacherId", teacher_name AS "teacherName", class_id AS "classId", subject, term, year, title, content, marks, status, comment, submitted_at AS "submittedAt"
         FROM question_submissions WHERE school_id = $1 ${role === "teacher" ? "AND teacher_id = $2" : ""} ORDER BY submitted_at`,
      role === "teacher" ? [sid, u.teacher_id || ""] : [sid]);
    out.questionSubmissions = r.rows;
  }

  // Accounts and audit log: proprietor only
  if (role === "proprietor") {
    out.users = (await client.query(
      `SELECT u.id, u.username, u.role, u.name, u.title, u.teacher_id AS "teacherId", u.pupil_id AS "pupilId", u.active, u.locked,
              u.must_change_password AS "mustChangePassword", u.last_login_at AS "lastLoginAt",
              COALESCE((SELECT array_agg(pc.pupil_id) FROM parent_children pc WHERE pc.user_id = u.id), '{}') AS "pupilIds"
         FROM users u WHERE u.school_id = $1 ORDER BY u.role, u.name`, [sid])).rows;
    out.auditLog = (await client.query(
      `SELECT id::text, at AS timestamp, actor, action, details FROM audit_log WHERE school_id = $1 ORDER BY at DESC LIMIT 500`, [sid])).rows;
  }

  return out;
}

module.exports = { build, canSeePupil, canSeeTeacher, visiblePupilIds, gradeTotal, ALL };
