"use strict";
// End-to-end smoke test: starts the server on a temp data dir and exercises the API and the browser shim.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const PORT = 3100 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "sms-test-"));
const AUTH = "Basic " + Buffer.from("tester:s3cret!").toString("base64");
let pass = 0, fail = 0;
const ok = (c, name) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}`); };
const call = (m, p, body, headers = {}) =>
  fetch(BASE + p, { method: m, headers: { Authorization: AUTH, ...headers }, body }).then(async (r) => {
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) {}
    return { status: r.status, text: t, json: j };
  });
const put = (k, v, base) => call("PUT", "/api/storage/" + k, JSON.stringify({ value: v }),
  { "Content-Type": "application/json", ...(base !== undefined ? { "X-Base-Version": String(base) } : {}) });

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT, DATA_DIR: DATA, SITE_PASSWORD: "s3cret!" }, stdio: ["ignore", "pipe", "pipe"],
  });
  srv.stderr.on("data", (d) => process.stderr.write(d));
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + "/healthz"); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }

  try {
    ok((await fetch(BASE + "/healthz")).status === 200, "healthz open without auth");
    ok((await fetch(BASE + "/")).status === 401, "site requires auth");
    ok((await fetch(BASE + "/api/storage/x")).status === 401, "API requires auth");
    const home = await call("GET", "/");
    ok(home.status === 200 && home.text.includes('src="/storage-shim.js"') && home.text.indexOf("storage-shim") < home.text.indexOf("<script>"), "app served with shim injected before bundle");

    ok((await call("GET", "/api/storage/k1")).status === 404, "missing key -> 404");
    let r = await put("k1", "A");
    ok(r.status === 200 && r.json.version === 1, "first write to new key -> v1");
    r = await call("GET", "/api/storage/k1");
    ok(r.json.value === "A" && r.json.version === 1, "read back value + version");
    ok((await put("k1", "EVIL-SEED")).status === 409, "blind write to existing key rejected");
    ok((await call("GET", "/api/storage/k1")).json.value === "A", "data intact after rejected blind write");
    r = await put("k1", "B", 1);
    ok(r.status === 200 && r.json.version === 2, "write with correct base -> v2");
    r = await put("k1", "C-from-stale-client", 1);
    ok(r.status === 200 && r.json.version === 3, "stale write accepted (last-write-wins) -> v3");
    const hist = fs.readdirSync(path.join(DATA, "history")).flatMap((d) => fs.readdirSync(path.join(DATA, "history", d)));
    ok(hist.some((f) => f.includes("stale-overwrite")), "stale overwrite snapshotted for recovery");
    ok((await put("bad key!", "x")).status === 400, "invalid key -> 400");
    ok((await put("big", "x".repeat(5 * 1024 * 1024 + 10))).status === 413, "oversize value -> 413");
    ok((await call("PUT", "/api/storage/k2", "{not json", { "Content-Type": "application/json" })).status === 400, "bad JSON -> 400");
    await put("pre:a", "1"); await put("pre:b", "2");
    r = await call("GET", "/api/storage?prefix=pre:");
    ok(JSON.stringify(r.json.keys) === '["pre:a","pre:b"]', "list by prefix");
    r = await call("GET", "/api/export");
    ok(r.json.k1 && r.json.k1.value === "C-from-stale-client", "export contains data");
    ok((await call("DELETE", "/api/storage/pre:a")).status === 200 && (await call("GET", "/api/storage/pre:a")).status === 404, "delete works");
    ok((await call("GET", "/../../etc/passwd")).status === 404, "no path traversal / static file serving");

    // ---- exercise the real browser shim against the server ----
    const shimSrc = fs.readFileSync(path.join(__dirname, "..", "public", "storage-shim.js"), "utf8");
    const mkWindow = () => {
      const w = { document: { getElementById: () => null, createElement: () => ({ style: {} }), body: { appendChild() {} } } };
      w.window = w;
      const ctx = vm.createContext({
        window: w, document: w.document, AbortController, setTimeout, clearTimeout, console,
        fetch: (u, o = {}) => fetch(BASE + u, { ...o, headers: { ...(o.headers || {}), Authorization: AUTH } }),
      });
      vm.runInContext(shimSrc, ctx);
      return w.storage;
    };
    const DBK = "dia-school-db-v1";
    const s1 = mkWindow(), s2 = mkWindow();
    ok((await s1.get(DBK)) === null, "shim: get on missing key -> null (app then seeds defaults)");
    await s1.set(DBK, JSON.stringify({ users: ["seed"] }));
    const got = await s2.get(DBK);
    ok(JSON.parse(got.value).users[0] === "seed", "shim: second 'device' sees first device's write");
    await s2.set(DBK, JSON.stringify({ users: ["seed", "added-by-2"] }));
    const again = await s1.get(DBK);
    ok(JSON.parse(again.value).users.length === 2, "shim: first device sees second device's write after reload");
    const s3 = mkWindow(); // never read -> simulates timed-out load followed by seed overwrite
    let rejected = false;
    try { await s3.set(DBK, JSON.stringify({ users: ["WIPE"] })); } catch (e) { rejected = true; }
    ok(rejected, "shim: write without a successful prior read is refused (protects against seed-wipe)");
    ok(JSON.parse((await s1.get(DBK)).value).users.length === 2, "shim: real data survived the wipe attempt");
  } catch (e) {
    fail++; console.error("TEST ERROR", e);
  } finally {
    srv.kill();
    fs.rmSync(DATA, { recursive: true, force: true });
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
