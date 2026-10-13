"use strict";
/*
 * Every change a school user can make. Each action names the roles allowed to run it and
 * re-checks on the server what the screens already limit (which class, which pupil, which values),
 * so a tampered browser cannot do more than its role allows.
 *
 * All actions run inside db.withSchool(): one transaction, bound to the signed-in person's school.
 */
const { bad, forbidden, notFound, newId, str, num, arr, imageDataUrl, dateOnly, today } = require("./util");
const settingsLib = require("./settings");
const auth = require("./auth");
const projection = require("./projection");
const { nextAdmissionNo, suggestAdmissionNo } = require("./admission");
const backup = require("./backup");

async function schoolRow(c, sid) {
  const r = await c.query("SELECT * FROM schools WHERE id = $1", [sid]);
  return { ...r.rows[0], settings: settingsLib.full(r.rows[0].settings) };
}

async function audit(c, p, action, details, ctx) {
  await auth.audit(p.schoolId, auth.actorLabel(p.user), action, details, ctx && ctx.ip, c);
}

async function getPupil(c, sid, id) {
  const r = await c.query("SELECT * FROM pupils WHERE school_id = $1 AND id = $2", [sid, String(id || "")]);
  if (!r.rows[0]) throw notFound("That pupil was not found.");
  return r.rows[0];
}

async function getTeacher(c, sid, id) {
  const r = await c.query("SELECT * FROM teachers WHERE school_id = $1 AND id = $2", [sid, String(id || "")]);
  if (!r.rows[0]) throw notFound("That staff member was not found.");
  return r.rows[0];
}

async function getClass(c, sid, id, { optional = false } = {}) {
  if (!id && optional) return null;
  const r = await c.query("SELECT * FROM classes WHERE school_id = $1 AND id = $2", [sid, String(id || "")]);
  if (!r.rows[0]) throw bad("Choose a valid class.");
  return r.rows[0];
}

async function subjectNames(c, sid) {
  return (await c.query("SELECT name FROM subjects WHERE school_id = $1", [sid])).rows.map((r) => r.name);
}

/* A teacher may only work with their own class. Principal and proprietor may work with any. */
async function assertClassAccess(c, p, classId) {
  if (p.user.role === "proprietor" || p.user.role === "principal") return;
  if (p.user.role !== "teacher" || !p.user.teacher_id) throw forbidden();
  const t = await getTeacher(c, p.schoolId, p.user.teacher_id);
  if (t.class_id !== classId) throw forbidden("You can only do this for your own class.");
}

function admissionNoField(value) {
  const no = str(value, "ID number", { max: 40, required: true });
  if (!/^[A-Za-z0-9/._-]+$/.test(no)) throw bad("ID numbers may only use letters, digits and / . _ -");
  return no;
}

function pupilFields(body) {
  return {
    name: str(body.name, "Full name", { max: 120, required: true }),
    parentName: str(body.parentName, "Parent / Guardian name", { max: 120 }),
    address: str(body.address, "Address", { max: 300 }),
    telephone: str(body.telephone, "Telephone", { max: 40 }),
    dob: dateOnly(body.dob, "Date of birth"),
    placeOfBirth: str(body.placeOfBirth, "Place of birth", { max: 120 }),
  };
}

function staffFields(body, validSubjects) {
  const subjects = arr(body.subjects, "Subjects", { max: 50 }).map((s) => String(s));
  for (const s of subjects) if (!validSubjects.includes(s)) throw bad(`Unknown subject "${s}".`);
  return {
    name: str(body.name, "Full name", { max: 120, required: true }),
    subjects,
    address: str(body.address, "Address", { max: 300 }),
    telephone: str(body.telephone, "Telephone", { max: 40 }),
    dob: dateOnly(body.dob, "Date of birth"),
    placeOfBirth: str(body.placeOfBirth, "Place of birth", { max: 120 }),
    qualifications: str(body.qualifications, "Qualifications", { max: 300 }),
  };
}

const USERNAME_RE = /^[A-Za-z0-9._-]{3,40}$/;
const ROLES = ["proprietor", "principal", "bursar", "teacher", "pupil", "parent", "examofficer"];

