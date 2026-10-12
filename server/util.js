"use strict";
const crypto = require("node:crypto");

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const bad = (msg) => new HttpError(400, msg);
const forbidden = (msg = "You do not have permission to do that.") => new HttpError(403, msg);
const notFound = (msg = "Not found.") => new HttpError(404, msg);

function newId(prefix) {
  // 12 chars of base36 from 64 random bits: unguessable and short enough to read in logs
  return prefix + "_" + crypto.randomBytes(8).readBigUInt64BE().toString(36).padStart(12, "0");
}

function str(v, field, { max = 200, required = false, trim = true } = {}) {
  if (v === undefined || v === null) v = "";
  if (typeof v !== "string") throw bad(`${field} must be text.`);
  if (trim) v = v.trim();
  if (required && !v) throw bad(`${field} is required.`);
  if (v.length > max) throw bad(`${field} is too long (max ${max} characters).`);
  return v;
}

function num(v, field, { min = -Infinity, max = Infinity, integer = false, required = true } = {}) {
  if ((v === "" || v === undefined || v === null) && !required) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw bad(`${field} must be a number.`);
  if (integer && !Number.isInteger(n)) throw bad(`${field} must be a whole number.`);
  if (n < min || n > max) throw bad(`${field} must be between ${min} and ${max}.`);
  return n;
}

function bool(v) {
  return v === true || v === "true" || v === 1;
}

function arr(v, field, { max = 500 } = {}) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw bad(`${field} must be a list.`);
  if (v.length > max) throw bad(`${field} has too many items.`);
  return v;
}

const DATA_URL_RE = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGE_CHARS = 2 * 1024 * 1024; // ~1.5 MB image once decoded

function imageDataUrl(v, field) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !DATA_URL_RE.test(v)) throw bad(`${field} must be a PNG, JPEG, GIF or WebP image.`);
  if (v.length > MAX_IMAGE_CHARS) throw bad(`${field} is too large. Please use an image under 1.5 MB.`);
  return v;
}

function parseDataUrl(v) {
  const m = /^data:(image\/[a-z+]+);base64,(.*)$/.exec(v || "");
  if (!m) return null;
  return { type: m[1], body: Buffer.from(m[2], "base64") };
}

function dateOnly(v, field, { required = false } = {}) {
  if (!v) {
    if (required) throw bad(`${field} is required.`);
    return "";
  }
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + "T00:00:00Z"))) {
    throw bad(`${field} must be a date like 2015-03-21.`);
  }
  return v;
}

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

function today() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { HttpError, bad, forbidden, notFound, newId, str, num, bool, arr, imageDataUrl, parseDataUrl, dateOnly, sha256, today };
