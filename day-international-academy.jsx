import React, { useState, useEffect, useMemo, useCallback } from "react";

const SCHOOL_LOGO = "data:image/png;base64,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";

/* ============================================================
   THE INTERNATIONAL SCHOOL LTD — SCHOOL MANAGEMENT SYSTEM
   Working prototype. Data persists via window.storage (shared),
   so every role sees the same live school record.
   ============================================================ */

const DB_KEY = "dia-school-db-v1";

const SEED_USERS = [
  { id: "U1", username: "fred1", password: "Password@123!", role: "proprietor", name: "Mr. Fred Kamanda", title: "Proprietor" },
  { id: "U2", username: "principal1", password: "Password@123!", role: "principal", name: "Mrs. Grace Fofanah", title: "Principal" },
  { id: "U3", username: "bursar1", password: "Password@123!", role: "bursar", name: "Mr. Joseph Bangura", title: "Bursar" },
  { id: "U4", username: "teacher1", password: "Password@123!", role: "teacher", name: "Mrs. Aminata Sesay", title: "Class Teacher, JSS1", teacherId: "T1" },
  { id: "U5", username: "teacher2", password: "Password@123!", role: "teacher", name: "Mr. Samuel Koroma", title: "Class Teacher, JSS2", teacherId: "T2" },
  { id: "U8", username: "teacher3", password: "Password@123!", role: "teacher", name: "Mrs. Fatmata Bangura", title: "Class Teacher, JSS3", teacherId: "T3" },
  { id: "U9", username: "teacher4", password: "Password@123!", role: "teacher", name: "Mr. Ibrahim Kamara", title: "Class Teacher, SSS1", teacherId: "T4" },
  { id: "U10", username: "teacher5", password: "Password@123!", role: "teacher", name: "Mrs. Adama Conteh", title: "Class Teacher, SSS2", teacherId: "T5" },
  { id: "U11", username: "teacher6", password: "Password@123!", role: "teacher", name: "Mr. Foday Sesay", title: "Class Teacher, SSS3", teacherId: "T6" },
  { id: "U6", username: "pupil1", password: "Password@123!", role: "pupil", name: "Fatmata Kamara", title: "Pupil, JSS1", pupilId: "P1" },
  { id: "U7", username: "parent1", password: "Password@123!", role: "parent", name: "Mrs. Isatu Kamara", title: "Parent", pupilIds: ["P1", "P4"] },
  { id: "U12", username: "examofficer1", password: "Password@123!", role: "examofficer", name: "Mr. Alusine Turay", title: "Exam Officer" },
].map((u) => ({ ...u, active: true }));

const CURRENT_TERM = "Term 2";
const CURRENT_YEAR = "2025/2026";

function seedDB() {
  return {
    users: SEED_USERS,
    classes: [
      { id: "C1", name: "JSS1", teacherId: "T1" },
      { id: "C2", name: "JSS2", teacherId: "T2" },
      { id: "C3", name: "JSS3", teacherId: "T3" },
      { id: "C4", name: "SSS1", teacherId: "T4" },
      { id: "C5", name: "SSS2", teacherId: "T5" },
      { id: "C6", name: "SSS3", teacherId: "T6" },
    ],
    subjects: [
      "Biology", "Chemistry", "Physics", "Business Studies",
      "Religious Moral Education (RME)", "Physical Health Education (PHE)",
      "Cost Accounting", "Business Management", "Economics", "History",
    ],
    teachers: [
      { id: "T1", name: "Mrs. Aminata Sesay", classId: "C1", subjects: ["Religious Moral Education (RME)", "Physical Health Education (PHE)", "Business Studies"] },
      { id: "T2", name: "Mr. Samuel Koroma", classId: "C2", subjects: ["History", "Economics"] },
      { id: "T3", name: "Mrs. Fatmata Bangura", classId: "C3", subjects: ["Biology", "Chemistry"] },
      { id: "T4", name: "Mr. Ibrahim Kamara", classId: "C4", subjects: ["Physics", "Economics"] },
      { id: "T5", name: "Mrs. Adama Conteh", classId: "C5", subjects: ["Business Management", "Cost Accounting"] },
      { id: "T6", name: "Mr. Foday Sesay", classId: "C6", subjects: ["Economics", "History"] },
    ],
    pupils: [
      { id: "P1", name: "Fatmata Kamara", admissionNo: "TISL/2024/001", classId: "C1", parentName: "Mrs. Isatu Kamara" },
      { id: "P2", name: "Ibrahim Bangura", admissionNo: "TISL/2024/002", classId: "C1", parentName: "Mr. Alie Bangura" },
      { id: "P3", name: "Mariama Conteh", admissionNo: "TISL/2024/003", classId: "C2", parentName: "Mrs. Adama Conteh" },
      { id: "P4", name: "Abdul Sesay", admissionNo: "TISL/2024/004", classId: "C2", parentName: "Mrs. Isatu Kamara" },
      { id: "P5", name: "Isata Turay", admissionNo: "TISL/2024/005", classId: "C3", parentName: "Mr. Foday Turay" },
      { id: "P6", name: "Mohamed Kargbo", admissionNo: "TISL/2024/006", classId: "C4", parentName: "Mrs. Yeanoh Kargbo" },
      { id: "P7", name: "Aminata Koroma", admissionNo: "TISL/2024/007", classId: "C5", parentName: "Mr. Sorie Koroma" },
      { id: "P8", name: "Foday Kamara", admissionNo: "TISL/2024/008", classId: "C6", parentName: "Mrs. Isatu Kamara" },
    ],
    grades: {
      "P1|Religious Moral Education (RME)|Term 2|2025/2026": { classwork: 17, test1: 9, test2: 9, exam: 52 },
      "P1|Physical Health Education (PHE)|Term 2|2025/2026": { classwork: 16, test1: 9, test2: 8, exam: 55 },
      "P1|Business Studies|Term 2|2025/2026": { classwork: 18, test1: 10, test2: 9, exam: 58 },
      "P2|Religious Moral Education (RME)|Term 2|2025/2026": { classwork: 14, test1: 8, test2: 7, exam: 44 },
      "P2|Physical Health Education (PHE)|Term 2|2025/2026": { classwork: 15, test1: 7, test2: 7, exam: 46 },
      "P4|History|Term 2|2025/2026": { classwork: 19, test1: 9, test2: 9, exam: 56 },
      "P4|Economics|Term 2|2025/2026": { classwork: 17, test1: 9, test2: 8, exam: 50 },
      "P5|Biology|Term 2|2025/2026": { classwork: 15, test1: 8, test2: 8, exam: 47 },
      "P6|Physics|Term 2|2025/2026": { classwork: 16, test1: 8, test2: 7, exam: 49 },
      "P7|Business Management|Term 2|2025/2026": { classwork: 18, test1: 9, test2: 8, exam: 53 },
      "P8|Economics|Term 2|2025/2026": { classwork: 13, test1: 7, test2: 7, exam: 41 },
      "P1|Religious Moral Education (RME)|Term 1|2025/2026": { classwork: 15, test1: 8, test2: 8, exam: 48 },
      "P1|Physical Health Education (PHE)|Term 1|2025/2026": { classwork: 14, test1: 8, test2: 7, exam: 50 },
      "P1|Business Studies|Term 1|2025/2026": { classwork: 16, test1: 9, test2: 8, exam: 54 },
      "P2|Religious Moral Education (RME)|Term 1|2025/2026": { classwork: 12, test1: 7, test2: 6, exam: 40 },
      "P2|Physical Health Education (PHE)|Term 1|2025/2026": { classwork: 13, test1: 6, test2: 6, exam: 42 },
      "P4|History|Term 1|2025/2026": { classwork: 17, test1: 8, test2: 8, exam: 52 },
      "P4|Economics|Term 1|2025/2026": { classwork: 15, test1: 8, test2: 7, exam: 46 },
      "P5|Biology|Term 1|2025/2026": { classwork: 13, test1: 7, test2: 7, exam: 43 },
      "P6|Physics|Term 1|2025/2026": { classwork: 14, test1: 7, test2: 6, exam: 45 },
      "P7|Business Management|Term 1|2025/2026": { classwork: 16, test1: 8, test2: 7, exam: 49 },
      "P8|Economics|Term 1|2025/2026": { classwork: 11, test1: 6, test2: 6, exam: 37 },
    },
    attendance: {
      P1: { present: 46, total: 50 },
      P2: { present: 41, total: 50 },
      P3: { present: 48, total: 50 },
      P4: { present: 44, total: 50 },
      P5: { present: 39, total: 50 },
      P6: { present: 45, total: 50 },
      P7: { present: 47, total: 50 },
      P8: { present: 40, total: 50 },
    },
    lastMarked: {},
    fees: {
      P1: { termFee: 3500, paid: 3500 },
      P2: { termFee: 3500, paid: 1500 },
      P3: { termFee: 3500, paid: 3500 },
      P4: { termFee: 3200, paid: 3200 },
      P5: { termFee: 3200, paid: 800 },
      P6: { termFee: 3800, paid: 3800 },
      P7: { termFee: 3800, paid: 1900 },
      P8: { termFee: 4200, paid: 2000 },
    },
    payments: [
      { id: "PAY1", pupilId: "P1", amount: 3500, date: "2026-04-02", note: "Full term payment" },
      { id: "PAY2", pupilId: "P2", amount: 1500, date: "2026-04-05", note: "Part payment" },
      { id: "PAY3", pupilId: "P4", amount: 3200, date: "2026-04-01", note: "Full term payment" },
      { id: "PAY5", pupilId: "P5", amount: 800, date: "2026-04-10", note: "Part payment" },
      { id: "PAY6", pupilId: "P6", amount: 3800, date: "2026-04-03", note: "Full term payment" },
      { id: "PAY7", pupilId: "P7", amount: 1900, date: "2026-04-06", note: "Part payment" },
      { id: "PAY8", pupilId: "P8", amount: 2000, date: "2026-04-08", note: "Part payment" },
    ],
    announcements: [
      { id: "A1", author: "Mrs. Grace Fofanah (Principal)", date: "2026-08-03", text: "Mid-term examinations begin Monday 17th August. Teachers should submit CA scores by Friday 14th." },
      { id: "A2", author: "Mr. Fred Kamanda (Proprietor)", date: "2026-07-28", text: "School resumes for Term 2 on Monday 3rd August. Fees are due within the first two weeks of term." },
    ],
    gradeScale: [
      { min: 80, max: 100, grade: "A", remark: "Excellent" },
      { min: 70, max: 79, grade: "B", remark: "Very Good" },
      { min: 60, max: 69, grade: "C", remark: "Good" },
      { min: 50, max: 59, grade: "D", remark: "Pass" },
      { min: 0, max: 49, grade: "F", remark: "Fail" },
    ],
    auditLog: [
      { id: "AUD1", timestamp: "2026-08-03T08:12:00Z", actor: "Mrs. Grace Fofanah (Principal)", action: "Posted announcement", details: "Mid-term examinations begin Monday 17th August." },
      { id: "AUD2", timestamp: "2026-07-28T09:00:00Z", actor: "Mr. Fred Kamanda (Proprietor)", action: "Posted announcement", details: "School resumes for Term 2 on Monday 3rd August." },
      { id: "AUD3", timestamp: "2026-04-10T14:20:00Z", actor: "Mr. Joseph Bangura (Bursar)", action: "Recorded payment", details: "Le 800 from Isata Turay" },
    ],
    settings: {
      sessionTimeoutMinutes: 30,
      lockoutThreshold: 5,
    },
    questionSubmissions: [
      {
        id: "Q1", teacherId: "T1", teacherName: "Mrs. Aminata Sesay", subject: "Business Studies", classId: "C1",
        term: "Term 2", year: "2025/2026", title: "End of Term Test — Business Studies",
        content: "1. Define the term 'entrepreneur' and list three qualities of a successful entrepreneur.\n2. Explain the difference between a sole proprietorship and a partnership.\n3. State three functions of money.",
        marks: 30, status: "Pending", comment: "", submittedAt: "2026-08-05T10:00:00Z",
      },
      {
        id: "Q2", teacherId: "T4", teacherName: "Mr. Ibrahim Kamara", subject: "Physics", classId: "C4",
        term: "Term 2", year: "2025/2026", title: "Mid-Term Assessment — Physics",
        content: "1. State Newton's three laws of motion.\n2. A car accelerates from rest to 20m/s in 5 seconds. Calculate its acceleration.\n3. Define work done and state its SI unit.",
        marks: 40, status: "Approved", comment: "Well balanced paper. Approved for printing.", submittedAt: "2026-08-01T09:30:00Z",
      },
    ],
  };
}