const actions = {
  /* ---------------- academics ---------------- */
  saveGrade: {
    roles: ["teacher", "principal", "proprietor"],
    async run(c, p, b, ctx) {
      const school = await schoolRow(c, p.schoolId);
      const s = school.settings;
      const pupil = await getPupil(c, p.schoolId, b.pupilId);
      await assertClassAccess(c, p, pupil.class_id);
      const subject = str(b.subject, "Subject", { required: true });
      if (!(await subjectNames(c, p.schoolId)).includes(subject)) throw bad("Unknown subject.");
      if (p.user.role === "teacher") {
        const t = await getTeacher(c, p.schoolId, p.user.teacher_id);
        if (t.subjects.length && !t.subjects.includes(subject)) throw forbidden("You can only enter scores for subjects you teach.");
      }
      const term = b.term ? str(b.term, "Term") : s.currentTerm;
      if (!s.terms.includes(term)) throw bad("Unknown term.");
      const scores = {};
      for (const part of s.assessment) {
        scores[part.key] = num(b.scores && b.scores[part.key] !== undefined ? b.scores[part.key] : 0, part.label, { min: 0, max: part.max });
      }
      await c.query(
        `INSERT INTO grades (school_id, pupil_id, subject, term, year, scores, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (pupil_id, subject, term, year) DO UPDATE SET scores = EXCLUDED.scores, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [p.schoolId, pupil.id, subject, term, s.currentYear, scores, p.user.id]);
      await audit(c, p, "Entered grade", `${subject} for ${pupil.name}: ${projection.gradeTotal(scores)}/100 (${term})`, ctx);
    },
  },

  saveComment: {
    roles: ["teacher", "principal", "proprietor"],
    async run(c, p, b, ctx) {
      const s = (await schoolRow(c, p.schoolId)).settings;
      const pupil = await getPupil(c, p.schoolId, b.pupilId);
      const term = str(b.term, "Term", { required: true });
      if (term !== "combined" && !s.terms.includes(term)) throw bad("Unknown term.");
      const hasTeacher = b.teacherComment !== undefined;
      const hasPrincipal = b.principalComment !== undefined;
      if (hasTeacher) await assertClassAccess(c, p, pupil.class_id);
      if (hasPrincipal && p.user.role === "teacher") throw forbidden("Only the Principal or Proprietor can write the Principal's comment.");
      const tc = hasTeacher ? str(b.teacherComment, "Class teacher's comment", { max: 600 }) : null;
      const pc = hasPrincipal ? str(b.principalComment, "Principal's comment", { max: 600 }) : null;
      await c.query(
        `INSERT INTO report_comments (school_id, pupil_id, term, year, teacher_comment, principal_comment) VALUES ($1,$2,$3,$4,COALESCE($5,''),COALESCE($6,''))
         ON CONFLICT (pupil_id, term, year) DO UPDATE SET
           teacher_comment = COALESCE($5, report_comments.teacher_comment),
           principal_comment = COALESCE($6, report_comments.principal_comment), updated_at = now()`,
        [p.schoolId, pupil.id, term, s.currentYear, tc, pc]);
      await audit(c, p, "Edited report comment", `${pupil.name} (${term === "combined" ? "end of year" : term})`, ctx);
    },
  },

  saveAttendance: {
    roles: ["teacher", "principal", "proprietor"],
    async run(c, p, b, ctx) {
      const s = (await schoolRow(c, p.schoolId)).settings;
      const cls = await getClass(c, p.schoolId, b.classId);
      await assertClassAccess(c, p, cls.id);
      const date = b.date ? dateOnly(b.date, "Date") : today();
      if (date > today()) throw bad("Attendance cannot be marked for a future date.");
      const map = b.statusMap && typeof b.statusMap === "object" ? b.statusMap : {};
      const pupils = (await c.query("SELECT id FROM pupils WHERE school_id = $1 AND class_id = $2 AND active", [p.schoolId, cls.id])).rows.map((r) => r.id);
      let n = 0;
      for (const pid of pupils) {
        const st = map[pid];
        if (st !== "present" && st !== "absent") continue;
        await c.query(
          `INSERT INTO attendance (school_id, pupil_id, class_id, date, year, present, marked_by) VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (pupil_id, date) DO UPDATE SET present = EXCLUDED.present, class_id = EXCLUDED.class_id, marked_by = EXCLUDED.marked_by`,
          [p.schoolId, pid, cls.id, date, s.currentYear, st === "present", p.user.id]);
        n++;
      }
      if (!n) throw bad("No pupils were marked.");
      await audit(c, p, "Marked attendance", `${cls.name}: ${date} (${n} pupils)`, ctx);
    },
  },

  submitQuestion: {
    roles: ["teacher"],
    async run(c, p, b, ctx) {
      const s = (await schoolRow(c, p.schoolId)).settings;
      if (!p.user.teacher_id) throw forbidden("Your account is not linked to a staff record. Ask the Proprietor to link it.");
      const t = await getTeacher(c, p.schoolId, p.user.teacher_id);
      const subject = str(b.subject, "Subject", { required: true });
      if (!(await subjectNames(c, p.schoolId)).includes(subject)) throw bad("Unknown subject.");
      const title = str(b.title, "Title", { max: 200, required: true });
      const content = str(b.content, "Questions", { max: 50000, required: true, trim: false }).trim();
      if (!content) throw bad("Enter the exam questions.");
      const marks = num(b.marks || 0, "Total marks", { min: 0, max: 1000, integer: true });
      await c.query(
        `INSERT INTO question_submissions (id, school_id, teacher_id, teacher_name, class_id, subject, term, year, title, content, marks)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [newId("Q"), p.schoolId, t.id, t.name, t.class_id, subject, s.currentTerm, s.currentYear, title, content, marks]);
      await audit(c, p, "Submitted exam questions", `${title} (${subject}): ${t.name}`, ctx);
    },
  },

  reviewQuestion: {
    roles: ["examofficer"],
    async run(c, p, b, ctx) {
      const status = str(b.status, "Status", { required: true });
      if (!["Reviewed", "Approved", "Rejected"].includes(status)) throw bad("Unknown review status.");
      const comment = str(b.comment, "Comment", { max: 2000 });
      const r = await c.query(
        `UPDATE question_submissions SET status = $3, comment = $4, reviewed_by = $5, reviewed_at = now()
          WHERE school_id = $1 AND id = $2 RETURNING title, teacher_name`,
        [p.schoolId, String(b.id || ""), status, comment, p.user.id]);
      if (!r.rows[0]) throw notFound("That submission was not found.");
      await audit(c, p, `${status} exam questions`, `${r.rows[0].title}: ${r.rows[0].teacher_name}${comment ? ` (${comment})` : ""}`, ctx);
    },
  },

  postAnnouncement: {
    roles: ["proprietor", "principal"],
    async run(c, p, b, ctx) {
      const text = str(b.text, "Message", { max: 4000, required: true });
      await c.query("INSERT INTO announcements (id, school_id, author, text, created_by) VALUES ($1,$2,$3,$4,$5)",
        [newId("A"), p.schoolId, auth.actorLabel(p.user), text, p.user.id]);
      await audit(c, p, "Posted announcement", text.length > 80 ? text.slice(0, 80) + "…" : text, ctx);
    },
  },

  deleteAnnouncement: {
    roles: ["proprietor", "principal"],
    async run(c, p, b, ctx) {
      const r = await c.query("DELETE FROM announcements WHERE school_id = $1 AND id = $2 RETURNING text", [p.schoolId, String(b.id || "")]);
      if (!r.rows[0]) throw notFound("That announcement was not found.");
      await audit(c, p, "Deleted announcement", r.rows[0].text.slice(0, 80), ctx);
    },
  },

  /* ---------------- finance ---------------- */
  recordPayment: {
    roles: ["bursar", "proprietor"],
    async run(c, p, b, ctx) {
      const school = await schoolRow(c, p.schoolId);
      const s = school.settings;
      const pupil = await getPupil(c, p.schoolId, b.pupilId);
      const amount = num(b.amount, "Amount", { min: 0.01, max: 1e10 });
      const note = str(b.note, "Note", { max: 200 });
      const seq = (await c.query("UPDATE schools SET next_receipt_seq = next_receipt_seq + 1 WHERE id = $1 RETURNING next_receipt_seq - 1 AS n", [p.schoolId])).rows[0].n;
      const receiptNo = `R${String(seq).padStart(5, "0")}`;
      const id = newId("PAY");
      await c.query(
        `INSERT INTO payments (id, school_id, pupil_id, amount, term, year, note, receipt_no, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, p.schoolId, pupil.id, amount, s.currentTerm, s.currentYear, note, receiptNo, auth.actorLabel(p.user)]);
      await audit(c, p, "Recorded payment", `${s.currency} ${amount.toLocaleString("en-US")} for ${pupil.name}, receipt ${receiptNo}${note ? ` (${note})` : ""}`, ctx);
      return { paymentId: id, receiptNo };
    },
  },

  setFee: {
    roles: ["bursar", "proprietor"],
    async run(c, p, b, ctx) {
      const s = (await schoolRow(c, p.schoolId)).settings;
      const amount = num(b.amount, "Term fee", { min: 0, max: 1e10 });
      let pupils;
      if (b.classId) {
        const cls = await getClass(c, p.schoolId, b.classId);
        pupils = (await c.query("SELECT id, name FROM pupils WHERE school_id = $1 AND class_id = $2 AND active", [p.schoolId, cls.id])).rows;
        if (!pupils.length) throw bad("That class has no pupils.");
        await audit(c, p, "Set class fee", `${cls.name}: ${s.currency} ${amount.toLocaleString("en-US")} for ${s.currentTerm} (${pupils.length} pupils)`, ctx);
      } else {
        const pupil = await getPupil(c, p.schoolId, b.pupilId);
        pupils = [pupil];
        await audit(c, p, "Set fee", `${pupil.name}: ${s.currency} ${amount.toLocaleString("en-US")} for ${s.currentTerm}`, ctx);
      }
      for (const pu of pupils) {
        await c.query(
          `INSERT INTO fees (school_id, pupil_id, term, year, amount) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (pupil_id, term, year) DO UPDATE SET amount = EXCLUDED.amount`,
          [p.schoolId, pu.id, s.currentTerm, s.currentYear, amount]);
      }
    },
  },

  /* ---------------- people ---------------- */
  registerPupil: {
    roles: ["proprietor"],
    async run(c, p, b, ctx) {
      const school = await schoolRow(c, p.schoolId);
      const f = pupilFields(b);
      const cls = await getClass(c, p.schoolId, b.classId, { optional: true });
      const photo = imageDataUrl(b.photo, "Photo");
      const id = newId("P");
      // keeping the suggested number uses it up, so the next pupil is offered the one after
      const typed = b.admissionNo ? admissionNoField(b.admissionNo) : "";
      const admissionNo = !typed || typed === (await suggestAdmissionNo(c, school)) ? await nextAdmissionNo(c, school) : typed;
      const dup = await c.query("SELECT 1 FROM pupils WHERE school_id = $1 AND lower(admission_no) = lower($2)", [p.schoolId, admissionNo]);
      if (dup.rowCount) throw bad(`ID number ${admissionNo} is already used by another pupil.`);
      await c.query(
        `INSERT INTO pupils (id, school_id, name, admission_no, class_id, parent_name, address, telephone, dob, place_of_birth, photo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [id, p.schoolId, f.name, admissionNo, cls && cls.id, f.parentName, f.address, f.telephone, f.dob, f.placeOfBirth, photo]);
      const fee = num(b.termFee || 0, "Term fee", { min: 0, max: 1e10 });
      if (fee > 0) {
        await c.query("INSERT INTO fees (school_id, pupil_id, term, year, amount) VALUES ($1,$2,$3,$4,$5)",
          [p.schoolId, id, school.settings.currentTerm, school.settings.currentYear, fee]);
      }
      await audit(c, p, "Registered pupil", `${f.name} (${admissionNo}): ${cls ? cls.name : "Unassigned"}`, ctx);
      return { id };
    },
  },

  updatePupil: {
    roles: ["proprietor"],
    async run(c, p, b, ctx) {
      const pupil = await getPupil(c, p.schoolId, b.id);
      const f = pupilFields(b);
      const cls = await getClass(c, p.schoolId, b.classId, { optional: true });
      const photo = b.photo === undefined || (typeof b.photo === "string" && b.photo.startsWith("/api/")) ? pupil.photo : imageDataUrl(b.photo, "Photo");
      const active = b.active === undefined ? pupil.active : b.active === true;
      const admissionNo = b.admissionNo === undefined ? pupil.admission_no : admissionNoField(b.admissionNo);
      if (admissionNo !== pupil.admission_no) {
        const dup = await c.query("SELECT 1 FROM pupils WHERE school_id = $1 AND lower(admission_no) = lower($2) AND id <> $3", [p.schoolId, admissionNo, pupil.id]);
        if (dup.rowCount) throw bad(`ID number ${admissionNo} is already used by another pupil.`);
      }
      await c.query(
        `UPDATE pupils SET name=$3, class_id=$4, parent_name=$5, address=$6, telephone=$7, dob=$8, place_of_birth=$9, photo=$10, active=$11, admission_no=$12, updated_at=now()
          WHERE school_id = $1 AND id = $2`,
        [p.schoolId, pupil.id, f.name, cls && cls.id, f.parentName, f.address, f.telephone, f.dob, f.placeOfBirth, photo, active, admissionNo]);
      if (admissionNo !== pupil.admission_no) await audit(c, p, "Changed ID number", `${f.name}: ${pupil.admission_no} to ${admissionNo}`, ctx);
      const what = active !== pupil.active ? (active ? "Re-admitted pupil" : "Withdrew pupil") : "Updated pupil";
      await audit(c, p, what, `${f.name} (${pupil.admission_no})${cls && cls.id !== pupil.class_id ? `: moved to ${cls.name}` : ""}`, ctx);
    },
  },

  registerStaff: {
    roles: ["proprietor"],
    async run(c, p, b, ctx) {
      const f = staffFields(b, await subjectNames(c, p.schoolId));
      const cls = await getClass(c, p.schoolId, b.classId, { optional: true });
      const photo = imageDataUrl(b.photo, "Photo");
      const id = newId("T");
      await c.query(
        `INSERT INTO teachers (id, school_id, name, class_id, subjects, address, telephone, dob, place_of_birth, qualifications, photo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [id, p.schoolId, f.name, cls && cls.id, f.subjects, f.address, f.telephone, f.dob, f.placeOfBirth, f.qualifications, photo]);
      await audit(c, p, "Registered staff", `${f.name}: ${cls ? cls.name : "Unassigned"}`, ctx);
      return { id };
    },
  },

  updateStaff: {
    roles: ["proprietor"],
    async run(c, p, b, ctx) {
      const t = await getTeacher(c, p.schoolId, b.id);
      const f = staffFields(b, await subjectNames(c, p.schoolId));
      const cls = await getClass(c, p.schoolId, b.classId, { optional: true });
      const photo = b.photo === undefined || (typeof b.photo === "string" && b.photo.startsWith("/api/")) ? t.photo : imageDataUrl(b.photo, "Photo");
      const active = b.active === undefined ? t.active : b.active === true;
      await c.query(
        `UPDATE teachers SET name=$3, class_id=$4, subjects=$5, address=$6, telephone=$7, dob=$8, place_of_birth=$9, qualifications=$10, photo=$11, active=$12, updated_at=now()
          WHERE school_id = $1 AND id = $2`,
        [p.schoolId, t.id, f.name, cls && cls.id, f.subjects, f.address, f.telephone, f.dob, f.placeOfBirth, f.qualifications, photo, active]);
      if (cls) await c.query("UPDATE users SET title = $3 WHERE school_id = $1 AND teacher_id = $2", [p.schoolId, t.id, `Class Teacher, ${cls.name}`]);
      await audit(c, p, "Updated staff", f.name, ctx);
    },
  },

  /* ---------------- accounts ---------------- */
  createAccount: {
    roles: ["proprietor"],
    async run(c, p, b, ctx) {
      const role = str(b.role, "Role", { required: true });
      if (!ROLES.includes(role)) throw bad("Unknown role.");
      const name = str(b.name, "Full name", { max: 120, required: true });
      const username = str(b.username, "Username", { max: 40, required: true });
      if (!USERNAME_RE.test(username)) throw bad("Usernames use 3 to 40 letters, digits, dots, dashes or underscores, with no spaces.");
      const taken = await c.query("SELECT 1 FROM users WHERE school_id = $1 AND lower(username) = lower($2)", [p.schoolId, username]);
      if (taken.rowCount) throw bad("That username is already taken.");
      const school = await schoolRow(c, p.schoolId);

      let password = typeof b.password === "string" ? b.password : "";
      if (password) auth.checkNewPassword(password, username);
      else password = auth.generateTempPassword();

      const id = newId("U");
      let teacherId = null, pupilId = null, title = auth.ROLE_LABELS[role];
      if (role === "teacher") {
        if (b.teacherId) {
          const t = await getTeacher(c, p.schoolId, b.teacherId);
          teacherId = t.id;
          const cls = t.class_id ? await getClass(c, p.schoolId, t.class_id) : null;
          title = cls ? `Class Teacher, ${cls.name}` : "Teacher";
        } else {
          // no staff record yet: create one, as the original app did
          const f = staffFields({ name, subjects: b.subjects }, await subjectNames(c, p.schoolId));
          const cls = await getClass(c, p.schoolId, b.classId, { optional: true });
          teacherId = newId("T");
          await c.query("INSERT INTO teachers (id, school_id, name, class_id, subjects) VALUES ($1,$2,$3,$4,$5)",
            [teacherId, p.schoolId, name, cls && cls.id, f.subjects]);
          title = cls ? `Class Teacher, ${cls.name}` : "Teacher";
        }
        const linked = await c.query("SELECT username FROM users WHERE school_id = $1 AND teacher_id = $2", [p.schoolId, teacherId]);
        if (linked.rowCount) throw bad(`That staff member already has an account (${linked.rows[0].username}).`);
      }
      if (role === "pupil") {
        let pupil;
        if (b.pupilId) pupil = await getPupil(c, p.schoolId, b.pupilId);
        else {
          const cls = await getClass(c, p.schoolId, b.classId, { optional: true });
          pupilId = newId("P");
          const admissionNo = await nextAdmissionNo(c, school);
          await c.query("INSERT INTO pupils (id, school_id, name, admission_no, class_id) VALUES ($1,$2,$3,$4,$5)",
            [pupilId, p.schoolId, name, admissionNo, cls && cls.id]);
          pupil = { id: pupilId, class_id: cls && cls.id };
        }
        pupilId = pupil.id;
        const linked = await c.query("SELECT username FROM users WHERE school_id = $1 AND pupil_id = $2", [p.schoolId, pupilId]);
        if (linked.rowCount) throw bad(`That pupil already has an account (${linked.rows[0].username}).`);
        const cls = pupil.class_id ? await getClass(c, p.schoolId, pupil.class_id) : null;
        title = `Pupil${cls ? ", " + cls.name : ""}`;
      }
      let childIds = [];
      if (role === "parent") {
        childIds = arr(b.pupilIds, "Children", { max: 20 }).map(String);
        if (!childIds.length) throw bad("Select at least one child for this parent account.");
        for (const cid of childIds) await getPupil(c, p.schoolId, cid);
      }

      await c.query(
        `INSERT INTO users (id, school_id, username, password_hash, role, name, title, teacher_id, pupil_id, must_change_password)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)`,
        [id, p.schoolId, username, await auth.hashPassword(password), role, name, title, teacherId, pupilId]);
      for (const cid of childIds) {
        await c.query("INSERT INTO parent_children (user_id, pupil_id, school_id) VALUES ($1,$2,$3)", [id, cid, p.schoolId]);
      }
      await audit(c, p, "Created account", `${username} (${auth.ROLE_LABELS[role]}): ${name}`, ctx);
      return { id, username, tempPassword: password };
    },
  },

  setParentChildren: {
    roles: ["proprietor"],
    async run(c, p, b, ctx) {
      const u = (await c.query("SELECT * FROM users WHERE school_id = $1 AND id = $2 AND role = 'parent'", [p.schoolId, String(b.userId || "")])).rows[0];
      if (!u) throw notFound("That parent account was not found.");
      const ids = arr(b.pupilIds, "Children", { max: 20 }).map(String);
      if (!ids.length) throw bad("Select at least one child.");
      for (const cid of ids) await getPupil(c, p.schoolId, cid);
      await c.query("DELETE FROM parent_children WHERE user_id = $1", [u.id]);
      for (const cid of ids) await c.query("INSERT INTO parent_children (user_id, pupil_id, school_id) VALUES ($1,$2,$3)", [u.id, cid, p.schoolId]);
      await audit(c, p, "Changed linked children", `${u.username}: ${ids.length} children`, ctx);
    },
  },

  toggleAccountActive: {
    roles: ["proprietor"],
    async run(c, p, b, ctx) {
      if (b.userId === p.user.id) throw bad("You cannot disable your own account.");
      const r = await c.query("UPDATE users SET active = NOT active WHERE school_id = $1 AND id = $2 RETURNING username, name, active", [p.schoolId, String(b.userId || "")]);
      if (!r.rows[0]) throw notFound("That account was not found.");
      if (!r.rows[0].active) await c.query("DELETE FROM sessions WHERE user_id = $1", [String(b.userId)]);
      await audit(c, p, r.rows[0].active ? "Enabled account" : "Disabled account", `${r.rows[0].username}: ${r.rows[0].name}`, ctx);
    },
  },

  resetPassword: {
    roles: ["proprietor"],
    async run(c, p, b, ctx) {
      const temp = auth.generateTempPassword();
      const r = await c.query(
        `UPDATE users SET password_hash = $3, must_change_password = true, locked = false, failed_attempts = 0
          WHERE school_id = $1 AND id = $2 RETURNING username, name`,
        [p.schoolId, String(b.userId || ""), await auth.hashPassword(temp)]);
      if (!r.rows[0]) throw notFound("That account was not found.");
      await c.query("DELETE FROM sessions WHERE user_id = $1", [String(b.userId)]);
      await audit(c, p, "Reset password", `${r.rows[0].username}: ${r.rows[0].name}`, ctx);
      return { username: r.rows[0].username, name: r.rows[0].name, tempPassword: temp };
    },
  },

  unlockAccount: {
    roles: ["proprietor"],
    async run(c, p, b, ctx) {
      const r = await c.query("UPDATE users SET locked = false, failed_attempts = 0 WHERE school_id = $1 AND id = $2 RETURNING username, name", [p.schoolId, String(b.userId || "")]);
      if (!r.rows[0]) throw notFound("That account was not found.");
      await audit(c, p, "Unlocked account", `${r.rows[0].username}: ${r.rows[0].name}`, ctx);
    },
  },

  /* ---------------- school setup ---------------- */
  updateSettings: {
    roles: ["proprietor"],
    async run(c, p, b, ctx) {
      const school = await schoolRow(c, p.schoolId);
      const patch = b.patch || {};
      const next = settingsLib.sanitize(patch, school.settings);
      let name = school.name;
      if ("name" in patch) name = str(patch.name, "School name", { max: 120, required: true });
      await c.query("UPDATE schools SET settings = $2, name = $3 WHERE id = $1", [p.schoolId, next, name]);

      // New term or year: carry each pupil's latest fee forward so balances start from the right amount.
      if (next.currentTerm !== school.settings.currentTerm || next.currentYear !== school.settings.currentYear) {
        await c.query(
          `INSERT INTO fees (school_id, pupil_id, term, year, amount)
           SELECT $1, f.pupil_id, $2, $3, f.amount FROM fees f
            WHERE f.school_id = $1 AND f.term = $4 AND f.year = $5
           ON CONFLICT DO NOTHING`,
          [p.schoolId, next.currentTerm, next.currentYear, school.settings.currentTerm, school.settings.currentYear]);
      }
      const changed = Object.keys(patch).map((k) => (typeof patch[k] === "object" ? k : `${k}: ${patch[k]}`)).join(", ");
      await audit(c, p, "Updated school settings", changed.slice(0, 400), ctx);
    },
  },

  setLogo: {
    roles: ["proprietor"],
    async run(c, p, b, ctx) {
      const logo = b.logo ? imageDataUrl(b.logo, "Logo") : null;
      await c.query("UPDATE schools SET logo = $2 WHERE id = $1", [p.schoolId, logo]);
      await audit(c, p, logo ? "Changed school logo" : "Removed school logo", "", ctx);
    },
  },

  saveClasses: {
    roles: ["proprietor"],
    async run(c, p, b, ctx) {
      const rows = arr(b.classes, "Classes", { max: 100 });
      if (!rows.length) throw bad("Keep at least one class.");
      const existing = (await c.query("SELECT id, name FROM classes WHERE school_id = $1", [p.schoolId])).rows;
      const keep = new Set();
      const names = new Set();
      for (let i = 0; i < rows.length; i++) {
        const name = str(rows[i] && rows[i].name, `Class ${i + 1} name`, { max: 40, required: true });
        if (names.has(name.toLowerCase())) throw bad(`Class "${name}" appears twice.`);
        names.add(name.toLowerCase());
        const id = rows[i].id && existing.some((e) => e.id === rows[i].id) ? rows[i].id : null;
        if (id) {
          keep.add(id);
          await c.query("UPDATE classes SET name = $3, sort = $4 WHERE school_id = $1 AND id = $2", [p.schoolId, id, name, i]);
        } else {
          await c.query("INSERT INTO classes (id, school_id, name, sort) VALUES ($1,$2,$3,$4)", [newId("C"), p.schoolId, name, i]);
        }
      }
      for (const e of existing) {
        if (keep.has(e.id)) continue;
        const used = await c.query("SELECT count(*)::int AS n FROM pupils WHERE school_id = $1 AND class_id = $2 AND active", [p.schoolId, e.id]);
        if (used.rows[0].n) throw bad(`Class "${e.name}" still has ${used.rows[0].n} pupils. Move them to another class first.`);
        await c.query("DELETE FROM classes WHERE school_id = $1 AND id = $2", [p.schoolId, e.id]);
      }
      await audit(c, p, "Updated classes", [...names].join(", ").slice(0, 400), ctx);
    },
  },

  saveSubjects: {
    roles: ["proprietor"],
    async run(c, p, b, ctx) {
      const rows = arr(b.subjects, "Subjects", { max: 100 });
      if (!rows.length) throw bad("Keep at least one subject.");
      const existing = (await c.query("SELECT id, name FROM subjects WHERE school_id = $1", [p.schoolId])).rows;
      const keep = new Set();
      const names = new Set();
      for (let i = 0; i < rows.length; i++) {
        const name = str(rows[i] && rows[i].name, `Subject ${i + 1} name`, { max: 80, required: true });
        if (name.includes("|")) throw bad("Subject names cannot contain the | character.");
        if (names.has(name.toLowerCase())) throw bad(`Subject "${name}" appears twice.`);
        names.add(name.toLowerCase());
        const prev = rows[i].id && existing.find((e) => e.id === rows[i].id);
        if (prev) {
          keep.add(prev.id);
          if (prev.name !== name) {
            // renaming: carry grades, staff subject lists and exam questions along
            await c.query("UPDATE subjects SET name = $3 WHERE school_id = $1 AND id = $2", [p.schoolId, prev.id, "__renaming__" + prev.id]);
            await c.query("UPDATE grades SET subject = $3 WHERE school_id = $1 AND subject = $2", [p.schoolId, prev.name, name]);
            await c.query("UPDATE teachers SET subjects = array_replace(subjects, $2, $3) WHERE school_id = $1", [p.schoolId, prev.name, name]);
            await c.query("UPDATE question_submissions SET subject = $3 WHERE school_id = $1 AND subject = $2", [p.schoolId, prev.name, name]);
          }
          await c.query("UPDATE subjects SET name = $3, sort = $4 WHERE school_id = $1 AND id = $2", [p.schoolId, prev.id, name, i]);
        } else {
          await c.query("INSERT INTO subjects (id, school_id, name, sort) VALUES ($1,$2,$3,$4)", [newId("S"), p.schoolId, name, i]);
        }
      }
      for (const e of existing) {
        if (keep.has(e.id)) continue;
        // removing a subject keeps past grades in the database (and in exports), it just stops showing
        await c.query("DELETE FROM subjects WHERE school_id = $1 AND id = $2", [p.schoolId, e.id]);
        await c.query("UPDATE teachers SET subjects = array_remove(subjects, $2) WHERE school_id = $1", [p.schoolId, e.name]);
      }
      await audit(c, p, "Updated subjects", [...names].join(", ").slice(0, 400), ctx);
    },
  },

  restoreBackup: {
    roles: ["proprietor"],
    async run(c, p, b, ctx) {
      await backup.snapshot(c, p.schoolId, "before-restore");
      const counts = await backup.restore(c, p.schoolId, b.data);
      await audit(c, p, "Restored from backup", `Replaced school records: ${counts.pupils} pupils, ${counts.teachers} staff`, ctx);
      return counts;
    },
  },
};

async function run(name, client, principal, body, ctx) {
  const a = Object.prototype.hasOwnProperty.call(actions, name) ? actions[name] : null;
  if (!a) throw notFound("Unknown action.");
  if (!a.roles.includes(principal.user.role)) throw forbidden();
  if (principal.user.must_change_password) throw forbidden("Please change your password before continuing.");
  const result = await a.run(client, principal, body || {}, ctx);
  await client.query("UPDATE schools SET rev = rev + 1 WHERE id = $1", [principal.schoolId]);
  return result || {};
}

module.exports = { run, actions };
