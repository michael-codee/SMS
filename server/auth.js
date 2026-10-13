"use strict";
/*
 * Passwords, sessions and sign-in.
 *  - Passwords: scrypt with a random salt per password (Node built-in, no extra packages).
 *  - Sessions: a random 256-bit token in an HttpOnly cookie; only its SHA-256 is stored.
 *  - Lockout: per account (school's threshold) plus a per-IP limit against password guessing.
 */
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const db = require("./db");
const { HttpError, sha256, newId } = require("./util");
const settingsLib = require("./settings");
const schoolTypes = require("./schoolTypes");
const platformSettings = require("./platformSettings");

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const SESSION_MAX_HOURS = 12;
const COOKIE = "sms_session";

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, { N: +N, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
  return crypto.timingSafeEqual(key, expected);
}

// Used when the username does not exist, so a wrong username takes as long as a wrong password.
let DUMMY_HASH = null;
async function dummyVerify(password) {
  if (!DUMMY_HASH) DUMMY_HASH = await hashPassword("dummy-password-for-timing");
  await verifyPassword(password, DUMMY_HASH);
}

const COMMON = new Set(["password", "password1", "password123", "12345678", "123456789", "qwerty123", "11111111", "iloveyou", "admin123", "welcome1", "letmein1", "school123"]);

function checkNewPassword(pw, username) {
  if (typeof pw !== "string") throw new HttpError(400, "Enter a new password.");
  const min = platformSettings.get().minPasswordLength;
  if (pw.length < min) throw new HttpError(400, `The new password must be at least ${min} characters long.`);
  if (pw.length > 200) throw new HttpError(400, "The new password is too long.");
  if (COMMON.has(pw.toLowerCase())) throw new HttpError(400, "That password is too easy to guess. Choose another.");
  if (username && pw.toLowerCase().includes(String(username).toLowerCase())) throw new HttpError(400, "The password must not contain the username.");
}

function generateTempPassword() {
  // e.g. "Palm-4821-Wave": easy to read out over the phone, ~40 bits of randomness
  const words = ["Blue", "Gold", "Star", "Palm", "Wave", "Cedar", "River", "Coral", "Amber", "Cove", "Lion", "Kite", "Mango", "Ocean", "Hill", "Rain", "Sun", "Moon", "Leaf", "Rock"];
  const pick = () => words[crypto.randomInt(words.length)];
  return `${pick()}-${crypto.randomInt(1000, 10000)}-${pick()}${crypto.randomInt(10, 100)}`;
}

/* ---------- per-IP sign-in rate limit (in memory: one app instance) ---------- */
const ipAttempts = new Map(); // ip -> [timestamps]
const IP_WINDOW_MS = 10 * 60 * 1000;
const IP_MAX = 30;

function checkIpLimit(ip) {
  const now = Date.now();
  const list = (ipAttempts.get(ip) || []).filter((t) => now - t < IP_WINDOW_MS);
  ipAttempts.set(ip, list);
  if (list.length >= IP_MAX) throw new HttpError(429, "Too many sign-in attempts from this network. Please wait 10 minutes and try again.");
}
function noteIpFailure(ip) {
  const list = ipAttempts.get(ip) || [];
  list.push(Date.now());
  ipAttempts.set(ip, list);
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of ipAttempts) if (!list.some((t) => now - t < IP_WINDOW_MS)) ipAttempts.delete(ip);
}, 60 * 1000).unref();