function totalScore(g) {
  if (!g) return 0;
  return (g.classwork || 0) + (g.test1 || 0) + (g.test2 || 0) + (g.exam || 0);
}

function letterFor(total, scale) {
  const row = scale.find((r) => total >= r.min && total <= r.max) || scale[scale.length - 1];
  return row;
}

function withAudit(prev, actor, action, details) {
  const entry = {
    id: "AUD" + Date.now() + Math.random().toString(36).slice(2, 7),
    timestamp: new Date().toISOString(),
    actor,
    action,
    details,
  };
  return [entry, ...(prev.auditLog || [])].slice(0, 500);
}

function formatTimestamp(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return iso;
  }
}

function generateTempPassword() {
  const words = ["Blue", "Gold", "Star", "Palm", "Wave", "Cedar", "River", "Coral", "Amber", "Cove"];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  const symbols = ["!", "@", "#", "$"];
  const symbol = symbols[Math.floor(Math.random() * symbols.length)];
  return `${word}${num}${symbol}`;
}

function money(n) {
  return "Le " + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0 });
}

const TERMS = ["Term 1", "Term 2", "Term 3"];

function gradeKey(pupilId, subject, term = CURRENT_TERM) {
  return `${pupilId}|${subject}|${term}|${CURRENT_YEAR}`;
}

/* ---------------- storage helpers ---------------- */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

async function loadDB() {
  const defaults = seedDB();
  const backfill = (loaded) => {
    const merged = { ...defaults, ...loaded };
    merged.settings = { ...defaults.settings, ...(loaded.settings || {}) };
    merged.questionSubmissions = loaded.questionSubmissions || defaults.questionSubmissions;
    if (!merged.users.some((u) => u.role === "examofficer")) {
      const seedOfficer = SEED_USERS.find((u) => u.role === "examofficer");
      if (seedOfficer) merged.users = [...merged.users, seedOfficer];
    }
    return merged;
  };
  try {
    if (!window.storage || typeof window.storage.get !== "function") throw new Error("no storage");
    const res = await withTimeout(window.storage.get(DB_KEY, true), 4000);
    if (res && res.value) return backfill(JSON.parse(res.value));
    throw new Error("empty");
  } catch (e) {
    try {
      if (window.storage && typeof window.storage.set === "function") {
        await withTimeout(window.storage.set(DB_KEY, JSON.stringify(defaults), true), 4000);
      }
    } catch (e2) {
      /* ignore — app still works in-memory for this session */
    }
    return defaults;
  }
}

async function saveDB(db) {
  try {
    if (!window.storage || typeof window.storage.set !== "function") return;
    await withTimeout(window.storage.set(DB_KEY, JSON.stringify(db), true), 4000);
  } catch (e) {
    /* ignore — data still lives in this session's React state */
  }
}

/* ================= shared UI atoms ================= */

function Seal({ size = 46 }) {
  return (
    <img
      src={SCHOOL_LOGO}
      alt="The International School Ltd crest"
      width={size}
      height={Math.round(size * 1.2038)}
      className="seal-img"
      style={{ width: size, height: Math.round(size * 1.2038), objectFit: "contain", flexShrink: 0 }}
    />
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
      <div className={"modal-card" + (wide ? " modal-wide" : "")} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function Pill({ children, tone }) {
  return <span className={"pill" + (tone ? " pill-" + tone : "")}>{children}</span>;
}

/* ================= Report Card ================= */

function ReportCard({ db, pupil, term = CURRENT_TERM }) {
  const cls = db.classes.find((c) => c.id === pupil.classId);
  const classmates = db.pupils.filter((p) => p.classId === pupil.classId);

  const rows = db.subjects
    .map((subj) => {
      const g = db.grades[gradeKey(pupil.id, subj, term)];
      if (!g) return null;
      const total = totalScore(g);
      const grading = letterFor(total, db.gradeScale);
      return { subj, ...g, total, ...grading };
    })
    .filter(Boolean);

  const average = rows.length ? (rows.reduce((s, r) => s + r.total, 0) / rows.length).toFixed(1) : "—";

  const rankings = classmates
    .map((p) => {
      const pr = db.subjects
        .map((subj) => db.grades[gradeKey(p.id, subj, term)])
        .filter(Boolean)
        .map((g) => totalScore(g));
      const avg = pr.length ? pr.reduce((a, b) => a + b, 0) / pr.length : -1;
      return { id: p.id, avg };
    })
    .filter((r) => r.avg >= 0)
    .sort((a, b) => b.avg - a.avg);
  const position = rankings.findIndex((r) => r.id === pupil.id) + 1;
  const positionLabel = position > 0 ? `${position} of ${rankings.length}` : "Not yet ranked";

  const att = db.attendance[pupil.id] || { present: 0, total: 0 };

  return (
    <div className="report-card">
      <div className="rc-header">
        <Seal size={58} />
        <div className="rc-heading">
          <div className="rc-school">THE INTERNATIONAL SCHOOL LTD</div>
          <div className="rc-tagline">Knowledge · Excellence · Service</div>
          <div className="rc-doc">Pupil Report Card — {term}, {CURRENT_YEAR}</div>
        </div>
      </div>

      <div className="rc-meta">
        <div><span>Name</span><b>{pupil.name}</b></div>
        <div><span>Admission No.</span><b>{pupil.admissionNo}</b></div>
        <div><span>Class</span><b>{cls?.name}</b></div>
        <div><span>Attendance</span><b>{att.present}/{att.total} days</b></div>
      </div>

      <table className="rc-table">
        <thead>
          <tr>
            <th>Subject</th>
            <th>Classwork (20)</th>
            <th>Test 1 (10)</th>
            <th>Test 2 (10)</th>
            <th>Exam (60)</th>
            <th>Total (100)</th>
            <th>Grade</th>
            <th>Remark</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={8} className="rc-empty">No grades recorded for this term yet.</td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.subj}>
              <td>{r.subj}</td>
              <td>{r.classwork}</td>
              <td>{r.test1}</td>
              <td>{r.test2}</td>
              <td>{r.exam}</td>
              <td className="rc-total">{r.total}</td>
              <td><Pill tone={r.grade === "F" ? "red" : "gold"}>{r.grade}</Pill></td>
              <td>{r.remark}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="rc-summary">
        <div><span>Term Average</span><b>{average}</b></div>
        <div><span>Class Position</span><b>{positionLabel}</b></div>
      </div>

      <div className="rc-comments">
        <div><span>Class Teacher's Comment</span><p>A steady, encouraging term. Keep up consistent effort in every subject.</p></div>
        <div><span>Principal's Comment</span><p>Promoted to work harder next term. Well done.</p></div>
      </div>

      <div className="rc-sign">
        <div><div className="sig-line" /><span>Class Teacher's Signature</span></div>
        <div className="rc-stamp"><Seal size={64} /><span>Official Stamp</span></div>
        <div><div className="sig-line" /><span>Principal's Signature</span></div>
      </div>
    </div>
  );
}

function CombinedReportCard({ db, pupil }) {
  const cls = db.classes.find((c) => c.id === pupil.classId);
  const classmates = db.pupils.filter((p) => p.classId === pupil.classId);

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

  const rankings = classmates
    .map((p) => ({ id: p.id, avg: cumulativeAvg(p.id) }))
    .filter((r) => r.avg >= 0)
    .sort((a, b) => b.avg - a.avg);
  const position = rankings.findIndex((r) => r.id === pupil.id) + 1;
  const positionLabel = position > 0 ? `${position} of ${rankings.length}` : "Not yet ranked";

  const att = db.attendance[pupil.id] || { present: 0, total: 0 };

  return (
    <div className="report-card">
      <div className="rc-header">
        <Seal size={58} />
        <div className="rc-heading">
          <div className="rc-school">THE INTERNATIONAL SCHOOL LTD</div>
          <div className="rc-tagline">Knowledge · Excellence · Service</div>
          <div className="rc-doc">Cumulative Report Card — Term 1, Term 2 & Term 3, {CURRENT_YEAR}</div>
        </div>
      </div>

      <div className="rc-meta">
        <div><span>Name</span><b>{pupil.name}</b></div>
        <div><span>Admission No.</span><b>{pupil.admissionNo}</b></div>
        <div><span>Class</span><b>{cls?.name}</b></div>
        <div><span>Attendance</span><b>{att.present}/{att.total} days</b></div>
      </div>

      <table className="rc-table">
        <thead>
          <tr>
            <th>Subject</th>
            <th>Term 1</th>
            <th>Term 2</th>
            <th>Term 3</th>
            <th>Average</th>
            <th>Grade</th>
            <th>Remark</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={7} className="rc-empty">No grades recorded for this pupil in any term yet.</td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.subj}>
              <td>{r.subj}</td>
              {r.byTerm.map((v, i) => (
                <td key={i}>{v === null ? <span className="muted">—</span> : v}</td>
              ))}
              <td className="rc-total">{r.avg.toFixed(1)}</td>
              <td><Pill tone={r.grade === "F" ? "red" : "gold"}>{r.grade}</Pill></td>
              <td>{r.remark}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="rc-summary">
        <div><span>Overall Average</span><b>{overallAverage}</b></div>
        <div><span>Class Position</span><b>{positionLabel}</b></div>
      </div>

      <div className="rc-comments">
        <div><span>Class Teacher's Comment</span><p>A consistent year overall, with steady progress across the terms.</p></div>
        <div><span>Principal's Comment</span><p>Promoted to the next class. Well done.</p></div>
      </div>

      <div className="rc-sign">
        <div><div className="sig-line" /><span>Class Teacher's Signature</span></div>
        <div className="rc-stamp"><Seal size={64} /><span>Official Stamp</span></div>
        <div><div className="sig-line" /><span>Principal's Signature</span></div>
      </div>
    </div>
  );
}

