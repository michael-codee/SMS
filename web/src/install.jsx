import React, { useEffect, useState } from "react";

/*
 * Installable app: lets people add the system to their desktop or home screen so it opens in its own
 * window like ordinary software. Browsers offer this only over HTTPS (or on localhost).
 */
let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

export function setupInstall() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* the app works without it */ });
    });
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

/* Point the install description at this school, so the installed app carries the school's name. */
export function useSchoolManifest(code) {
  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]');
    if (link) link.href = code ? `/manifest.webmanifest?school=${encodeURIComponent(code)}` : "/manifest.webmanifest";
  }, [code]);
}

export const isInstalled = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function InstallButton({ className = "btn-ghost btn-small", block = false }) {
  const [, force] = useState(0);
  const [showIosHelp, setShowIosHelp] = useState(false);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  if (isInstalled()) return null;
  if (deferredPrompt) {
    const install = async () => {
      const p = deferredPrompt;
      deferredPrompt = null;
      notify();
      p.prompt();
      try { await p.userChoice; } catch (e) { /* closed */ }
    };
    return <button type="button" className={className + (block ? " btn-full" : "")} onClick={install}>Install app</button>;
  }
  if (isIos()) {
    return (
      <div style={{ textAlign: "center" }}>
        <button type="button" className={className + (block ? " btn-full" : "")} onClick={() => setShowIosHelp(!showIosHelp)}>Install app</button>
        {showIosHelp && <p className="muted" style={{ fontSize: 13.5, margin: "6px 0 0" }}>Tap the Share button, then <b>Add to Home Screen</b>.</p>}
      </div>
    );
  }
  return null;
}
