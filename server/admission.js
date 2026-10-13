"use strict";
/* Pupil admission (ID) numbers: PREFIX/YEAR/001, counting up per school. A number typed in by hand is skipped. */
const settingsLib = require("./settings");
const { bad } = require("./util");

function admissionNoFor(school, seq) {
  const settings = settingsLib.full(school.settings);
  const prefix = settings.admissionPrefix || school.code;
  return `${prefix}/${String(settings.currentYear).slice(0, 4)}/${String(seq).padStart(3, "0")}`;
}

/* The next automatic admission (ID) number, skipping any that were typed in by hand. */
async function nextAdmissionNo(c, school) {
  for (let i = 0; i < 10000; i++) {
    const r = await c.query("UPDATE schools SET next_admission_seq = next_admission_seq + 1 WHERE id = $1 RETURNING next_admission_seq - 1 AS seq", [school.id]);
    const no = admissionNoFor(school, r.rows[0].seq);
    const used = await c.query("SELECT 1 FROM pupils WHERE school_id = $1 AND admission_no = $2", [school.id, no]);
    if (!used.rowCount) return no;
  }
  throw bad("Could not find a free admission number. Type one in instead.");
}

/* The number nextAdmissionNo would give, without using it up (shown as a suggestion when registering). */
async function suggestAdmissionNo(c, school) {
  const seq = Number((await c.query("SELECT next_admission_seq FROM schools WHERE id = $1", [school.id])).rows[0].next_admission_seq);
  for (let i = 0; i < 10000; i++) {
    const no = admissionNoFor(school, seq + i);
    const used = await c.query("SELECT 1 FROM pupils WHERE school_id = $1 AND admission_no = $2", [school.id, no]);
    if (!used.rowCount) return no;
  }
  return "";
}

module.exports = { nextAdmissionNo, suggestAdmissionNo };
