"use strict";
/* Builds the web app: web/src -> web/dist/app.js, plus index.html and static assets. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const esbuild = require("esbuild");

const root = path.join(__dirname, "..");
const src = path.join(root, "web", "src");
const dist = path.join(root, "web", "dist");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

esbuild.buildSync({
  entryPoints: [path.join(src, "main.jsx")],
  bundle: true,
  minify: true,
  format: "iife",
  jsx: "automatic",
  target: ["es2019"],
  define: { "process.env.NODE_ENV": '"production"' },
  outfile: path.join(dist, "app.js"),
  logLevel: "warning",
});

const js = fs.readFileSync(path.join(dist, "app.js"));
const hash = crypto.createHash("sha256").update(js).digest("hex").slice(0, 12);
fs.renameSync(path.join(dist, "app.js"), path.join(dist, `app.${hash}.js`));

fs.cpSync(path.join(root, "web", "public"), dist, { recursive: true });
const html = fs.readFileSync(path.join(root, "web", "index.html"), "utf8").replace("__APP_JS__", `/app.${hash}.js`);
fs.writeFileSync(path.join(dist, "index.html"), html);
console.log(`[build] web/dist/app.${hash}.js (${(js.length / 1024).toFixed(0)} KB)`);