/* ---------- sessions ---------- */
async function createSession({ kind, schoolId, userId, ip, userAgent }) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_MAX_HOURS * 3600 * 1000);
  await db.query(
    `INSERT INTO sessions (token_hash, kind, school_id, user_id, expires_at, ip, user_agent) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [sha256(token), kind, schoolId || null, userId, expires, ip || "", String(userAgent || "").slice(0, 200)]
  );
  return { token, expires };
}

async function destroySession(token) {
  if (token) await db.query("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
}

async function destroyUserSessions(userId, exceptToken) {
  await db.query("DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2", [userId, exceptToken ? sha256(exceptToken) : ""]);
}

/*
 * Resolve the cookie to a signed-in person. `active` = the request came from the person doing
 * something (not background polling), so it extends the idle timer.
 */
async function resolveSession(token, { active }) {
  if (!token) return null;
  const h = sha256(token);
  const r = await db.query(
    `SELECT s.*, sc.settings AS school_settings, sc.active AS school_active, sc.code AS school_code
       FROM sessions s LEFT JOIN schools sc ON sc.id = s.school_id
      WHERE s.token_hash = $1`,
    [h]
  );
  const s = r.rows[0];
  if (!s) return null;
  const now = Date.now();
  const idleMin = s.kind === "school" ? settingsLib.full(s.school_settings).sessionTimeoutMinutes : platformSettings.get().adminIdleMinutes;
  const idleExpired = now - new Date(s.last_seen_at).getTime() > idleMin * 60 * 1000;
  if (new Date(s.expires_at).getTime() < now || idleExpired || (s.kind === "school" && !s.school_active)) {
    await db.query("DELETE FROM sessions WHERE token_hash = $1", [h]);
    return { expired: true };
  }

  let principal;
  if (s.kind === "platform") {
    const u = (await db.query("SELECT id, username, name, locked, must_change_password FROM platform_admins WHERE id = $1", [s.user_id])).rows[0];
    if (!u || u.locked) return null;
    principal = { kind: "platform", user: u };
  } else {
    const u = (await db.query(
      `SELECT u.id, u.school_id, u.username, u.role, u.name, u.title, u.teacher_id, u.pupil_id, u.active, u.locked, u.must_change_password,
              COALESCE((SELECT array_agg(pc.pupil_id) FROM parent_children pc WHERE pc.user_id = u.id), '{}') AS pupil_ids
         FROM users u WHERE u.id = $1 AND u.school_id = $2`,
      [s.user_id, s.school_id]
    )).rows[0];
    if (!u || !u.active || u.locked) {
      await db.query("DELETE FROM sessions WHERE token_hash = $1", [h]);
      return null;
    }
    u.roleLabel = schoolTypes.roleLabel(u.role, s.school_settings, ROLE_LABELS);
    principal = { kind: "school", schoolId: s.school_id, schoolCode: s.school_code, user: u };
  }

  if (active && now - new Date(s.last_seen_at).getTime() > 15 * 1000) {
    await db.query("UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1", [h]);
  }
  return principal;
}

/* ---------- sign-in ---------- */
const GENERIC = "School code, username or password is incorrect.";

async function schoolLogin({ schoolCode, username, password, ip, userAgent }) {
  checkIpLimit(ip);
  schoolCode = String(schoolCode || "").trim();
  username = String(username || "").trim();
  password = String(password || "");
  if (!schoolCode || !username || !password) throw new HttpError(400, "Enter your school code, username and password.");

  const school = (await db.query("SELECT id, name, active, settings FROM schools WHERE lower(code) = lower($1)", [schoolCode])).rows[0];
  if (!school || !school.active) {
    noteIpFailure(ip);
    await dummyVerify(password);
    throw new HttpError(401, GENERIC);
  }
  const settings = settingsLib.full(school.settings);
  const u = (await db.query("SELECT * FROM users WHERE school_id = $1 AND lower(username) = lower($2)", [school.id, username])).rows[0];
  if (!u) {
    noteIpFailure(ip);
    await dummyVerify(password);
    throw new HttpError(401, GENERIC);
  }
  if (u.locked) {
    throw new HttpError(423, "This account has been locked after too many failed sign-in attempts. Please contact the Proprietor.");
  }
  const ok = await verifyPassword(password, u.password_hash);
  if (!ok) {
    noteIpFailure(ip);
    const next = u.failed_attempts + 1;
    const lock = next >= settings.lockoutThreshold;
    await db.query("UPDATE users SET failed_attempts = $2, locked = $3 WHERE id = $1", [u.id, next, lock]);
    await audit(school.id, "System", lock ? "Account locked" : "Failed sign-in",
      lock ? `${u.username}: ${next} failed sign-in attempts (threshold: ${settings.lockoutThreshold})` : `${u.username}`, ip);
    if (lock) throw new HttpError(423, "This account has been locked after too many failed sign-in attempts. Please contact the Proprietor.");
    throw new HttpError(401, GENERIC);
  }
  if (!u.active) throw new HttpError(403, "This account has been disabled. Please contact the Proprietor.");

  await db.query("UPDATE users SET failed_attempts = 0, last_login_at = now() WHERE id = $1", [u.id]);
  const session = await createSession({ kind: "school", schoolId: school.id, userId: u.id, ip, userAgent });
  u.roleLabel = schoolTypes.roleLabel(u.role, school.settings, ROLE_LABELS);
  await audit(school.id, actorLabel(u), "Logged in", `Username: ${u.username}`, ip);
  return { session, user: u };
}

async function platformLogin({ username, password, ip, userAgent }) {
  checkIpLimit(ip);
  username = String(username || "").trim();
  password = String(password || "");
  if (!username || !password) throw new HttpError(400, "Enter your username and password.");
  const u = (await db.query("SELECT * FROM platform_admins WHERE lower(username) = lower($1)", [username])).rows[0];
  if (!u) {
    const none = (await db.query("SELECT count(*)::int AS n FROM platform_admins")).rows[0].n === 0;
    if (none) {
      const { status } = require("./status");
      throw new HttpError(503, status.adminProblem
        ? `No platform administrator was created because PLATFORM_ADMIN_PASSWORD was not accepted: ${status.adminProblem} Change it in Railway's Variables; the server restarts by itself.`
        : "No platform administrator exists yet. Add PLATFORM_ADMIN_USERNAME and PLATFORM_ADMIN_PASSWORD in Railway's Variables; the server restarts by itself.");
    }
    noteIpFailure(ip);
    await dummyVerify(password);
    throw new HttpError(401, "Username or password is incorrect.");
  }
  if (u.locked) throw new HttpError(423, "This administrator account is locked. Ask another platform administrator to reset its password, or use PLATFORM_ADMIN_RESET (see README).");
  if (!(await verifyPassword(password, u.password_hash))) {
    noteIpFailure(ip);
    const next = u.failed_attempts + 1;
    const lock = next >= platformSettings.get().adminLockoutThreshold;
    await db.query("UPDATE platform_admins SET failed_attempts = $2, locked = $3 WHERE id = $1", [u.id, next, lock]);
    await audit(null, "System", lock ? "Administrator locked" : "Failed platform sign-in", lock ? `${u.username}: ${next} failed sign-in attempts` : u.username, ip);
    throw new HttpError(401, "Username or password is incorrect.");
  }
  await db.query("UPDATE platform_admins SET failed_attempts = 0, last_login_at = now() WHERE id = $1", [u.id]);
  const session = await createSession({ kind: "platform", userId: u.id, ip, userAgent });
  await audit(null, `${u.name} (Platform admin)`, "Logged in", u.username, ip);
  return { session, user: u };
}

