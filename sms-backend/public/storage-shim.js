/*
 * storage-shim.js
 * Implements the `window.storage` key-value API (get / set / delete / list) that the
 * School Management System was written against, backed by this project's server.
 *
 * Safety behaviour (important for multi-user testing):
 *  - get() has its own 3.5 s deadline. If the server is slow, get() throws and NO version
 *    is recorded, so a later set() is sent "blind" and the server refuses it. This stops the
 *    app's "load failed -> write seed defaults" fallback from wiping real data.
 *  - set() sends the version it last read (X-Base-Version) so the server can detect stale
 *    writes and snapshot the overwritten data (last-write-wins, but recoverable).
 *  - If a save fails, a red banner tells the user their changes were NOT stored.
 */
(function () {
  "use strict";
  if (window.storage) return; // running somewhere that already provides storage

  var versions = {}; // key -> last version this tab read or wrote ("0" = confirmed absent)
  var GET_DEADLINE_MS = 3500;

  function url(key) {
    return "/api/storage/" + encodeURIComponent(key);
  }

  function banner(msg) {
    try {
      var id = "storage-error-banner";
      var el = document.getElementById(id);
      if (!el) {
        el = document.createElement("div");
        el.id = id;
        el.style.cssText =
          "position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#b42318;color:#fff;" +
          "font:600 14px/1.4 system-ui,sans-serif;padding:10px 14px;text-align:center;";
        document.body.appendChild(el);
      }
      el.textContent = msg;
    } catch (e) {}
  }
  function clearBanner() {
    var el = document.getElementById("storage-error-banner");
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  window.storage = {
    async get(key) {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, GET_DEADLINE_MS);
      try {
        var r = await fetch(url(key), { credentials: "same-origin", cache: "no-store", signal: ctrl.signal });
        if (r.status === 404) { versions[key] = "0"; return null; }
        if (!r.ok) throw new Error("storage get failed: HTTP " + r.status);
        var j = await r.json();
        versions[key] = String(j.version);
        return { key: key, value: j.value, shared: true };
      } finally {
        clearTimeout(timer);
      }
    },

    async set(key, value) {
      var headers = { "Content-Type": "application/json" };
      if (versions[key] !== undefined) headers["X-Base-Version"] = versions[key];
      try {
        var r = await fetch(url(key), {
          method: "PUT",
          headers: headers,
          credentials: "same-origin",
          body: JSON.stringify({ value: value }),
        });
        if (!r.ok) {
          var detail = "";
          try { detail = (await r.json()).error || ""; } catch (e) {}
          throw new Error("HTTP " + r.status + " " + detail);
        }
        var j = await r.json();
        versions[key] = String(j.version);
        clearBanner();
        return { key: key, value: value, shared: true };
      } catch (err) {
        banner("Could not save to the server. Your latest changes are NOT stored. Reload the page and retry.");
        throw err;
      }
    },

    async delete(key) {
      var r = await fetch(url(key), { method: "DELETE", credentials: "same-origin" });
      if (!r.ok && r.status !== 404) throw new Error("storage delete failed: HTTP " + r.status);
      delete versions[key];
      return { key: key, deleted: r.ok, shared: true };
    },

    async list(prefix) {
      var q = prefix ? "?prefix=" + encodeURIComponent(prefix) : "";
      var r = await fetch("/api/storage" + q, { credentials: "same-origin", cache: "no-store" });
      if (!r.ok) throw new Error("storage list failed: HTTP " + r.status);
      var j = await r.json();
      return { keys: j.keys, prefix: prefix, shared: true };
    },
  };
})();
