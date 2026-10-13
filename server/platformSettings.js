"use strict";
/*
 * Platform-wide settings, chosen by the platform administrators:
 *  - system: a notice shown to every school, and who schools contact for help;
 *  - security: administrator sign-out and lockout, the minimum password length for every account,
 *    and the security defaults a new school starts with.
 * Kept in memory and re-read every 15 seconds, so password checks can use them without waiting.
 */
const db = require("./db");
const { bad, str, num } = require("./util");

const DEFAULTS = Object.freeze({
  notice: "",
  supportContact: "",
  adminIdleMinutes: 30,
  adminLockoutThreshold: 10,
  minPasswordLength: 8,
  newSchoolSessionTimeoutMinutes: 30,
  newSchoolLockoutThreshold: 5,
});

let cache = { ...DEFAULTS };

function full(stored) {
  return { ...DEFAULTS, ...(stored || {}) };
}

function get() {
  return cache;
}

async function load() {
  const row = (await db.query("SELECT settings FROM platform_settings WHERE id")).rows[0];
  cache = full(row && row.settings);
  return cache;
}

setInterval(() => { load().catch(() => {}); }, 15 * 1000).unref();

function sanitize(patch) {
  if (!patch || typeof patch !== "object") throw bad("Settings must be an object.");
  const out = { ...cache };
  if ("notice" in patch) out.notice = str(patch.notice, "Notice", { max: 300 });
  if ("supportContact" in patch) out.supportContact = str(patch.supportContact, "Support contact", { max: 160 });
  if ("adminIdleMinutes" in patch) out.adminIdleMinutes = num(patch.adminIdleMinutes, "Administrator idle sign-out", { min: 5, max: 240, integer: true });
  if ("adminLockoutThreshold" in patch) out.adminLockoutThreshold = num(patch.adminLockoutThreshold, "Administrator lockout", { min: 3, max: 20, integer: true });
  if ("minPasswordLength" in patch) out.minPasswordLength = num(patch.minPasswordLength, "Minimum password length", { min: 8, max: 32, integer: true });
  if ("newSchoolSessionTimeoutMinutes" in patch) out.newSchoolSessionTimeoutMinutes = num(patch.newSchoolSessionTimeoutMinutes, "New school idle sign-out", { min: 1, max: 240, integer: true });
  if ("newSchoolLockoutThreshold" in patch) out.newSchoolLockoutThreshold = num(patch.newSchoolLockoutThreshold, "New school lockout", { min: 1, max: 20, integer: true });
  return out;
}

/* Returns the names of the settings that changed, for the activity log. */
async function update(patch) {
  const before = await load();
  const next = sanitize(patch);
  await db.query("UPDATE platform_settings SET settings = $1, updated_at = now() WHERE id", [next]);
  cache = next;
  return Object.keys(DEFAULTS).filter((k) => before[k] !== next[k]);
}

module.exports = { DEFAULTS, get, load, update };