/* First start: create the platform administrator from environment variables. */
async function bootstrapPlatformAdmin() {
  const username = (process.env.PLATFORM_ADMIN_USERNAME || "").trim();
  const password = process.env.PLATFORM_ADMIN_PASSWORD || "";
  const existing = (await db.query("SELECT count(*)::int AS n FROM platform_admins")).rows[0].n;
  if (existing === 0) {
    if (!username || !password) {
      console.warn("[auth] No platform administrator yet. Set PLATFORM_ADMIN_USERNAME and PLATFORM_ADMIN_PASSWORD, then restart.");
      return;
    }
    checkNewPassword(password, username);
    await db.query("INSERT INTO platform_admins (id, username, name, password_hash) VALUES ($1,$2,$3,$4)",
      [require("node:crypto").randomUUID(), username, process.env.PLATFORM_ADMIN_NAME || "Platform Administrator", await hashPassword(password)]);
    console.log(`[auth] created platform administrator "${username}"`);
  } else if (process.env.PLATFORM_ADMIN_RESET === "1" && username && password) {
    // Recovery path: owner of the hosting account resets the admin password via environment variables.
    checkNewPassword(password, username);
    const r = await db.query("UPDATE platform_admins SET password_hash = $2, locked = false, failed_attempts = 0 WHERE lower(username) = lower($1)",
      [username, await hashPassword(password)]);
    console.log(r.rowCount ? `[auth] reset password for platform administrator "${username}". Remove PLATFORM_ADMIN_RESET now.` : `[auth] PLATFORM_ADMIN_RESET: no administrator named "${username}"`);
  }
}

const ROLE_LABELS = {
  proprietor: "Proprietor", principal: "Principal", bursar: "Bursar",
  teacher: "Teacher", pupil: "Pupil", parent: "Parent", examofficer: "Exam Officer",
};
function actorLabel(u) {
  return `${u.name} (${u.roleLabel || ROLE_LABELS[u.role] || u.role})`;
}

async function audit(schoolId, actor, action, details, ip, client) {
  const q = client || db;
  await q.query("INSERT INTO audit_log (school_id, actor, action, details, ip) VALUES ($1,$2,$3,$4,$5)",
    [schoolId, actor, action, String(details || "").slice(0, 500), ip || ""]);
}

module.exports = {
  COOKIE, hashPassword, verifyPassword, checkNewPassword, generateTempPassword,
  createSession, destroySession, destroyUserSessions, resolveSession,
  schoolLogin, platformLogin, bootstrapPlatformAdmin, actorLabel, audit, ROLE_LABELS, newId,
};
