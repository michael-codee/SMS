import React, { useState, useEffect, useCallback, useContext, createContext } from "react";
import { api, ApiError, readImageFile } from "./api.js";
import { InstallButton, isInstalled, useSchoolManifest } from "./install.jsx";
import { SchoolSetupView } from "./SchoolSetup.jsx";
import { APP_NAME, APP_LOGO } from "./brand.js";
import { Icon, NAV_ICONS } from "./icons.jsx";

/* ============================================================
   ELITE SMART SCHOOL SYSTEMS — web app
   One app serves many schools. Everything a person sees comes from the
   server, already limited to their school and role (see server/projection.js);
   every change is sent to the server as an action (see server/actions.js).
   ============================================================ */

/*
 * The school's academic calendar and currency. Set from the school's settings each time
 * data loads (one school per browser tab), so the helpers below stay simple.
 */
let CURRENT_TERM = "Term 1";
let CURRENT_YEAR = "";
let TERMS = ["Term 1", "Term 2", "Term 3"];
let CURRENCY = "Le";

function applySchoolCalendar(settings) {
  CURRENT_TERM = settings.currentTerm;
  CURRENT_YEAR = settings.currentYear;
  TERMS = settings.terms;
  CURRENCY = settings.currency;
}

/* Branding of the school currently shown: name, crest, motto, colours. */
const SchoolContext = createContext({ name: APP_NAME, motto: "", location: "", logoUrl: APP_LOGO, colors: {} });
const useSchool = () => useContext(SchoolContext);

function totalScore(g) {
  if (!g) return 0;
  return Object.values(g).reduce((s, v) => s + (Number(v) || 0), 0);
}

function letterFor(total, scale) {
  const row = scale.find((r) => total >= r.min && total <= r.max) || scale.find((r) => total >= r.min) || scale[scale.length - 1];
  return row;
}

function formatTimestamp(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return iso;
  }
}

function money(n) {
  return CURRENCY + " " + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function gradeKey(pupilId, subject, term = CURRENT_TERM) {
  return `${pupilId}|${subject}|${term}|${CURRENT_YEAR}`;
}

function schoolColorVars(colors) {
  if (!colors) return undefined;
  const v = {};
  if (colors.primary) v["--ink"] = colors.primary;
  if (colors.accent) v["--gold"] = colors.accent;
  if (colors.banner) v["--banner"] = colors.banner;
  return v;
}

/* ================= shared UI atoms ================= */

function initials(name) {
  return String(name || "")
    .replace(/\b(the|of|and|ltd|school|academy|college)\b/gi, " ")
    .split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0].toUpperCase()).join("") || "S";
}

function Seal({ size = 46 }) {
  const school = useSchool();
  const h = Math.round(size * 1.2038);
  if (school.logoUrl) {
    return (
      <img
        src={school.logoUrl}
        alt={`${school.name} crest`}
        width={size}
        height={h}
        className="seal-img"
        style={{ width: size, height: h, objectFit: "contain", flexShrink: 0 }}
      />
    );
  }
  // no crest uploaded yet: a plain shield with the school's initials
  return (
    <svg className="seal-img" width={size} height={h} viewBox="0 0 100 120" role="img" aria-label={`${school.name} crest`} style={{ flexShrink: 0 }}>
      <path d="M50 4 94 18v38c0 30-19 52-44 60C25 108 6 86 6 56V18z" fill="var(--ink)" />
      <path d="M50 12 86 23v33c0 25-15 43-36 51C29 99 14 81 14 56V23z" fill="none" stroke="var(--gold)" strokeWidth="3" />
      <text x="50" y="70" textAnchor="middle" fontFamily="Lexend, sans-serif" fontWeight="700" fontSize={initials(school.name).length > 2 ? 26 : 32} fill="#fff">{initials(school.name)}</text>
    </svg>
  );
}

function StatCard({ label, value, sub, tone }) {
  return (
    <div className={"stat-card" + (tone ? " stat-" + tone : "")}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function Panel({ title, action, children }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
        {action}
      </div>
      <div className="panel-body">{children}</div>
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={"modal-card" + (wide === "xl" ? " modal-xl" : wide ? " modal-wide" : "")} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/* Print just the open pop-up window (a receipt, a report card, a question paper). */
function printModal() {
  document.body.classList.add("printing-modal");
  const done = () => document.body.classList.remove("printing-modal");
  window.addEventListener("afterprint", done, { once: true });
  window.print();
  setTimeout(done, 1000);
}

function Pill({ children, tone }) {
  return <span className={"pill" + (tone ? " pill-" + tone : "")}>{children}</span>;
}

/* ================= Report Card ================= */

function DocHeader({ title }) {
  const school = useSchool();
  return (
    <div className="rc-header">
      <Seal size={58} />
      <div className="rc-heading">
        <div className="rc-school">{school.name.toUpperCase()}</div>
        {school.motto && <div className="rc-tagline">{school.motto}</div>}
        <div className="rc-doc">{title}</div>
      </div>
    </div>
  );
}

/* Class position: sent by the server for pupils and parents, worked out here for staff who see the whole class. */
function classPosition(db, pupil, term, avgFor) {
  if (db.settings && db.settings.showClassPosition === false) return null;
  const sent = db.rankings && db.rankings[`${pupil.id}|${term}`];
  if (sent) return sent;
  if (db.me && (db.me.role === "pupil" || db.me.role === "parent")) return "Not yet ranked";
  const rankings = db.pupils
    .filter((p) => p.classId === pupil.classId)
    .map((p) => ({ id: p.id, avg: avgFor(p.id) }))
    .filter((r) => r.avg >= 0)
    .sort((a, b) => b.avg - a.avg);
  const position = rankings.findIndex((r) => r.id === pupil.id) + 1;
  return position > 0 ? `${position} of ${rankings.length}` : "Not yet ranked";
}

function ReportComments({ db, pupil, term, onEditComments }) {
  const c = (db.comments && db.comments[`${pupil.id}|${term}`]) || { teacher: "", principal: "" };
  return (
    <div className="rc-comments">
      <div><span>Class Teacher's Comment</span><p>{c.teacher || <span className="muted no-print">No comment yet.</span>}</p></div>
      <div><span>Principal's Comment</span><p>{c.principal || <span className="muted no-print">No comment yet.</span>}</p></div>
      {onEditComments && (
        <div className="no-print" style={{ gridColumn: "1 / -1" }}>
          <button className="btn-ghost btn-small" onClick={() => onEditComments({ pupilId: pupil.id, term })}>Edit comments</button>
        </div>
      )}
    </div>
  );
}

function ReportCard({ db, pupil, term = CURRENT_TERM, onEditComments }) {
  const cls = db.classes.find((c) => c.id === pupil.classId);
  const parts = db.settings.assessment;

  const rows = db.subjects
    .map((subj) => {
      const g = db.grades[gradeKey(pupil.id, subj, term)];
      if (!g) return null;
      const total = totalScore(g);
      const grading = letterFor(total, db.gradeScale);
      return { subj, g, total, ...grading };
    })
    .filter(Boolean);

  const average = rows.length ? (rows.reduce((s, r) => s + r.total, 0) / rows.length).toFixed(1) : "—";

  const avgFor = (pid) => {
    const pr = db.subjects.map((subj) => db.grades[gradeKey(pid, subj, term)]).filter(Boolean).map((g) => totalScore(g));
    return pr.length ? pr.reduce((a, b) => a + b, 0) / pr.length : -1;
  };
  const positionLabel = classPosition(db, pupil, term, avgFor);

  const att = db.attendance[pupil.id] || { present: 0, total: 0 };
  const failGrade = db.gradeScale[db.gradeScale.length - 1]?.grade;

  return (
    <div className="report-card">
      <DocHeader title={`Pupil Report Card — ${term}, ${CURRENT_YEAR}`} />

      <div className="rc-meta">
        <div><span>Name</span><b>{pupil.name}</b></div>
        <div><span>ID / Admission No.</span><b>{pupil.admissionNo}</b></div>
        <div><span>Class</span><b>{cls?.name}</b></div>
        <div><span>Attendance</span><b>{att.present}/{att.total} days</b></div>
      </div>

      <div className="table-scroll">
        <table className="rc-table">
          <thead>
            <tr>
              <th>Subject</th>
              {parts.map((p) => <th key={p.key}>{p.label} ({p.max})</th>)}
              <th>Total (100)</th>
              <th>Grade</th>
              <th>Remark</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={parts.length + 4} className="rc-empty">No grades recorded for this term yet.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.subj}>
                <td>{r.subj}</td>
                {parts.map((p) => <td key={p.key}>{r.g[p.key] ?? "—"}</td>)}
                <td className="rc-total">{r.total}</td>
                <td><Pill tone={r.grade === failGrade ? "red" : "gold"}>{r.grade}</Pill></td>
                <td>{r.remark}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rc-summary">
        <div><span>Term Average</span><b>{average}</b></div>
        {positionLabel !== null && <div><span>Class Position</span><b>{positionLabel}</b></div>}
      </div>

      <ReportComments db={db} pupil={pupil} term={term} onEditComments={onEditComments} />

      <div className="rc-sign">
        <div><div className="sig-line" /><span>Class Teacher's Signature</span></div>
        <div className="rc-stamp"><Seal size={64} /><span>Official Stamp</span></div>
        <div><div className="sig-line" /><span>Principal's Signature</span></div>
      </div>
    </div>
  );
}

function CombinedReportCard({ db, pupil, onEditComments }) {
  const cls = db.classes.find((c) => c.id === pupil.classId);

  const cumulativeAvg = (pupilId) => {
    const perSubject = db.subjects
      .map((subj) => {
        const scores = TERMS.map((t) => db.grades[gradeKey(pupilId, subj, t)])
          .filter(Boolean)
          .map((g) => totalScore(g));
        return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
      })
      .filter((v) => v !== null);
    return perSubject.length ? perSubject.reduce((a, b) => a + b, 0) / perSubject.length : -1;
  };

  const rows = db.subjects
    .map((subj) => {
      const byTerm = TERMS.map((t) => {
        const g = db.grades[gradeKey(pupil.id, subj, t)];
        return g ? totalScore(g) : null;
      });
      const scored = byTerm.filter((v) => v !== null);
      if (scored.length === 0) return null;
      const avg = scored.reduce((a, b) => a + b, 0) / scored.length;
      const grading = letterFor(avg, db.gradeScale);
      return { subj, byTerm, avg, ...grading };
    })
    .filter(Boolean);

  const overallAverage = rows.length ? (rows.reduce((s, r) => s + r.avg, 0) / rows.length).toFixed(1) : "—";
  const positionLabel = classPosition(db, pupil, "combined", cumulativeAvg);
  const att = db.attendance[pupil.id] || { present: 0, total: 0 };
  const failGrade = db.gradeScale[db.gradeScale.length - 1]?.grade;

  return (
    <div className="report-card">
      <DocHeader title={`Cumulative Report Card — ${TERMS.join(", ")}, ${CURRENT_YEAR}`} />

      <div className="rc-meta">
        <div><span>Name</span><b>{pupil.name}</b></div>
        <div><span>ID / Admission No.</span><b>{pupil.admissionNo}</b></div>
        <div><span>Class</span><b>{cls?.name}</b></div>
        <div><span>Attendance</span><b>{att.present}/{att.total} days</b></div>
      </div>

      <div className="table-scroll">
        <table className="rc-table">
          <thead>
            <tr>
              <th>Subject</th>
              {TERMS.map((t) => <th key={t}>{t}</th>)}
              <th>Average</th>
              <th>Grade</th>
              <th>Remark</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={TERMS.length + 4} className="rc-empty">No grades recorded for this pupil in any term yet.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.subj}>
                <td>{r.subj}</td>
                {r.byTerm.map((v, i) => (
                  <td key={i}>{v === null ? <span className="muted">—</span> : v}</td>
                ))}
                <td className="rc-total">{r.avg.toFixed(1)}</td>
                <td><Pill tone={r.grade === failGrade ? "red" : "gold"}>{r.grade}</Pill></td>
                <td>{r.remark}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rc-summary">
        <div><span>Overall Average</span><b>{overallAverage}</b></div>
        {positionLabel !== null && <div><span>Class Position</span><b>{positionLabel}</b></div>}
      </div>

      <ReportComments db={db} pupil={pupil} term="combined" onEditComments={onEditComments} />

      <div className="rc-sign">
        <div><div className="sig-line" /><span>Class Teacher's Signature</span></div>
        <div className="rc-stamp"><Seal size={64} /><span>Official Stamp</span></div>
        <div><div className="sig-line" /><span>Principal's Signature</span></div>
      </div>
    </div>
  );
}

function RegistrationForm({ db, kind, id }) {
  const person = kind === "teacher" ? db.teachers.find((t) => t.id === id) : [...db.pupils, ...(db.withdrawnPupils || [])].find((p) => p.id === id);
  if (!person) return null;
  const cls = db.classes.find((c) => c.id === person.classId);
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  const fields = [
    ["Full Name", person.name],
    ...(kind === "pupil" ? [["Admission No.", person.admissionNo]] : []),
    ["Class", cls?.name || "Unassigned"],
    ...(kind === "teacher" ? [["Subjects Taught", person.subjects?.join(", ") || "—"]] : []),
    ...(kind === "pupil" ? [["Parent / Guardian", person.parentName || "—"]] : []),
    ["Date of Birth", formatDob(person.dob)],
    ["Place of Birth", person.placeOfBirth || "—"],
    ["Telephone", person.telephone || "—"],
    ["Address", person.address || "—"],
    ...(kind === "teacher" ? [["Qualifications", person.qualifications || "—"]] : []),
  ];

  return (
    <div className="report-card">
      <DocHeader title={kind === "teacher" ? "Staff Registration Form" : "Pupil Registration Form"} />

      <div className="reg-form-body">
        {person.photo && (
          <div className="reg-form-photo">
            <img src={person.photo} alt={`${person.name} ID`} />
          </div>
        )}
        <div className="reg-form-fields">
          {fields.map(([label, value]) => (
            <div key={label} className="reg-form-field"><span>{label}</span><b>{value}</b></div>
          ))}
        </div>
      </div>

      <div className="rc-meta" style={{ marginTop: 20 }}>
        <div><span>Date Printed</span><b>{today}</b></div>
        <div><span>Academic Year</span><b>{CURRENT_YEAR}</b></div>
      </div>

      <div className="rc-sign" style={{ marginTop: 32 }}>
        <div><div className="sig-line" /><span>{kind === "teacher" ? "Staff Signature" : "Parent / Guardian Signature"}</span></div>
        <div className="rc-stamp"><Seal size={64} /><span>Official Stamp</span></div>
        <div><div className="sig-line" /><span>Proprietor's Signature</span></div>
      </div>
    </div>
  );
}

function CommentsModal({ db, pupilId, term, onClose, onSave }) {
  const pupil = db.pupils.find((p) => p.id === pupilId);
  const existing = (db.comments && db.comments[`${pupilId}|${term}`]) || { teacher: "", principal: "" };
  const role = db.me.role;
  const canTeacher = role === "teacher" || role === "principal" || role === "proprietor";
  const canPrincipal = role === "principal" || role === "proprietor";
  const [teacher, setTeacher] = useState(existing.teacher);
  const [principal, setPrincipal] = useState(existing.principal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setBusy(true);
    setError("");
    const body = { pupilId, term };
    if (canTeacher) body.teacherComment = teacher;
    if (canPrincipal) body.principalComment = principal;
    try {
      await onSave(body);
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={`Report comments — ${pupil?.name || ""}`} onClose={onClose} wide>
      <p className="muted" style={{ fontSize: 14.5, marginTop: 0 }}>{term === "combined" ? "End-of-year (cumulative) report card" : `${term} report card`}, {CURRENT_YEAR}.</p>
      <div className="form-grid">
        {canTeacher && (
          <label className="form-span">Class Teacher's comment
            <textarea rows={3} maxLength={600} value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="e.g. A steady, encouraging term. Keep up consistent effort in every subject." />
          </label>
        )}
        {canPrincipal && (
          <label className="form-span">Principal's comment
            <textarea rows={3} maxLength={600} value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="e.g. Promoted to work harder next term. Well done." />
          </label>
        )}
      </div>
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save comments"}</button>
      </div>
    </Modal>
  );
}

/* Runs a save, keeping the form open with the server's message if it fails. */
function useSave(onClose) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      const out = await fn();
      if (onClose) onClose();
      return out;
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

/* ================= Grade entry modal ================= */

function GradeEntryModal({ db, classId, onClose, onSave }) {
  const pupils = db.pupils.filter((p) => p.classId === classId);
  const teacher = db.me.role === "teacher" ? db.teachers.find((t) => t.id === db.me.teacherId) : null;
  const subjects = teacher && teacher.subjects.length ? teacher.subjects.filter((s) => db.subjects.includes(s)) : db.subjects;
  const parts = db.settings.assessment;
  const [pupilId, setPupilId] = useState(pupils[0]?.id || "");
  const [subject, setSubject] = useState(subjects[0] || "");
  const [values, setValues] = useState({});
  const { busy, error, run } = useSave(null);
  const [savedNote, setSavedNote] = useState("");

  useEffect(() => {
    const g = db.grades[gradeKey(pupilId, subject)] || {};
    setValues(Object.fromEntries(parts.map((p) => [p.key, g[p.key] ?? ""])));
    setSavedNote("");
  }, [pupilId, subject]); // eslint-disable-line

  const clamped = Object.fromEntries(parts.map((p) => [p.key, Math.max(0, Math.min(p.max, Number(values[p.key]) || 0))]));
  const total = parts.reduce((s, p) => s + clamped[p.key], 0);
  const grading = letterFor(total, db.gradeScale);
  const failGrade = db.gradeScale[db.gradeScale.length - 1]?.grade;

  const save = (andNext) => run(async () => {
    await onSave({ pupilId, subject, scores: clamped });
    const name = pupils.find((p) => p.id === pupilId)?.name;
    setSavedNote(`Saved ${subject} for ${name}.`);
    if (andNext) {
      const i = pupils.findIndex((p) => p.id === pupilId);
      if (i >= 0 && i < pupils.length - 1) setPupilId(pupils[i + 1].id);
    } else {
      onClose();
    }
  });

  if (!pupils.length) {
    return (
      <Modal title="Enter Scores" onClose={onClose}>
        <p className="muted">There are no pupils in this class yet.</p>
        <div className="modal-actions"><button className="btn-primary" onClick={onClose}>Close</button></div>
      </Modal>
    );
  }

  return (
    <Modal title={`Enter Scores — ${CURRENT_TERM}`} onClose={onClose} wide>
      <div className="form-grid">
        <label>Pupil
          <select value={pupilId} onChange={(e) => setPupilId(e.target.value)}>
            {pupils.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>Subject
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        {parts.map((p) => (
          <label key={p.key}>{p.label} / {p.max}
            <input type="number" min="0" max={p.max} value={values[p.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))} />
          </label>
        ))}
      </div>
      <div className="calc-preview">
        <div>Total: <b>{total} / 100</b></div>
        <div>Grade: <Pill tone={grading.grade === failGrade ? "red" : "gold"}>{grading.grade}</Pill></div>
        <div>Remark: <b>{grading.remark}</b></div>
      </div>
      {savedNote && <div className="notice" style={{ marginTop: 12 }}>{savedNote}</div>}
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Close</button>
        <button className="btn-ghost" disabled={busy || !subject} onClick={() => save(true)}>Save &amp; next pupil</button>
        <button className="btn-primary" disabled={busy || !subject} onClick={() => save(false)}>{busy ? "Saving…" : "Save score"}</button>
      </div>
    </Modal>
  );
}

/* ================= Attendance modal ================= */

function AttendanceModal({ db, classId, onClose, onSave }) {
  const pupils = db.pupils.filter((p) => p.classId === classId);
  const today = new Date().toISOString().slice(0, 10);
  const alreadyMarked = db.lastMarked[classId] === today;
  const [statusMap, setStatusMap] = useState(() => Object.fromEntries(pupils.map((p) => [p.id, "present"])));
  const { busy, error, run } = useSave(onClose);

  return (
    <Modal title={`Mark Attendance — ${today}`} onClose={onClose}>
      {alreadyMarked && <div className="notice">Attendance for this class was already recorded today. Saving again replaces today's record.</div>}
      <div className="att-list">
        {pupils.map((p) => (
          <div className="att-row" key={p.id}>
            <span>{p.name}</span>
            <div className="seg">
              <button className={statusMap[p.id] === "present" ? "seg-on" : ""} onClick={() => setStatusMap((m) => ({ ...m, [p.id]: "present" }))}>Present</button>
              <button className={statusMap[p.id] === "absent" ? "seg-on seg-red" : ""} onClick={() => setStatusMap((m) => ({ ...m, [p.id]: "absent" }))}>Absent</button>
            </div>
          </div>
        ))}
        {pupils.length === 0 && <p className="muted">There are no pupils in this class yet.</p>}
      </div>
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !pupils.length} onClick={() => run(() => onSave({ classId, statusMap, date: today }))}>{busy ? "Saving…" : "Save attendance"}</button>
      </div>
    </Modal>
  );
}

/* ================= Submit question modal ================= */

function SubmitQuestionModal({ db, onClose, onSave }) {
  const teacher = db.teachers.find((t) => t.id === db.me.teacherId);
  const subjects = teacher?.subjects?.length ? teacher.subjects : db.subjects;
  const [subject, setSubject] = useState(subjects[0] || "");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [marks, setMarks] = useState("");
  const { busy, error, setError, run } = useSave(onClose);

  const submit = () => {
    if (!title.trim()) { setError("Give the question set a title."); return; }
    if (!content.trim()) { setError("Enter the exam questions."); return; }
    run(() => onSave({ subject, title: title.trim(), content: content.trim(), marks: Number(marks) || 0 }));
  };

  return (
    <Modal title="Submit Exam Questions" onClose={onClose} wide>
      <p style={{ fontSize: 14.5, color: "var(--muted)", marginTop: 0 }}>
        This will be sent to the Exam Officer for review and approval.
      </p>
      <div className="form-grid">
        <label>Subject
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>Total marks
          <input type="number" min="0" value={marks} onChange={(e) => setMarks(e.target.value)} placeholder="e.g. 40" />
        </label>
        <label className="form-span">Title
          <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. End of Term Test — Mathematics" />
        </label>
        <label className="form-span">Questions
          <textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} placeholder={"1. ...\n2. ...\n3. ..."} />
        </label>
      </div>
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? "Sending…" : "Submit to Exam Officer"}</button>
      </div>
    </Modal>
  );
}