function RegistrationForm({ db, kind, id }) {
  const person = kind === "teacher" ? db.teachers.find((t) => t.id === id) : db.pupils.find((p) => p.id === id);
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
      <div className="rc-header">
        <Seal size={58} />
        <div className="rc-heading">
          <div className="rc-school">THE INTERNATIONAL SCHOOL LTD</div>
          <div className="rc-tagline">Knowledge · Excellence · Service</div>
          <div className="rc-doc">{kind === "teacher" ? "Staff Registration Form" : "Pupil Registration Form"}</div>
        </div>
      </div>

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
        <div><span>Date Registered</span><b>{today}</b></div>
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

/* ================= Grade entry modal ================= */

function GradeEntryModal({ db, classId, onClose, onSave }) {
  const pupils = db.pupils.filter((p) => p.classId === classId);
  const teacher = db.teachers.find((t) => t.classId === classId);
  const subjects = teacher ? teacher.subjects : db.subjects;
  const [pupilId, setPupilId] = useState(pupils[0]?.id || "");
  const [subject, setSubject] = useState(subjects[0] || "");
  const existing = db.grades[gradeKey(pupilId, subject)];
  const [classwork, setClasswork] = useState(existing?.classwork ?? "");
  const [test1, setTest1] = useState(existing?.test1 ?? "");
  const [test2, setTest2] = useState(existing?.test2 ?? "");
  const [exam, setExam] = useState(existing?.exam ?? "");

  useEffect(() => {
    const g = db.grades[gradeKey(pupilId, subject)];
    setClasswork(g?.classwork ?? "");
    setTest1(g?.test1 ?? "");
    setTest2(g?.test2 ?? "");
    setExam(g?.exam ?? "");
  }, [pupilId, subject]); // eslint-disable-line

  const cw = Math.max(0, Math.min(20, Number(classwork) || 0));
  const t1 = Math.max(0, Math.min(10, Number(test1) || 0));
  const t2 = Math.max(0, Math.min(10, Number(test2) || 0));
  const ex = Math.max(0, Math.min(60, Number(exam) || 0));
  const total = cw + t1 + t2 + ex;
  const grading = letterFor(total, db.gradeScale);

  return (
    <Modal title="Enter Continuous Assessment & Exam Scores" onClose={onClose} wide>
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
        <label>Classwork / 20
          <input type="number" min="0" max="20" value={classwork} onChange={(e) => setClasswork(e.target.value)} />
        </label>
        <label>Test 1 / 10
          <input type="number" min="0" max="10" value={test1} onChange={(e) => setTest1(e.target.value)} />
        </label>
        <label>Test 2 / 10
          <input type="number" min="0" max="10" value={test2} onChange={(e) => setTest2(e.target.value)} />
        </label>
        <label>Examination / 60
          <input type="number" min="0" max="60" value={exam} onChange={(e) => setExam(e.target.value)} />
        </label>
      </div>
      <div className="calc-preview">
        <div>Total: <b>{total} / 100</b></div>
        <div>Grade: <Pill tone={grading.grade === "F" ? "red" : "gold"}>{grading.grade}</Pill></div>
        <div>Remark: <b>{grading.remark}</b></div>
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={() => { onSave(pupilId, subject, { classwork: cw, test1: t1, test2: t2, exam: ex }); onClose(); }}>
          Save score
        </button>
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

  return (
    <Modal title={`Mark Attendance — ${today}`} onClose={onClose}>
      {alreadyMarked && <div className="notice">Attendance for this class was already recorded today. Saving again will add another day's record.</div>}
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
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={() => { onSave(classId, statusMap, today); onClose(); }}>Save attendance</button>
      </div>
    </Modal>
  );
}

/* ================= Submit question modal ================= */

function SubmitQuestionModal({ db, teacherId, teacherName, onClose, onSave }) {
  const teacher = db.teachers.find((t) => t.id === teacherId);
  const subjects = teacher?.subjects?.length ? teacher.subjects : db.subjects;
  const [subject, setSubject] = useState(subjects[0] || "");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [marks, setMarks] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    if (!title.trim()) { setError("Give the question set a title."); return; }
    if (!content.trim()) { setError("Enter the exam questions."); return; }
    onSave({
      teacherId, teacherName, classId: teacher?.classId, subject,
      title: title.trim(), content: content.trim(), marks: Number(marks) || 0,
    });
    onClose();
  };

  return (
    <Modal title="Submit Exam Questions" onClose={onClose} wide>
      <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 0 }}>
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
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. End of Term Test — Mathematics" />
        </label>
        <label className="form-span">Questions
          <textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} placeholder={"1. ...\n2. ...\n3. ..."} />
        </label>
      </div>
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit}>Submit to Exam Officer</button>
      </div>
    </Modal>
  );
}

/* ================= Payment modal ================= */

