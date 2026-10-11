"use strict";
/*
 * School Management System — test backend
 * Zero npm dependencies (Node >= 18). Serves the app and a small key-value storage API.
 *
 * Env vars:
 *   PORT            default 3000
 *   DATA_DIR        default $RAILWAY_VOLUME_MOUNT_PATH if set, else ./data (MUST be persistent disk in production)
 *   SITE_USER       default "tester" (basic-auth username)
 *   SITE_PASSWORD   if set, the whole site + API requires HTTP basic auth
 *   HISTORY_KEEP    default 200      (snapshots retained per key)
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, "data"));
const STORE_DIR = path.join(DATA_DIR, "store");
const HISTORY_DIR = path.join(DATA_DIR, "history");
const SITE_USER = process.env.SITE_USER || "tester";
const SITE_PASSWORD = process.env.SITE_PASSWORD || "";
const HISTORY_KEEP = Number(process.env.HISTORY_KEEP || 200);
const MAX_BODY = 5 * 1024 * 1024; // 5 MB per value
const KEY_RE = /^[A-Za-z0-9:_.\-]{1,200}$/;
const SNAPSHOT_MIN_INTERVAL_MS = 60 * 1000;

fs.mkdirSync(STORE_DIR, { recursive: true });
fs.mkdirSync(HISTORY_DIR, { recursive: true });

/* ---------- app HTML (original bundle + shim tag, built once at startup) ---------- */
const APP_HTML = (() => {
  const raw = fs.readFileSync(path.join(__dirname, "public", "app.html"), "utf8");
  const tag = '<script src="/storage-shim.js"></script>\n';
  const i = raw.indexOf("<script");
  if (i === -1) throw new Error("app.html contains no <script> tag");
  return raw.slice(0, i) + tag + raw.slice(i);
})();
const SHIM_JS = fs.readFileSync(path.join(__dirname, "public", "storage-shim.js"));

/* ---------- storage ---------- */
const enc = (key) => Buffer.from(key, "utf8").toString("base64url");
const filePath = (key) => path.join(STORE_DIR, enc(key) + ".json");

