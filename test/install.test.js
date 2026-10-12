"use strict";
/* The installable app: its description per school, and caching that never keeps school records. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { setup } = require("./helpers");

let env;
test.before(async () => {
  env = await setup();
  await env.school("TISL");
});
test.after(async () => { if (env) await env.teardown(); });

test("the install description is generic, or carries the school's name when given its code", async () => {
  const plain = await fetch(env.base + "/manifest.webmanifest");
  assert.equal(plain.status, 200);
  assert.match(plain.headers.get("content-type"), /manifest\+json/);
  const m = await plain.json();
  assert.equal(m.display, "standalone");
  assert.ok(m.icons.some((i) => i.sizes === "512x512"));
  for (const i of m.icons) assert.equal((await fetch(env.base + i.src)).status, 200, i.src);

  const school = await (await fetch(env.base + "/manifest.webmanifest?school=tisl")).json();
  assert.equal(school.name, "TISL School");
  assert.equal(school.start_url, "/?school=TISL");
  const unknown = await (await fetch(env.base + "/manifest.webmanifest?school=NOPE")).json();
  assert.equal(unknown.name, "Elite Smart School Systems");
});

test("the service worker and offline page are served fresh; only hashed app code is cached long", async () => {
  const sw = await fetch(env.base + "/sw.js");
  assert.equal(sw.status, 200);
  assert.equal(sw.headers.get("cache-control"), "no-cache");
  assert.match(sw.headers.get("content-type"), /javascript/);
  const off = await fetch(env.base + "/offline.html");
  assert.match(off.headers.get("content-type"), /text\/html/);
  const page = await (await fetch(env.base + "/")).text();
  const app = /src="(\/app\.[0-9a-f]+\.js)"/.exec(page)[1];
  assert.match((await fetch(env.base + app)).headers.get("cache-control"), /immutable/);
});

test("the service worker never stores answers from the server's /api/", () => {
  const code = fs.readFileSync(path.join(__dirname, "..", "web", "public", "sw.js"), "utf8");
  assert.match(code, /url\.pathname\.startsWith\("\/api\/"\)\) return;/);
  assert.ok(!/cache\.put\(|c\.put\(/.test(code.split('if (req.mode === "navigate")')[1].split("return;")[0]), "pages are not cached");
});
