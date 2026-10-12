"use strict";
/* Setup mistakes on the host keep the server up and are explained, instead of a silent crash. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, createDatabase, dropDatabase, Browser } = require("./helpers");

async function stop(server) {
  server.proc.kill("SIGTERM");
  await new Promise((res) => server.proc.once("exit", res));
}

test("without DATABASE_URL the server stays up and says what to fix", async () => {
  const port = 4900 + Math.floor(Math.random() * 90);
  const server = await startServer("", port, { DATABASE_URL: "" }, "listening on port");
  try {
    const base = `http://127.0.0.1:${port}`;
    const h = await fetch(base + "/healthz");
    assert.equal(h.status, 200);
    const page = await fetch(base + "/");
    assert.equal(page.status, 503);
    assert.match(await page.text(), /DATABASE_URL setting is missing/);
    const api = await new Browser(base).post("/api/login", { schoolCode: "X", username: "a", password: "b" });
    assert.equal(api.status, 503);
    assert.match(api.body.error, /DATABASE_URL/);
  } finally {
    await stop(server);
  }
});

test("an unreachable database is explained and does not stop the server", async () => {
  const port = 4900 + Math.floor(Math.random() * 90);
  const server = await startServer("postgres://postgres@127.0.0.1:1/none", port, {}, "cannot reach the database");
  try {
    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.status, 503);
    const text = await page.text();
    assert.match(text, /cannot reach the database/);
    assert.ok(!text.includes("127.0.0.1:1"), "connection details stay private");
  } finally {
    await stop(server);
  }
});

test("a rejected administrator password does not stop the server, and sign-in explains why", async () => {
  const db = await createDatabase();
  const port = 4900 + Math.floor(Math.random() * 90);
  const server = await startServer(db.url, port, { PLATFORM_ADMIN_USERNAME: "admin", PLATFORM_ADMIN_PASSWORD: "admin-2026-pass" });
  try {
    const base = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(base + "/healthz")).status, 200);
    const r = await new Browser(base).post("/api/platform/login", { username: "admin", password: "admin-2026-pass" });
    assert.equal(r.status, 503);
    assert.match(r.body.error, /PLATFORM_ADMIN_PASSWORD was not accepted: The password must not contain the username/);
  } finally {
    await stop(server);
    await dropDatabase(db.name);
  }
});
