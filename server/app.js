"use strict";
/*
 * HTTP layer: routing, security headers, cookies, request limits and compression.
 * No web framework: Node's built-in http module keeps the dependency list to one package (pg).
 */
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const db = require("./db");
const auth = require("./auth");
const actions = require("./actions");
const projection = require("./projection");
const backup = require("./backup");
const platform = require("./platform");
const settingsLib = require("./settings");
const { HttpError, parseDataUrl } = require("./util");
const { status } = require("./status");

const DIST = path.join(__dirname, "..", "web", "dist");
const TRUST_PROXY = process.env.TRUST_PROXY === "1" || !!process.env.RAILWAY_ENVIRONMENT;
const FORCE_SECURE_COOKIE = process.env.COOKIE_SECURE === "1";
const MAX_JSON = 4 * 1024 * 1024;
const MAX_RESTORE = 60 * 1024 * 1024;

/* ---------- helpers ---------- */
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; "),
};

function clientIp(req) {
  if (TRUST_PROXY) {
    const real = req.headers["x-real-ip"];
    if (real) return String(real).trim();
    const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1];
  }
  return req.socket.remoteAddress || "";
}

function isHttps(req) {
  if (FORCE_SECURE_COOKIE) return true;
  if (TRUST_PROXY && String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https") return true;
  return !!req.socket.encrypted;
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sessionCookie(req, token, expires) {
  const attrs = [`${auth.COOKIE}=${token || ""}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (isHttps(req)) attrs.push("Secure");
  attrs.push(token ? `Expires=${expires.toUTCString()}` : "Max-Age=0");
  return attrs.join("; ");
}

function send(req, res, status, body, headers = {}) {
  let payload = body;
  const h = { ...SECURITY_HEADERS, ...headers };
  if (!Buffer.isBuffer(body) && typeof body !== "string") {
    payload = JSON.stringify(body);
    h["Content-Type"] = h["Content-Type"] || "application/json; charset=utf-8";
  }
  if (!h["Cache-Control"]) h["Cache-Control"] = "no-store";
  if (isHttps(req)) h["Strict-Transport-Security"] = "max-age=31536000";
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const compressible = /json|javascript|html|css|svg|text/.test(h["Content-Type"] || "");
  if (compressible && buf.length > 1024 && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
    h["Content-Encoding"] = "gzip";
    h["Vary"] = "Accept-Encoding";
    const z = zlib.gzipSync(buf, { level: 6 });
    h["Content-Length"] = z.length;
    res.writeHead(status, h);
    return res.end(req.method === "HEAD" ? undefined : z);
  }
  h["Content-Length"] = buf.length;
  res.writeHead(status, h);
  res.end(req.method === "HEAD" ? undefined : buf);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, "That is too large to upload."));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req, limit = MAX_JSON) {
  if (!/application\/json/.test(req.headers["content-type"] || "")) throw new HttpError(415, "Expected JSON.");
  const raw = await readBody(req, limit);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch (e) {
    throw new HttpError(400, "The request was not valid JSON.");
  }
}

/*
 * Cross-site request forgery guard for every state-changing request: browsers will not send a custom
 * header cross-site without a CORS preflight (which this server never approves), and the Origin, when
 * present, must be this site.
 */
function checkCsrf(req) {
  if (req.headers["x-sms-request"] !== "1") throw new HttpError(403, "Request blocked (missing request header).");
  const origin = req.headers.origin;
  if (origin) {
    let host;
    try { host = new URL(origin).host; } catch (e) { host = ""; }
    const expected = (TRUST_PROXY && req.headers["x-forwarded-host"]) || req.headers.host;
    if (host !== expected) throw new HttpError(403, "Request blocked (wrong origin).");
  }
}

async function principalFor(req, { active = true } = {}) {
  const token = parseCookies(req)[auth.COOKIE];
  const p = await auth.resolveSession(token, { active });
  if (!p) throw new HttpError(401, "Please sign in.");
  if (p.expired) throw new HttpError(401, "You were signed out after a period of inactivity. Please sign in again.", { expired: true });
  return { ...p, token };
}

async function schoolPrincipal(req, opts) {
  const p = await principalFor(req, opts);
  if (p.kind !== "school") throw new HttpError(403, "This is for school accounts.");
  return p;
}

async function platformPrincipal(req, opts) {
  const p = await principalFor(req, opts);
  if (p.kind !== "platform") throw new HttpError(403, "This is for platform administrators.");
  return p;
}

/* ---------- installable app ---------- */
/* The app's description for "Install". With ?school=CODE the installed app carries that school's name. */
async function manifest(code) {
  const base = {
    name: "Elite Smart School Systems", short_name: "Elite School", start_url: "/", scope: "/",
    display: "standalone", background_color: "#FFFFFF", theme_color: "#0B4DA2",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  if (!code || !/^[A-Za-z0-9-]{2,20}$/.test(code)) return base;
  const s = (await db.query("SELECT code, name, settings FROM schools WHERE lower(code) = lower($1) AND active", [code])).rows[0];
  if (!s) return base;
  const st = settingsLib.full(s.settings);
  return {
    ...base, id: `/?school=${s.code}`, name: s.name, short_name: s.name.length <= 12 ? s.name : s.code,
    start_url: `/?school=${encodeURIComponent(s.code)}`, theme_color: st.colors.primary,
  };
}

/* ---------- static files ---------- */
const STATIC_TYPES = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".html": "text/html; charset=utf-8" };
let indexHtml = null;

function serveStatic(req, res, pathname) {
  if (pathname !== "/" && !pathname.includes("..")) {
    const file = path.join(DIST, pathname);
    if (file.startsWith(DIST + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      const type = STATIC_TYPES[path.extname(file)] || "application/octet-stream";
      // hashed app code never changes; everything else (service worker, offline page, icons) is checked each time
      const cache = /^\/app\.[0-9a-f]+\.js$/.test(pathname) ? "public, max-age=31536000, immutable" : "no-cache";
      return send(req, res, 200, fs.readFileSync(file), { "Content-Type": type, "Cache-Control": cache });
    }
  }
  if (!indexHtml) {
    const f = path.join(DIST, "index.html");
    if (!fs.existsSync(f)) return send(req, res, 500, "The web app has not been built. Run: npm run build", { "Content-Type": "text/plain" });
    indexHtml = fs.readFileSync(f);
  }
  return send(req, res, 200, indexHtml, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
}

function sendImage(req, res, dataUrl) {
  const img = parseDataUrl(dataUrl);
  if (!img) throw new HttpError(404, "No image.");
  return send(req, res, 200, img.body, { "Content-Type": img.type, "Cache-Control": "private, max-age=86400" });
}

function attachment(name) {
  return `attachment; filename="${name.replace(/[^A-Za-z0-9._-]/g, "_")}"`;
}

function setupPage(problem) {
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="15"><title>Setting up - Elite Smart School Systems</title></head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:60px auto;padding:0 16px;color:#1B3A2E;background:#FAF7F0">
<h1 style="font-size:22px">Elite Smart School Systems is not ready yet</h1>
<p style="font-size:16px;line-height:1.5">${esc(problem)}</p>
<p style="color:#666;font-size:14px">This page checks again every 15 seconds.</p></body></html>`;
}

/* ---------- routes ---------- */
async function route(req, res) {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  const m = req.method;
  const ip = clientIp(req);
  const ctx = { ip };

  // Until the database is ready: stay up for the health check, and explain the problem to visitors.
  if (!status.ready) {
    if (p === "/healthz") return send(req, res, 200, "starting: " + status.problem, { "Content-Type": "text/plain" });
    if (p.startsWith("/api/")) throw new HttpError(503, status.problem);
    return send(req, res, 503, setupPage(status.problem), { "Content-Type": "text/html; charset=utf-8", "Retry-After": "10" });
  }

  if (m === "GET" && p === "/manifest.webmanifest") {
    return send(req, res, 200, JSON.stringify(await manifest(url.searchParams.get("school"))), { "Content-Type": "application/manifest+json", "Cache-Control": "no-cache" });
  }

  if (p === "/healthz") {
    await db.query("SELECT 1");
    return send(req, res, 200, "ok", { "Content-Type": "text/plain" });
  }

  if (!p.startsWith("/api/")) {
    if (m !== "GET" && m !== "HEAD") return send(req, res, 405, { error: "Method not allowed" });
    return serveStatic(req, res, p);
  }

  if (m !== "GET" && m !== "HEAD") checkCsrf(req);
  let r;

  // --- public (no sign-in) ---
  if (m === "GET" && (r = /^\/api\/public\/school\/([^/]+)$/.exec(p))) {
    const s = (await db.query("SELECT code, name, settings, logo IS NOT NULL AS has_logo, rev FROM schools WHERE lower(code) = lower($1) AND active", [decodeURIComponent(r[1])])).rows[0];
    if (!s) return send(req, res, 404, { error: "No active school uses that code." });
    const st = settingsLib.full(s.settings);
    return send(req, res, 200, {
      code: s.code, name: s.name, motto: st.motto, location: st.location, colors: st.colors,
      logoUrl: s.has_logo ? `/api/public/logo/${encodeURIComponent(s.code)}?v=${s.rev}` : "",
    }, { "Cache-Control": "no-cache" });
  }
  if (m === "GET" && (r = /^\/api\/public\/logo\/([^/]+)$/.exec(p))) {
    const s = (await db.query("SELECT logo FROM schools WHERE lower(code) = lower($1) AND active", [decodeURIComponent(r[1])])).rows[0];
    if (!s || !s.logo) return send(req, res, 404, { error: "No logo." });
    return sendImage(req, res, s.logo);
  }

  // --- school sign-in ---
  if (m === "POST" && p === "/api/login") {
    const b = await readJson(req);
    const { session } = await auth.schoolLogin({ schoolCode: b.schoolCode, username: b.username, password: b.password, ip, userAgent: req.headers["user-agent"] });
    return send(req, res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, session.token, session.expires) });
  }
  if (m === "POST" && p === "/api/logout") {
    const token = parseCookies(req)[auth.COOKIE];
    try {
      const who = await auth.resolveSession(token, { active: false });
      if (who && who.kind === "school") await auth.audit(who.schoolId, auth.actorLabel(who.user), "Logged out", `Username: ${who.user.username}`, ip);
    } catch (e) { /* signing out always succeeds */ }
    await auth.destroySession(token);
    return send(req, res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, "", null) });
  }

  // --- school data ---
  if (m === "GET" && p === "/api/data") {
    const passive = req.headers["x-sms-passive"] === "1";
    const who = await schoolPrincipal(req, { active: !passive });
    const rev = (await db.query("SELECT rev FROM schools WHERE id = $1", [who.schoolId])).rows[0].rev;
    const etag = `"r${rev}-${who.user.id}-${who.user.must_change_password ? 1 : 0}"`;
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, { ...SECURITY_HEADERS, ETag: etag, "Cache-Control": "no-cache" });
      return res.end();
    }
    const data = await db.withSchool(who.schoolId, (c) => projection.build(c, who));
    return send(req, res, 200, data, { ETag: etag, "Cache-Control": "no-cache" });
  }
  if (m === "POST" && (r = /^\/api\/action\/([A-Za-z]+)$/.exec(p))) {
    const who = await schoolPrincipal(req);
    const body = await readJson(req, r[1] === "restoreBackup" ? MAX_RESTORE : MAX_JSON);
    const result = await db.withSchool(who.schoolId, (c) => actions.run(r[1], c, who, body, ctx));
    return send(req, res, 200, { ok: true, result });
  }
  if (m === "POST" && p === "/api/password") {
    const who = await schoolPrincipal(req);
    const b = await readJson(req);
    const row = (await db.query("SELECT password_hash FROM users WHERE id = $1 AND school_id = $2", [who.user.id, who.schoolId])).rows[0];
    if (!row || !(await auth.verifyPassword(String(b.current || ""), row.password_hash))) throw new HttpError(400, "Your current password is not correct.");
    auth.checkNewPassword(b.next, who.user.username);
    if (b.next === b.current) throw new HttpError(400, "Choose a password different from the current one.");
    await db.query("UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1", [who.user.id, await auth.hashPassword(b.next)]);
    await auth.destroyUserSessions(who.user.id, who.token);
    await db.query("UPDATE schools SET rev = rev + 1 WHERE id = $1", [who.schoolId]);
    await auth.audit(who.schoolId, auth.actorLabel(who.user), "Changed own password", "", ip);
    return send(req, res, 200, { ok: true });
  }
  if (m === "GET" && (r = /^\/api\/photo\/(pupil|teacher)\/([^/]+)$/.exec(p))) {
    const who = await schoolPrincipal(req, { active: false });
    const id = decodeURIComponent(r[2]);
    const photo = await db.withSchool(who.schoolId, async (c) => {
      const ok = r[1] === "pupil" ? await projection.canSeePupil(c, who, id) : await projection.canSeeTeacher(c, who, id);
      if (!ok) throw new HttpError(404, "No photo.");
      const t = r[1] === "pupil" ? "pupils" : "teachers";
      return (await c.query(`SELECT photo FROM ${t} WHERE school_id = $1 AND id = $2`, [who.schoolId, id])).rows[0];
    });
    if (!photo || !photo.photo) throw new HttpError(404, "No photo.");
    return sendImage(req, res, photo.photo);
  }
  if (m === "GET" && p === "/api/export") {
    const who = await schoolPrincipal(req);
    if (who.user.role !== "proprietor") throw new HttpError(403, "Only the Proprietor can download backups.");
    const data = await db.withSchool(who.schoolId, async (c) => {
      const d = await backup.exportSchool(c, who.schoolId);
      await auth.audit(who.schoolId, auth.actorLabel(who.user), "Downloaded backup", "", ip, c);
      return d;
    });
    return send(req, res, 200, data, { "Content-Disposition": attachment(`${data.school.code}-backup-${new Date().toISOString().slice(0, 10)}.json`) });
  }
  if (m === "GET" && p === "/api/snapshots") {
    const who = await schoolPrincipal(req);
    if (who.user.role !== "proprietor") throw new HttpError(403, "Only the Proprietor can see backups.");
    const rows = await db.withSchool(who.schoolId, async (c) =>
      (await c.query("SELECT id::text, reason, created_at AS \"createdAt\", length(data::text) AS size FROM snapshots WHERE school_id = $1 ORDER BY created_at DESC", [who.schoolId])).rows);
    return send(req, res, 200, rows);
  }
  if (m === "GET" && (r = /^\/api\/snapshots\/(\d+)$/.exec(p))) {
    const who = await schoolPrincipal(req);
    if (who.user.role !== "proprietor") throw new HttpError(403, "Only the Proprietor can download backups.");
    const row = await db.withSchool(who.schoolId, async (c) =>
      (await c.query("SELECT data, created_at FROM snapshots WHERE school_id = $1 AND id = $2", [who.schoolId, r[1]])).rows[0]);
    if (!row) throw new HttpError(404, "Backup not found.");
    return send(req, res, 200, row.data, { "Content-Disposition": attachment(`${row.data.school.code}-backup-${new Date(row.created_at).toISOString().slice(0, 10)}.json`) });
  }

  // --- platform administration ---
  if (m === "POST" && p === "/api/platform/login") {
    const b = await readJson(req);
    const { session } = await auth.platformLogin({ username: b.username, password: b.password, ip, userAgent: req.headers["user-agent"] });
    return send(req, res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, session.token, session.expires) });
  }
  if (p.startsWith("/api/platform/")) {
    const who = await platformPrincipal(req);
    const admin = who.user;
    if (m === "GET" && p === "/api/platform/me") return send(req, res, 200, { id: admin.id, username: admin.username, name: admin.name, rowSecurity: db.rowSecurityEnabled() });
    if (m === "GET" && p === "/api/platform/schools") return send(req, res, 200, await platform.listSchools());
    if (m === "GET" && p === "/api/platform/audit") return send(req, res, 200, await platform.platformAudit());
    if (m === "POST" && p === "/api/platform/schools") return send(req, res, 200, await platform.createSchool(admin, await readJson(req), ip));
    if (m === "POST" && (r = /^\/api\/platform\/schools\/([0-9a-f-]{36})\/active$/.exec(p))) {
      const b = await readJson(req);
      await platform.setActive(admin, r[1], b.active, ip);
      return send(req, res, 200, { ok: true });
    }
    if (m === "POST" && (r = /^\/api\/platform\/schools\/([0-9a-f-]{36})\/reset-proprietor$/.exec(p))) {
      return send(req, res, 200, await platform.resetProprietor(admin, r[1], ip));
    }
    if (m === "POST" && p === "/api/platform/password") {
      const b = await readJson(req);
      await platform.changeOwnPassword(admin, b.current, b.next);
      await auth.destroyUserSessions(admin.id, who.token);
      return send(req, res, 200, { ok: true });
    }
  }

  throw new HttpError(404, "Not found.");
}

function handler(req, res) {
  route(req, res).catch((e) => {
    if (e instanceof HttpError) return send(req, res, e.status, { error: e.message, ...(e.extra || {}) });
    if (e && e.code === "23505") return send(req, res, 409, { error: "That would create a duplicate record." });
    console.error(`[error] ${req.method} ${req.url}:`, e);
    send(req, res, 500, { error: "Something went wrong on the server. Please try again." });
  });
}

module.exports = { handler };