function PaymentModal({ db, onClose, onSave }) {
  const [pupilId, setPupilId] = useState(db.pupils[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const fee = db.fees[pupilId] || { termFee: 0, paid: 0 };
  const balance = fee.termFee - fee.paid;

  return (
    <Modal title="Record a Fee Payment" onClose={onClose}>
      <div className="form-grid">
        <label>Pupil
          <select value={pupilId} onChange={(e) => setPupilId(e.target.value)}>
            {db.pupils.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.admissionNo}</option>)}
          </select>
        </label>
        <label>Amount ({money(0).split(" ")[0]})
          <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Balance owed: ${money(balance)}`} />
        </label>
        <label className="form-span">Note (optional)
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Part payment for Term 2" />
        </label>
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!amount || Number(amount) <= 0}
          onClick={() => { onSave(pupilId, Number(amount), note); onClose(); }}>
          Record payment
        </button>
      </div>
    </Modal>
  );
}

/* ================= Announcement modal ================= */

function AnnouncementModal({ author, onClose, onSave }) {
  const [text, setText] = useState("");
  return (
    <Modal title="Post an Announcement" onClose={onClose}>
      <label className="form-span">Message
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your announcement..." />
      </label>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!text.trim()} onClick={() => { onSave(text.trim()); onClose(); }}>Post</button>
      </div>
    </Modal>
  );
}

/* ================= Login screen ================= */

function LoginScreen({ db, onLogin, onAttempt, sessionExpiredNotice, onDismissNotice }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (sessionExpiredNotice) {
      const t = setTimeout(() => onDismissNotice(), 8000);
      return () => clearTimeout(t);
    }
  }, [sessionExpiredNotice]); // eslint-disable-line

  const submit = () => {
    const uname = username.trim();
    const byName = db.users.find((x) => x.username.toLowerCase() === uname.toLowerCase());

    if (!byName) { setError("Username or password is incorrect."); return; }

    if (byName.locked) {
      setError("This account has been locked after too many failed sign-in attempts. Please contact the Proprietor.");
      return;
    }

    const passwordOk = byName.password === password.trim();

    if (!passwordOk) {
      const result = onAttempt(byName.username, false);
      if (result?.justLocked) {
        setError("This account has been locked after too many failed sign-in attempts. Please contact the Proprietor.");
      } else {
        setError("Username or password is incorrect.");
      }
      return;
    }

    if (byName.active === false) { setError("This account has been disabled. Please contact the Proprietor."); return; }

    onAttempt(byName.username, true);
    setError("");
    onLogin(byName);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        {sessionExpiredNotice && (
          <div className="notice" style={{ marginBottom: 18 }}>
            You were signed out after a period of inactivity. Please sign in again.
          </div>
        )}
        <div className="login-brand">
          <Seal size={64} />
          <div>
            <div className="brand-name">THE INTERNATIONAL SCHOOL LTD</div>
            <div className="brand-motto">Knowledge · Excellence · Service</div>
            <div className="brand-sub">School Management System</div>
          </div>
        </div>
        <div className="login-form">
          <label>Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={onKeyDown} placeholder="e.g. fred1" autoFocus />
          </label>
          <label>Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onKeyDown} placeholder="Password" />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button type="button" className="btn-primary btn-full" onClick={submit}>Sign in</button>
        </div>
      </div>
    </div>
  );
}

/* ================= Layout shell ================= */

const NAV = {
  proprietor: [["overview", "Overview"], ["staff", "Staff"], ["pupils", "Pupils"], ["reports", "Pupil Reports"], ["staffreports", "Staff Reports"], ["finance", "Finance"], ["announcements", "Announcements"], ["accounts", "User Accounts"], ["schoolreports", "Reports"], ["auditlog", "Audit Log"], ["settings", "System Settings"]],
  principal: [["overview", "Overview"], ["staff", "Staff"], ["pupils", "Pupils"], ["academics", "Academics"], ["announcements", "Announcements"]],
  bursar: [["overview", "Overview"], ["payments", "Payments"]],
  teacher: [["overview", "My Class"], ["grades", "Grades & Report Cards"], ["attendance", "Attendance"], ["questions", "Submit Questions"]],
  pupil: [["overview", "My Profile"], ["reportcard", "My Report Card"]],
  parent: [["overview", "My Children"], ["reportcard", "Report Cards"]],
  examofficer: [["overview", "Overview"], ["questions", "Question Submissions"], ["announcements", "Announcements"]],
};

function Shell({ user, view, setView, onLogout, children }) {
  const items = NAV[user.role];
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const selectView = (key) => { setView(key); setMobileOpen(false); };

  return (
    <div className={"shell" + (collapsed ? " shell-collapsed" : "")}>
      {mobileOpen && <div className="sidebar-scrim" onClick={() => setMobileOpen(false)} />}
      <aside className={"sidebar" + (mobileOpen ? " sidebar-open" : "")}>
        <div className="sidebar-brand">
          <Seal size={40} />
          {!collapsed && (
            <div>
              <div className="sb-name">The International School</div>
              <div className="sb-motto">Knowledge · Excellence · Service</div>
              <div className="sb-sub">Ltd. · Freetown</div>
            </div>
          )}
          <button className="collapse-btn" onClick={() => setCollapsed((c) => !c)} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label="Toggle sidebar">
            {collapsed ? "»" : "«"}
          </button>
        </div>
        <nav>
          {items.map(([key, label]) => (
            <button key={key} className={"nav-item" + (view === key ? " nav-active" : "")} onClick={() => selectView(key)} title={collapsed ? label : undefined}>
              <span className="nav-dot" />
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
          <button className="btn-ghost btn-small" onClick={onLogout}>{collapsed ? "⎋" : "Sign out"}</button>
        </div>
      </aside>
      <div className="content-area">
        <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)} aria-label="Open menu">☰ Menu</button>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

/* ================= Role dashboards ================= */

function ProprietorView({ db, view, setModal, toggleActive, resetPassword, unlockAccount, updateSettings, restoreBackup, user }) {
  const totalPupils = db.pupils.length;
  const totalTeachers = db.teachers.length;
  const totalClasses = db.classes.length;
  const collected = db.payments.reduce((s, p) => s + p.amount, 0);
  const totalDue = Object.values(db.fees).reduce((s, f) => s + f.termFee, 0);
  const outstanding = totalDue - collected;

  if (view === "overview") {
    return (
      <>
        <h1>Proprietor Dashboard</h1>
        <p className="lead">School-wide overview for {CURRENT_TERM}, {CURRENT_YEAR}.</p>
        <div className="stat-grid">
          <StatCard label="Total Pupils" value={totalPupils} />
          <StatCard label="Total Teachers" value={totalTeachers} />
          <StatCard label="Classes" value={totalClasses} />
          <StatCard label="Fees Collected" value={money(collected)} tone="gold" />
          <StatCard label="Outstanding Fees" value={money(outstanding)} tone={outstanding > 0 ? "red" : "gold"} />
        </div>
        <Panel title="Recent activity">
          <ul className="activity-list">
            {db.payments.slice(-4).reverse().map((p) => {
              const pu = db.pupils.find((x) => x.id === p.pupilId);
              return <li key={p.id}><span>{money(p.amount)} received from {pu?.name}</span><time>{p.date}</time></li>;
            })}
          </ul>
        </Panel>
      </>
    );
  }
  if (view === "staff") return <StaffView db={db} setModal={setModal} />;
  if (view === "pupils") return <PupilsView db={db} setModal={setModal} />;
  if (view === "reports") return <PupilReportsView db={db} setModal={setModal} />;
  if (view === "staffreports") return <StaffReportsView db={db} setModal={setModal} />;
  if (view === "accounts") return <AccountsView db={db} setModal={setModal} toggleActive={toggleActive} resetPassword={resetPassword} unlockAccount={unlockAccount} currentUserId={user.id} />;
  if (view === "settings") return <SettingsView db={db} updateSettings={updateSettings} restoreBackup={restoreBackup} />;
  if (view === "schoolreports") return <SchoolReportsView db={db} />;
  if (view === "auditlog") return <AuditLogView db={db} />;
  if (view === "finance") return <FinanceOverview db={db} setModal={setModal} allowRecord={true} />;
  if (view === "announcements") return <AnnouncementsView db={db} setModal={setModal} canPost author="Mr. Fred Kamanda (Proprietor)" />;
  return null;
}

function PrincipalView({ db, view, setModal, user }) {
  if (view === "overview") {
    const submitted = db.classes.filter((c) =>
      db.pupils.filter((p) => p.classId === c.id).some((p) => db.subjects.some((s) => db.grades[gradeKey(p.id, s)]))
    ).length;
    const avgAttendance = Math.round(
      (Object.values(db.attendance).reduce((s, a) => s + a.present / a.total, 0) / Object.values(db.attendance).length) * 100
    );
    return (
      <>
        <h1>Principal Dashboard</h1>
        <p className="lead">Academic overview for {CURRENT_TERM}, {CURRENT_YEAR}.</p>
        <div className="stat-grid">
          <StatCard label="Total Pupils" value={db.pupils.length} />
          <StatCard label="Teachers" value={db.teachers.length} />
          <StatCard label="Classes" value={db.classes.length} />
          <StatCard label="Grades Submitted" value={`${submitted}/${db.classes.length} classes`} tone="gold" />
          <StatCard label="Avg. Attendance" value={`${avgAttendance}%`} />
        </div>
        <Panel title="Announcements">
          <AnnouncementList db={db} limit={3} />
        </Panel>
      </>
    );
  }
  if (view === "staff") return <StaffView db={db} />;
  if (view === "pupils") return <PupilsView db={db} />;
  if (view === "academics") return <AcademicsOverview db={db} />;
  if (view === "announcements") return <AnnouncementsView db={db} setModal={setModal} canPost author="Mrs. Grace Fofanah (Principal)" />;
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
                <td>{t.name}</td>
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
  const q = search.trim().toLowerCase();
  const filtered = db.pupils.filter((p) => {
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
        title={`Pupils (${filtered.length}${filtered.length !== db.pupils.length ? ` of ${db.pupils.length}` : ""})`}
        action={<input className="audit-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search pupils…" />}
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
        <Panel title={`${pupil.name} — Term 1, Term 2 & Term 3 at a glance`}>
          {allTermsRows.length === 0 ? (
            <p className="muted" style={{ padding: "8px 0" }}>No grades recorded for this pupil in any term yet.</p>
          ) : (
            <table className="data-table">
              <thead><tr><th>Subject</th><th>Term 1</th><th>Term 2</th><th>Term 3</th></tr></thead>
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

      {pupil && (term === "combined" ? <CombinedReportCard db={db} pupil={pupil} /> : <ReportCard db={db} pupil={pupil} term={term} />)}
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
  const collected = db.payments.reduce((s, p) => s + p.amount, 0);
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
    const att = pupils.map((p) => db.attendance[p.id]).filter(Boolean);
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
    return t ? `Teaches ${db.classes.find((c) => c.id === t.classId)?.name || "—"}` : "No class linked";
  }
  if (u.role === "pupil") {
    const p = db.pupils.find((x) => x.id === u.pupilId);
    return p ? `${db.classes.find((c) => c.id === p.classId)?.name || "—"} · ${p.admissionNo}` : "No pupil linked";
  }
  if (u.role === "parent") {
    const names = (u.pupilIds || []).map((id) => db.pupils.find((p) => p.id === id)?.name).filter(Boolean);
    return names.length ? `Parent of ${names.join(", ")}` : "No children linked";
  }
  return "—";
}

function AccountsView({ db, setModal, toggleActive, resetPassword, unlockAccount, currentUserId }) {
  return (
    <>
      <h1>User Accounts</h1>
      <p className="lead">Every login to the system — the Proprietor can create, view, enable or disable, unlock, and reset the password for any account.</p>
      <Panel title={`All accounts (${db.users.length})`} action={<button className="btn-primary btn-small" onClick={() => setModal({ type: "account" })}>Create account</button>}>
        <table className="data-table">
          <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Details</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {db.users.map((u) => {
              const isActive = u.active !== false;
              const isSelf = u.id === currentUserId;
              const isLocked = !!u.locked;
              return (
                <tr key={u.id}>
                  <td className="mono">{u.username}</td>
                  <td>{u.name}</td>
                  <td><Pill tone={u.role === "proprietor" ? "gold" : undefined}>{ROLE_LABELS[u.role]}</Pill></td>
                  <td className="muted">{accountDetail(db, u)}</td>
                  <td>
                    <Pill tone={isLocked ? "red" : isActive ? "gold" : "red"}>{isLocked ? "Locked" : isActive ? "Active" : "Disabled"}</Pill>
                  </td>
                  <td>
                    <div className="row-actions" style={{ margin: 0, gap: 6, flexWrap: "nowrap" }}>
                      <button className="btn-ghost btn-small" onClick={() => resetPassword(u.id)}>Reset password</button>
                      {isLocked && (
                        <button className="btn-ghost btn-small" onClick={() => unlockAccount(u.id)}>Unlock</button>
                      )}
                      {isSelf ? (
                        <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>This is you</span>
                      ) : (
                        <button className="btn-ghost btn-small" onClick={() => toggleActive(u.id)}>
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
      </Panel>
    </>
  );
}

function SettingsView({ db, updateSettings, restoreBackup }) {
  const [sessionTimeout, setSessionTimeout] = useState(String(db.settings?.sessionTimeoutMinutes ?? 30));
  const [lockoutThreshold, setLockoutThreshold] = useState(String(db.settings?.lockoutThreshold ?? 5));
  const [saved, setSaved] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const [pendingRestore, setPendingRestore] = useState(null);
  const fileInputRef = React.useRef(null);

  const saveSecurityPolicy = () => {
    const timeout = Math.max(1, Math.min(240, Number(sessionTimeout) || 30));
    const threshold = Math.max(1, Math.min(20, Number(lockoutThreshold) || 5));
    setSessionTimeout(String(timeout));
    setLockoutThreshold(String(threshold));
    updateSettings({ sessionTimeoutMinutes: timeout, lockoutThreshold: threshold });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const downloadBackup = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tisl-school-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreError("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.users || !parsed.pupils || !parsed.classes) {
          setRestoreError("This file doesn't look like a valid school backup.");
          return;
        }
        setPendingRestore(parsed);
      } catch (err) {
        setRestoreError("Couldn't read that file — make sure it's a backup exported from this system.");
      }
    };
    reader.readAsText(file);
  };

  const confirmRestore = () => {
    restoreBackup(pendingRestore);
    setPendingRestore(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <>
      <h1>System Settings</h1>
      <p className="lead">Security policy and data backup for the whole school system.</p>

      <Panel title="Security Policy">
        <div className="form-grid" style={{ marginBottom: 14 }}>
          <label>Session timeout (minutes of inactivity)
            <input type="number" min="1" max="240" value={sessionTimeout} onChange={(e) => setSessionTimeout(e.target.value)} />
          </label>
          <label>Account lockout threshold (failed sign-in attempts)
            <input type="number" min="1" max="20" value={lockoutThreshold} onChange={(e) => setLockoutThreshold(e.target.value)} />
          </label>
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
          Signed-in users are automatically signed out after this many minutes without activity.
          An account is locked after this many consecutive failed sign-in attempts, and must be unlocked from User Accounts.
        </p>
        <div className="modal-actions" style={{ justifyContent: "flex-start", marginTop: 0 }}>
          <button className="btn-primary" onClick={saveSecurityPolicy}>Save security policy</button>
          {saved && <span style={{ color: "var(--ink)", fontSize: 13, alignSelf: "center" }}>Saved.</span>}
        </div>
      </Panel>

      <Panel title="Backup & Restore">
        <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
          Download a full backup of every pupil, staff, account, grade, payment, and log in the system.
          Restoring a backup replaces all current data with the contents of the file.
        </p>
        <div className="row-actions" style={{ marginBottom: 0 }}>
          <button className="btn-primary btn-small" onClick={downloadBackup}>Download backup</button>
          <label className="btn-ghost btn-small" style={{ cursor: "pointer" }}>
            Restore from backup
            <input ref={fileInputRef} type="file" accept="application/json" onChange={handleFileSelect} style={{ display: "none" }} />
          </label>
        </div>
        {restoreError && <div className="form-error" style={{ marginTop: 12 }}>{restoreError}</div>}
      </Panel>

      {pendingRestore && (
        <Modal title="Restore from Backup?" onClose={() => setPendingRestore(null)}>
          <p style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 0 }}>
            This will replace <b style={{ color: "var(--ink)" }}>all current data</b> — every pupil, staff member, account,
            grade, payment, and log — with the contents of this backup file. This cannot be undone.
          </p>
          <div className="notice">
            Backup contains {pendingRestore.pupils?.length ?? 0} pupils, {pendingRestore.teachers?.length ?? 0} staff, and {pendingRestore.users?.length ?? 0} accounts.
          </div>
          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => setPendingRestore(null)}>Cancel</button>
            <button className="btn-primary" onClick={confirmRestore}>Restore backup</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function ResetPasswordModal({ username, name, tempPassword, onClose }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      /* clipboard unavailable — password is still shown on screen to copy manually */
    }
  };

  return (
    <Modal title="Temporary Password Issued" onClose={onClose}>
      <p style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 0 }}>
        A new temporary password has been set for <b style={{ color: "var(--ink)" }}>{name}</b> ({username}).
        Share it with them directly — they can sign in with it immediately.
      </p>
      <div className="temp-pwd-box">
        <span className="mono temp-pwd-value">{tempPassword}</span>
        <button type="button" className="btn-ghost btn-small" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
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
  const [password, setPassword] = useState("Password@123!");
  const [classId, setClassId] = useState(db.classes[0]?.id || "");
  const [subjects, setSubjects] = useState([]);
  const [pupilIds, setPupilIds] = useState([]);
  const [error, setError] = useState("");

  const toggleSubject = (s) => setSubjects((cur) => cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]);
  const togglePupil = (id) => setPupilIds((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);

  const suggestUsername = (n) => n.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";

  const submit = () => {
    const uname = username.trim() || suggestUsername(name);
    if (!name.trim()) { setError("Enter a full name."); return; }
    if (!uname) { setError("Enter a username."); return; }
    if (db.users.some((u) => u.username.toLowerCase() === uname.toLowerCase())) { setError("That username is already taken."); return; }
    if (!password.trim()) { setError("Enter a password."); return; }
    if (role === "parent" && pupilIds.length === 0) { setError("Select at least one child for this parent account."); return; }
    onSave({ role, name: name.trim(), username: uname, password: password.trim(), classId, subjects, pupilIds });
    onClose();
  };

  return (
    <Modal title="Create a New Account" onClose={onClose} wide>
      <div className="form-grid">
        <label>Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="proprietor">Proprietor</option>
            <option value="principal">Principal</option>
            <option value="bursar">Bursar</option>
            <option value="teacher">Teacher</option>
            <option value="pupil">Pupil</option>
            <option value="parent">Parent</option>
            <option value="examofficer">Exam Officer</option>
          </select>
        </label>
        <label>Full name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mrs. Adama Kargbo" />
        </label>
        <label>Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={suggestUsername(name) || "username"} />
        </label>
        <label>Password
          <input value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        {role === "teacher" && (
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

        {role === "pupil" && (
          <label>Class
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>
              {db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}

        {role === "parent" && (
          <label className="form-span">Children
            <div className="check-row">
              {db.pupils.map((p) => (
                <label key={p.id} className="check-chip">
                  <input type="checkbox" checked={pupilIds.includes(p.id)} onChange={() => togglePupil(p.id)} /> {p.name}
                </label>
              ))}
            </div>
          </label>
        )}
      </div>
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit}>Create account</button>
      </div>
    </Modal>
  );
}

function RegisterPupilModal({ db, onClose, onSave }) {
  const [name, setName] = useState("");
  const [classId, setClassId] = useState(db.classes[0]?.id || "");
  const [parentName, setParentName] = useState("");
  const [termFee, setTermFee] = useState("");
  const [address, setAddress] = useState("");
  const [telephone, setTelephone] = useState("");
  const [dob, setDob] = useState("");
  const [placeOfBirth, setPlaceOfBirth] = useState("");
  const [photo, setPhoto] = useState("");
  const [error, setError] = useState("");

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result);
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (!name.trim()) { setError("Enter the pupil's full name."); return; }
    onSave({
      name: name.trim(), classId, parentName: parentName.trim(), termFee: Number(termFee) || 0,
      address: address.trim(), telephone: telephone.trim(), dob, placeOfBirth: placeOfBirth.trim(), photo,
    });
  };

  return (
    <Modal title="Register a New Pupil" onClose={onClose} wide>
      <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 0 }}>
        This adds the pupil to school records — an admission number is generated automatically.
        To also give them a login, create an account for them afterwards from User Accounts.
      </p>
      <div className="id-photo-row">
        <div className="id-photo-preview">
          {photo ? <img src={photo} alt="ID preview" /> : <span>No photo</span>}
        </div>
        <label className="id-photo-input">ID card photo (optional)
          <input type="file" accept="image/*" onChange={handlePhoto} />
        </label>
      </div>
      <div className="form-grid">
        <label className="form-span">Full name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sallay Bangura" autoFocus />
        </label>
        <label>Class
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            {db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Term fee (optional)
          <input type="number" min="0" value={termFee} onChange={(e) => setTermFee(e.target.value)} placeholder="e.g. 3500" />
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
        <label>Parent / Guardian name (optional)
          <input value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder="e.g. Mrs. Adama Bangura" />
        </label>
        <label className="form-span">Address
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. 12 Wilkinson Road, Freetown" />
        </label>
      </div>
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit}>Register pupil</button>
      </div>
    </Modal>
  );
}

function RegisterStaffModal({ db, onClose, onSave }) {
  const [name, setName] = useState("");
  const [classId, setClassId] = useState(db.classes[0]?.id || "");
  const [subjects, setSubjects] = useState([]);
  const [address, setAddress] = useState("");
  const [telephone, setTelephone] = useState("");
  const [dob, setDob] = useState("");
  const [placeOfBirth, setPlaceOfBirth] = useState("");
  const [qualifications, setQualifications] = useState("");
  const [photo, setPhoto] = useState("");
  const [error, setError] = useState("");

  const toggleSubject = (s) => setSubjects((cur) => cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]);

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result);
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (!name.trim()) { setError("Enter the staff member's full name."); return; }
    onSave({
      name: name.trim(), classId, subjects,
      address: address.trim(), telephone: telephone.trim(), dob, placeOfBirth: placeOfBirth.trim(),
      qualifications: qualifications.trim(), photo,
    });
  };

  return (
    <Modal title="Register New Staff" onClose={onClose} wide>
      <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 0 }}>
        This adds the teacher to school records and assigns them to a class — no login is created.
        To also give them a login, create an account for them afterwards from User Accounts.
      </p>
      <div className="id-photo-row">
        <div className="id-photo-preview">
          {photo ? <img src={photo} alt="ID preview" /> : <span>No photo</span>}
        </div>
        <label className="id-photo-input">ID card photo (optional)
          <input type="file" accept="image/*" onChange={handlePhoto} />
        </label>
      </div>
      <div className="form-grid">
        <label className="form-span">Full name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mr. Alusine Kamara" autoFocus />
        </label>
        <label>Class to teach
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
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
      </div>
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit}>Register staff</button>
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

function ProfileModal({ db, kind, id, onClose, onPrint, justRegistered }) {
  const person = kind === "teacher" ? db.teachers.find((t) => t.id === id) : db.pupils.find((p) => p.id === id);
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
          {kind === "teacher" ? "Staff member registered." : "Pupil registered."} You can print their registration form now, or later from this profile.
        </div>
      )}
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
        <button className="btn-ghost" onClick={() => onPrint(kind, id)}>Print form</button>
        <button className="btn-primary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

function AcademicsOverview({ db }) {
  return (
    <>
      <h1>Academics</h1>
      {db.classes.map((c) => {
        const pupils = db.pupils.filter((p) => p.classId === c.id);
        return (
          <Panel key={c.id} title={c.name}>
            <table className="data-table">
              <thead><tr><th>Pupil</th>{db.subjects.map((s) => <th key={s}>{s}</th>)}</tr></thead>
              <tbody>
                {pupils.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    {db.subjects.map((s) => {
                      const g = db.grades[gradeKey(p.id, s)];
                      const total = g ? totalScore(g) : null;
                      return <td key={s}>{total === null ? <span className="muted">—</span> : total}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        );
      })}
    </>
  );
}

function FinanceOverview({ db, setModal, allowRecord }) {
  const collected = db.payments.reduce((s, p) => s + p.amount, 0);
  const totalDue = Object.values(db.fees).reduce((s, f) => s + f.termFee, 0);
  const outstanding = totalDue - collected;
  return (
    <>
      <h1>Finance</h1>
      <div className="stat-grid">
        <StatCard label="Fees Collected" value={money(collected)} tone="gold" />
        <StatCard label="Outstanding" value={money(outstanding)} tone={outstanding > 0 ? "red" : "gold"} />
        <StatCard label="Total Expected" value={money(totalDue)} />
      </div>
      <Panel title="Pupil balances" action={allowRecord && <button className="btn-primary btn-small" onClick={() => setModal({ type: "payment" })}>Record payment</button>}>
        <table className="data-table">
          <thead><tr><th>Pupil</th><th>Term Fee</th><th>Paid</th><th>Balance</th></tr></thead>
          <tbody>
            {db.pupils.map((p) => {
              const f = db.fees[p.id] || { termFee: 0, paid: 0 };
              const bal = f.termFee - f.paid;
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{money(f.termFee)}</td>
                  <td>{money(f.paid)}</td>
                  <td><Pill tone={bal > 0 ? "red" : "gold"}>{money(bal)}</Pill></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

function BursarView({ db, view, setModal }) {
  if (view === "overview") return <FinanceOverview db={db} setModal={setModal} allowRecord />;
  if (view === "payments") {
    return (
      <>
        <h1>Payment History</h1>
        <Panel title="All payments" action={<button className="btn-primary btn-small" onClick={() => setModal({ type: "payment" })}>Record payment</button>}>
          <table className="data-table">
            <thead><tr><th>Date</th><th>Pupil</th><th>Amount</th><th>Note</th></tr></thead>
            <tbody>
              {db.payments.slice().reverse().map((p) => {
                const pu = db.pupils.find((x) => x.id === p.pupilId);
                return <tr key={p.id}><td>{p.date}</td><td>{pu?.name}</td><td>{money(p.amount)}</td><td>{p.note || "—"}</td></tr>;
              })}
            </tbody>
          </table>
        </Panel>
      </>
    );
  }
  return null;
}

function TeacherView({ db, view, user, setModal }) {
  const teacher = db.teachers.find((t) => t.id === user.teacherId);
  const cls = db.classes.find((c) => c.id === teacher?.classId);
  const pupils = db.pupils.filter((p) => p.classId === teacher?.classId);
  const [selectedPupil, setSelectedPupil] = useState(pupils[0]?.id || "");

  if (view === "overview") {
    return (
      <>
        <h1>{cls?.name} — My Class</h1>
        <p className="lead">You teach {teacher?.subjects.join(", ")}.</p>
        <div className="stat-grid">
          <StatCard label="Pupils" value={pupils.length} />
          <StatCard label="Subjects" value={teacher?.subjects.length} />
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
      </>
    );
  }

  if (view === "grades") {
    const pupil = db.pupils.find((p) => p.id === selectedPupil);
    return (
      <>
        <h1>Grades & Report Cards</h1>
        <div className="row-actions">
          <label className="inline-label">Pupil
            <select value={selectedPupil} onChange={(e) => setSelectedPupil(e.target.value)}>
              {pupils.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <button className="btn-primary btn-small" onClick={() => setModal({ type: "grades", classId: teacher.classId })}>Enter scores</button>
          <button className="btn-ghost btn-small" onClick={() => window.print()}>Print report card</button>
        </div>
        {pupil && <ReportCard db={db} pupil={pupil} />}
      </>
    );
  }

  if (view === "attendance") {
    return (
      <>
        <h1>Attendance</h1>
        <Panel title={cls?.name} action={<button className="btn-primary btn-small" onClick={() => setModal({ type: "attendance", classId: teacher.classId })}>Mark today's attendance</button>}>
          <table className="data-table">
            <thead><tr><th>Name</th><th>Present</th><th>Total days</th><th>Rate</th></tr></thead>
            <tbody>
              {pupils.map((p) => {
                const a = db.attendance[p.id] || { present: 0, total: 0 };
                const rate = a.total ? Math.round((a.present / a.total) * 100) : 0;
                return <tr key={p.id}><td>{p.name}</td><td>{a.present}</td><td>{a.total}</td><td><Pill tone={rate < 80 ? "red" : "gold"}>{rate}%</Pill></td></tr>;
              })}
            </tbody>
          </table>
        </Panel>
      </>
    );
  }

  if (view === "questions") {
    const mySubmissions = db.questionSubmissions.filter((q) => q.teacherId === teacher?.id);
    const statusTone = { Pending: undefined, Reviewed: "gold", Approved: "gold", Rejected: "red" };
    return (
      <>
        <h1>Submit Questions</h1>
        <p className="lead">Send your exam questions to the Exam Officer for review.</p>
        <Panel title="My submissions" action={<button className="btn-primary btn-small" onClick={() => setModal({ type: "submitquestion", teacherId: teacher.id, teacherName: teacher.name })}>Submit new question</button>}>
          {mySubmissions.length === 0 ? (
            <p className="muted" style={{ padding: "8px 0" }}>You haven't submitted any questions yet.</p>
          ) : (
            <table className="data-table">
              <thead><tr><th>Title</th><th>Subject</th><th>Marks</th><th>Submitted</th><th>Status</th></tr></thead>
              <tbody>
                {mySubmissions.slice().reverse().map((q) => (
                  <tr key={q.id}>
                    <td>{q.title}</td>
                    <td>{q.subject}</td>
                    <td>{q.marks}</td>
                    <td className="muted">{formatTimestamp(q.submittedAt)}</td>
                    <td><Pill tone={statusTone[q.status]}>{q.status}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </>
    );
  }
  return null;
}

function AnnouncementList({ db, limit }) {
  const list = limit ? db.announcements.slice(0, limit) : db.announcements;
  return (
    <ul className="announce-list">
      {list.map((a) => (
        <li key={a.id}>
          <div className="announce-meta"><b>{a.author}</b><time>{a.date}</time></div>
          <p>{a.text}</p>
        </li>
      ))}
    </ul>
  );
}

function AnnouncementsView({ db, setModal, canPost, author }) {
  return (
    <>
      <h1>Announcements</h1>
      <Panel title="School announcements" action={canPost && <button className="btn-primary btn-small" onClick={() => setModal({ type: "announcement", author })}>Post announcement</button>}>
        <AnnouncementList db={db} />
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
        <p className="lead">Question submissions from teachers for {CURRENT_TERM}, {CURRENT_YEAR}.</p>
        <div className="stat-grid">
          <StatCard label="Total Submissions" value={submissions.length} />
          <StatCard label="Pending Review" value={pending} tone={pending > 0 ? "red" : "gold"} />
          <StatCard label="Approved" value={approved} tone="gold" />
          <StatCard label="Rejected" value={rejected} />
        </div>
        <Panel title="Recent submissions">
          <ul className="activity-list">
            {submissions.slice().reverse().slice(0, 5).map((q) => (
              <li key={q.id}>
                <span>{q.title} — {q.teacherName} ({q.subject})</span>
                <Pill tone={statusTone[q.status]}>{q.status}</Pill>
              </li>
            ))}
          </ul>
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
            <table className="data-table">
              <thead><tr><th>Title</th><th>Teacher</th><th>Subject</th><th>Marks</th><th>Submitted</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {submissions.slice().reverse().map((q) => (
                  <tr key={q.id}>
                    <td>{q.title}</td>
                    <td>{q.teacherName}</td>
                    <td>{q.subject}</td>
                    <td>{q.marks}</td>
                    <td className="muted">{formatTimestamp(q.submittedAt)}</td>
                    <td><Pill tone={statusTone[q.status]}>{q.status}</Pill></td>
                    <td><button className="btn-ghost btn-small" onClick={() => setModal({ type: "reviewquestion", id: q.id })}>Review</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </>
    );
  }

  if (view === "announcements") return <AnnouncementsView db={db} setModal={setModal} canPost={false} />;
  return null;
}

function QuestionReviewModal({ db, id, onClose, onReview }) {
  const q = db.questionSubmissions.find((x) => x.id === id);
  const [comment, setComment] = useState(q?.comment || "");
  if (!q) return null;

  const act = (status) => {
    onReview(id, status, comment.trim());
    onClose();
  };

  return (
    <Modal title={q.title} onClose={onClose} wide>
      <div className="profile-grid" style={{ marginBottom: 16 }}>
        <div><span>Teacher</span><b>{q.teacherName}</b></div>
        <div><span>Subject</span><b>{q.subject}</b></div>
        <div><span>Total Marks</span><b>{q.marks}</b></div>
        <div><span>Submitted</span><b>{formatTimestamp(q.submittedAt)}</b></div>
      </div>
      <div style={{ background: "var(--sage)", borderRadius: 4, padding: "12px 14px", whiteSpace: "pre-wrap", fontSize: 13.5, marginBottom: 16, lineHeight: 1.6 }}>
        {q.content}
      </div>
      <label className="form-span">Comment (optional)
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Feedback for the teacher..." />
      </label>
      <div className="modal-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
        <button className="btn-ghost" onClick={() => act("Reviewed")}>Mark Reviewed</button>
        <button className="btn-ghost" onClick={() => act("Rejected")}>Reject</button>
        <button className="btn-primary" onClick={() => act("Approved")}>Approve</button>
      </div>
    </Modal>
  );
}

function PupilView({ db, view, user }) {
  const pupil = db.pupils.find((p) => p.id === user.pupilId);
  const cls = db.classes.find((c) => c.id === pupil?.classId);
  const att = db.attendance[pupil?.id] || { present: 0, total: 0 };

  if (view === "overview") {
    return (
      <>
        <h1>My Profile</h1>
        <Panel title={pupil?.name}>
          <div className="profile-grid">
            <div><span>Admission No.</span><b>{pupil?.admissionNo}</b></div>
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
        <div className="row-actions"><button className="btn-primary btn-small" onClick={() => window.print()}>Print report card</button></div>
        {pupil && <ReportCard db={db} pupil={pupil} />}
      </>
    );
  }
  return null;
}

function ParentView({ db, view, user }) {
  const children = db.pupils.filter((p) => user.pupilIds.includes(p.id));
  const [selected, setSelected] = useState(children[0]?.id || "");
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

  if (view === "overview") {
    return (
      <>
        <h1>My Children</h1>
        {ChildPicker}
        {child && (
          <>
            <Panel title={child.name}>
              <div className="profile-grid">
                <div><span>Admission No.</span><b>{child.admissionNo}</b></div>
                <div><span>Class</span><b>{cls?.name}</b></div>
                <div><span>Attendance</span><b>{att.present}/{att.total} days</b></div>
                <div><span>Fee Balance</span><b><Pill tone={fee.termFee - fee.paid > 0 ? "red" : "gold"}>{money(fee.termFee - fee.paid)}</Pill></b></div>
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
        <div className="row-actions"><button className="btn-primary btn-small" onClick={() => window.print()}>Print report card</button></div>
        {child && <ReportCard db={db} pupil={child} />}
      </>
    );
  }
  return null;
}

/* ================= App ================= */

export default function App() {
  const [db, setDb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [view, setView] = useState("overview");
  const [modal, setModal] = useState(null);
  const [printTarget, setPrintTarget] = useState(null);

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

  useEffect(() => {
    let done = false;
    loadDB().then((d) => { done = true; setDb(d); setLoading(false); });
    // absolute last-resort safeguard: never let the app sit on a spinner
    const hardCap = setTimeout(() => {
      if (!done) { setDb(seedDB()); setLoading(false); }
    }, 6000);
    return () => clearTimeout(hardCap);
  }, []);

  const persist = useCallback((updater) => {
    setDb((prev) => {
      const next = updater(prev);
      saveDB(next);
      return next;
    });
  }, []);

  const handleLogin = (u) => {
    setUser(u);
    setView("overview");
    persist((prev) => ({
      ...prev,
      auditLog: withAudit(prev, `${u.name} (${ROLE_LABELS[u.role]})`, "Logged in", `Username: ${u.username}`),
    }));
  };

  const handleLogout = () => {
    if (user) {
      persist((prev) => ({
        ...prev,
        auditLog: withAudit(prev, `${user.name} (${ROLE_LABELS[user.role]})`, "Logged out", `Username: ${user.username}`),
      }));
    }
    setUser(null);
    setView("overview");
  };

  const actorLabel = user ? `${user.name} (${ROLE_LABELS[user.role]})` : "System";

  const lastActivityRef = React.useRef(Date.now());
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(false);

  useEffect(() => {
    if (!user) return;
    lastActivityRef.current = Date.now();
    const markActive = () => { lastActivityRef.current = Date.now(); };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((ev) => window.addEventListener(ev, markActive, { passive: true }));

    const intervalId = setInterval(() => {
      const timeoutMs = (db?.settings?.sessionTimeoutMinutes || 30) * 60 * 1000;
      if (Date.now() - lastActivityRef.current >= timeoutMs) {
        setSessionExpiredNotice(true);
        handleLogout();
      }
    }, 5000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, markActive));
      clearInterval(intervalId);
    };
  }, [user, db?.settings?.sessionTimeoutMinutes]); // eslint-disable-line

  const saveGrade = (pupilId, subject, scores) => {
    persist((prev) => {
      const pupilName = prev.pupils.find((p) => p.id === pupilId)?.name || pupilId;
      return {
        ...prev,
        grades: { ...prev.grades, [gradeKey(pupilId, subject)]: scores },
        auditLog: withAudit(prev, actorLabel, "Entered grade", `${subject} for ${pupilName}: ${totalScore(scores)}/100`),
      };
    });
  };

  const saveAttendance = (classId, statusMap, date) => {
    persist((prev) => {
      const attendance = { ...prev.attendance };
      Object.entries(statusMap).forEach(([pid, status]) => {
        const cur = attendance[pid] || { present: 0, total: 0 };
        attendance[pid] = { present: cur.present + (status === "present" ? 1 : 0), total: cur.total + 1 };
      });
      const cls = prev.classes.find((c) => c.id === classId);
      return {
        ...prev,
        attendance,
        lastMarked: { ...prev.lastMarked, [classId]: date },
        auditLog: withAudit(prev, actorLabel, "Marked attendance", `${cls?.name || classId} — ${date}`),
      };
    });
  };

  const savePayment = (pupilId, amount, note) => {
    persist((prev) => {
      const fees = { ...prev.fees };
      const cur = fees[pupilId] || { termFee: 0, paid: 0 };
      fees[pupilId] = { ...cur, paid: cur.paid + amount };
      const payment = { id: "PAY" + Date.now(), pupilId, amount, date: new Date().toISOString().slice(0, 10), note };
      const pupilName = prev.pupils.find((p) => p.id === pupilId)?.name || pupilId;
      return {
        ...prev,
        fees,
        payments: [...prev.payments, payment],
        auditLog: withAudit(prev, actorLabel, "Recorded payment", `${money(amount)} deposited for ${pupilName}${note ? ` — ${note}` : ""}`),
      };
    });
  };

  const saveAnnouncement = (author, text) => {
    persist((prev) => ({
      ...prev,
      announcements: [{ id: "A" + Date.now(), author, date: new Date().toISOString().slice(0, 10), text }, ...prev.announcements],
      auditLog: withAudit(prev, actorLabel, "Posted announcement", text.length > 80 ? text.slice(0, 80) + "…" : text),
    }));
  };

  const submitQuestion = ({ teacherId, teacherName, classId, subject, title, content, marks }) => {
    persist((prev) => {
      const submission = {
        id: "Q" + Date.now(), teacherId, teacherName, classId, subject, term: CURRENT_TERM, year: CURRENT_YEAR,
        title, content, marks, status: "Pending", comment: "", submittedAt: new Date().toISOString(),
      };
      return {
        ...prev,
        questionSubmissions: [...(prev.questionSubmissions || []), submission],
        auditLog: withAudit(prev, actorLabel, "Submitted exam questions", `${title} (${subject}) — ${teacherName}`),
      };
    });
  };

  const reviewQuestion = (id, status, comment) => {
    persist((prev) => {
      const target = (prev.questionSubmissions || []).find((q) => q.id === id);
      return {
        ...prev,
        questionSubmissions: (prev.questionSubmissions || []).map((q) => (q.id === id ? { ...q, status, comment } : q)),
        auditLog: withAudit(prev, actorLabel, `${status} exam questions`, `${target?.title} — ${target?.teacherName}${comment ? `: ${comment}` : ""}`),
      };
    });
  };

  const registerPupil = ({ name, classId, parentName, termFee, address, telephone, dob, placeOfBirth, photo }) => {
    const pupilId = "P" + Date.now();
    persist((prev) => {
      const cls = prev.classes.find((c) => c.id === classId);
      const admissionNo = `TISL/${CURRENT_YEAR.slice(0, 4)}/${String(prev.pupils.length + 1).padStart(3, "0")}`;
      const pupil = {
        id: pupilId, name, admissionNo, classId, parentName: parentName || "—",
        address: address || "", telephone: telephone || "", dob: dob || "", placeOfBirth: placeOfBirth || "", photo: photo || "",
      };
      return {
        ...prev,
        pupils: [...prev.pupils, pupil],
        attendance: { ...prev.attendance, [pupilId]: { present: 0, total: 0 } },
        fees: { ...prev.fees, [pupilId]: { termFee: termFee || 0, paid: 0 } },
        auditLog: withAudit(prev, actorLabel, "Registered pupil", `${name} (${admissionNo}) — ${cls?.name || "Unassigned"}`),
      };
    });
    setModal({ type: "profile", kind: "pupil", id: pupilId, justRegistered: true });
  };

  const registerStaff = ({ name, classId, subjects, address, telephone, dob, placeOfBirth, qualifications, photo }) => {
    const teacherId = "T" + Date.now();
    persist((prev) => {
      const cls = prev.classes.find((c) => c.id === classId);
      const teacher = {
        id: teacherId, name, classId, subjects: subjects || [],
        address: address || "", telephone: telephone || "", dob: dob || "", placeOfBirth: placeOfBirth || "", qualifications: qualifications || "", photo: photo || "",
      };
      return {
        ...prev,
        teachers: [...prev.teachers, teacher],
        auditLog: withAudit(prev, actorLabel, "Registered staff", `${name} — ${cls?.name || "Unassigned"}`),
      };
    });
    setModal({ type: "profile", kind: "teacher", id: teacherId, justRegistered: true });
  };

  const saveAccount = ({ role, name, username, password, classId, subjects, pupilIds }) => {
    persist((prev) => {
      const id = "U" + Date.now();
      const newUser = { id, username, password, role, name, active: true };
      const audit = (extraDb) => withAudit(prev, actorLabel, "Created account", `${username} (${ROLE_LABELS[role]}) — ${name}`);

      if (role === "teacher") {
        const teacherId = "T" + Date.now();
        const cls = prev.classes.find((c) => c.id === classId);
        const teacher = { id: teacherId, name, classId, subjects: subjects.length ? subjects : [] };
        newUser.teacherId = teacherId;
        newUser.title = `Class Teacher, ${cls?.name || "Unassigned"}`;
        return { ...prev, teachers: [...prev.teachers, teacher], users: [...prev.users, newUser], auditLog: audit() };
      }

      if (role === "pupil") {
        const pupilId = "P" + Date.now();
        const cls = prev.classes.find((c) => c.id === classId);
        const admissionNo = `TISL/${CURRENT_YEAR.slice(0, 4)}/${String(prev.pupils.length + 1).padStart(3, "0")}`;
        const pupil = { id: pupilId, name, admissionNo, classId, parentName: "—" };
        newUser.pupilId = pupilId;
        newUser.title = `Pupil, ${cls?.name || "Unassigned"}`;
        return {
          ...prev,
          pupils: [...prev.pupils, pupil],
          attendance: { ...prev.attendance, [pupilId]: { present: 0, total: 0 } },
          fees: { ...prev.fees, [pupilId]: { termFee: 0, paid: 0 } },
          users: [...prev.users, newUser],
          auditLog: audit(),
        };
      }

      if (role === "parent") {
        newUser.pupilIds = pupilIds;
        newUser.title = "Parent";
        return { ...prev, users: [...prev.users, newUser], auditLog: audit() };
      }

      newUser.title = ROLE_LABELS[role];
      return { ...prev, users: [...prev.users, newUser], auditLog: audit() };
    });
  };

  const toggleAccountActive = (userId) => {
    persist((prev) => {
      const target = prev.users.find((u) => u.id === userId);
      const willBeActive = target?.active === false;
      return {
        ...prev,
        users: prev.users.map((u) => (u.id === userId ? { ...u, active: u.active === false } : u)),
        auditLog: withAudit(prev, actorLabel, willBeActive ? "Enabled account" : "Disabled account", `${target?.username} — ${target?.name}`),
      };
    });
  };

  const resetPassword = (userId) => {
    const tempPassword = generateTempPassword();
    const target = db.users.find((u) => u.id === userId);
    persist((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === userId ? { ...u, password: tempPassword } : u)),
      auditLog: withAudit(prev, actorLabel, "Reset password", `${target?.username} — ${target?.name}`),
    }));
    setModal({ type: "resetpwd", username: target?.username, name: target?.name, tempPassword });
  };

  const recordLoginAttempt = (username, success) => {
    const threshold = db.settings?.lockoutThreshold || 5;
    const target = db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (!target) return {};

    if (success) {
      persist((prev) => ({
        ...prev,
        users: prev.users.map((u) => (u.id === target.id ? { ...u, failedAttempts: 0 } : u)),
      }));
      return {};
    }

    const nextCount = (target.failedAttempts || 0) + 1;
    const justLocked = nextCount >= threshold;
    persist((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === target.id ? { ...u, failedAttempts: nextCount, locked: justLocked ? true : u.locked } : u)),
      auditLog: justLocked
        ? withAudit(prev, "System", "Account locked", `${target.username} — ${nextCount} failed sign-in attempts (threshold: ${threshold})`)
        : prev.auditLog,
    }));
    return { justLocked };
  };

  const unlockAccount = (userId) => {
    const target = db.users.find((u) => u.id === userId);
    persist((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === userId ? { ...u, locked: false, failedAttempts: 0 } : u)),
      auditLog: withAudit(prev, actorLabel, "Unlocked account", `${target?.username} — ${target?.name}`),
    }));
  };

  const updateSettings = (patch) => {
    persist((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...patch },
      auditLog: withAudit(prev, actorLabel, "Updated security policy", Object.entries(patch).map(([k, v]) => `${k}: ${v}`).join(", ")),
    }));
  };

  const restoreBackup = (newDb) => {
    persist((prev) => ({
      ...newDb,
      auditLog: withAudit(newDb, actorLabel, "Restored from backup", "Full school database replaced from an uploaded backup file"),
    }));
  };

  return (
    <div className="dia-root">
      <style>{CSS}</style>
      {loading || !db ? (
        <div className="loading-screen"><Seal size={56} /><p>Loading school records…</p></div>
      ) : !user ? (
        <LoginScreen db={db} onLogin={handleLogin} onAttempt={recordLoginAttempt} sessionExpiredNotice={sessionExpiredNotice} onDismissNotice={() => setSessionExpiredNotice(false)} />
      ) : (
        <Shell user={user} view={view} setView={setView} onLogout={handleLogout}>
          {user.role === "proprietor" && <ProprietorView db={db} view={view} setModal={setModal} toggleActive={toggleAccountActive} resetPassword={resetPassword} unlockAccount={unlockAccount} updateSettings={updateSettings} restoreBackup={restoreBackup} user={user} />}
          {user.role === "principal" && <PrincipalView db={db} view={view} setModal={setModal} user={user} />}
          {user.role === "bursar" && <BursarView db={db} view={view} setModal={setModal} />}
          {user.role === "teacher" && <TeacherView db={db} view={view} user={user} setModal={setModal} />}
          {user.role === "pupil" && <PupilView db={db} view={view} user={user} />}
          {user.role === "parent" && <ParentView db={db} view={view} user={user} />}
          {user.role === "examofficer" && <ExamOfficerView db={db} view={view} setModal={setModal} />}
        </Shell>
      )}

      {modal?.type === "grades" && (
        <GradeEntryModal db={db} classId={modal.classId} onClose={() => setModal(null)} onSave={saveGrade} />
      )}
      {modal?.type === "attendance" && (
        <AttendanceModal db={db} classId={modal.classId} onClose={() => setModal(null)} onSave={saveAttendance} />
      )}
      {modal?.type === "payment" && (
        <PaymentModal db={db} onClose={() => setModal(null)} onSave={savePayment} />
      )}
      {modal?.type === "announcement" && (
        <AnnouncementModal author={modal.author} onClose={() => setModal(null)} onSave={(text) => saveAnnouncement(modal.author, text)} />
      )}
      {modal?.type === "registerpupil" && (
        <RegisterPupilModal db={db} onClose={() => setModal(null)} onSave={registerPupil} />
      )}
      {modal?.type === "registerstaff" && (
        <RegisterStaffModal db={db} onClose={() => setModal(null)} onSave={registerStaff} />
      )}
      {modal?.type === "profile" && (
        <ProfileModal
          db={db}
          kind={modal.kind}
          id={modal.id}
          justRegistered={modal.justRegistered}
          onClose={() => setModal(null)}
          onPrint={(kind, id) => setPrintTarget({ kind, id })}
        />
      )}
      {modal?.type === "account" && (
        <CreateAccountModal db={db} onClose={() => setModal(null)} onSave={saveAccount} />
      )}
      {modal?.type === "resetpwd" && (
        <ResetPasswordModal username={modal.username} name={modal.name} tempPassword={modal.tempPassword} onClose={() => setModal(null)} />
      )}
      {modal?.type === "submitquestion" && (
        <SubmitQuestionModal db={db} teacherId={modal.teacherId} teacherName={modal.teacherName} onClose={() => setModal(null)} onSave={submitQuestion} />
      )}
      {modal?.type === "reviewquestion" && (
        <QuestionReviewModal db={db} id={modal.id} onClose={() => setModal(null)} onReview={reviewQuestion} />
      )}
      {printTarget && (
        <div className="print-only-form">
          <RegistrationForm db={db} kind={printTarget.kind} id={printTarget.id} />
        </div>
      )}
    </div>
  );
}

/* ================= styles ================= */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

.dia-root {
  --ink: #1B3A2E;
  --ink-light: #2B5240;
  --gold: #B98A2C;
  --gold-light: #E3C878;
  --paper: #FAF7EF;
  --panel: #F3EFE2;
  --sage: #E7ECE1;
  --text: #262620;
  --muted: #746F60;
  --red: #A63D31;
  --red-bg: #F5E3DF;
  --gold-bg: #F1E6C9;
  --royal-blue: #4169E1;
  --royal-blue-dark: #2E4FB8;
  --border: #DCD3B8;
  font-family: 'IBM Plex Sans', sans-serif;
  color: var(--text);
  background: var(--paper);
  min-height: 100vh;
}
.dia-root * { box-sizing: border-box; }
.mono { font-family: 'IBM Plex Mono', monospace; }
.muted { color: var(--muted); }

/* login */
.login-screen { min-height: 100vh; display: flex; align-items: center; justify-content: center; background:
  radial-gradient(circle at 15% 10%, rgba(185,138,44,0.10), transparent 45%),
  radial-gradient(circle at 85% 90%, rgba(27,58,46,0.08), transparent 45%), var(--paper); padding: 24px; }
.login-card { width: 100%; max-width: 480px; background: #fff; border: 1px solid var(--border); border-radius: 4px; padding: 36px; box-shadow: 0 20px 50px rgba(27,58,46,0.10); }
.login-brand { display: flex; align-items: center; gap: 14px; margin-bottom: 26px; padding-bottom: 22px; border-bottom: 2px solid var(--royal-blue); }
.brand-name { font-family: 'Fraunces', serif; font-weight: 700; font-size: 16px; color: #FFFFFF; background: #003399; letter-spacing: 0.3px; line-height: 1.3; padding: 6px 12px; border-radius: 3px; display: inline-block; }
.brand-sub { font-size: 13px; font-weight: 700; color: var(--ink); margin-top: 6px; text-align: center; }
.brand-motto { font-size: 11.5px; color: var(--gold); font-style: italic; margin-top: 6px; letter-spacing: 0.3px; text-align: center; }
.login-form { display: flex; flex-direction: column; gap: 14px; }
.login-form label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--muted); font-weight: 500; }
.login-form input { font-family: inherit; padding: 11px 12px; border: 1.5px solid var(--royal-blue); border-radius: 3px; font-size: 14px; background: var(--paper); color: var(--text); }
.login-form input:focus { outline: 2px solid var(--royal-blue); outline-offset: 1px; border-color: var(--royal-blue); }
.form-error { background: var(--red-bg); color: var(--red); font-size: 13px; padding: 9px 11px; border-radius: 3px; }

.loading-screen { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--muted); }

/* seal */
.seal-img { flex-shrink: 0; }

/* shell */
.shell { display: flex; min-height: 100vh; }
.sidebar { width: 240px; background: #FFFFFF; color: var(--text); display: flex; flex-direction: column; padding: 22px 16px; position: relative; flex-shrink: 0; transition: width 0.18s ease; border-right: 1px solid var(--border); }
.sidebar::after { content: ""; position: absolute; left: 6px; top: 0; bottom: 0; width: 1px; background: rgba(185,138,44,0.25); box-shadow: 4px 0 0 rgba(185,138,44,0.10); }
.shell-collapsed .sidebar { width: 72px; padding: 22px 12px; }
.shell-collapsed .sidebar-brand { justify-content: center; }
.sidebar-brand { display: flex; align-items: center; gap: 10px; padding: 4px 6px 20px; border-bottom: 1px solid var(--border); margin-bottom: 16px; position: relative; }
.sb-name { font-family: 'Fraunces', serif; font-weight: 600; font-size: 16.5px; color: var(--ink); line-height: 1.25; }
.sb-motto { font-size: 11px; color: var(--gold); font-style: italic; margin-top: 3px; letter-spacing: 0.1px; line-height: 1.3; }
.sb-sub { font-size: 12.5px; color: var(--muted); letter-spacing: 0.5px; margin-top: 2px; }
.collapse-btn { position: absolute; right: -12px; top: 4px; width: 24px; height: 24px; border-radius: 50%; background: var(--gold); color: #fff; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.15); font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.shell-collapsed .collapse-btn { position: static; margin-top: 10px; border: 1px solid var(--border); background: transparent; color: var(--muted); box-shadow: none; }
.sidebar nav { display: flex; flex-direction: column; gap: 3px; flex: 1; }
.nav-item { display: flex; align-items: center; gap: 10px; text-align: left; background: transparent; border: none; color: var(--text); font-family: inherit; font-size: 15px; padding: 11px 12px; border-radius: 3px; cursor: pointer; white-space: nowrap; overflow: hidden; }
.nav-item:hover { background: var(--sage); }
.nav-active { background: var(--gold); color: #fff; font-weight: 600; }
.nav-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; opacity: 0.55; flex-shrink: 0; }
.nav-active .nav-dot { opacity: 1; }
.shell-collapsed .nav-item { justify-content: center; padding: 10px; }
.sidebar-foot { border-top: 1px solid var(--border); padding-top: 14px; display: flex; flex-direction: column; gap: 10px; }
.sidebar-foot .btn-ghost { color: var(--ink); border-color: var(--border); font-size: 13.5px; padding: 8px 12px; }
.sidebar-foot .btn-ghost:hover { background: var(--sage); }
.shell-collapsed .sidebar-foot { align-items: center; }
.who-name { font-size: 14.5px; color: var(--ink); font-weight: 500; }
.who-role { font-size: 13px; color: var(--muted); }
.sidebar-scrim { display: none; }
.mobile-menu-btn { display: none; }
.content-area { flex: 1; min-width: 0; }

.content { padding: 32px 40px; max-width: 1100px; }
.content h1 { font-family: 'Fraunces', serif; font-size: 26px; font-weight: 600; color: var(--ink); margin: 0 0 4px; }
.lead { color: var(--muted); margin: 0 0 22px; font-size: 14px; }

/* stat cards */
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; margin-bottom: 26px; }
.stat-card { background: #fff; border: 1px solid var(--border); border-radius: 4px; padding: 16px 18px; border-top: 3px solid var(--ink); }
.stat-gold { border-top-color: var(--gold); }
.stat-red { border-top-color: var(--red); }
.stat-label { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.stat-value { font-family: 'Fraunces', serif; font-size: 24px; font-weight: 600; color: var(--ink); }
.stat-sub { font-size: 11.5px; color: var(--muted); margin-top: 4px; }

/* panels */
.panel { background: #fff; border: 1px solid var(--border); border-radius: 4px; margin-bottom: 20px; overflow: hidden; }
.panel-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border); background: var(--sage); }
.panel-head h3 { margin: 0; font-family: 'Fraunces', serif; font-size: 15.5px; color: var(--ink); font-weight: 600; }
.panel-body { padding: 6px 18px 14px; }

.data-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.data-table th { text-align: left; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted); padding: 10px 8px; border-bottom: 1px solid var(--border); }
.data-table td { padding: 10px 8px; border-bottom: 1px solid #EEE8D6; }
.data-table tr:last-child td { border-bottom: none; }

.activity-list, .announce-list { list-style: none; margin: 0; padding: 0; }
.activity-list li { display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid #EEE8D6; font-size: 13.5px; }
.activity-list li:last-child { border-bottom: none; }
.activity-list time { color: var(--muted); font-size: 12px; }
.announce-list li { padding: 12px 0; border-bottom: 1px solid #EEE8D6; }
.announce-list li:last-child { border-bottom: none; }
.announce-meta { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); margin-bottom: 4px; }
.announce-meta b { color: var(--ink); font-weight: 600; }
.announce-list p { margin: 0; font-size: 13.5px; line-height: 1.5; }

/* pills / chips */
.pill { display: inline-block; padding: 2px 9px; border-radius: 20px; font-size: 12px; font-weight: 600; background: var(--sage); color: var(--ink); }
.pill-gold { background: var(--gold-bg); color: #8A6414; }
.pill-red { background: var(--red-bg); color: var(--red); }
.chip { border: 1px solid var(--border); background: #fff; padding: 6px 14px; border-radius: 20px; font-family: inherit; font-size: 13px; cursor: pointer; }
.chip-on { background: var(--ink); color: #fff; border-color: var(--ink); }

/* buttons */
.btn-primary { background: var(--gold); color: var(--ink); border: none; padding: 10px 16px; border-radius: 3px; font-weight: 600; font-family: inherit; font-size: 13.5px; cursor: pointer; }
.btn-primary:hover { background: #A8791E; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.login-form .btn-primary { background: var(--royal-blue); color: #fff; }
.login-form .btn-primary:hover { background: var(--royal-blue-dark); }
.btn-ghost { background: transparent; border: 1px solid var(--border); color: var(--ink); padding: 10px 16px; border-radius: 3px; font-family: inherit; font-size: 13.5px; cursor: pointer; }
.btn-ghost:hover { background: var(--sage); }
.btn-small { padding: 7px 12px; font-size: 12.5px; }
.btn-full { width: 100%; }
.icon-btn { background: transparent; border: none; font-size: 15px; cursor: pointer; color: var(--muted); }
.row-actions { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.inline-label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
.inline-label select { padding: 7px 9px; border: 1px solid var(--border); border-radius: 3px; font-family: inherit; }

/* modal */
.modal-backdrop { position: fixed; inset: 0; background: rgba(27,58,46,0.45); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
.modal-card { background: #fff; border-radius: 5px; width: 100%; max-width: 420px; max-height: 90vh; overflow-y: auto; }
.modal-wide { max-width: 560px; }
.modal-head { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border); }
.modal-head h3 { margin: 0; font-family: 'Fraunces', serif; font-size: 16px; color: var(--ink); }
.modal-body { padding: 18px 20px 20px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-span { grid-column: 1 / -1; }
.form-grid label, .modal-body > label { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; color: var(--muted); font-weight: 500; }
.form-grid input, .form-grid select, .modal-body input, .modal-body select, .modal-body textarea { font-family: inherit; padding: 9px 10px; border: 1px solid var(--border); border-radius: 3px; font-size: 13.5px; }
.calc-preview { display: flex; gap: 20px; margin-top: 14px; padding: 12px 14px; background: var(--sage); border-radius: 3px; font-size: 13.5px; align-items: center; }
.check-row { display: flex; flex-wrap: wrap; gap: 8px; }
.check-chip { flex-direction: row !important; align-items: center; gap: 6px !important; border: 1px solid var(--border); background: #fff; padding: 6px 10px; border-radius: 20px; font-size: 12.5px; color: var(--text) !important; font-weight: 400 !important; cursor: pointer; width: auto; }
.check-chip input { width: auto; padding: 0; accent-color: var(--gold); }
.id-photo-row { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; padding: 12px; background: var(--sage); border-radius: 4px; }
.id-photo-preview { width: 64px; height: 64px; border-radius: 4px; background: #fff; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
.id-photo-preview img { width: 100%; height: 100%; object-fit: cover; }
.id-photo-preview span { font-size: 10px; color: var(--muted); text-align: center; }
.id-photo-input { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--muted); font-weight: 500; }
.id-photo-input input { font-size: 12px; }
.profile-photo-wrap { display: flex; justify-content: center; margin-bottom: 16px; }
.profile-photo { width: 96px; height: 96px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border); }
.reg-form-body { display: flex; gap: 24px; align-items: flex-start; }
.reg-form-photo { flex-shrink: 0; width: 110px; height: 110px; border-radius: 6px; overflow: hidden; border: 1px solid var(--border); }
.reg-form-photo img { width: 100%; height: 100%; object-fit: cover; }
.reg-form-fields { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 14px 20px; }
.reg-form-field { display: flex; flex-direction: column; gap: 3px; }
.reg-form-field span { font-size: 10.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.4px; }
.reg-form-field b { font-size: 14px; color: var(--ink); }
.print-only-form { display: none; }
.notice { background: var(--gold-bg); color: #8A6414; font-size: 12.5px; padding: 9px 11px; border-radius: 3px; margin-bottom: 12px; }
.temp-pwd-box { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: var(--sage); border: 1px dashed var(--gold); border-radius: 4px; padding: 12px 14px; }
.temp-pwd-value { font-size: 16px; font-weight: 600; color: var(--ink); letter-spacing: 0.4px; }
.audit-search { font-family: inherit; padding: 7px 10px; border: 1px solid var(--border); border-radius: 3px; font-size: 12.5px; width: 200px; }
.att-list { display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow-y: auto; }
.att-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #EEE8D6; font-size: 13.5px; }
.seg { display: flex; gap: 6px; }
.seg button { border: 1px solid var(--border); background: #fff; padding: 5px 11px; border-radius: 3px; font-size: 12px; cursor: pointer; font-family: inherit; }
.seg-on { background: var(--gold-bg); border-color: var(--gold); font-weight: 600; }
.seg-red.seg-on { background: var(--red-bg); border-color: var(--red); color: var(--red); }

.profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.profile-grid div { display: flex; flex-direction: column; gap: 3px; }
.profile-grid span { font-size: 11.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.4px; }
.profile-grid b { font-size: 14.5px; color: var(--ink); }

/* report card */
.report-card { background: #fff; border: 1px solid var(--border); border-radius: 4px; padding: 30px; max-width: 760px; }
.rc-header { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid var(--ink); padding-bottom: 16px; margin-bottom: 18px; }
.rc-school { font-family: 'Fraunces', serif; font-size: 21px; font-weight: 700; color: var(--ink); letter-spacing: 0.4px; }
.rc-tagline { font-size: 12px; color: var(--gold); font-style: italic; margin: 2px 0; }
.rc-doc { font-size: 12.5px; color: var(--muted); margin-top: 4px; }
.rc-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
.rc-meta div { display: flex; flex-direction: column; gap: 2px; }
.rc-meta span { font-size: 10.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.4px; }
.rc-meta b { font-size: 13.5px; color: var(--ink); }
.rc-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 18px; }
.rc-table th { background: var(--sage); text-align: left; padding: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; color: var(--ink); }
.rc-table td { padding: 8px; border-bottom: 1px solid #EEE8D6; }
.rc-total { font-weight: 700; }
.rc-empty { text-align: center; color: var(--muted); padding: 18px; }
.rc-summary { display: flex; gap: 30px; margin-bottom: 20px; }
.rc-summary div { display: flex; flex-direction: column; gap: 2px; }
.rc-summary span { font-size: 10.5px; color: var(--muted); text-transform: uppercase; }
.rc-summary b { font-family: 'Fraunces', serif; font-size: 18px; color: var(--ink); }
.rc-comments { display: flex; flex-direction: column; gap: 12px; margin-bottom: 26px; }
.rc-comments span { font-size: 11px; font-weight: 600; color: var(--ink); text-transform: uppercase; letter-spacing: 0.3px; }
.rc-comments p { margin: 4px 0 0; font-size: 13px; font-style: italic; color: var(--text); }
.rc-sign { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; }
.rc-sign > div { display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 1; }
.sig-line { width: 100%; border-bottom: 1px solid var(--muted); height: 34px; }
.rc-sign span { font-size: 10.5px; color: var(--muted); }
.rc-stamp { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 0; }

@media print {
  .sidebar, .row-actions, .modal-backdrop { display: none !important; }
  .content { padding: 0; }
  .shell { display: block; }
  body.printing-form .shell { display: none !important; }
  body.printing-form .print-only-form { display: block !important; padding: 24px; }
}

@media (max-width: 860px) {
  .shell { display: block; }
  .sidebar { position: fixed; top: 0; left: 0; bottom: 0; z-index: 40; width: 240px !important; padding: 22px 16px !important; transform: translateX(-100%); transition: transform 0.2s ease; }
  .sidebar-open { transform: translateX(0); box-shadow: 8px 0 24px rgba(0,0,0,0.25); }
  .shell-collapsed .sidebar-brand { justify-content: flex-start; }
  .collapse-btn { display: none; }
  .sidebar-scrim { display: block; position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 39; }
  .mobile-menu-btn { display: inline-flex; align-items: center; gap: 6px; margin: 16px 20px 0; background: var(--ink); color: #FAF7EF; border: none; padding: 9px 14px; border-radius: 3px; font-family: inherit; font-size: 13px; cursor: pointer; }
  .content { padding: 20px; }
  .form-grid, .rc-meta, .profile-grid { grid-template-columns: 1fr; }
}
`;
