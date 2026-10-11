"use strict";
/*
 * Recover data from snapshots.
 *   node scripts/restore.js                      list keys that have snapshots
 *   node scripts/restore.js <key>                list snapshots for a key (newest last)
 *   node scripts/restore.js <key> <filename>     restore that snapshot as the live value
 * Stop the server first (or restore, then reload all browsers) to avoid races.
 */
const fs = require("node:fs");
const path = require("node:path");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"));
const enc = (k) => Buffer.from(k, "utf8").toString("base64url");
const [, , key, file] = process.argv;
const HIST = path.join(DATA_DIR, "history");

if (!key) {
  if (!fs.existsSync(HIST)) return console.log("no history yet");
  for (const d of fs.readdirSync(HIST)) console.log(Buffer.from(d, "base64url").toString("utf8"));
  return;
}
const dir = path.join(HIST, enc(key));
if (!fs.existsSync(dir)) return console.log("no snapshots for", key);
if (!file) {
  for (const f of fs.readdirSync(dir).sort()) {
    const s = fs.statSync(path.join(dir, f));
    console.log(f, `(${s.size} bytes)`);
  }
  return;
}
const snap = JSON.parse(fs.readFileSync(path.join(dir, path.basename(file)), "utf8"));
const target = path.join(DATA_DIR, "store", enc(key) + ".json");
let version = snap.version;
try { version = Math.max(version, JSON.parse(fs.readFileSync(target, "utf8")).version) + 1; } catch (e) {}
fs.writeFileSync(target, JSON.stringify({ key, value: snap.value, version, updatedAt: new Date().toISOString() }));
console.log(`restored ${file} -> ${key} (now v${version}). Reload all open browsers.`);