function readEntry(key) {
  try {
    return JSON.parse(fs.readFileSync(filePath(key), "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

function atomicWrite(file, text) {
  const tmp = file + "." + process.pid + ".tmp";
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, text);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

function snapshot(key, entry, reason) {
  const dir = path.join(HISTORY_DIR, enc(key));
  fs.mkdirSync(dir, { recursive: true });
  const name = `${new Date().toISOString().replace(/[:.]/g, "-")}_v${entry.version}_${reason}.json`;
  atomicWrite(path.join(dir, name), JSON.stringify(entry));
  const files = fs.readdirSync(dir).sort();
  for (const f of files.slice(0, Math.max(0, files.length - HISTORY_KEEP))) fs.unlinkSync(path.join(dir, f));
}

const lastSnapshotAt = new Map();

/* All writes are synchronous fs calls on a single thread, so they are serialized by the event loop. */
function writeEntry(key, value, baseVersion) {
  const current = readEntry(key);

  if (current && baseVersion === undefined) {
    // Client never successfully read this key (e.g. its load timed out) and is trying to write anyway.
    return { status: 409, body: { error: "blind-write-rejected: reload the page to sync before saving" } };
  }

  let reason = null;
  if (current) {
    const stale = String(current.version) !== String(baseVersion);
    const now = Date.now();
    if (stale) reason = "stale-overwrite";
    else if (now - (lastSnapshotAt.get(key) || 0) > SNAPSHOT_MIN_INTERVAL_MS) reason = "periodic";
    if (reason) {
      snapshot(key, current, reason);
      lastSnapshotAt.set(key, now);
    }
    if (stale) console.warn(`[warn] stale write on "${key}" (base v${baseVersion}, server v${current.version}); previous data snapshotted`);
  }

  const entry = { key, value, version: (current ? current.version : 0) + 1, updatedAt: new Date().toISOString() };
  atomicWrite(filePath(key), JSON.stringify(entry));
  return { status: 200, body: { key, version: entry.version } };
}

function listKeys(prefix) {
  const keys = [];
  for (const f of fs.readdirSync(STORE_DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      const k = JSON.parse(fs.readFileSync(path.join(STORE_DIR, f), "utf8")).key;
      if (!prefix || k.startsWith(prefix)) keys.push(k);
    } catch (e) {}
  }
  return keys.sort();
}

/* ---------- http helpers ---------- */
function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body) || typeof body === "string";
  const payload = isBuf ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": isBuf ? headers["Content-Type"] || "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...headers,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooBig = false;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) tooBig = true; // keep draining (discarding) so the client can read our 413
      else if (!tooBig) chunks.push(c);
    });
    req.on("end", () => {
      if (tooBig) reject(Object.assign(new Error("payload too large"), { status: 413 }));
      else resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function authorized(req) {
  if (!SITE_PASSWORD) return true;
  const h = req.headers.authorization || "";
  if (!h.startsWith("Basic ")) return false;
  const [u, ...rest] = Buffer.from(h.slice(6), "base64").toString("utf8").split(":");
  const p = rest.join(":");
  const eq = (a, b) => {
    const ha = crypto.createHash("sha256").update(a).digest();
    const hb = crypto.createHash("sha256").update(b).digest();
    return crypto.timingSafeEqual(ha, hb);
  };
  const userOk = eq(u, SITE_USER);
  const passOk = eq(p, SITE_PASSWORD);
  return userOk && passOk;
}

/* ---------- router ---------- */
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://x");
    const p = u.pathname;

    if (p === "/healthz") return send(res, 200, "ok");

    if (!authorized(req)) {
      return send(res, 401, "Authentication required", { "WWW-Authenticate": 'Basic realm="SMS test site", charset="UTF-8"' });
    }

    if (req.method === "GET" && (p === "/" || p === "/index.html")) {
      return send(res, 200, APP_HTML, { "Content-Type": "text/html; charset=utf-8" });
    }
    if (req.method === "GET" && p === "/storage-shim.js") {
      return send(res, 200, SHIM_JS, { "Content-Type": "application/javascript; charset=utf-8" });
    }

    if (req.method === "GET" && p === "/api/export") {
      const out = {};
      for (const k of listKeys("")) out[k] = readEntry(k);
      return send(res, 200, out, { "Content-Disposition": `attachment; filename="sms-export-${Date.now()}.json"` });
    }

    if (p === "/api/storage" && req.method === "GET") {
      return send(res, 200, { keys: listKeys(u.searchParams.get("prefix") || "") });
    }

    if (p.startsWith("/api/storage/")) {
      const key = decodeURIComponent(p.slice("/api/storage/".length));
      if (!KEY_RE.test(key)) return send(res, 400, { error: "invalid key" });

      if (req.method === "GET") {
        const e = readEntry(key);
        return e ? send(res, 200, { key, value: e.value, version: e.version, updatedAt: e.updatedAt }) : send(res, 404, { error: "not found" });
      }
      if (req.method === "PUT") {
        let parsed;
        try {
          parsed = JSON.parse(await readBody(req));
        } catch (e) {
          if (e.status) return send(res, e.status, { error: e.message });
          return send(res, 400, { error: "invalid JSON" });
        }
        if (typeof parsed.value !== "string") return send(res, 400, { error: "value must be a string" });
        const base = req.headers["x-base-version"];
        const r = writeEntry(key, parsed.value, base === undefined ? undefined : String(base));
        return send(res, r.status, r.body);
      }
      if (req.method === "DELETE") {
        const e = readEntry(key);
        if (!e) return send(res, 404, { error: "not found" });
        snapshot(key, e, "deleted");
        fs.unlinkSync(filePath(key));
        return send(res, 200, { key, deleted: true });
      }
    }

    return send(res, 404, "Not found");
  } catch (e) {
    console.error("[error]", e);
    return send(res, 500, { error: "internal error" });
  }
});

server.listen(PORT, () => {
  console.log(`SMS test server on :${PORT}  data=${DATA_DIR}  auth=${SITE_PASSWORD ? "ON" : "OFF (set SITE_PASSWORD!)"}`);
});