/* ================= Payment modal ================= */

function PaymentModal({ db, onClose, onSave, onReceipt }) {
  const [pupilId, setPupilId] = useState(db.pupils[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const { busy, error, run } = useSave(null);
  const fee = db.fees[pupilId] || { termFee: 0, paid: 0 };
  const balance = fee.termFee - fee.paid;
  const q = search.trim().toLowerCase();
  const options = db.pupils.filter((p) => !q || p.name.toLowerCase().includes(q) || p.admissionNo.toLowerCase().includes(q));

  const save = () => run(async () => {
    const r = await onSave({ pupilId, amount: Number(amount), note });
    onClose();
    if (onReceipt) onReceipt({ pupilId, amount: Number(amount), note, receiptNo: r.receiptNo, date: new Date().toISOString().slice(0, 10) });
  });

  return (
    <Modal title={`Record a Fee Payment — ${CURRENT_TERM}`} onClose={onClose}>
      <div className="form-grid">
        <label className="form-span">Find pupil
          <input value={search} onChange={(e) => { setSearch(e.target.value); }} placeholder="Type a name or admission number" />
        </label>
        <label className="form-span">Pupil
          <select value={pupilId} onChange={(e) => setPupilId(e.target.value)}>
            {options.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.admissionNo}</option>)}
          </select>
        </label>
        <label>Amount ({CURRENCY})
          <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Balance owed: ${money(balance)}`} />
        </label>
        <label>Note (optional)
          <input type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Part payment" />
        </label>
      </div>
      <p className="muted" style={{ fontSize: 14 }}>Term fee {money(fee.termFee)} · paid {money(fee.paid)} · balance {money(balance)}</p>
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !pupilId || !amount || Number(amount) <= 0} onClick={save}>
          {busy ? "Saving…" : "Record payment"}
        </button>
      </div>
    </Modal>
  );
}

function ReceiptModal({ db, receipt, onClose }) {
  const pupil = db.pupils.find((p) => p.id === receipt.pupilId);
  const cls = db.classes.find((c) => c.id === pupil?.classId);
  const fee = db.fees[receipt.pupilId] || { termFee: 0, paid: 0 };
  return (
    <Modal title="Payment recorded" onClose={onClose}>
      <div className="receipt print-receipt">
        <DocHeader title={`Official Receipt ${receipt.receiptNo}`} />
        <div className="profile-grid">
          <div><span>Pupil</span><b>{pupil?.name}</b></div>
          <div><span>ID / Admission No.</span><b>{pupil?.admissionNo}</b></div>
          <div><span>Class</span><b>{cls?.name || "—"}</b></div>
          <div><span>Date</span><b>{receipt.date}</b></div>
          <div><span>Amount received</span><b>{money(receipt.amount)}</b></div>
          <div><span>For</span><b>{CURRENT_TERM}, {CURRENT_YEAR}</b></div>
          <div><span>Balance after payment</span><b>{money(fee.termFee - fee.paid)}</b></div>
          <div><span>Note</span><b>{receipt.note || "—"}</b></div>
        </div>
        <div className="rc-sign" style={{ marginTop: 28 }}>
          <div><div className="sig-line" /><span>Received by ({db.me.name})</span></div>
          <div className="rc-stamp"><Seal size={52} /><span>Official Stamp</span></div>
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={printModal}>Print receipt</button>
        <button className="btn-primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}

function FeeModal({ db, pupilId, onClose, onSave }) {
  const [mode, setMode] = useState(pupilId ? "pupil" : "class");
  const [target, setTarget] = useState(pupilId || db.classes[0]?.id || "");
  const [amount, setAmount] = useState(pupilId ? String(db.fees[pupilId]?.termFee || "") : "");
  const { busy, error, run } = useSave(onClose);
  const pupil = db.pupils.find((p) => p.id === pupilId);
  return (
    <Modal title={`Set term fee — ${CURRENT_TERM}, ${CURRENT_YEAR}`} onClose={onClose}>
      {!pupilId && (
        <div className="seg" style={{ marginBottom: 14 }}>
          <button className={mode === "class" ? "seg-on" : ""} onClick={() => { setMode("class"); setTarget(db.classes[0]?.id || ""); }}>Whole class</button>
          <button className={mode === "pupil" ? "seg-on" : ""} onClick={() => { setMode("pupil"); setTarget(db.pupils[0]?.id || ""); }}>One pupil</button>
        </div>
      )}
      <div className="form-grid">
        {pupilId ? (
          <label className="form-span">Pupil<input value={`${pupil?.name} — ${pupil?.admissionNo}`} disabled /></label>
        ) : mode === "class" ? (
          <label className="form-span">Class
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        ) : (
          <label className="form-span">Pupil
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {db.pupils.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.admissionNo}</option>)}
            </select>
          </label>
        )}
        <label className="form-span">Term fee ({CURRENCY})
          <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 3500" />
        </label>
      </div>
      {mode === "class" && !pupilId && <p className="muted" style={{ fontSize: 14 }}>This sets the same fee for every pupil currently in the class. You can change single pupils afterwards.</p>}
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || amount === "" || Number(amount) < 0}
          onClick={() => run(() => onSave(mode === "class" && !pupilId ? { classId: target, amount: Number(amount) } : { pupilId: target, amount: Number(amount) }))}>
          {busy ? "Saving…" : "Save fee"}
        </button>
      </div>
    </Modal>
  );
}

/* ================= Announcement modal ================= */

function AnnouncementModal({ onClose, onSave }) {
  const [text, setText] = useState("");
  const { busy, error, run } = useSave(onClose);
  return (
    <Modal title="Post an Announcement" onClose={onClose}>
      <label className="form-span">Message
        <textarea rows={4} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your announcement..." />
      </label>
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !text.trim()} onClick={() => run(() => onSave({ text: text.trim() }))}>{busy ? "Posting…" : "Post"}</button>
      </div>
    </Modal>
  );
}

/* ================= Login screen ================= */

const SCHOOL_CODE_KEY = "sms.schoolCode";
function rememberedSchoolCode() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("school");
    if (fromUrl) return fromUrl;
    return window.localStorage.getItem(SCHOOL_CODE_KEY) || "";
  } catch (e) {
    return "";
  }
}

function LoginScreen({ onLoggedIn, notice, onDismissNotice, onBrand }) {
  const [schoolCode, setSchoolCode] = useState(rememberedSchoolCode);
  const [brand, setBrand] = useState(null);
  useSchoolManifest(brand?.code);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const platform = usePlatformNotice();
  const support = platform.supportContact;

  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => onDismissNotice(), 10000);
      return () => clearTimeout(t);
    }
  }, [notice]); // eslint-disable-line

  // show the school's own name and crest once its code is known
  useEffect(() => {
    const code = schoolCode.trim();
    if (code.length < 2) { setBrand(null); onBrand(null); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      api.publicSchool(code).then((b) => { if (!cancelled) { setBrand(b); onBrand(b); } }).catch(() => { if (!cancelled) { setBrand(null); onBrand(null); } });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [schoolCode]); // eslint-disable-line

  const submit = async () => {
    if (!schoolCode.trim() || !username.trim() || !password) { setError("Enter your school code, username and password."); return; }
    setBusy(true);
    setError("");
    try {
      await api.login(schoolCode.trim(), username.trim(), password);
      try { window.localStorage.setItem(SCHOOL_CODE_KEY, schoolCode.trim()); } catch (e) { /* private browsing */ }
      setPassword("");
      await onLoggedIn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        {notice && <div className="notice" style={{ marginBottom: 18 }}>{notice}</div>}
        {platform.notice && <PlatformNotice text={platform.notice} />}
        <div className="login-brand">
          <Seal size={64} />
          <div>
            <div className="brand-name">{brand ? brand.name.toUpperCase() : APP_NAME.toUpperCase()}</div>
            {brand?.motto && <div className="brand-motto">{brand.motto}</div>}
            <div className="brand-sub">{brand ? APP_NAME : "Sign in with your school's code"}</div>
          </div>
        </div>
        <div className="login-form">
          <label>School code
            <input value={schoolCode} onChange={(e) => setSchoolCode(e.target.value)} onKeyDown={onKeyDown} placeholder="e.g. 48213907" autoCapitalize="characters" autoComplete="organization" />
          </label>
          <label>Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={onKeyDown} placeholder="Your username" autoComplete="username" autoCapitalize="none" autoFocus={!!schoolCode} />
          </label>
          <label>Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onKeyDown} placeholder="Password" autoComplete="current-password" />
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button type="button" className="btn-primary btn-full" disabled={busy} onClick={submit}>{busy ? "Signing in…" : "Sign in"}</button>
          <p className="muted" style={{ fontSize: 14.5, margin: 0, textAlign: "center" }}>Forgot your password? Ask your school's Proprietor to reset it.</p>
          {support && <p className="muted" style={{ fontSize: 14.5, margin: 0, textAlign: "center" }}>Need help? {support}</p>}
          <InstallButton block />
          {isInstalled() && <p className="muted" style={{ fontSize: 13.5, margin: 0, textAlign: "center" }}><a className="text-link" href="/platform">Platform administrator sign-in</a> (no school code needed)</p>}
        </div>
      </div>
    </div>
  );
}

function ChangePasswordScreen({ db, forced, onDone, onCancel, onLogout }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (next !== again) { setError("The two new passwords do not match."); return; }
    setBusy(true);
    setError("");
    try {
      await api.changePassword(current, next);
      await onDone();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  const body = (
    <div className="login-form">
      {forced && <div className="notice">Welcome, {db.me.name}. Before you start, please choose your own password. Your current one was given to you by someone else.</div>}
      <label>Current password
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </label>
      <label>New password (at least 8 characters)
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      </label>
      <label>New password again
        <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" onKeyDown={(e) => e.key === "Enter" && submit()} />
      </label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="btn-primary btn-full" disabled={busy || !current || !next} onClick={submit}>{busy ? "Saving…" : "Save new password"}</button>
      {forced ? (
        <button className="btn-ghost btn-full" onClick={onLogout}>Sign out</button>
      ) : (
        <button className="btn-ghost btn-full" onClick={onCancel}>Cancel</button>
      )}
    </div>
  );
  if (!forced) return <Modal title="Change your password" onClose={onCancel}>{body}</Modal>;
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <Seal size={64} />
          <div>
            <div className="brand-name">{db.school.name.toUpperCase()}</div>
            <div className="brand-sub">Choose your password</div>
          </div>
        </div>
        {body}
      </div>
    </div>
  );
}

/* ================= Layout shell ================= */

const NAV = {
  proprietor: [["overview", "Overview"], ["staff", "Staff"], ["pupils", "Pupils"], ["reports", "Pupil Reports"], ["staffreports", "Staff Reports"], ["finance", "Finance"], ["announcements", "Announcements"], ["accounts", "User Accounts"], ["schoolreports", "Reports"], ["auditlog", "Audit Log"], ["setup", "School Setup"], ["settings", "Security & Backups"]],
  principal: [["overview", "Overview"], ["staff", "Staff"], ["pupils", "Pupils"], ["academics", "Academics"], ["finance", "Fees & Receipts"], ["announcements", "Announcements"]],
  bursar: [["overview", "Overview"], ["payments", "Payments"], ["announcements", "Announcements"]],
  teacher: [["overview", "My Class"], ["grades", "Grades & Report Cards"], ["attendance", "Attendance"], ["questions", "Submit Questions"], ["announcements", "Announcements"]],
  pupil: [["overview", "My Profile"], ["reportcard", "My Report Card"]],
  parent: [["overview", "My Children"], ["reportcard", "Report Cards"]],
  examofficer: [["overview", "Overview"], ["questions", "Question Submissions"], ["reportcards", "Report Cards"], ["announcements", "Announcements"]],
};

function Shell({ user, view, setView, onLogout, onChangePassword, children }) {
  const school = useSchool();
  useSchoolManifest(school?.code);
  const items = NAV[user.role];
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const platform = usePlatformNotice();

  const selectView = (key) => { setView(key); setMobileOpen(false); };

  return (
    <div className={"shell" + (collapsed ? " shell-collapsed" : "")}>
      {mobileOpen && <div className="sidebar-scrim" onClick={() => setMobileOpen(false)} />}
      <aside className={"sidebar" + (mobileOpen ? " sidebar-open" : "")}>
        <div className="sidebar-brand">
          <Seal size={40} />
          {!collapsed && (
            <div>
              <div className="sb-name">{school.name}</div>
              {school.motto && <div className="sb-motto">{school.motto}</div>}
              {school.location && <div className="sb-sub">{school.location}</div>}
            </div>
          )}
          <button className="collapse-btn" onClick={() => setCollapsed((c) => !c)} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label="Toggle sidebar">
            {collapsed ? "»" : "«"}
          </button>
        </div>
        <nav>
          {items.map(([key, label]) => (
            <button key={key} className={"nav-item" + (view === key ? " nav-active" : "")} onClick={() => selectView(key)} title={collapsed ? label : undefined}>
              <Icon name={NAV_ICONS[key]} />
              {!collapsed && <span>{label}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          {!collapsed && (
            <div className="who">
              <div className="who-name">{user.name}</div>
              <div className="who-role">{user.title}</div>
            </div>
          )}
          {!collapsed && <InstallButton />}
          {!collapsed && <button className="btn-ghost btn-small" onClick={onChangePassword}>Change password</button>}
          <button className="btn-ghost btn-small" onClick={onLogout}>{collapsed ? "⎋" : "Sign out"}</button>
        </div>
      </aside>
      <div className="content-area">
        <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)} aria-label="Open menu">☰ Menu</button>
        <main className="content" key={view}>
          {platform.notice && <PlatformNotice text={platform.notice} />}
          {children}
        </main>
      </div>
    </div>
  );
}

/* A message from the platform administrators to every school (e.g. planned maintenance). */
function usePlatformNotice() {
  const [n, setN] = useState({ notice: "", supportContact: "" });
  useEffect(() => { api.publicNotice().then(setN).catch(() => {}); }, []);
  return n;
}

function PlatformNotice({ text }) {
  return <div className="platform-notice" role="status"><Icon name="megaphone" size={18} /><span>{text}</span></div>;
}

/* ================= Role dashboards ================= */

function ProprietorView({ db, view, setModal, act }) {
  const totalPupils = db.pupils.length;
  const totalTeachers = db.teachers.length;
  const totalClasses = db.classes.length;
  const collected = Object.values(db.fees).reduce((s, f) => s + f.paid, 0);
  const totalDue = Object.values(db.fees).reduce((s, f) => s + f.termFee, 0);
  const outstanding = totalDue - collected;

  if (view === "overview") {
    return (
      <>
        <h1>Proprietor Dashboard</h1>
        <p className="lead">School-wide overview for {CURRENT_TERM}, {CURRENT_YEAR}.</p>
        {totalPupils === 0 && (
          <div className="notice">
            Getting started: open <b>School Setup</b> to check your school's name, crest, classes, subjects and terms. Then register staff and pupils, and create accounts for them in <b>User Accounts</b>.
          </div>
        )}
        <div className="stat-grid">
          <StatCard label="Total Pupils" value={totalPupils} />
          <StatCard label="Total Teachers" value={totalTeachers} />
          <StatCard label="Classes" value={totalClasses} />
          <StatCard label="Fees Collected" value={money(collected)} tone="gold" sub={CURRENT_TERM} />
          <StatCard label="Outstanding Fees" value={money(outstanding)} tone={outstanding > 0 ? "red" : "gold"} sub={CURRENT_TERM} />
        </div>
        <Panel title="Recent payments">
          {db.payments.length === 0 ? <p className="muted" style={{ padding: "8px 0" }}>No payments recorded this year yet.</p> : (
            <ul className="activity-list">
              {db.payments.slice(-5).reverse().map((p) => {
                const pu = db.pupils.find((x) => x.id === p.pupilId);
                return <li key={p.id}><span>{money(p.amount)} received for {pu?.name || "a former pupil"}</span><time>{p.date}</time></li>;
              })}
            </ul>
          )}
        </Panel>
      </>
    );
  }
  if (view === "staff") return <StaffView db={db} setModal={setModal} />;
  if (view === "pupils") return <PupilsView db={db} setModal={setModal} />;
  if (view === "reports") return <PupilReportsView db={db} setModal={setModal} />;
  if (view === "staffreports") return <StaffReportsView db={db} setModal={setModal} />;
  if (view === "accounts") return <AccountsView db={db} setModal={setModal} act={act} />;
  if (view === "settings") return <SettingsView db={db} act={act} />;
  if (view === "setup") return <SchoolSetupView db={db} act={act} />;
  if (view === "schoolreports") return <SchoolReportsView db={db} />;
  if (view === "auditlog") return <AuditLogView db={db} />;
  if (view === "finance") return <FinanceOverview db={db} setModal={setModal} allowRecord={true} />;
  if (view === "announcements") return <AnnouncementsView db={db} setModal={setModal} act={act} canPost />;
  return null;
}

function PrincipalView({ db, view, setModal, act }) {
  if (view === "overview") {
    const submitted = db.classes.filter((c) =>
      db.pupils.filter((p) => p.classId === c.id).some((p) => db.subjects.some((s) => db.grades[gradeKey(p.id, s)]))
    ).length;
    const att = Object.values(db.attendance).filter((a) => a.total > 0);
    const avgAttendance = att.length ? Math.round((att.reduce((s, a) => s + a.present / a.total, 0) / att.length) * 100) : null;
    return (
      <>
        <h1>Principal Dashboard</h1>
        <p className="lead">Academic overview for {CURRENT_TERM}, {CURRENT_YEAR}.</p>
        <div className="stat-grid">
          <StatCard label="Total Pupils" value={db.pupils.length} />
          <StatCard label="Teachers" value={db.teachers.length} />
          <StatCard label="Classes" value={db.classes.length} />
          <StatCard label="Grades Submitted" value={`${submitted}/${db.classes.length} classes`} tone="gold" />
          <StatCard label="Avg. Attendance" value={avgAttendance === null ? "—" : `${avgAttendance}%`} />
        </div>
        <Panel title="Announcements">
          <AnnouncementList db={db} limit={3} />
        </Panel>
      </>
    );
  }
  if (view === "staff") return <StaffView db={db} />;
  if (view === "pupils") return <PupilsView db={db} />;
  if (view === "academics") return <AcademicsOverview db={db} setModal={setModal} />;
  if (view === "finance") return <FinanceOverview db={db} setModal={setModal} allowRecord={false} />;
  if (view === "announcements") return <AnnouncementsView db={db} setModal={setModal} act={act} canPost />;
  return null;
}

function StaffView({ db, setModal }) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const filtered = db.teachers.filter((t) => {
    if (!q) return true;
    const clsName = db.classes.find((c) => c.id === t.classId)?.name || "";
    return (
      t.name.toLowerCase().includes(q) ||
      clsName.toLowerCase().includes(q) ||
      t.subjects.join(" ").toLowerCase().includes(q)
    );
  });

  return (
    <>
      <h1>Staff</h1>
      <Panel
        title={`Teachers (${filtered.length}${filtered.length !== db.teachers.length ? ` of ${db.teachers.length}` : ""})`}
        action={
          <div className="row-actions" style={{ margin: 0 }}>
            <input className="audit-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff…" />
            {setModal && <button className="btn-primary btn-small" onClick={() => setModal({ type: "registerstaff" })}>Register staff</button>}
          </div>
        }
      >
        <table className="data-table">
          <thead><tr><th>Name</th><th>Class</th><th>Subjects</th><th></th></tr></thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="rc-empty">No staff match "{search}".</td></tr>
            )}
            {filtered.map((t) => (
              <tr key={t.id}>
                <td>{t.name}{t.active === false && <> <Pill tone="red">Left</Pill></>}</td>
                <td>{db.classes.find((c) => c.id === t.classId)?.name || <span className="muted">Unassigned</span>}</td>
                <td>{t.subjects.join(", ") || <span className="muted">—</span>}</td>
                <td>{setModal && <button className="btn-ghost btn-small" onClick={() => setModal({ type: "profile", kind: "teacher", id: t.id })}>View</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

function PupilsView({ db, setModal }) {
  const [search, setSearch] = useState("");
  const [showWithdrawn, setShowWithdrawn] = useState(false);
  const q = search.trim().toLowerCase();
  const source = showWithdrawn ? db.withdrawnPupils || [] : db.pupils;
  const filtered = source.filter((p) => {
    if (!q) return true;
    const clsName = db.classes.find((c) => c.id === p.classId)?.name || "";
    return (
      p.name.toLowerCase().includes(q) ||
      p.admissionNo.toLowerCase().includes(q) ||
      clsName.toLowerCase().includes(q) ||
      (p.parentName || "").toLowerCase().includes(q)
    );
  });

  return (
    <>
      <h1>Pupils</h1>
      <Panel
        title={`${showWithdrawn ? "Withdrawn pupils" : "Pupils"} (${filtered.length}${filtered.length !== source.length ? ` of ${source.length}` : ""})`}
        action={
          <div className="row-actions" style={{ margin: 0 }}>
            <input className="audit-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search pupils…" />
            {db.withdrawnPupils && (
              <button className="btn-ghost btn-small" onClick={() => setShowWithdrawn((v) => !v)}>{showWithdrawn ? "Show current pupils" : `Withdrawn (${db.withdrawnPupils.length})`}</button>
            )}
            {setModal && db.me.role === "proprietor" && <button className="btn-primary btn-small" onClick={() => setModal({ type: "registerpupil" })}>Register pupil</button>}
          </div>
        }
      >
        <table className="data-table">
          <thead><tr><th>Name</th><th>Admission No.</th><th>Class</th><th>Parent</th><th></th></tr></thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="rc-empty">No pupils match "{search}".</td></tr>
            )}
            {filtered.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="mono">{p.admissionNo}</td>
                <td>{db.classes.find((c) => c.id === p.classId)?.name}</td>
                <td>{p.parentName}</td>
                <td>{setModal && <button className="btn-ghost btn-small" onClick={() => setModal({ type: "profile", kind: "pupil", id: p.id })}>View</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

function PupilReportsView({ db, setModal }) {
  const [selected, setSelected] = useState(db.pupils[0]?.id || "");
  const [term, setTerm] = useState(CURRENT_TERM);
  const pupil = db.pupils.find((p) => p.id === selected);

  const allTermsRows = pupil
    ? db.subjects
        .map((subj) => {
          const byTerm = TERMS.map((t) => {
            const g = db.grades[gradeKey(pupil.id, subj, t)];
            return g ? totalScore(g) : null;
          });
          if (byTerm.every((v) => v === null)) return null;
          return { subj, byTerm };
        })
        .filter(Boolean)
    : [];

  return (
    <>
      <h1>Pupil Reports</h1>
      <p className="lead">View and print the full report card for any pupil in the school, for any term.</p>
      <div className="row-actions">
        <label className="inline-label">Pupil
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {db.classes.map((c) => (
              <optgroup key={c.id} label={c.name}>
                {db.pupils.filter((p) => p.classId === c.id).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="inline-label">Term
          <select value={term} onChange={(e) => setTerm(e.target.value)}>
            {TERMS.map((t) => <option key={t} value={t}>{t}{t === CURRENT_TERM ? " (current)" : ""}</option>)}
            <option value="combined">Combined (all terms)</option>
          </select>
        </label>
        <button className="btn-primary btn-small" onClick={() => window.print()}>Print report card</button>
        {setModal && <button className="btn-ghost btn-small" onClick={() => setModal({ type: "registerpupil" })}>Register new pupil</button>}
      </div>

      {pupil && (
        <Panel title={`${pupil.name}: all terms at a glance`}>
          {allTermsRows.length === 0 ? (
            <p className="muted" style={{ padding: "8px 0" }}>No grades recorded for this pupil in any term yet.</p>
          ) : (
            <table className="data-table">
              <thead><tr><th>Subject</th>{TERMS.map((t) => <th key={t}>{t}</th>)}</tr></thead>
              <tbody>
                {allTermsRows.map((r) => (
                  <tr key={r.subj}>
                    <td>{r.subj}</td>
                    {r.byTerm.map((v, i) => (
                      <td key={i}>{v === null ? <span className="muted">—</span> : v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}

      {pupil && (term === "combined"
        ? <CombinedReportCard db={db} pupil={pupil} onEditComments={(t) => setModal({ type: "comments", ...t })} />
        : <ReportCard db={db} pupil={pupil} term={term} onEditComments={(t) => setModal({ type: "comments", ...t })} />)}
    </>
  );
}

function StaffReportsView({ db, setModal }) {
  const [selected, setSelected] = useState(db.teachers[0]?.id || "");
  const teacher = db.teachers.find((t) => t.id === selected);

  return (
    <>
      <h1>Staff Reports</h1>
      <p className="lead">View and print the full registration form for any staff member in the school.</p>
      <div className="row-actions">
        <label className="inline-label">Staff member
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {db.classes.map((c) => {
              const staffInClass = db.teachers.filter((t) => t.classId === c.id);
              return staffInClass.length ? (
                <optgroup key={c.id} label={c.name}>
                  {staffInClass.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </optgroup>
              ) : null;
            })}
            {db.teachers.filter((t) => !db.classes.some((c) => c.id === t.classId)).length > 0 && (
              <optgroup label="Unassigned">
                {db.teachers.filter((t) => !db.classes.some((c) => c.id === t.classId)).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <button className="btn-primary btn-small" onClick={() => window.print()}>Print form</button>
        {setModal && <button className="btn-ghost btn-small" onClick={() => setModal({ type: "registerstaff" })}>Register new staff</button>}
      </div>
      {teacher ? (
        <RegistrationForm db={db} kind="teacher" id={teacher.id} />
      ) : (
        <Panel title="No staff yet"><p className="muted" style={{ padding: "8px 0" }}>Register a staff member to see their form here.</p></Panel>
      )}
    </>
  );
}

function SchoolReportsView({ db }) {
  const [term, setTerm] = useState(CURRENT_TERM);
  const collected = Object.values(db.fees).reduce((s, f) => s + f.paid, 0);
  const totalDue = Object.values(db.fees).reduce((s, f) => s + f.termFee, 0);
  const outstanding = totalDue - collected;

  const classStats = db.classes.map((c) => {
    const pupils = db.pupils.filter((p) => p.classId === c.id);
    const scores = [];
    pupils.forEach((p) => {
      db.subjects.forEach((s) => {
        const g = db.grades[gradeKey(p.id, s, term)];
        if (g) scores.push(totalScore(g));
      });
    });
    const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const att = pupils.map((p) => db.attendance[p.id]).filter((a) => a && a.total > 0);
    const attRate = att.length ? Math.round((att.reduce((s, a) => s + a.present / a.total, 0) / att.length) * 100) : null;
    const classFees = pupils.reduce((s, p) => s + (db.fees[p.id]?.termFee || 0), 0);
    const classPaid = pupils.reduce((s, p) => s + (db.fees[p.id]?.paid || 0), 0);
    return { name: c.name, pupilCount: pupils.length, avg, attRate, classFees, classPaid };
  });

  return (
    <>
      <h1>School Reports</h1>
      <p className="lead">Consolidated summary for {term}, {CURRENT_YEAR}.</p>
      <div className="row-actions">
        <label className="inline-label">Term
          <select value={term} onChange={(e) => setTerm(e.target.value)}>
            {TERMS.map((t) => <option key={t} value={t}>{t}{t === CURRENT_TERM ? " (current)" : ""}</option>)}
          </select>
        </label>
        <button className="btn-primary btn-small" onClick={() => window.print()}>Print report</button>
      </div>

      <div className="stat-grid">
        <StatCard label="Total Pupils" value={db.pupils.length} />
        <StatCard label="Total Teachers" value={db.teachers.length} />
        <StatCard label="Fees Collected" value={money(collected)} tone="gold" />
        <StatCard label="Outstanding Fees" value={money(outstanding)} tone={outstanding > 0 ? "red" : "gold"} />
      </div>

      <Panel title="Class-by-class summary">
        <table className="data-table">
          <thead><tr><th>Class</th><th>Pupils</th><th>Average Score</th><th>Attendance Rate</th><th>Fees Collected</th><th>Fees Expected</th></tr></thead>
          <tbody>
            {classStats.map((c) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td>{c.pupilCount}</td>
                <td>{c.avg === null ? <span className="muted">No grades yet</span> : c.avg.toFixed(1)}</td>
                <td>{c.attRate === null ? <span className="muted">—</span> : `${c.attRate}%`}</td>
                <td>{money(c.classPaid)}</td>
                <td>{money(c.classFees)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Enrollment by class">
        <table className="data-table">
          <thead><tr><th>Class</th><th>Pupils Enrolled</th></tr></thead>
          <tbody>
            {classStats.map((c) => (
              <tr key={c.name}><td>{c.name}</td><td>{c.pupilCount}</td></tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

function AuditLogView({ db }) {
  const [filter, setFilter] = useState("");
  const log = db.auditLog || [];
  const filtered = filter.trim()
    ? log.filter((e) =>
        (e.actor + " " + e.action + " " + (e.details || "")).toLowerCase().includes(filter.trim().toLowerCase())
      )
    : log;

  return (
    <>
      <h1>Audit Log</h1>
      <p className="lead">A record of key actions taken across the system.</p>
      <Panel
        title={`Activity (${filtered.length}${filtered.length !== log.length ? ` of ${log.length}` : ""})`}
        action={<input className="audit-search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search log…" />}
      >
        <table className="data-table">
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Details</th></tr></thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="rc-empty">No matching activity.</td></tr>
            )}
            {filtered.map((e) => (
              <tr key={e.id}>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{formatTimestamp(e.timestamp)}</td>
                <td>{e.actor}</td>
                <td><Pill>{e.action}</Pill></td>
                <td className="muted">{e.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

const ROLE_LABELS = {
  proprietor: "Proprietor", principal: "Principal", bursar: "Bursar",
  teacher: "Teacher", pupil: "Pupil", parent: "Parent", examofficer: "Exam Officer",
};

function accountDetail(db, u) {
  if (u.role === "teacher") {
    const t = db.teachers.find((x) => x.id === u.teacherId);
    return t ? `Teaches ${db.classes.find((c) => c.id === t.classId)?.name || "—"}` : "No staff record linked";
  }
  if (u.role === "pupil") {
    const p = [...db.pupils, ...(db.withdrawnPupils || [])].find((x) => x.id === u.pupilId);
    return p ? `${db.classes.find((c) => c.id === p.classId)?.name || "—"} · ${p.admissionNo}` : "No pupil linked";
  }
  if (u.role === "parent") {
    const names = (u.pupilIds || []).map((id) => [...db.pupils, ...(db.withdrawnPupils || [])].find((p) => p.id === id)?.name).filter(Boolean);
    return names.length ? `Parent of ${names.join(", ")}` : "No children linked";
  }
  return "—";
}

function AccountsView({ db, setModal, act }) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [error, setError] = useState("");
  const q = search.trim().toLowerCase();
  const list = db.users.filter((u) => (!roleFilter || u.role === roleFilter) && (!q || (u.username + " " + u.name).toLowerCase().includes(q)));

  const doAct = async (name, body, then) => {
    setError("");
    try {
      const r = await act(name, body);
      if (then) then(r);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <>
      <h1>User Accounts</h1>
      <p className="lead">Every login to the system. New accounts and password resets get a temporary password, which the person must change when they first sign in.</p>
      {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}
      <Panel
        title={`Accounts (${list.length}${list.length !== db.users.length ? ` of ${db.users.length}` : ""})`}
        action={
          <div className="row-actions" style={{ margin: 0 }}>
            <input className="audit-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search accounts…" />
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
              <option value="">All roles</option>
              {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button className="btn-primary btn-small" onClick={() => setModal({ type: "account" })}>Create account</button>
          </div>
        }
      >
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Details</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {list.map((u) => {
                const isActive = u.active !== false;
                const isSelf = u.id === db.me.id;
                const isLocked = !!u.locked;
                return (
                  <tr key={u.id}>
                    <td className="mono">{u.username}</td>
                    <td>{u.name}</td>
                    <td><Pill tone={u.role === "proprietor" ? "gold" : undefined}>{ROLE_LABELS[u.role]}</Pill></td>
                    <td className="muted">{accountDetail(db, u)}</td>
                    <td>
                      <Pill tone={isLocked ? "red" : isActive ? "gold" : "red"}>{isLocked ? "Locked" : isActive ? (u.mustChangePassword ? "Not signed in yet" : "Active") : "Disabled"}</Pill>
                    </td>
                    <td>
                      <div className="row-actions" style={{ margin: 0, gap: 6, flexWrap: "nowrap" }}>
                        {!isSelf && (
                          <button className="btn-ghost btn-small" onClick={() => doAct("resetPassword", { userId: u.id }, (r) => setModal({ type: "resetpwd", ...r }))}>Reset password</button>
                        )}
                        {isLocked && (
                          <button className="btn-ghost btn-small" onClick={() => doAct("unlockAccount", { userId: u.id })}>Unlock</button>
                        )}
                        {u.role === "parent" && (
                          <button className="btn-ghost btn-small" onClick={() => setModal({ type: "parentchildren", userId: u.id })}>Children</button>
                        )}
                        {isSelf ? (
                          <span className="muted" style={{ fontSize: 13.5, whiteSpace: "nowrap" }}>This is you</span>
                        ) : (
                          <button className="btn-ghost btn-small" onClick={() => doAct("toggleAccountActive", { userId: u.id })}>
                            {isActive ? "Disable" : "Enable"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function SettingsView({ db, act }) {
  const [sessionTimeout, setSessionTimeout] = useState(String(db.settings?.sessionTimeoutMinutes ?? 30));
  const [lockoutThreshold, setLockoutThreshold] = useState(String(db.settings?.lockoutThreshold ?? 5));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [restoreError, setRestoreError] = useState("");
  const [pendingRestore, setPendingRestore] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [restored, setRestored] = useState("");
  const [snapshots, setSnapshots] = useState(null);
  const fileInputRef = React.useRef(null);

  useEffect(() => {
    api.snapshots().then(setSnapshots).catch(() => setSnapshots([]));
  }, [restored]);

  const saveSecurityPolicy = async () => {
    setError("");
    const timeout = Math.max(1, Math.min(240, Number(sessionTimeout) || 30));
    const threshold = Math.max(1, Math.min(20, Number(lockoutThreshold) || 5));
    setSessionTimeout(String(timeout));
    setLockoutThreshold(String(threshold));
    try {
      await act("updateSettings", { patch: { sessionTimeoutMinutes: timeout, lockoutThreshold: threshold } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreError("");
    setRestored("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (parsed.format !== "sms-school-export" || !Array.isArray(parsed.pupils)) {
          setRestoreError("This file doesn't look like a backup downloaded from this system.");
          return;
        }
        setPendingRestore(parsed);
      } catch (err) {
        setRestoreError("Couldn't read that file. Make sure it's a backup downloaded from this system.");
      }
    };
    reader.readAsText(file);
  };

  const confirmRestore = async () => {
    setRestoring(true);
    setRestoreError("");
    try {
      const r = await act("restoreBackup", { data: pendingRestore });
      setRestored(`Restored ${r.pupils} pupils and ${r.teachers} staff. A copy of the data from just before the restore was kept in the backup list.`);
      setPendingRestore(null);
    } catch (e) {
      setRestoreError(e.message);
      setPendingRestore(null);
    } finally {
      setRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const REASONS = { daily: "Automatic daily backup", "before-restore": "Saved just before a restore" };

  return (
    <>
      <h1>Security &amp; Backups</h1>
      <p className="lead">Sign-in rules and data backups for {db.school.name}.</p>

      <Panel title="Security Policy">
        <div className="form-grid" style={{ marginBottom: 14 }}>
          <label>Session timeout (minutes of inactivity)
            <input type="number" min="1" max="240" value={sessionTimeout} onChange={(e) => setSessionTimeout(e.target.value)} />
          </label>
          <label>Account lockout threshold (failed sign-in attempts)
            <input type="number" min="1" max="20" value={lockoutThreshold} onChange={(e) => setLockoutThreshold(e.target.value)} />
          </label>
        </div>
        <p className="muted" style={{ fontSize: 14, marginBottom: 14 }}>
          Signed-in users are automatically signed out after this many minutes without activity.
          An account is locked after this many failed sign-in attempts in a row, and must be unlocked from User Accounts.
        </p>
        {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}
        <div className="modal-actions" style={{ justifyContent: "flex-start", marginTop: 0 }}>
          <button className="btn-primary" onClick={saveSecurityPolicy}>Save security policy</button>
          {saved && <span style={{ color: "var(--ink)", fontSize: 14.5, alignSelf: "center" }}>Saved.</span>}
        </div>
      </Panel>

      <Panel title="Backup & Restore">
        <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
          Download a full copy of every pupil, staff member, grade, payment and comment in your school. Keep it somewhere safe,
          such as a USB stick or your email. Restoring a backup replaces all school records with those in the file; user accounts and passwords are not changed.
        </p>
        <div className="row-actions" style={{ marginBottom: 0 }}>
          <a className="btn-primary btn-small" href="/api/export" download>Download backup now</a>
          <label className="btn-ghost btn-small" style={{ cursor: "pointer" }}>
            Restore from backup
            <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleFileSelect} style={{ display: "none" }} />
          </label>
        </div>
        {restoreError && <div className="form-error" style={{ marginTop: 12 }}>{restoreError}</div>}
        {restored && <div className="notice" style={{ marginTop: 12 }}>{restored}</div>}
      </Panel>

      <Panel title="Automatic backups">
        <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>The system saves a copy of your school's records every day and keeps the last 30 days.</p>
        {snapshots === null ? <p className="muted">Loading…</p> : snapshots.length === 0 ? <p className="muted">The first automatic backup is made within a day.</p> : (
          <table className="data-table">
            <thead><tr><th>When</th><th>Type</th><th></th></tr></thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id}>
                  <td>{formatTimestamp(s.createdAt)}</td>
                  <td className="muted">{REASONS[s.reason] || s.reason}</td>
                  <td><a className="btn-ghost btn-small" href={`/api/snapshots/${s.id}`} download>Download</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {pendingRestore && (
        <Modal title="Restore from Backup?" onClose={() => setPendingRestore(null)}>
          <p style={{ fontSize: 15, color: "var(--muted)", marginTop: 0 }}>
            This will replace <b style={{ color: "var(--ink)" }}>all current school records</b> (pupils, staff, grades, attendance, fees,
            payments, announcements and settings) with the contents of this file, saved on {formatTimestamp(pendingRestore.exportedAt)}.
            A copy of today's records is kept first, so this can be undone by restoring that copy.
          </p>
          <div className="notice">
            Backup contains {pendingRestore.pupils?.length ?? 0} pupils, {pendingRestore.teachers?.length ?? 0} staff and {pendingRestore.payments?.length ?? 0} payments.
          </div>
          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => setPendingRestore(null)}>Cancel</button>
            <button className="btn-primary" disabled={restoring} onClick={confirmRestore}>{restoring ? "Restoring…" : "Restore backup"}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function ResetPasswordModal({ username, name, tempPassword, onClose, created, schoolCode }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      /* clipboard unavailable: password is still shown on screen to copy manually */
    }
  };

  return (
    <Modal title={created ? "Account created" : "Temporary Password Issued"} onClose={onClose}>
      <p style={{ fontSize: 15, color: "var(--muted)", marginTop: 0 }}>
        {created ? "The account for " : "A new temporary password has been set for "}<b style={{ color: "var(--ink)" }}>{name}</b> is ready.
        Give them these details in person or by phone. They will be asked to choose their own password when they first sign in.
      </p>
      <div className="profile-grid" style={{ marginBottom: 12 }}>
        <div><span>School code</span><b className="mono">{schoolCode}</b></div>
        <div><span>Username</span><b className="mono">{username}</b></div>
      </div>
      <div className="temp-pwd-box">
        <span className="mono temp-pwd-value">{tempPassword}</span>
        <button type="button" className="btn-ghost btn-small" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <p className="muted" style={{ fontSize: 13.5 }}>This password is shown only once. If it is lost, reset it again.</p>
      <div className="modal-actions">
        <button className="btn-primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}

function CreateAccountModal({ db, onClose, onSave }) {
  const [role, setRole] = useState("teacher");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [pupilId, setPupilId] = useState("");
  const [classId, setClassId] = useState(db.classes[0]?.id || "");
  const [subjects, setSubjects] = useState([]);
  const [pupilIds, setPupilIds] = useState([]);
  const [childSearch, setChildSearch] = useState("");
  const { busy, error, setError, run } = useSave(null);

  const linkedTeachers = new Set(db.users.map((u) => u.teacherId).filter(Boolean));
  const linkedPupils = new Set(db.users.map((u) => u.pupilId).filter(Boolean));
  const freeTeachers = db.teachers.filter((t) => !linkedTeachers.has(t.id) && t.active !== false);
  const freePupils = db.pupils.filter((p) => !linkedPupils.has(p.id));

  const toggleSubject = (s) => setSubjects((cur) => cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]);
  const togglePupil = (id) => setPupilIds((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);

  const suggestUsername = (n) => {
    const parts = n.trim().toLowerCase().replace(/\b(mr|mrs|ms|miss|dr)\.?\s+/g, "").split(/\s+/).filter(Boolean);
    if (!parts.length) return "";
    return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1] : parts[0]).replace(/[^a-z0-9]/g, "");
  };

  // linking a record fills in the name
  const pickTeacher = (id) => { setTeacherId(id); const t = db.teachers.find((x) => x.id === id); if (t) setName(t.name); };
  const pickPupil = (id) => { setPupilId(id); const p = db.pupils.find((x) => x.id === id); if (p) setName(p.name); };

  const submit = () => {
    const uname = username.trim() || suggestUsername(name);
    if (!name.trim()) { setError("Enter a full name."); return; }
    if (!uname) { setError("Enter a username."); return; }
    if (db.users.some((u) => u.username.toLowerCase() === uname.toLowerCase())) { setError("That username is already taken."); return; }
    if (role === "parent" && pupilIds.length === 0) { setError("Select at least one child for this parent account."); return; }
    if (role === "pupil" && !pupilId) { setError("Choose the pupil this account belongs to. Register the pupil first if they are not listed."); return; }
    run(async () => {
      const r = await onSave({ role, name: name.trim(), username: uname, teacherId: teacherId || undefined, pupilId: pupilId || undefined, classId, subjects, pupilIds });
      onClose(r, name.trim());
    });
  };

  const q = childSearch.trim().toLowerCase();
  const childOptions = db.pupils.filter((p) => !q || p.name.toLowerCase().includes(q) || p.admissionNo.toLowerCase().includes(q) || (p.parentName || "").toLowerCase().includes(q));

  return (
    <Modal title="Create a New Account" onClose={() => onClose()} wide>
      <div className="form-grid">
        <label>Role
          <select value={role} onChange={(e) => { setRole(e.target.value); setTeacherId(""); setPupilId(""); }}>
            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>

        {role === "teacher" && (
          <label>Staff record
            <select value={teacherId} onChange={(e) => pickTeacher(e.target.value)}>
              <option value="">Create a new staff record</option>
              {freeTeachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        )}
        {role === "pupil" && (
          <label>Pupil
            <select value={pupilId} onChange={(e) => pickPupil(e.target.value)}>
              <option value="">Choose a registered pupil…</option>
              {freePupils.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.admissionNo}</option>)}
            </select>
          </label>
        )}

        <label>Full name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mrs. Adama Kargbo" disabled={!!teacherId || !!pupilId} />
        </label>
        <label>Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={suggestUsername(name) || "username"} autoCapitalize="none" />
        </label>

        {role === "teacher" && !teacherId && (
          <>
            <label>Class to teach
              <select value={classId} onChange={(e) => setClassId(e.target.value)}>
                {db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="form-span">Subjects taught
              <div className="check-row">
                {db.subjects.map((s) => (
                  <label key={s} className="check-chip">
                    <input type="checkbox" checked={subjects.includes(s)} onChange={() => toggleSubject(s)} /> {s}
                  </label>
                ))}
              </div>
            </label>
          </>
        )}

        {role === "parent" && (
          <label className="form-span">Children
            <input value={childSearch} onChange={(e) => setChildSearch(e.target.value)} placeholder="Search by pupil name, admission number or parent name" style={{ marginBottom: 8 }} />
            <div className="check-row">
              {childOptions.map((p) => (
                <label key={p.id} className="check-chip">
                  <input type="checkbox" checked={pupilIds.includes(p.id)} onChange={() => togglePupil(p.id)} /> {p.name}
                </label>
              ))}
            </div>
          </label>
        )}
      </div>
      <p className="muted" style={{ fontSize: 14 }}>A temporary password is created automatically and shown on the next screen.</p>
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="modal-actions">
        <button className="btn-ghost" onClick={() => onClose()}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? "Creating…" : "Create account"}</button>
      </div>
    </Modal>
  );
}

function ParentChildrenModal({ db, userId, onClose, onSave }) {
  const u = db.users.find((x) => x.id === userId);
  const [pupilIds, setPupilIds] = useState(u?.pupilIds || []);
  const [search, setSearch] = useState("");
  const { busy, error, run } = useSave(onClose);
  const q = search.trim().toLowerCase();
  const options = db.pupils.filter((p) => pupilIds.includes(p.id) || !q || p.name.toLowerCase().includes(q) || p.admissionNo.toLowerCase().includes(q));
  const toggle = (id) => setPupilIds((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  return (
    <Modal title={`Children linked to ${u?.name || ""}`} onClose={onClose} wide>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search pupils" style={{ marginBottom: 10, width: "100%" }} />
      <div className="check-row">
        {options.map((p) => (
          <label key={p.id} className="check-chip">
            <input type="checkbox" checked={pupilIds.includes(p.id)} onChange={() => toggle(p.id)} /> {p.name}
          </label>
        ))}
      </div>
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !pupilIds.length} onClick={() => run(() => onSave({ userId, pupilIds }))}>Save</button>
      </div>
    </Modal>
  );
}

function PhotoPicker({ photo, setPhoto, setError }) {
  const [camera, setCamera] = useState(false);
  const handlePhoto = async (e) => {
    try {
      setPhoto(await readImageFile(e.target.files?.[0]));
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="id-photo-row">
      <div className="id-photo-preview">
        {photo ? <img src={photo} alt="ID preview" /> : <span>No photo</span>}
      </div>
      <div className="id-photo-input">ID card photo (optional)
        <div className="photo-buttons">
          <label className="btn-ghost btn-small file-btn">
            <Icon name="upload" size={16} /> Upload
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={handlePhoto} />
          </label>
          <button type="button" className="btn-ghost btn-small btn-icon" onClick={() => setCamera(true)}><Icon name="camera" size={16} /> Take photo</button>
          {photo && <button type="button" className="btn-danger btn-small" onClick={() => setPhoto("")}>Remove</button>}
        </div>
      </div>
      {camera && <CameraModal onClose={() => setCamera(false)} onTaken={(dataUrl) => { setPhoto(dataUrl); setCamera(false); }} />}
    </div>
  );
}

/*
 * Take a photo with the computer's or phone's camera. The picture stays in the browser until the form is
 * saved; nothing is recorded or sent while the camera is on. Where the browser cannot use the camera,
 * the phone's own camera app is offered instead.
 */
function CameraModal({ onClose, onTaken }) {
  const videoRef = React.useRef(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState("user");

  useEffect(() => {
    let stream = null;
    let cancelled = false;
    setReady(false);
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot use the camera here. Use the phone camera button instead.");
      return undefined;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 960 }, height: { ideal: 960 } }, audio: false })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
        setReady(true);
      })
      .catch((e) => setError(e && e.name === "NotAllowedError"
        ? "Camera access was refused. Allow the camera for this site in the browser's settings, or use the phone camera button."
        : "No camera was found, or another app is using it. Use the phone camera button instead."));
    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    // a square from the middle, at most 600 pixels, like an uploaded photo
    const side = Math.min(v.videoWidth, v.videoHeight);
    const out = Math.min(600, side);
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (facing === "user") { ctx.translate(out, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, out, out);
    onTaken(canvas.toDataURL("image/jpeg", 0.85));
  };

  const fromPhoneCamera = async (e) => {
    try { onTaken(await readImageFile(e.target.files?.[0])); } catch (err) { setError(err.message); }
  };

  return (
    <Modal title="Take an ID card photo" onClose={onClose} wide>
      <div className="camera-frame">
        <video ref={videoRef} playsInline muted className={facing === "user" ? "mirrored" : ""} />
        {!ready && !error && <span className="camera-wait">Starting the camera…</span>}
      </div>
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      <p className="muted" style={{ fontSize: 14 }}>Centre the face in the square, in good light, then press Take photo.</p>
      <div className="modal-actions" style={{ flexWrap: "wrap" }}>
        <label className="btn-ghost file-btn">Use phone camera
          <input type="file" accept="image/*" capture="user" onChange={fromPhoneCamera} />
        </label>
        {ready && <button className="btn-ghost" onClick={() => setFacing(facing === "user" ? "environment" : "user")}>Switch camera</button>}
        <button className="btn-primary" disabled={!ready} onClick={capture}>Take photo</button>
      </div>
    </Modal>
  );
}

function RegisterPupilModal({ db, onClose, onSave, editId }) {
  const existing = editId ? [...db.pupils, ...(db.withdrawnPupils || [])].find((p) => p.id === editId) : null;
  const [name, setName] = useState(existing?.name || "");
  const [classId, setClassId] = useState(existing ? existing.classId || "" : db.classes[0]?.id || "");
  const [parentName, setParentName] = useState(existing?.parentName || "");
  const [termFee, setTermFee] = useState("");
  const [address, setAddress] = useState(existing?.address || "");
  const [telephone, setTelephone] = useState(existing?.telephone || "");
  const [dob, setDob] = useState(existing?.dob || "");
  const [placeOfBirth, setPlaceOfBirth] = useState(existing?.placeOfBirth || "");
  const [photo, setPhoto] = useState(existing?.photo || "");
  const [active, setActive] = useState(existing ? existing.active !== false : true);
  const suggested = existing ? existing.admissionNo : db.nextAdmissionNo || "";
  const [idNo, setIdNo] = useState(suggested);
  const { busy, error, setError, run } = useSave(null);

  const submit = () => {
    if (!name.trim()) { setError("Enter the pupil's full name."); return; }
    const body = {
      name: name.trim(), classId, parentName: parentName.trim(),
      address: address.trim(), telephone: telephone.trim(), dob, placeOfBirth: placeOfBirth.trim(), photo: photo || null,
      admissionNo: idNo.trim() || undefined,
    };
    run(async () => {
      if (existing) {
        await onSave({ ...body, id: existing.id, active });
        onClose(existing.id);
      } else {
        const r = await onSave({ ...body, termFee: Number(termFee) || 0 });
        onClose(r.id);
      }
    });
  };

  return (
    <Modal title={existing ? `Edit pupil — ${existing.admissionNo}` : "Register a New Pupil"} onClose={() => onClose()} wide>
      {!existing && (
        <p style={{ fontSize: 14.5, color: "var(--muted)", marginTop: 0 }}>
          This adds the pupil to school records. An ID number is suggested; keep it or type your own.
          To also give them a login, create an account for them afterwards from User Accounts.
        </p>
      )}
      <PhotoPicker photo={photo} setPhoto={setPhoto} setError={setError} />
      <div className="form-grid">
        <label className="form-span">Full name
          <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sallay Bangura" autoFocus />
        </label>
        <label>ID number (admission number)
          <div className="input-with-btn">
            <input value={idNo} maxLength={40} onChange={(e) => setIdNo(e.target.value)} placeholder={suggested || "e.g. TISL/2026/001"} className="mono" />
            {idNo !== suggested && suggested && <button type="button" className="btn-ghost btn-small" onClick={() => setIdNo(suggested)}>{existing ? "Undo" : "Use suggested"}</button>}
          </div>
        </label>
        <label>Class
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Unassigned</option>
            {db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {!existing && (
          <label>Term fee for {CURRENT_TERM} (optional)
            <input type="number" min="0" value={termFee} onChange={(e) => setTermFee(e.target.value)} placeholder="e.g. 3500" />
          </label>
        )}
        <label>Date of birth
          <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
        </label>
        <label>Place of birth
          <input value={placeOfBirth} onChange={(e) => setPlaceOfBirth(e.target.value)} placeholder="e.g. Bo, Sierra Leone" />
        </label>
        <label>Telephone (optional)
          <input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="e.g. +232 76 123456" />
        </label>
        <label>Parent / Guardian name (optional)
          <input value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder="e.g. Mrs. Adama Bangura" />
        </label>
        <label className="form-span">Address
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. 12 Wilkinson Road, Freetown" />
        </label>
        {existing && (
          <label className="form-span check-chip" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={!active} onChange={(e) => setActive(!e.target.checked)} />
            This pupil has left the school (withdrawn). Their records are kept but they no longer appear in class lists.
          </label>
        )}
      </div>
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="modal-actions">
        <button className="btn-ghost" onClick={() => onClose()}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : existing ? "Save changes" : "Register pupil"}</button>
      </div>
    </Modal>
  );
}

function RegisterStaffModal({ db, onClose, onSave, editId }) {
  const existing = editId ? db.teachers.find((t) => t.id === editId) : null;
  const [name, setName] = useState(existing?.name || "");
  const [classId, setClassId] = useState(existing ? existing.classId || "" : db.classes[0]?.id || "");
  const [subjects, setSubjects] = useState(existing?.subjects || []);
  const [address, setAddress] = useState(existing?.address || "");
  const [telephone, setTelephone] = useState(existing?.telephone || "");
  const [dob, setDob] = useState(existing?.dob || "");
  const [placeOfBirth, setPlaceOfBirth] = useState(existing?.placeOfBirth || "");
  const [qualifications, setQualifications] = useState(existing?.qualifications || "");
  const [photo, setPhoto] = useState(existing?.photo || "");
  const [active, setActive] = useState(existing ? existing.active !== false : true);
  const { busy, error, setError, run } = useSave(null);

  const toggleSubject = (s) => setSubjects((cur) => cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]);

  const submit = () => {
    if (!name.trim()) { setError("Enter the staff member's full name."); return; }
    const body = {
      name: name.trim(), classId, subjects,
      address: address.trim(), telephone: telephone.trim(), dob, placeOfBirth: placeOfBirth.trim(),
      qualifications: qualifications.trim(), photo: photo || null,
    };
    run(async () => {
      if (existing) {
        await onSave({ ...body, id: existing.id, active });
        onClose(existing.id);
      } else {
        const r = await onSave(body);
        onClose(r.id);
      }
    });
  };

  return (
    <Modal title={existing ? `Edit staff — ${existing.name}` : "Register New Staff"} onClose={() => onClose()} wide>
      {!existing && (
        <p style={{ fontSize: 14.5, color: "var(--muted)", marginTop: 0 }}>
          This adds the staff member to school records and assigns them to a class. No login is created.
          To also give them a login, create an account for them afterwards from User Accounts.
        </p>
      )}
      <PhotoPicker photo={photo} setPhoto={setPhoto} setError={setError} />
      <div className="form-grid">
        <label className="form-span">Full name
          <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mr. Alusine Kamara" autoFocus />
        </label>
        <label>Class to teach
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">No class</option>
            {db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Date of birth
          <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
        </label>
        <label>Place of birth
          <input value={placeOfBirth} onChange={(e) => setPlaceOfBirth(e.target.value)} placeholder="e.g. Bo, Sierra Leone" />
        </label>
        <label>Telephone (optional)
          <input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="e.g. +232 76 123456" />
        </label>
        <label className="form-span">Address
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. 12 Wilkinson Road, Freetown" />
        </label>
        <label className="form-span">Qualifications
          <input value={qualifications} onChange={(e) => setQualifications(e.target.value)} placeholder="e.g. B.Ed. Mathematics, Fourah Bay College" />
        </label>
        <label className="form-span">Subjects taught
          <div className="check-row">
            {db.subjects.map((s) => (
              <label key={s} className="check-chip">
                <input type="checkbox" checked={subjects.includes(s)} onChange={() => toggleSubject(s)} /> {s}
              </label>
            ))}
          </div>
        </label>
        {existing && (
          <label className="form-span check-chip" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={!active} onChange={(e) => setActive(!e.target.checked)} />
            This person has left the school.
          </label>
        )}
      </div>
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="modal-actions">
        <button className="btn-ghost" onClick={() => onClose()}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : existing ? "Save changes" : "Register staff"}</button>
      </div>
    </Modal>
  );
}

function formatDob(dob) {
  if (!dob) return "—";
  try {
    return new Date(dob + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  } catch (e) {
    return dob;
  }
}

function ProfileModal({ db, kind, id, onClose, onPrint, onEdit, justRegistered }) {
  const person = kind === "teacher" ? db.teachers.find((t) => t.id === id) : [...db.pupils, ...(db.withdrawnPupils || [])].find((p) => p.id === id);
  if (!person) return null;
  const cls = db.classes.find((c) => c.id === person.classId);

  const fields = [
    ["Class", cls?.name || "Unassigned"],
    ...(kind === "teacher" ? [["Subjects taught", person.subjects?.join(", ") || "—"]] : []),
    ...(kind === "pupil" ? [["Admission No.", person.admissionNo], ["Parent / Guardian", person.parentName || "—"]] : []),
    ["Date of birth", formatDob(person.dob)],
    ["Place of birth", person.placeOfBirth || "—"],
    ["Telephone", person.telephone || "—"],
    ["Address", person.address || "—"],
    ...(kind === "teacher" ? [["Qualifications", person.qualifications || "—"]] : []),
  ];

  return (
    <Modal title={person.name} onClose={onClose}>
      {justRegistered && (
        <div className="notice">
          {kind === "teacher" ? "Staff member saved." : "Pupil saved."} You can print their registration form now, or later from this profile.
        </div>
      )}
      {person.active === false && <div className="notice">{kind === "teacher" ? "This person has left the school." : "This pupil has been withdrawn."}</div>}
      {person.photo && (
        <div className="profile-photo-wrap">
          <img src={person.photo} alt={`${person.name} ID`} className="profile-photo" />
        </div>
      )}
      <div className="profile-grid">
        {fields.map(([label, value]) => (
          <div key={label}><span>{label}</span><b>{value}</b></div>
        ))}
      </div>
      <div className="modal-actions">
        {onEdit && <button className="btn-ghost" onClick={() => onEdit(kind, id)}>Edit</button>}
        <button className="btn-ghost" onClick={() => onPrint(kind, id)}>Print form</button>
        <button className="btn-primary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

function AcademicsOverview({ db, setModal }) {
  return (
    <>
      <h1>Academics</h1>
      <p className="lead">Total scores for {CURRENT_TERM}, {CURRENT_YEAR}. Open Pupil Reports from a row to read or comment on a report card.</p>
      {db.classes.map((c) => {
        const pupils = db.pupils.filter((p) => p.classId === c.id);
        return (
          <Panel key={c.id} title={`${c.name} (${pupils.length})`}>
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Pupil</th>{db.subjects.map((s) => <th key={s}>{s}</th>)}<th></th></tr></thead>
                <tbody>
                  {pupils.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      {db.subjects.map((s) => {
                        const g = db.grades[gradeKey(p.id, s)];
                        const total = g ? totalScore(g) : null;
                        return <td key={s}>{total === null ? <span className="muted">—</span> : total}</td>;
                      })}
                      <td><button className="btn-ghost btn-small" onClick={() => setModal({ type: "reportcard", pupilId: p.id })}>Report card</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        );
      })}
    </>
  );
}

function ReportCardModal({ db, pupilId, setModal, onClose, initialTerm, readOnly }) {
  const pupil = db.pupils.find((p) => p.id === pupilId);
  const [term, setTerm] = useState(initialTerm || CURRENT_TERM);
  if (!pupil) return null;
  const onEditComments = readOnly ? null : (t) => setModal({ type: "comments", ...t, back: { type: "reportcard", pupilId } });
  return (
    <Modal title={pupil.name} onClose={onClose} wide="xl">
      <div className="row-actions">
        <label className="inline-label">Term
          <select value={term} onChange={(e) => setTerm(e.target.value)}>
            {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
            <option value="combined">Combined (all terms)</option>
          </select>
        </label>
      </div>
      {term === "combined" ? <CombinedReportCard db={db} pupil={pupil} onEditComments={onEditComments} /> : <ReportCard db={db} pupil={pupil} term={term} onEditComments={onEditComments} />}
      <div className="modal-actions">
        <button className="btn-ghost" onClick={printModal}>Print report card</button>
        <button className="btn-primary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

const paidInFull = (f) => f.termFee > 0 && f.paid >= f.termFee;

/* A receipt for a pupil whose fees for the current term are fully paid: every payment, and the cleared balance. */
function PaidInFullReceipt({ db, pupilId, onClose }) {
  const pupil = db.pupils.find((p) => p.id === pupilId);
  if (!pupil) return null;
  const cls = db.classes.find((c) => c.id === pupil.classId);
  const fee = db.fees[pupilId] || { termFee: 0, paid: 0 };
  const payments = db.payments.filter((p) => p.pupilId === pupilId && p.term === CURRENT_TERM);
  const termNo = TERMS.indexOf(CURRENT_TERM) + 1;
  const ref = `PIF/${String(CURRENT_YEAR).slice(0, 4)}/T${termNo}/${pupil.admissionNo}`;
  return (
    <Modal title="Payment receipt" onClose={onClose} wide>
      <div className="receipt print-receipt">
        <DocHeader title={`Fees Receipt: Paid in Full · ${ref}`} />
        <div className="profile-grid">
          <div><span>Pupil</span><b>{pupil.name}</b></div>
          <div><span>ID / Admission No.</span><b>{pupil.admissionNo}</b></div>
          <div><span>Class</span><b>{cls?.name || "—"}</b></div>
          <div><span>For</span><b>{CURRENT_TERM}, {CURRENT_YEAR}</b></div>
          <div><span>Term fee</span><b>{money(fee.termFee)}</b></div>
          <div><span>Total paid</span><b>{money(fee.paid)}</b></div>
          <div><span>Balance</span><b>{money(Math.max(0, fee.termFee - fee.paid))}</b></div>
          <div><span>Date issued</span><b>{new Date().toISOString().slice(0, 10)}</b></div>
        </div>
        <table className="rc-table" style={{ marginTop: 18 }}>
          <thead><tr><th>Date</th><th>Receipt No.</th><th>Amount</th><th>Note</th></tr></thead>
          <tbody>
            {payments.length === 0 && <tr><td colSpan={4} className="rc-empty">No payments recorded this term.</td></tr>}
            {payments.map((p) => <tr key={p.id}><td>{p.date}</td><td className="mono">{p.receiptNo}</td><td>{money(p.amount)}</td><td>{p.note || "—"}</td></tr>)}
          </tbody>
        </table>
        <div className="paid-stamp">PAID IN FULL</div>
        <div className="rc-sign" style={{ marginTop: 22 }}>
          <div><div className="sig-line" /><span>Issued by ({db.me.name}, {db.me.title})</span></div>
          <div className="rc-stamp"><Seal size={52} /><span>Official Stamp</span></div>
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={printModal}>Print receipt</button>
        <button className="btn-primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}

function FinanceOverview({ db, setModal, allowRecord }) {
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [owingOnly, setOwingOnly] = useState(false);
  const [paidOnly, setPaidOnly] = useState(false);
  const collected = Object.values(db.fees).reduce((s, f) => s + f.paid, 0);
  const totalDue = Object.values(db.fees).reduce((s, f) => s + f.termFee, 0);
  const outstanding = totalDue - collected;
  const q = search.trim().toLowerCase();
  const rows = db.pupils.filter((p) => {
    const f = db.fees[p.id] || { termFee: 0, paid: 0 };
    if (owingOnly && f.termFee - f.paid <= 0) return false;
    if (paidOnly && !paidInFull(f)) return false;
    if (classFilter && p.classId !== classFilter) return false;
    return !q || p.name.toLowerCase().includes(q) || p.admissionNo.toLowerCase().includes(q);
  });
  return (
    <>
      <h1>Finance</h1>
      <p className="lead">Fees for {CURRENT_TERM}, {CURRENT_YEAR}.</p>
      <div className="stat-grid">
        <StatCard label="Fees Collected" value={money(collected)} tone="gold" />
        <StatCard label="Outstanding" value={money(outstanding)} tone={outstanding > 0 ? "red" : "gold"} />
        <StatCard label="Total Expected" value={money(totalDue)} />
      </div>
      <Panel
        title={`Pupil balances (${rows.length})`}
        action={
          <div className="row-actions" style={{ margin: 0 }}>
            <input className="audit-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search pupils…" />
            <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} aria-label="Filter by class">
              <option value="">All classes</option>
              {db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label className="check-chip" style={{ flexDirection: "row", gap: 6 }}><input type="checkbox" checked={owingOnly} onChange={(e) => { setOwingOnly(e.target.checked); setPaidOnly(false); }} /> Owing only</label>
            <label className="check-chip" style={{ flexDirection: "row", gap: 6 }}><input type="checkbox" checked={paidOnly} onChange={(e) => { setPaidOnly(e.target.checked); setOwingOnly(false); }} /> Paid in full</label>
            {allowRecord && <button className="btn-ghost btn-small" onClick={() => setModal({ type: "fee" })}>Set fees</button>}
            {allowRecord && <button className="btn-primary btn-small" onClick={() => setModal({ type: "payment" })}>Record payment</button>}
          </div>
        }
      >
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Pupil</th><th>Class</th><th>Term Fee</th><th>Paid</th><th>Balance</th><th></th></tr></thead>
            <tbody>
              {rows.map((p) => {
                const f = db.fees[p.id] || { termFee: 0, paid: 0 };
                const bal = f.termFee - f.paid;
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{db.classes.find((c) => c.id === p.classId)?.name || "—"}</td>
                    <td>{money(f.termFee)}</td>
                    <td>{money(f.paid)}</td>
                    <td><Pill tone={bal > 0 ? "red" : "gold"}>{money(bal)}</Pill></td>
                    <td>
                      <div className="row-actions" style={{ margin: 0, gap: 6, flexWrap: "nowrap" }}>
                        {paidInFull(f) && <button className="btn-primary btn-small" onClick={() => setModal({ type: "paidreceipt", pupilId: p.id })}>Payment receipt</button>}
                        {allowRecord && <button className="btn-ghost btn-small" onClick={() => setModal({ type: "fee", pupilId: p.id })}>Set fee</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function PaymentHistory({ db, setModal }) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const rows = db.payments.slice().reverse().filter((p) => {
    if (!q) return true;
    const pu = db.pupils.find((x) => x.id === p.pupilId);
    return ((pu?.name || "") + " " + (p.receiptNo || "") + " " + (p.note || "")).toLowerCase().includes(q);
  });
  return (
    <>
      <h1>Payment History</h1>
      <p className="lead">All payments recorded in {CURRENT_YEAR}.</p>
      <Panel
        title={`Payments (${rows.length})`}
        action={
          <div className="row-actions" style={{ margin: 0 }}>
            <input className="audit-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or receipt…" />
            <button className="btn-primary btn-small" onClick={() => setModal({ type: "payment" })}>Record payment</button>
          </div>
        }
      >
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Date</th><th>Receipt</th><th>Pupil</th><th>Term</th><th>Amount</th><th>Note</th><th>Recorded by</th></tr></thead>
            <tbody>
              {rows.map((p) => {
                const pu = db.pupils.find((x) => x.id === p.pupilId);
                return (
                  <tr key={p.id}>
                    <td>{p.date}</td>
                    <td className="mono">{p.receiptNo}</td>
                    <td>{pu?.name || <span className="muted">Former pupil</span>}</td>
                    <td>{p.term}</td>
                    <td>{money(p.amount)}</td>
                    <td>{p.note || "—"}</td>
                    <td className="muted">{p.recordedBy}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function BursarView({ db, view, setModal }) {
  if (view === "overview") return <FinanceOverview db={db} setModal={setModal} allowRecord />;
  if (view === "payments") return <PaymentHistory db={db} setModal={setModal} />;
  if (view === "announcements") return <AnnouncementsView db={db} />;
  return null;
}

function TeacherView({ db, view, setModal }) {
  const teacher = db.teachers.find((t) => t.id === db.me.teacherId);
  const cls = db.classes.find((c) => c.id === teacher?.classId);
  const pupils = db.pupils.filter((p) => p.classId === teacher?.classId);
  const [selectedPupil, setSelectedPupil] = useState(pupils[0]?.id || "");
  const [term, setTerm] = useState(CURRENT_TERM);

  if (!teacher || !cls) {
    if (view === "announcements") return <AnnouncementsView db={db} />;
    return (
      <>
        <h1>Welcome, {db.me.name}</h1>
        <Panel title="No class yet">
          <p className="muted" style={{ padding: "8px 0" }}>
            {teacher ? "You have not been assigned a class yet." : "Your account is not linked to a staff record yet."} Please ask the Proprietor to set this up.
          </p>
        </Panel>
        <Panel title="School announcements"><AnnouncementList db={db} limit={3} /></Panel>
      </>
    );
  }

  if (view === "overview") {
    return (
      <>
        <h1>{cls.name}: My Class</h1>
        <p className="lead">You teach {teacher.subjects.join(", ") || "no subjects yet"}. {CURRENT_TERM}, {CURRENT_YEAR}.</p>
        <div className="stat-grid">
          <StatCard label="Pupils" value={pupils.length} />
          <StatCard label="Subjects" value={teacher.subjects.length} />
        </div>
        <Panel title="Pupils" action={<button className="btn-primary btn-small" onClick={() => setModal({ type: "grades", classId: teacher.classId })}>Enter scores</button>}>
          <table className="data-table">
            <thead><tr><th>Name</th><th>Admission No.</th><th>Attendance</th></tr></thead>
            <tbody>
              {pupils.map((p) => {
                const a = db.attendance[p.id] || { present: 0, total: 0 };
                return <tr key={p.id}><td>{p.name}</td><td className="mono">{p.admissionNo}</td><td>{a.present}/{a.total}</td></tr>;
              })}
            </tbody>
          </table>
        </Panel>
        <Panel title="School announcements"><AnnouncementList db={db} limit={3} /></Panel>
      </>
    );
  }

  if (view === "grades") {
    const pupil = db.pupils.find((p) => p.id === selectedPupil) || pupils[0];
    const onEditComments = (t) => setModal({ type: "comments", ...t });
    return (
      <>
        <h1>Grades &amp; Report Cards</h1>
        <div className="row-actions">
          <label className="inline-label">Pupil
            <select value={pupil?.id || ""} onChange={(e) => setSelectedPupil(e.target.value)}>
              {pupils.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="inline-label">Term
            <select value={term} onChange={(e) => setTerm(e.target.value)}>
              {TERMS.map((t) => <option key={t} value={t}>{t}{t === CURRENT_TERM ? " (current)" : ""}</option>)}
              <option value="combined">Combined (all terms)</option>
            </select>
          </label>
          <button className="btn-primary btn-small" onClick={() => setModal({ type: "grades", classId: teacher.classId })}>Enter scores</button>
          <button className="btn-ghost btn-small" onClick={() => window.print()}>Print report card</button>
        </div>
        {pupil && (term === "combined"
          ? <CombinedReportCard db={db} pupil={pupil} onEditComments={onEditComments} />
          : <ReportCard db={db} pupil={pupil} term={term} onEditComments={onEditComments} />)}
      </>
    );
  }

  if (view === "attendance") {
    return (
      <>
        <h1>Attendance</h1>
        <p className="lead">{CURRENT_YEAR}{db.lastMarked[cls.id] ? `. Last marked ${db.lastMarked[cls.id]}.` : "."}</p>
        <Panel title={cls.name} action={<button className="btn-primary btn-small" onClick={() => setModal({ type: "attendance", classId: teacher.classId })}>Mark today's attendance</button>}>
          <table className="data-table">
            <thead><tr><th>Name</th><th>Present</th><th>Total days</th><th>Rate</th></tr></thead>
            <tbody>
              {pupils.map((p) => {
                const a = db.attendance[p.id] || { present: 0, total: 0 };
                const rate = a.total ? Math.round((a.present / a.total) * 100) : null;
                return <tr key={p.id}><td>{p.name}</td><td>{a.present}</td><td>{a.total}</td><td>{rate === null ? <span className="muted">—</span> : <Pill tone={rate < 80 ? "red" : "gold"}>{rate}%</Pill>}</td></tr>;
              })}
            </tbody>
          </table>
        </Panel>
      </>
    );
  }

  if (view === "questions") {
    const mySubmissions = db.questionSubmissions;
    const statusTone = { Pending: undefined, Reviewed: "gold", Approved: "gold", Rejected: "red" };
    return (
      <>
        <h1>Submit Questions</h1>
        <p className="lead">Send your exam questions to the Exam Officer for review.</p>
        <Panel title="My submissions" action={<button className="btn-primary btn-small" onClick={() => setModal({ type: "submitquestion" })}>Submit new question</button>}>
          {mySubmissions.length === 0 ? (
            <p className="muted" style={{ padding: "8px 0" }}>You haven't submitted any questions yet.</p>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Title</th><th>Subject</th><th>Marks</th><th>Submitted</th><th>Status</th><th>Exam Officer's comment</th></tr></thead>
                <tbody>
                  {mySubmissions.slice().reverse().map((q) => (
                    <tr key={q.id}>
                      <td>{q.title}</td>
                      <td>{q.subject}</td>
                      <td>{q.marks}</td>
                      <td className="muted">{formatTimestamp(q.submittedAt)}</td>
                      <td><Pill tone={statusTone[q.status]}>{q.status}</Pill></td>
                      <td className="muted">{q.comment || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </>
    );
  }
  if (view === "announcements") return <AnnouncementsView db={db} />;
  return null;
}

function AnnouncementList({ db, limit, onDelete }) {
  const list = limit ? db.announcements.slice(0, limit) : db.announcements;
  if (!list.length) return <p className="muted" style={{ padding: "8px 0" }}>No announcements yet.</p>;
  return (
    <ul className="announce-list">
      {list.map((a) => (
        <li key={a.id}>
          <div className="announce-meta"><b>{a.author}</b><time>{a.date}</time></div>
          <p>{a.text}</p>
          {onDelete && <button className="btn-ghost btn-small" onClick={() => onDelete(a)}>Delete</button>}
        </li>
      ))}
    </ul>
  );
}

function AnnouncementsView({ db, setModal, act, canPost }) {
  const onDelete = canPost && act ? (a) => { if (window.confirm("Delete this announcement?")) act("deleteAnnouncement", { id: a.id }).catch((e) => window.alert(e.message)); } : null;
  return (
    <>
      <h1>Announcements</h1>
      <Panel title="School announcements" action={canPost && <button className="btn-primary btn-small" onClick={() => setModal({ type: "announcement" })}>Post announcement</button>}>
        <AnnouncementList db={db} onDelete={onDelete} />
      </Panel>
    </>
  );
}

function ExamOfficerView({ db, view, setModal }) {
  const submissions = db.questionSubmissions || [];
  const statusTone = { Pending: undefined, Reviewed: "gold", Approved: "gold", Rejected: "red" };

  if (view === "overview") {
    const pending = submissions.filter((q) => q.status === "Pending").length;
    const approved = submissions.filter((q) => q.status === "Approved").length;
    const rejected = submissions.filter((q) => q.status === "Rejected").length;
    return (
      <>
        <h1>Exam Officer Dashboard</h1>
        <p className="lead">Question submissions from teachers. Current term: {CURRENT_TERM}, {CURRENT_YEAR}.</p>
        <div className="stat-grid">
          <StatCard label="Total Submissions" value={submissions.length} />
          <StatCard label="Pending Review" value={pending} tone={pending > 0 ? "red" : "gold"} />
          <StatCard label="Approved" value={approved} tone="gold" />
          <StatCard label="Rejected" value={rejected} />
        </div>
        <Panel title="Recent submissions">
          {submissions.length === 0 ? <p className="muted" style={{ padding: "8px 0" }}>No questions have been submitted yet.</p> : (
            <ul className="activity-list">
              {submissions.slice().reverse().slice(0, 5).map((q) => (
                <li key={q.id}>
                  <span>{q.title}: {q.teacherName} ({q.subject})</span>
                  <Pill tone={statusTone[q.status]}>{q.status}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </>
    );
  }

  if (view === "questions") {
    return (
      <>
        <h1>Question Submissions</h1>
        <Panel title={`All submissions (${submissions.length})`}>
          {submissions.length === 0 ? (
            <p className="muted" style={{ padding: "8px 0" }}>No questions have been submitted yet.</p>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Title</th><th>Teacher</th><th>Subject</th><th>Term</th><th>Marks</th><th>Submitted</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {submissions.slice().reverse().map((q) => (
                    <tr key={q.id}>
                      <td>{q.title}</td>
                      <td>{q.teacherName}</td>
                      <td>{q.subject}</td>
                      <td>{q.term} {q.year}</td>
                      <td>{q.marks}</td>
                      <td className="muted">{formatTimestamp(q.submittedAt)}</td>
                      <td><Pill tone={statusTone[q.status]}>{q.status}</Pill></td>
                      <td><button className="btn-ghost btn-small" onClick={() => setModal({ type: "reviewquestion", id: q.id })}>Review</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </>
    );
  }

  if (view === "reportcards") return <ReportCardsView db={db} setModal={setModal} />;
  if (view === "announcements") return <AnnouncementsView db={db} />;
  return null;
}

/* Exam Officer: every pupil who has marks, with a button to generate (view and print) their report card. */
function ReportCardsView({ db, setModal }) {
  const [classFilter, setClassFilter] = useState("");
  const [term, setTerm] = useState(CURRENT_TERM);
  const [search, setSearch] = useState("");
  const termsToCheck = term === "combined" ? TERMS : [term];
  const q = search.trim().toLowerCase();
  const rows = db.pupils
    .filter((p) => (!classFilter || p.classId === classFilter) && (!q || p.name.toLowerCase().includes(q) || p.admissionNo.toLowerCase().includes(q)))
    .map((p) => {
      const totals = [];
      for (const t of termsToCheck) for (const s of db.subjects) {
        const g = db.grades[gradeKey(p.id, s, t)];
        if (g) totals.push(totalScore(g));
      }
      return { p, subjects: totals.length, avg: totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null };
    });
  const withGrades = rows.filter((r) => r.subjects > 0);
  return (
    <>
      <h1>Report Cards</h1>
      <p className="lead">Generate, check and print the report card of any pupil with marks.</p>
      <div className="row-actions">
        <input className="audit-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search pupils…" />
        <label className="inline-label">Class
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="">All classes</option>
            {db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="inline-label">Term
          <select value={term} onChange={(e) => setTerm(e.target.value)}>
            {TERMS.map((t) => <option key={t} value={t}>{t}{t === CURRENT_TERM ? " (current)" : ""}</option>)}
            <option value="combined">Combined (all terms)</option>
          </select>
        </label>
      </div>
      <Panel title={`Pupils with marks (${withGrades.length} of ${rows.length})`}>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Pupil</th><th>ID No.</th><th>Class</th><th>Subjects marked</th><th>Average</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="rc-empty">No pupils match.</td></tr>}
              {rows.map(({ p, subjects, avg }) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="mono">{p.admissionNo}</td>
                  <td>{db.classes.find((c) => c.id === p.classId)?.name || "—"}</td>
                  <td>{subjects || <span className="muted">None yet</span>}</td>
                  <td>{avg === null ? "—" : avg.toFixed(1)}</td>
                  <td>{subjects > 0 && <button className="btn-primary btn-small" onClick={() => setModal({ type: "reportcard", pupilId: p.id, term, readOnly: true })}>Generate report card</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function QuestionReviewModal({ db, id, onClose, onReview }) {
  const q = db.questionSubmissions.find((x) => x.id === id);
  const [comment, setComment] = useState(q?.comment || "");
  const { busy, error, run } = useSave(onClose);
  if (!q) return null;

  const review = (status) => run(() => onReview({ id, status, comment: comment.trim() }));

  return (
    <Modal title={q.title} onClose={onClose} wide>
      <div className="profile-grid" style={{ marginBottom: 16 }}>
        <div><span>Teacher</span><b>{q.teacherName}</b></div>
        <div><span>Subject</span><b>{q.subject}</b></div>
        <div><span>Total Marks</span><b>{q.marks}</b></div>
        <div><span>Submitted</span><b>{formatTimestamp(q.submittedAt)}</b></div>
      </div>
      <div className="question-text">{q.content}</div>
      <label className="form-span">Comment (optional)
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Feedback for the teacher..." />
      </label>
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="modal-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
        <button className="btn-ghost" disabled={busy} onClick={printModal}>Print</button>
        <button className="btn-ghost" disabled={busy} onClick={() => review("Reviewed")}>Mark Reviewed</button>
        <button className="btn-ghost" disabled={busy} onClick={() => review("Rejected")}>Reject</button>
        <button className="btn-primary" disabled={busy} onClick={() => review("Approved")}>Approve</button>
      </div>
    </Modal>
  );
}

function PupilView({ db, view }) {
  const pupil = db.pupils.find((p) => p.id === db.me.pupilId);
  const cls = db.classes.find((c) => c.id === pupil?.classId);
  const att = db.attendance[pupil?.id] || { present: 0, total: 0 };
  const [term, setTerm] = useState(CURRENT_TERM);

  if (!pupil) {
    return (
      <>
        <h1>Welcome, {db.me.name}</h1>
        <Panel title="Not linked yet"><p className="muted" style={{ padding: "8px 0" }}>Your account is not linked to a pupil record yet. Please ask the school office.</p></Panel>
      </>
    );
  }

  if (view === "overview") {
    return (
      <>
        <h1>My Profile</h1>
        <Panel title={pupil.name}>
          <div className="profile-grid">
            <div><span>ID / Admission No.</span><b>{pupil.admissionNo}</b></div>
            <div><span>Class</span><b>{cls?.name}</b></div>
            <div><span>Attendance</span><b>{att.present}/{att.total} days</b></div>
            <div><span>Term</span><b>{CURRENT_TERM}, {CURRENT_YEAR}</b></div>
          </div>
        </Panel>
        <Panel title="School announcements"><AnnouncementList db={db} limit={3} /></Panel>
      </>
    );
  }
  if (view === "reportcard") {
    return (
      <>
        <h1>My Report Card</h1>
        <div className="row-actions">
          <label className="inline-label">Term
            <select value={term} onChange={(e) => setTerm(e.target.value)}>
              {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
              <option value="combined">Combined (all terms)</option>
            </select>
          </label>
          <button className="btn-primary btn-small" onClick={() => window.print()}>Print report card</button>
        </div>
        {term === "combined" ? <CombinedReportCard db={db} pupil={pupil} /> : <ReportCard db={db} pupil={pupil} term={term} />}
      </>
    );
  }
  return null;
}

function ParentView({ db, view }) {
  const children = db.pupils;
  const [selected, setSelected] = useState(children[0]?.id || "");
  const [term, setTerm] = useState(CURRENT_TERM);
  const child = db.pupils.find((p) => p.id === selected);
  const cls = db.classes.find((c) => c.id === child?.classId);
  const att = db.attendance[child?.id] || { present: 0, total: 0 };
  const fee = db.fees[child?.id] || { termFee: 0, paid: 0 };

  const ChildPicker = (
    <div className="row-actions">
      {children.map((c) => (
        <button key={c.id} className={"chip" + (selected === c.id ? " chip-on" : "")} onClick={() => setSelected(c.id)}>{c.name}</button>
      ))}
    </div>
  );

  if (!children.length) {
    return (
      <>
        <h1>My Children</h1>
        <Panel title="No children linked"><p className="muted" style={{ padding: "8px 0" }}>No pupils are linked to your account yet. Please ask the school office.</p></Panel>
      </>
    );
  }

  if (view === "overview") {
    return (
      <>
        <h1>My Children</h1>
        {ChildPicker}
        {child && (
          <>
            <Panel title={child.name}>
              <div className="profile-grid">
                <div><span>ID / Admission No.</span><b>{child.admissionNo}</b></div>
                <div><span>Class</span><b>{cls?.name}</b></div>
                <div><span>Attendance</span><b>{att.present}/{att.total} days</b></div>
                <div><span>Fee Balance ({CURRENT_TERM})</span><b><Pill tone={fee.termFee - fee.paid > 0 ? "red" : "gold"}>{money(fee.termFee - fee.paid)}</Pill></b></div>
              </div>
            </Panel>
            <Panel title="School announcements"><AnnouncementList db={db} limit={3} /></Panel>
          </>
        )}
      </>
    );
  }
  if (view === "reportcard") {
    return (
      <>
        <h1>Report Cards</h1>
        {ChildPicker}
        <div className="row-actions">
          <label className="inline-label">Term
            <select value={term} onChange={(e) => setTerm(e.target.value)}>
              {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
              <option value="combined">Combined (all terms)</option>
            </select>
          </label>
          <button className="btn-primary btn-small" onClick={() => window.print()}>Print report card</button>
        </div>
        {child && (term === "combined" ? <CombinedReportCard db={db} pupil={child} /> : <ReportCard db={db} pupil={child} term={term} />)}
      </>
    );
  }
  return null;
}

/* ================= App ================= */

const POLL_MS = 60 * 1000;

export default function App() {
  const [db, setDb] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | signedout | ready
  const [view, setView] = useState("overview");
  const [modal, setModal] = useState(null);
  const [printTarget, setPrintTarget] = useState(null);
  const [notice, setNotice] = useState("");
  const [loginBrand, setLoginBrand] = useState(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const etagRef = React.useRef(null);

  useEffect(() => {
    if (!printTarget) return;
    document.body.classList.add("printing-form");
    const t = setTimeout(() => window.print(), 60);
    const cleanup = () => {
      document.body.classList.remove("printing-form");
      setPrintTarget(null);
    };
    window.addEventListener("afterprint", cleanup, { once: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", cleanup);
    };
  }, [printTarget]);

  const signedOut = useCallback((message) => {
    etagRef.current = null;
    setDb(null);
    setModal(null);
    setChangingPassword(false);
    setView("overview");
    setStatus("signedout");
    if (message) setNotice(message);
  }, []);

  /* Load (or refresh) everything this person may see. `passive` = background refresh. */
  const load = useCallback(async ({ passive = false } = {}) => {
    try {
      const r = await api.data({ passive, etag: etagRef.current });
      setConnectionError("");
      if (r.notModified) return;
      etagRef.current = r.etag;
      applySchoolCalendar(r.data.settings);
      setDb(r.data);
      setStatus("ready");
    } catch (e) {
      // 403: this browser is signed in to platform administration, not to a school
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        signedOut(e.body && e.body.expired ? "You were signed out after a period of inactivity. Please sign in again." : "");
      } else if (passive) {
        setConnectionError("Can't reach the server right now. Your screen may be out of date; it will refresh when the connection returns.");
      } else {
        setConnectionError(e.message);
        setStatus((s) => (s === "loading" ? "signedout" : s));
      }
    }
  }, [signedOut]);

  useEffect(() => { load(); }, [load]);

  // keep the screen up to date with other people's changes
  useEffect(() => {
    if (status !== "ready") return;
    const id = setInterval(() => { if (!document.hidden) load({ passive: true }); }, POLL_MS);
    const onFocus = () => load({ passive: true });
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, [status, load]);

  /* Every change goes to the server; the screen then reloads from the server's copy. */
  const act = useCallback(async (name, body) => {
    try {
      const result = await api.action(name, body);
      await load();
      return result;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) signedOut("Your session has ended. Please sign in again.");
      throw e;
    }
  }, [load, signedOut]);

  const handleLogout = useCallback(async () => {
    await api.logout();
    signedOut("");
  }, [signedOut]);

  // sign out after the school's inactivity limit (the server enforces it too)
  const lastActivityRef = React.useRef(Date.now());
  const timeoutMinutes = db?.settings?.sessionTimeoutMinutes || 30;
  useEffect(() => {
    if (status !== "ready") return;
    lastActivityRef.current = Date.now();
    const markActive = () => { lastActivityRef.current = Date.now(); };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((ev) => window.addEventListener(ev, markActive, { passive: true }));
    const intervalId = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= timeoutMinutes * 60 * 1000) {
        api.logout();
        signedOut("You were signed out after a period of inactivity. Please sign in again.");
      }
    }, 5000);
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, markActive));
      clearInterval(intervalId);
    };
  }, [status, timeoutMinutes, signedOut]);

  const brand = db
    ? { code: db.school.code, name: db.school.name, motto: db.settings.motto, location: db.settings.location, logoUrl: db.school.logoUrl, colors: db.settings.colors }
    : loginBrand
      ? { code: loginBrand.code, name: loginBrand.name, motto: loginBrand.motto, location: loginBrand.location, logoUrl: loginBrand.logoUrl, colors: loginBrand.colors }
      : { code: "", name: APP_NAME, motto: "", location: "", logoUrl: APP_LOGO, colors: null };

  useEffect(() => {
    document.title = brand.name === APP_NAME ? brand.name : `${brand.name} — ${APP_NAME}`;
  }, [brand.name]);

  const close = () => setModal(null);
  const user = db?.me;
  const tempPassword = (r, name) => r && setModal({ type: "resetpwd", username: r.username, name, tempPassword: r.tempPassword, created: true });

  let page;
  if (status === "loading") {
    page = <div className="loading-screen"><Seal size={56} /><p>Loading school records…</p></div>;
  } else if (status === "signedout" || !db) {
    page = (
      <>
        {connectionError && <div className="conn-banner" role="alert">{connectionError}</div>}
        <LoginScreen onLoggedIn={() => { setNotice(""); return load(); }} notice={notice} onDismissNotice={() => setNotice("")} onBrand={setLoginBrand} />
      </>
    );
  } else if (user.mustChangePassword) {
    page = <ChangePasswordScreen db={db} forced onDone={() => load()} onLogout={handleLogout} />;
  } else {
    page = (
      <Shell user={user} view={view} setView={setView} onLogout={handleLogout} onChangePassword={() => setChangingPassword(true)}>
        {connectionError && <div className="conn-banner" role="alert">{connectionError}</div>}
        {user.role === "proprietor" && <ProprietorView db={db} view={view} setModal={setModal} act={act} />}
        {user.role === "principal" && <PrincipalView db={db} view={view} setModal={setModal} act={act} />}
        {user.role === "bursar" && <BursarView db={db} view={view} setModal={setModal} />}
        {user.role === "teacher" && <TeacherView db={db} view={view} setModal={setModal} />}
        {user.role === "pupil" && <PupilView db={db} view={view} />}
        {user.role === "parent" && <ParentView db={db} view={view} />}
        {user.role === "examofficer" && <ExamOfficerView db={db} view={view} setModal={setModal} />}
      </Shell>
    );
  }

  return (
    <SchoolContext.Provider value={brand}>
      <div className="dia-root" style={schoolColorVars(brand.colors)}>
        <style>{CSS}</style>
        {page}

        {db && status === "ready" && (
          <>
            {changingPassword && <ChangePasswordScreen db={db} onDone={() => { setChangingPassword(false); return load(); }} onCancel={() => setChangingPassword(false)} />}
            {modal?.type === "grades" && (
              <GradeEntryModal db={db} classId={modal.classId} onClose={close} onSave={(b) => act("saveGrade", b)} />
            )}
            {modal?.type === "attendance" && (
              <AttendanceModal db={db} classId={modal.classId} onClose={close} onSave={(b) => act("saveAttendance", b)} />
            )}
            {modal?.type === "payment" && (
              <PaymentModal db={db} onClose={close} onSave={(b) => act("recordPayment", b)} onReceipt={(receipt) => setModal({ type: "receipt", receipt })} />
            )}
            {modal?.type === "receipt" && <ReceiptModal db={db} receipt={modal.receipt} onClose={close} />}
            {modal?.type === "paidreceipt" && <PaidInFullReceipt db={db} pupilId={modal.pupilId} onClose={close} />}
            {modal?.type === "fee" && <FeeModal db={db} pupilId={modal.pupilId} onClose={close} onSave={(b) => act("setFee", b)} />}
            {modal?.type === "announcement" && (
              <AnnouncementModal onClose={close} onSave={(b) => act("postAnnouncement", b)} />
            )}
            {modal?.type === "registerpupil" && (
              <RegisterPupilModal db={db} editId={modal.editId} onSave={(b) => act(modal.editId ? "updatePupil" : "registerPupil", b)}
                onClose={(id) => setModal(id ? { type: "profile", kind: "pupil", id, justRegistered: true } : null)} />
            )}
            {modal?.type === "registerstaff" && (
              <RegisterStaffModal db={db} editId={modal.editId} onSave={(b) => act(modal.editId ? "updateStaff" : "registerStaff", b)}
                onClose={(id) => setModal(id ? { type: "profile", kind: "teacher", id, justRegistered: true } : null)} />
            )}
            {modal?.type === "profile" && (
              <ProfileModal
                db={db}
                kind={modal.kind}
                id={modal.id}
                justRegistered={modal.justRegistered}
                onClose={close}
                onPrint={(kind, id) => setPrintTarget({ kind, id })}
                onEdit={user.role === "proprietor" ? (kind, id) => setModal({ type: kind === "teacher" ? "registerstaff" : "registerpupil", editId: id }) : null}
              />
            )}
            {modal?.type === "account" && (
              <CreateAccountModal db={db} onClose={(r, name) => (r ? tempPassword(r, name) : close())} onSave={(b) => act("createAccount", b)} />
            )}
            {modal?.type === "parentchildren" && (
              <ParentChildrenModal db={db} userId={modal.userId} onClose={close} onSave={(b) => act("setParentChildren", b)} />
            )}
            {modal?.type === "resetpwd" && (
              <ResetPasswordModal username={modal.username} name={modal.name} tempPassword={modal.tempPassword} created={modal.created} schoolCode={db.school.code} onClose={close} />
            )}
            {modal?.type === "submitquestion" && (
              <SubmitQuestionModal db={db} onClose={close} onSave={(b) => act("submitQuestion", b)} />
            )}
            {modal?.type === "reviewquestion" && (
              <QuestionReviewModal db={db} id={modal.id} onClose={close} onReview={(b) => act("reviewQuestion", b)} />
            )}
            {modal?.type === "comments" && (
              <CommentsModal db={db} pupilId={modal.pupilId} term={modal.term} onClose={() => setModal(modal.back || null)} onSave={(b) => act("saveComment", b)} />
            )}
            {modal?.type === "reportcard" && (
              <ReportCardModal db={db} pupilId={modal.pupilId} setModal={setModal} onClose={close} initialTerm={modal.term} readOnly={modal.readOnly || user.role === "examofficer"} />
            )}
            {printTarget && (
              <div className="print-only-form">
                <RegistrationForm db={db} kind={printTarget.kind} id={printTarget.id} />
              </div>
            )}
          </>
        )}
      </div>
    </SchoolContext.Provider>
  );
}

/* ================= styles ================= */

export { Panel, Modal, Pill, Seal, StatCard, useSave, useSchool, formatTimestamp, money, CSS };

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600;700&display=swap');

/* Design: the school's colour is the "board" (sign-in background and menu);
   the work happens on white "paper". The open menu item is a paper tab joined to the page. */
.dia-root {
  --ink: #12355B;
  --ink-light: #1E4D80;
  --gold: #E9A23B;
  --gold-light: #F7D58B;
  --paper: #F2F5F9;
  --panel: #EDF2F8;
  --sage: #EAF0F7;
  --text: #17212E;
  --muted: #546273;
  --red: #B42318;
  --red-bg: #FDECEA;
  --gold-bg: #FDF1DC;
  --green: #1F7A4D;
  --green-bg: #E5F4EC;
  --royal-blue: #1E5BB8;
  --royal-blue-dark: #164795;
  --border: #D3DCE7;
  --line: #E7ECF2;
  --field: #C4CFDC;
  --board: var(--ink);
  --board-deep: color-mix(in srgb, var(--ink) 78%, #000);
  --on-board: #FFFFFF;
  --on-board-soft: rgba(255,255,255,0.74);
  --font: 'Lexend', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --r-sm: 8px;
  --r-md: 10px;
  --r-lg: 16px;
  --shadow: 0 1px 2px rgba(16,33,56,0.05);
  --shadow-pop: 0 24px 60px rgba(10,24,44,0.28);
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  font-family: var(--font);
  font-size: 17px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  color: var(--text);
  background: var(--paper);
  min-height: 100vh;
  min-height: 100dvh;
  font-variant-numeric: tabular-nums;
}
.dia-root * { box-sizing: border-box; }
.dia-root button, .dia-root input, .dia-root select, .dia-root textarea { font-family: var(--font); }
.dia-root h1, .dia-root h2, .dia-root h3 { letter-spacing: -0.01em; text-wrap: balance; }
.mono { font-family: var(--font); font-variant-numeric: tabular-nums; letter-spacing: 0.02em; font-weight: 500; }
.muted { color: var(--muted); }
.icon { flex-shrink: 0; }

/* ---------- sign-in: paper card on the school's board ---------- */
.login-screen { min-height: 100vh; min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 32px 20px;
  background:
    repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 34px),
    radial-gradient(120% 80% at 50% 0%, var(--board) 0%, var(--board-deep) 100%); }
.login-card { width: 100%; max-width: 460px; background: #fff; border-radius: var(--r-lg); padding: 36px 36px 30px; box-shadow: var(--shadow-pop); }
.login-brand { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 14px; margin-bottom: 28px; padding-bottom: 24px; border-bottom: 1px solid var(--line); }
.brand-name { font-weight: 700; font-size: 19px; color: #fff; background: var(--banner, var(--royal-blue)); letter-spacing: 0.02em; line-height: 1.3; padding: 7px 14px; border-radius: var(--r-sm); display: inline-block; }
.brand-sub { font-size: 15px; font-weight: 500; color: var(--muted); margin-top: 8px; text-align: center; }
.brand-motto { font-size: 14px; color: var(--ink); font-style: italic; margin-top: 8px; text-align: center; }
.login-form { display: flex; flex-direction: column; gap: 16px; }
.login-form label { display: flex; flex-direction: column; gap: 6px; font-size: 15px; color: var(--text); font-weight: 500; }
.login-form input { padding: 12px 14px; min-height: 48px; border: 1.5px solid var(--field); border-radius: var(--r-md); font-size: 16px; background: #fff; color: var(--text); }
.login-form .btn-primary { min-height: 50px; font-size: 16.5px; margin-top: 4px; }
.form-error { background: var(--red-bg); color: var(--red); font-size: 15px; padding: 10px 12px; border-radius: var(--r-sm); border-left: 4px solid var(--red); }

.loading-screen { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--muted); }
.seal-img { flex-shrink: 0; }

/* ---------- the menu (board) ---------- */
.shell { display: flex; min-height: 100vh; min-height: 100dvh; }
.sidebar { width: 272px; background: var(--board); color: var(--on-board); display: flex; flex-direction: column; padding: 24px 0 20px 16px; position: sticky; top: 0; height: 100vh; height: 100dvh; overflow-y: auto; flex-shrink: 0; transition: width 0.2s var(--ease-out); scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.25) transparent; }
.shell-collapsed .sidebar { width: 80px; padding: 24px 0 20px 12px; }
.sidebar-brand { display: flex; align-items: center; gap: 12px; padding: 0 16px 20px 4px; margin-bottom: 14px; border-bottom: 1px solid rgba(255,255,255,0.14); position: relative; }
.shell-collapsed .sidebar-brand { flex-direction: column; padding-right: 12px; }
.sb-name { font-weight: 600; font-size: 17.5px; color: var(--on-board); line-height: 1.25; }
.sb-motto { font-size: 13.5px; color: var(--gold); font-style: italic; margin-top: 4px; line-height: 1.3; }
.sb-sub { font-size: 13.5px; color: var(--on-board-soft); margin-top: 3px; }
.collapse-btn { position: absolute; right: 10px; top: -6px; width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.12); color: var(--on-board); border: none; font-size: 15px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.collapse-btn:hover { background: var(--gold); color: var(--board-deep); }
.shell-collapsed .collapse-btn { position: static; }
.sidebar nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.nav-item { position: relative; display: flex; align-items: center; gap: 12px; min-height: 44px; text-align: left; background: transparent; border: none; color: var(--on-board-soft); font-size: 16.5px; font-weight: 500; padding: 9px 14px; border-radius: var(--r-md) 0 0 var(--r-md); cursor: pointer; white-space: nowrap; overflow: hidden; }
.nav-item:hover { background: rgba(255,255,255,0.08); color: var(--on-board); }
.nav-active, .nav-active:hover { background: var(--paper); color: var(--ink); font-weight: 600; }
.nav-active::before { content: ""; position: absolute; left: 0; top: 10px; bottom: 10px; width: 4px; border-radius: 0 4px 4px 0; background: var(--gold); }
.nav-item .icon { opacity: 0.85; }
.nav-active .icon { opacity: 1; color: var(--ink); }
.shell-collapsed .nav-item { justify-content: center; padding: 10px; }
.nav-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.sidebar-foot { border-top: 1px solid rgba(255,255,255,0.14); margin-right: 16px; padding-top: 16px; margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.shell-collapsed .sidebar-foot { margin-right: 12px; align-items: center; }
.who { padding: 0 2px 4px; }
.who-name { font-size: 15.5px; color: var(--on-board); font-weight: 600; }
.who-role { font-size: 14px; color: var(--on-board-soft); }
.sidebar-foot .btn-ghost { color: var(--on-board); border-color: rgba(255,255,255,0.28); background: transparent; font-size: 15px; }
.sidebar-foot .btn-ghost:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.5); }
.sidebar-scrim { display: none; }
.mobile-menu-btn { display: none; }
.content-area { flex: 1; min-width: 0; }

/* ---------- page ---------- */
.content { padding: 40px 48px 56px; max-width: 1180px; }
.content h1 { font-size: 30px; font-weight: 600; color: var(--ink); margin: 0 0 6px; line-height: 1.2; }
.lead { color: var(--muted); margin: 0 0 28px; font-size: 16px; max-width: 70ch; }

/* figures */
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; margin-bottom: 28px; }
.stat-card { position: relative; background: #fff; border: 1px solid var(--border); border-radius: var(--r-lg); padding: 18px 20px 18px 24px; box-shadow: var(--shadow); }
.stat-card::before { content: ""; position: absolute; left: 0; top: 18px; width: 4px; height: 26px; border-radius: 0 4px 4px 0; background: var(--ink); }
.stat-gold::before { background: var(--gold); }
.stat-red::before { background: var(--red); }
.stat-label { font-size: 14.5px; color: var(--muted); margin-bottom: 8px; font-weight: 500; }
.stat-value { white-space: nowrap; font-size: clamp(22px, 2.1vw, 28px); font-weight: 600; color: var(--ink); line-height: 1.1; letter-spacing: -0.01em; }
.stat-red .stat-value { color: var(--red); }
.stat-sub { font-size: 13.5px; color: var(--muted); margin-top: 6px; }

/* panels */
.panel { background: #fff; border: 1px solid var(--border); border-radius: var(--r-lg); margin-bottom: 22px; overflow: hidden; box-shadow: var(--shadow); }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 16px 22px; border-bottom: 1px solid var(--line); background: #fff; }
.panel-head h3 { margin: 0; font-size: 18.5px; color: var(--ink); font-weight: 600; }
.panel-body { padding: 8px 22px 18px; }

/* tables: sentence-case headings, roomy rows */
.data-table { width: 100%; border-collapse: collapse; font-size: 15.5px; }
.data-table th { text-align: left; font-size: 14px; font-weight: 500; color: var(--muted); padding: 12px 10px; border-bottom: 1.5px solid var(--border); background: transparent; white-space: nowrap; }
.data-table td { padding: 12px 10px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.data-table tr:last-child td { border-bottom: none; }
.data-table tbody tr:hover td { background: #F6F9FC; }

.activity-list, .announce-list { list-style: none; margin: 0; padding: 0; }
.activity-list li { display: flex; justify-content: space-between; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--line); font-size: 15.5px; }
.activity-list li:last-child { border-bottom: none; }
.activity-list time { color: var(--muted); font-size: 14px; white-space: nowrap; }
.announce-list li { padding: 14px 0; border-bottom: 1px solid var(--line); }
.announce-list li:last-child { border-bottom: none; }
.announce-meta { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; color: var(--muted); margin-bottom: 6px; }
.announce-meta b { color: var(--ink); font-weight: 600; }
.announce-list p { margin: 0; font-size: 15.5px; line-height: 1.6; max-width: 75ch; }

/* pills / chips */
.pill { display: inline-block; padding: 3px 11px; border-radius: 999px; font-size: 13.5px; font-weight: 500; background: var(--sage); color: var(--ink); white-space: nowrap; }
.pill-gold { background: var(--gold-bg); color: #7A4F00; }
.pill-red { background: var(--red-bg); color: var(--red); }
.chip { border: 1px solid var(--field); background: #fff; padding: 7px 16px; min-height: 38px; border-radius: 999px; font-size: 14.5px; cursor: pointer; color: var(--text); }
.chip:hover { border-color: var(--ink); }
.chip-on, .chip-on:hover { background: var(--ink); color: #fff; border-color: var(--ink); }

/* buttons */
.btn-primary, .btn-ghost, .btn-danger { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 10px 18px; border-radius: var(--r-md); font-size: 15.5px; font-weight: 500; cursor: pointer; text-decoration: none; line-height: 1.2; touch-action: manipulation; }
.btn-primary { background: var(--ink); color: #fff; border: 1px solid var(--ink); font-weight: 600; }
.btn-primary:hover:not(:disabled) { background: var(--ink-light); border-color: var(--ink-light); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.login-form .btn-primary { background: var(--royal-blue); border-color: var(--royal-blue); }
.login-form .btn-primary:hover:not(:disabled) { background: var(--royal-blue-dark); border-color: var(--royal-blue-dark); }
.btn-ghost { background: #fff; border: 1px solid var(--field); color: var(--ink); }
.btn-ghost:hover { background: var(--sage); border-color: var(--ink); }
.btn-danger { background: #fff; border: 1px solid #EDB3AC; color: var(--red); }
.btn-danger:hover { background: var(--red-bg); border-color: var(--red); }
.btn-small, .btn-danger.btn-small { min-height: 38px; padding: 7px 14px; font-size: 14.5px; }
.btn-full { width: 100%; }
.btn-icon { display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.icon-btn { background: transparent; border: none; font-size: 17px; cursor: pointer; color: var(--muted); min-width: 40px; min-height: 40px; border-radius: var(--r-sm); display: inline-flex; align-items: center; justify-content: center; }
.icon-btn:hover { background: var(--sage); color: var(--ink); }
.row-actions { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; }
.inline-label { display: flex; align-items: center; gap: 8px; font-size: 15px; color: var(--muted); }
.text-link { color: var(--royal-blue); text-decoration: underline; text-decoration-color: rgba(30,91,184,0.35); text-underline-offset: 3px; font-weight: 500; }
.text-link:hover { text-decoration-color: currentColor; }
.link-btn { background: none; border: none; color: var(--royal-blue); font: inherit; cursor: pointer; padding: 0; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: rgba(30,91,184,0.35); }
.link-btn:hover { text-decoration-color: currentColor; }

/* fields */
:where(.dia-root) :where(input:not([type=checkbox], [type=radio], [type=file], [type=color], [type=range]), select, textarea) {
  min-height: 40px; padding: 7px 11px; border: 1.5px solid var(--field); border-radius: var(--r-md); font-size: 15.5px; background-color: #fff; color: var(--text); }
:where(.dia-root) :where(input:not([type=checkbox], [type=radio], [type=file], [type=color], [type=range]), select, textarea):focus { outline: none; border-color: var(--royal-blue); box-shadow: 0 0 0 3px rgba(30,91,184,0.2); }
:where(.dia-root) input[type=checkbox], :where(.dia-root) input[type=radio] { width: 18px; height: 18px; accent-color: var(--ink); vertical-align: -3px; }
.dia-root input[type=file] { font-size: 14.5px; color: var(--muted); }
.dia-root input[type=file]::file-selector-button { font-family: var(--font); font-size: 14.5px; font-weight: 500; color: var(--ink); background: #fff; border: 1px solid var(--field); border-radius: var(--r-sm); padding: 7px 14px; margin-right: 10px; cursor: pointer; }
.dia-root input[type=file]::file-selector-button:hover { background: var(--sage); border-color: var(--ink); }
.form-grid input, .form-grid select, .form-grid textarea, .modal-body input, .modal-body select, .modal-body textarea,
.setup-row input, .setup-grid input, .setup-grid select, .audit-search, .inline-label select {
  padding: 10px 12px; min-height: 44px; border: 1.5px solid var(--field); border-radius: var(--r-md); font-size: 16px; background: #fff; color: var(--text); transition: border-color 0.15s ease, box-shadow 0.15s ease; }
.form-grid textarea, .modal-body textarea { resize: vertical; line-height: 1.5; }
.modal-body input[type=checkbox], .modal-body input[type=radio], .modal-body input[type=color], .modal-body input[type=file] { min-height: 0; }
.form-grid input:focus, .form-grid select:focus, .form-grid textarea:focus, .modal-body input:focus, .modal-body select:focus, .modal-body textarea:focus,
.setup-row input:focus, .setup-grid input:focus, .setup-grid select:focus, .audit-search:focus, .inline-label select:focus, .login-form input:focus {
  outline: none; border-color: var(--royal-blue); box-shadow: 0 0 0 3px rgba(30,91,184,0.2); }
.dia-root :focus-visible { outline: 3px solid var(--royal-blue); outline-offset: 2px; }
.sidebar :focus-visible { outline-color: var(--gold); }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.form-span { grid-column: 1 / -1; }
.form-grid label, .modal-body > label { display: flex; flex-direction: column; gap: 6px; font-size: 15px; color: var(--text); font-weight: 500; }
.modal-body > label + label { margin-top: 14px; }
.audit-search { width: 220px; min-height: 40px; padding: 8px 12px; font-size: 15px; }
.inline-label select { min-height: 40px; padding: 7px 10px; font-size: 15px; }

/* pop-ups */
.modal-backdrop { position: fixed; inset: 0; background: rgba(10,24,44,0.55); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
.modal-card { background: #fff; border-radius: var(--r-lg); width: 100%; max-width: 440px; max-height: 92vh; max-height: 92dvh; overflow-y: auto; box-shadow: var(--shadow-pop); }
.modal-wide { max-width: 600px; }
.modal-xl { max-width: 900px; }
.modal-head { position: sticky; top: 0; z-index: 1; background: #fff; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 16px 14px 24px; border-bottom: 1px solid var(--line); }
.modal-head h3 { margin: 0; font-size: 19px; font-weight: 600; color: var(--ink); }
.modal-body { padding: 20px 24px 24px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--line); }
.calc-preview { display: flex; gap: 20px; flex-wrap: wrap; margin-top: 16px; padding: 14px 16px; background: var(--sage); border-radius: var(--r-md); font-size: 15.5px; align-items: center; }
.check-row { display: flex; flex-wrap: wrap; gap: 8px; }
.check-chip { flex-direction: row !important; align-items: center; gap: 8px !important; border: 1px solid var(--field); background: #fff; padding: 8px 12px; min-height: 40px; border-radius: 999px; font-size: 14.5px; color: var(--text) !important; font-weight: 400 !important; cursor: pointer; width: auto; }
.check-chip:hover { border-color: var(--royal-blue); }
.check-chip:has(input:checked) { background: var(--sage); border-color: var(--ink); font-weight: 500 !important; }
.check-chip input { width: 18px; height: 18px; min-height: 0 !important; padding: 0; accent-color: var(--ink); }
.id-photo-row { display: flex; align-items: center; gap: 16px; margin-bottom: 18px; padding: 14px; background: var(--sage); border-radius: var(--r-md); }
.id-photo-preview { width: 72px; height: 72px; border-radius: var(--r-md); background: #fff; border: 1.5px dashed var(--field); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
.id-photo-preview img { width: 100%; height: 100%; object-fit: cover; }
.id-photo-preview span { font-size: 12.5px; color: var(--muted); text-align: center; }
.id-photo-input { display: flex; flex-direction: column; gap: 6px; font-size: 15px; color: var(--text); font-weight: 500; }
.id-photo-input input { font-size: 14px; }
.profile-photo-wrap { display: flex; justify-content: center; margin-bottom: 18px; }
.profile-photo { width: 104px; height: 104px; border-radius: var(--r-md); object-fit: cover; border: 1px solid var(--border); }
.reg-form-body { display: flex; gap: 24px; align-items: flex-start; }
.reg-form-photo { flex-shrink: 0; width: 110px; height: 110px; border-radius: 6px; overflow: hidden; border: 1px solid var(--border); }
.reg-form-photo img { width: 100%; height: 100%; object-fit: cover; }
.reg-form-fields { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 14px 20px; }
.reg-form-field { display: flex; flex-direction: column; gap: 3px; }
.reg-form-field span { font-size: 10.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.4px; }
.reg-form-field b { font-size: 14px; color: var(--ink); }
.print-only-form { display: none; }
.notice { background: var(--gold-bg); color: #6B4500; font-size: 15px; padding: 10px 14px; border-radius: var(--r-sm); border-left: 4px solid var(--gold); margin-bottom: 14px; }
.temp-pwd-box { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; background: var(--sage); border: 1.5px dashed var(--ink); border-radius: var(--r-md); padding: 14px 16px; }
.temp-pwd-value { font-size: 20px; font-weight: 600; color: var(--ink); letter-spacing: 0.04em; }
.att-list { display: flex; flex-direction: column; gap: 4px; max-height: 360px; overflow-y: auto; }
.att-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 15.5px; }
.seg { display: flex; gap: 6px; flex-wrap: wrap; }
.seg button { border: 1px solid var(--field); background: #fff; padding: 6px 13px; min-height: 36px; border-radius: var(--r-sm); font-size: 14.5px; cursor: pointer; color: var(--text); }
.seg button:hover { border-color: var(--ink); }
.seg-on { background: var(--green-bg) !important; border-color: var(--green) !important; color: var(--green) !important; font-weight: 600; }
.seg-red.seg-on { background: var(--red-bg) !important; border-color: var(--red) !important; color: var(--red) !important; }

.profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 20px; }
.profile-grid div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.profile-grid span { font-size: 14px; color: var(--muted); }
.profile-grid b { font-size: 16.5px; color: var(--ink); font-weight: 600; overflow-wrap: anywhere; }

/* report card and receipts: printed documents, kept close to paper */
.report-card { background: #fff; border: 1px solid var(--border); border-radius: var(--r-md); padding: 30px; max-width: 780px; }
.rc-header { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid var(--ink); padding-bottom: 16px; margin-bottom: 18px; }
.rc-school { font-size: 21px; font-weight: 700; color: var(--ink); letter-spacing: 0.02em; }
.rc-tagline { font-size: 12px; color: var(--gold); font-style: italic; margin: 2px 0; }
.rc-doc { font-size: 12.5px; color: var(--muted); margin-top: 4px; }
.rc-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
.rc-meta div { display: flex; flex-direction: column; gap: 2px; }
.rc-meta span { font-size: 10.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.4px; }
.rc-meta b { font-size: 13.5px; color: var(--ink); }
.rc-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 18px; }
.rc-table th { background: var(--sage); text-align: left; padding: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; color: var(--ink); }
.rc-table td { padding: 8px; border-bottom: 1px solid var(--line); }
.rc-total { font-weight: 700; }
.rc-empty { text-align: center; color: var(--muted); padding: 20px; }
.rc-summary { display: flex; gap: 30px; margin-bottom: 20px; }
.rc-summary div { display: flex; flex-direction: column; gap: 2px; }
.rc-summary span { font-size: 10.5px; color: var(--muted); text-transform: uppercase; }
.rc-summary b { font-size: 18px; color: var(--ink); }
.rc-comments { display: flex; flex-direction: column; gap: 12px; margin-bottom: 26px; }
.rc-comments span { font-size: 11px; font-weight: 600; color: var(--ink); text-transform: uppercase; letter-spacing: 0.3px; }
.rc-comments p { margin: 4px 0 0; font-size: 13px; font-style: italic; color: var(--text); }
.rc-sign { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; }
.rc-sign > div { display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 1; }
.sig-line { width: 100%; border-bottom: 1px solid var(--muted); height: 34px; }
.rc-sign span { font-size: 10.5px; color: var(--muted); }
.rc-stamp { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 0; }

.conn-banner { background: var(--red-bg); color: var(--red); font-size: 15px; padding: 11px 16px; border-radius: var(--r-sm); border-left: 4px solid var(--red); margin-bottom: 14px; }
.login-screen + .conn-banner, .conn-banner + .login-screen { margin: 0; }
.table-scroll { width: 100%; overflow-x: auto; }
.question-text { background: var(--sage); border-radius: var(--r-md); padding: 14px 16px; white-space: pre-wrap; font-size: 15.5px; margin-bottom: 18px; line-height: 1.65; }
.setup-row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
.setup-row input { flex: 1; min-width: 0; }
.setup-row input.narrow { flex: 0 0 96px; }
.setup-row .icon-btn { flex-shrink: 0; }
.setup-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.setup-grid label { display: flex; flex-direction: column; gap: 6px; font-size: 15px; color: var(--text); font-weight: 500; }
.color-input { display: flex; gap: 8px; align-items: center; }
.color-input input[type=color] { width: 48px; height: 40px; min-height: 0; padding: 2px; border-radius: var(--r-sm); }
.saved-note { color: var(--green); font-size: 15px; font-weight: 500; align-self: center; }
.receipt { padding: 4px 0; }
.photo-buttons { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.file-btn { position: relative; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; }
.file-btn input[type=file] { position: absolute; inset: 0; opacity: 0; cursor: pointer; font-size: 0; width: 100%; }
.camera-frame { position: relative; width: 100%; aspect-ratio: 1 / 1; background: #0F1B2B; border-radius: var(--r-md); overflow: hidden; display: flex; align-items: center; justify-content: center; }
.camera-frame video { width: 100%; height: 100%; object-fit: cover; }
.camera-frame video.mirrored { transform: scaleX(-1); }
.camera-wait { position: absolute; color: #fff; font-size: 15px; }
.input-with-btn { display: flex; gap: 8px; align-items: center; }
.input-with-btn input { flex: 1; min-width: 0; }
.paid-stamp { display: inline-block; margin-top: 16px; padding: 6px 16px; border: 3px solid var(--green); color: var(--green); font-weight: 700; letter-spacing: 2px; border-radius: 8px; transform: rotate(-3deg); }
.save-row { display: flex; align-items: center; justify-content: flex-end; gap: 12px; flex-wrap: wrap; margin-top: 10px; }
.save-row .form-error { flex: 1; }
.platform-notice { display: flex; align-items: flex-start; gap: 10px; background: var(--gold-bg); border-left: 4px solid var(--gold); color: #5E3D00; padding: 12px 16px; border-radius: var(--r-sm); margin-bottom: 20px; font-size: 15.5px; line-height: 1.5; }
.platform-notice .icon { margin-top: 2px; color: #9A6200; }

/* ---------- motion: responses to what people do, plus one quiet page entrance ---------- */
.nav-item, .btn-primary, .btn-ghost, .btn-danger, .chip, .seg button, .check-chip, .collapse-btn, .icon-btn, .data-table td {
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease; }
.btn-primary:active:not(:disabled), .btn-ghost:active, .btn-danger:active, .chip:active, .seg button:active, .nav-item:active { transform: scale(0.98); }
.content { animation: page-in 0.32s var(--ease-out) both; }
.login-card { animation: page-in 0.4s var(--ease-out) both; }
.modal-backdrop { animation: fade-in 0.16s ease both; }
.modal-card { animation: pop-in 0.24s var(--ease-out) both; }
.platform-notice, .notice, .form-error { animation: fade-in 0.2s ease both; }
.pulse { animation: pulse 1.4s ease-in-out infinite; }
@keyframes page-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes pop-in { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(0.94); opacity: 0.75; } }
@media (prefers-reduced-motion: reduce) {
  .dia-root *, .dia-root *::before, .dia-root *::after { animation: none !important; transition: none !important; }
}

@media print {
  .no-print { display: none !important; }
  body.printing-modal .shell, body.printing-modal .login-screen { display: none !important; }
  body.printing-modal .modal-backdrop { display: block !important; position: static; background: none; padding: 0; }
  body.printing-modal .modal-card { max-width: none; max-height: none; overflow: visible; box-shadow: none; }
  body.printing-modal .modal-head, body.printing-modal .modal-actions, body.printing-modal .row-actions, body.printing-modal .modal-body > label, body.printing-modal .form-error { display: none !important; }
  body:not(.printing-modal) .modal-backdrop { display: none !important; }
  .sidebar, .row-actions, .mobile-menu-btn, .conn-banner { display: none !important; }
  .content { padding: 0; animation: none; }
  .shell { display: block; }
  .panel, .stat-card { box-shadow: none; }
  body.printing-form .shell { display: none !important; }
  body.printing-form .print-only-form { display: block !important; padding: 24px; }
}

@media (max-width: 860px) {
  .shell { display: block; }
  .sidebar { position: fixed; top: 0; left: 0; bottom: 0; height: auto; z-index: 40; width: 284px !important; padding: 24px 0 20px 16px !important; transform: translateX(-100%); transition: transform 0.24s var(--ease-out); }
  .sidebar-open { transform: translateX(0); box-shadow: 12px 0 40px rgba(0,0,0,0.3); }
  .shell-collapsed .sidebar-brand { flex-direction: row; }
  .collapse-btn { display: none; }
  .sidebar-scrim { display: block; position: fixed; inset: 0; background: rgba(10,24,44,0.5); z-index: 39; }
  .mobile-menu-btn { display: flex; align-items: center; gap: 10px; position: sticky; top: 0; z-index: 30; width: 100%; min-height: 56px; margin: 0; padding: 0 20px; padding-top: env(safe-area-inset-top); background: var(--board); color: var(--on-board); border: none; border-radius: 0; font-size: 17px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 10px rgba(10,24,44,0.18); }
  .content { padding: 22px 16px 40px; }
  .content h1 { font-size: 25px; }
  .lead { margin-bottom: 20px; }
  .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .stat-card { padding: 14px 14px 14px 18px; }
  .stat-card::before { top: 14px; }
  .stat-value { font-size: 22px; }
  .panel-head { padding: 14px 16px; }
  .panel-body { padding: 6px 16px 14px; }
  .panel-body { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .data-table th, .data-table td { padding: 10px 8px; white-space: nowrap; }
  .form-grid, .rc-meta, .profile-grid, .setup-grid, .reg-form-fields { grid-template-columns: 1fr; }
  .rc-meta { grid-template-columns: 1fr 1fr; }
  .report-card { padding: 16px; }
  .reg-form-body { flex-direction: column; }
  .audit-search { width: 100%; }
  .modal-backdrop { align-items: flex-end; padding: 0; }
  .modal-card, .modal-wide, .modal-xl { max-width: none; border-radius: var(--r-lg) var(--r-lg) 0 0; max-height: 94dvh; }
  .modal-head { padding: 14px 12px 12px 18px; }
  .modal-body { padding: 18px 18px calc(22px + env(safe-area-inset-bottom)); }
  .login-card { padding: 28px 22px 24px; }
}
`;
