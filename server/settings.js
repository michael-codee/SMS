"use strict";
/*
 * Per-school settings: branding, academic calendar, grading, fees and security policy.
 * Stored as JSON on the schools row; always passed through sanitize() before saving.
 */
const { bad, str, num, arr } = require("./util");

const DEFAULT_SETTINGS = Object.freeze({
  schoolType: "secondary",
  motto: "",
  location: "",
  colors: { primary: "#12355B", accent: "#E9A23B", banner: "#1E5BB8" },
  currency: "Le",
  terms: ["Term 1", "Term 2", "Term 3"],
  currentTerm: "Term 1",
  currentYear: defaultYear(),
  admissionPrefix: "",
  assessment: [
    { key: "classwork", label: "Classwork", max: 20 },
    { key: "test1", label: "Test 1", max: 10 },
    { key: "test2", label: "Test 2", max: 10 },
    { key: "exam", label: "Exam", max: 60 },
  ],
  gradeScale: [
    { min: 80, max: 100, grade: "A", remark: "Excellent" },
    { min: 70, max: 79, grade: "B", remark: "Very Good" },
    { min: 60, max: 69, grade: "C", remark: "Good" },
    { min: 50, max: 59, grade: "D", remark: "Pass" },
    { min: 0, max: 49, grade: "F", remark: "Fail" },
  ],
  showClassPosition: true,
  sessionTimeoutMinutes: 30,
  lockoutThreshold: 5,
});

const DEFAULT_CLASSES = ["JSS1", "JSS2", "JSS3", "SSS1", "SSS2", "SSS3"];
const DEFAULT_SUBJECTS = [
  "English Language", "Mathematics", "Biology", "Chemistry", "Physics", "Business Studies",
  "Religious Moral Education (RME)", "Physical Health Education (PHE)",
  "Cost Accounting", "Business Management", "Economics", "History",
];

function defaultYear() {
  // Sierra Leone's school year starts in September
  const d = new Date();
  const y = d.getUTCMonth() >= 8 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}/${y + 1}`;
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const KEY_RE = /^[a-z][a-z0-9_]{0,23}$/;

function full(settings) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  s.colors = { ...DEFAULT_SETTINGS.colors, ...((settings && settings.colors) || {}) };
  return s;
}

/* Merge a patch into current settings, validating every field the patch touches. */
function sanitize(patch, current) {
  const cur = full(current);
  const out = { ...cur };
  if (!patch || typeof patch !== "object") throw bad("Settings must be an object.");

  if ("motto" in patch) out.motto = str(patch.motto, "Motto", { max: 120 });
  if ("location" in patch) out.location = str(patch.location, "Location", { max: 120 });
  if ("currency" in patch) out.currency = str(patch.currency, "Currency symbol", { max: 6, required: true });
  if ("admissionPrefix" in patch) {
    out.admissionPrefix = str(patch.admissionPrefix, "Admission number prefix", { max: 12 });
    if (out.admissionPrefix && !/^[A-Za-z0-9-]+$/.test(out.admissionPrefix)) throw bad("Admission number prefix may only use letters, digits and dashes.");
  }
  if ("colors" in patch) {
    const c = patch.colors || {};
    out.colors = { ...cur.colors };
    for (const k of ["primary", "accent", "banner"]) {
      if (k in c) {
        if (!COLOR_RE.test(c[k] || "")) throw bad(`Colour "${k}" must look like #12355B.`);
        out.colors[k] = c[k];
      }
    }
  }
  if ("terms" in patch) {
    const terms = arr(patch.terms, "Terms", { max: 6 }).map((t, i) => str(t, `Term ${i + 1}`, { max: 30, required: true }));
    if (terms.length < 1) throw bad("Add at least one term.");
    if (new Set(terms.map((t) => t.toLowerCase())).size !== terms.length) throw bad("Term names must be different from each other.");
    if (terms.some((t) => t.toLowerCase() === "combined")) throw bad('"Combined" is reserved; choose another term name.');
    out.terms = terms;
  }
  if ("currentTerm" in patch) out.currentTerm = str(patch.currentTerm, "Current term", { max: 30, required: true });
  if (!out.terms.includes(out.currentTerm)) out.currentTerm = out.terms[0];
  if ("currentYear" in patch) {
    out.currentYear = str(patch.currentYear, "Academic year", { max: 20, required: true });
    if (!/^[0-9A-Za-z/ -]+$/.test(out.currentYear)) throw bad("Academic year should look like 2025/2026.");
  }
  if ("assessment" in patch) {
    const rows = arr(patch.assessment, "Assessment parts", { max: 8 });
    if (rows.length < 1) throw bad("Add at least one assessment part.");
    const seen = new Set();
    out.assessment = rows.map((r, i) => {
      const label = str(r && r.label, `Assessment part ${i + 1} name`, { max: 30, required: true });
      let key = r && r.key ? String(r.key) : label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);
      if (!/^[a-z]/.test(key)) key = "p_" + key;
      if (!KEY_RE.test(key)) throw bad(`Assessment part "${label}" has an invalid key.`);
      if (seen.has(key)) throw bad(`Two assessment parts share the name "${label}".`);
      seen.add(key);
      return { key, label, max: num(r.max, `Maximum for ${label}`, { min: 1, max: 100, integer: true }) };
    });
    const total = out.assessment.reduce((s, a) => s + a.max, 0);
    if (total !== 100) throw bad(`Assessment maximums must add up to 100 (they add up to ${total}).`);
  }
  if ("gradeScale" in patch) {
    const rows = arr(patch.gradeScale, "Grade scale", { max: 15 }).map((r, i) => ({
      min: num(r && r.min, `Grade row ${i + 1} lowest mark`, { min: 0, max: 100 }),
      max: num(r && r.max, `Grade row ${i + 1} highest mark`, { min: 0, max: 100 }),
      grade: str(r && r.grade, `Grade row ${i + 1} grade`, { max: 4, required: true }),
      remark: str(r && r.remark, `Grade row ${i + 1} remark`, { max: 40 }),
    }));
    if (rows.length < 1) throw bad("Add at least one grade.");
    rows.forEach((r) => { if (r.min > r.max) throw bad(`Grade ${r.grade}: lowest mark is above highest mark.`); });
    rows.sort((a, b) => b.min - a.min);
    if (rows[rows.length - 1].min !== 0) throw bad("The lowest grade must start at 0.");
    out.gradeScale = rows;
  }
  if ("showClassPosition" in patch) out.showClassPosition = patch.showClassPosition === true;
  if ("sessionTimeoutMinutes" in patch) out.sessionTimeoutMinutes = num(patch.sessionTimeoutMinutes, "Session timeout", { min: 1, max: 240, integer: true });
  if ("lockoutThreshold" in patch) out.lockoutThreshold = num(patch.lockoutThreshold, "Lockout threshold", { min: 1, max: 20, integer: true });
  return out;
}

module.exports = { DEFAULT_SETTINGS, DEFAULT_CLASSES, DEFAULT_SUBJECTS, full, sanitize };
