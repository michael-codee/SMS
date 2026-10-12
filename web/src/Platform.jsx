import React, { useState, useEffect, useCallback } from "react";
import { api, ApiError, readImageFile } from "./api.js";
import { Panel, Modal, Pill, StatCard, formatTimestamp, CSS } from "./App.jsx";


/* Platform administration (at /platform): add schools, switch them on or off, recover a Proprietor's access. */

function Login({ onDone }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await api.platformLogin(username.trim(), password);
      await onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <div>
            <div className="brand-name">PLATFORM ADMINISTRATION</div>
            <div className="brand-sub">School Management System</div>
          </div>
        </div>
        <div className="login-form">
          <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" onKeyDown={(e) => e.key === "Enter" && submit()} /></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="btn-primary btn-full" disabled={busy} onClick={submit}>{busy ? "Signing in…" : "Sign in"}</button>
          <a href="/" className="muted" style={{ fontSize: 12, textAlign: "center" }}>Go to the school sign-in page</a>
        </div>
      </div>
    </div>
  );
}

function Credentials({ title, info, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0, fontSize: 13.5 }}>Give these details to the Proprietor in person or by phone. They will choose their own password when they first sign in. The password is shown only once.</p>
      <div className="profile-grid" style={{ marginBottom: 12 }}>
        <div><span>Web address</span><b className="mono">{window.location.origin}/?school={encodeURIComponent(info.code)}</b></div>
        <div><span>School code</span><b className="mono">{info.code}</b></div>
        <div><span>Username</span><b className="mono">{info.username}</b></div>
      </div>
      <div className="temp-pwd-box"><span className="mono temp-pwd-value">{info.tempPassword}</span></div>
      <div className="modal-actions"><button className="btn-primary" onClick={onClose}>Done</button></div>
    </Modal>
  );
}

function CreateSchool({ onClose, onCreated }) {
  const [f, setF] = useState({ code: "", name: "", motto: "", location: "", proprietorName: "", proprietorUsername: "", demo: false, logo: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const pickLogo = async (e) => {
    try { setF({ ...f, logo: await readImageFile(e.target.files?.[0], 400) }); } catch (err) { setError(err.message); }
  };
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api.platformCreateSchool({ ...f, logo: f.logo || null });
      onCreated({ code: r.code, username: r.proprietorUsername, tempPassword: r.tempPassword });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Add a school" onClose={onClose} wide>
      <div className="form-grid">
        <label>School code (used to sign in)<input value={f.code} onChange={set("code")} placeholder="e.g. TISL" maxLength={20} /></label>
        <label>School name<input value={f.name} onChange={set("name")} placeholder="e.g. The International School Ltd" maxLength={120} /></label>
        <label>Motto (optional)<input value={f.motto} onChange={set("motto")} maxLength={120} /></label>
        <label>Location line (optional)<input value={f.location} onChange={set("location")} placeholder="e.g. Freetown" maxLength={120} /></label>
        <label>Proprietor's full name<input value={f.proprietorName} onChange={set("proprietorName")} maxLength={120} /></label>
        <label>Proprietor's username<input value={f.proprietorUsername} onChange={set("proprietorUsername")} placeholder="e.g. fkamanda" maxLength={40} autoCapitalize="none" /></label>
        <label className="form-span">Crest or logo (optional, the Proprietor can add it later)
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={pickLogo} />
        </label>
        <label className="form-span check-chip"><input type="checkbox" checked={f.demo} onChange={set("demo")} /> Fill with sample pupils, staff and marks (for training only, never for a real school)</label>
      </div>
      <p className="muted" style={{ fontSize: 12.5 }}>The school starts with classes JSS1 to SSS3, a standard subject list, three terms and the usual A to F grades. The Proprietor can change all of these in School Setup.</p>
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? "Creating…" : "Create school"}</button>
      </div>
    </Modal>
  );
}

function ChangePassword({ onClose }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const submit = async () => {
    setError("");
    try {
      await api.platformChangePassword(current, next);
      setDone(true);
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <Modal title="Change your password" onClose={onClose}>
      {done ? <div className="notice">Password changed.</div> : (
        <div className="form-grid">
          <label className="form-span">Current password<input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
          <label className="form-span">New password (at least 8 characters)<input type="password" value={next} onChange={(e) => setNext(e.target.value)} /></label>
        </div>
      )}
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Close</button>
        {!done && <button className="btn-primary" onClick={submit}>Save</button>}
      </div>
    </Modal>
  );
}

export default function PlatformApp() {
  const [me, setMe] = useState(null);
  const [status, setStatus] = useState("loading");
  const [schools, setSchools] = useState([]);
  const [audit, setAudit] = useState([]);
  const [modal, setModal] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const m = await api.platformMe();
      setMe(m);
      setSchools(await api.platformSchools());
      setAudit(await api.platformAudit());
      setStatus("ready");
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setStatus("signedout");
      else { setError(e.message); setStatus("signedout"); }
    }
  }, []);

  useEffect(() => { load(); document.title = "Platform administration — School Management System"; }, [load]);

  const run = async (fn) => {
    setError("");
    try { await fn(); await load(); } catch (e) { setError(e.message); }
  };

  let page;
  if (status === "loading") page = <div className="loading-screen"><p>Loading…</p></div>;
  else if (status === "signedout") page = <Login onDone={load} />;
  else {
    const active = schools.filter((s) => s.active).length;
    page = (
      <div className="content" style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div className="row-actions" style={{ justifyContent: "space-between" }}>
          <h1 style={{ margin: 0 }}>Platform administration</h1>
          <div className="row-actions" style={{ margin: 0 }}>
            <span className="muted" style={{ fontSize: 13 }}>Signed in as {me.name}</span>
            <button className="btn-ghost btn-small" onClick={() => setModal({ type: "password" })}>Change password</button>
            <button className="btn-ghost btn-small" onClick={async () => { await api.logout(); setStatus("signedout"); }}>Sign out</button>
          </div>
        </div>
        {!me.rowSecurity && <div className="form-error" style={{ marginBottom: 12 }}>Database-level separation between schools is switched off because the database user cannot create roles. The app still separates schools itself. See README, "Database user".</div>}
        {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}
        <div className="stat-grid">
          <StatCard label="Schools" value={schools.length} />
          <StatCard label="Active" value={active} tone="gold" />
          <StatCard label="Pupils (all schools)" value={schools.reduce((s, x) => s + x.pupils, 0)} />
        </div>
        <Panel title="Schools" action={<button className="btn-primary btn-small" onClick={() => setModal({ type: "create" })}>Add a school</button>}>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Code</th><th>Name</th><th>Pupils</th><th>Accounts</th><th>Last activity</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {schools.length === 0 && <tr><td colSpan={7} className="rc-empty">No schools yet. Add the first one.</td></tr>}
                {schools.map((s) => (
                  <tr key={s.id}>
                    <td className="mono">{s.code}</td>
                    <td>{s.name}</td>
                    <td>{s.pupils}</td>
                    <td>{s.accounts}</td>
                    <td className="muted">{s.lastActivity ? formatTimestamp(s.lastActivity) : "—"}</td>
                    <td><Pill tone={s.active ? "gold" : "red"}>{s.active ? "Active" : "Switched off"}</Pill></td>
                    <td>
                      <div className="row-actions" style={{ margin: 0, gap: 6, flexWrap: "nowrap" }}>
                        <button className="btn-ghost btn-small" onClick={() => {
                          if (window.confirm(`Give the Proprietor of ${s.name} a new temporary password? Their current password stops working.`)) {
                            run(async () => { const r = await api.platformResetProprietor(s.id); setModal({ type: "creds", title: "New Proprietor password", info: { code: s.code, username: r.username, tempPassword: r.tempPassword } }); });
                          }
                        }}>Reset Proprietor password</button>
                        <button className="btn-ghost btn-small" onClick={() => {
                          if (window.confirm(s.active ? `Switch off ${s.name}? Nobody at the school can sign in until you switch it back on. No data is deleted.` : `Switch ${s.name} back on?`)) {
                            run(() => api.platformSetActive(s.id, !s.active));
                          }
                        }}>{s.active ? "Switch off" : "Switch on"}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Platform activity">
          <table className="data-table">
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
            <tbody>
              {audit.slice(0, 50).map((a) => (
                <tr key={a.id}><td className="muted">{formatTimestamp(a.timestamp)}</td><td>{a.actor}</td><td><Pill>{a.action}</Pill></td><td className="muted">{a.details}</td></tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    );
  }

  return (
    <div className="dia-root">
      <style>{CSS}</style>
      {page}
      {modal?.type === "create" && <CreateSchool onClose={() => setModal(null)} onCreated={(info) => { setModal({ type: "creds", title: "School created", info }); load(); }} />}
      {modal?.type === "creds" && <Credentials title={modal.title} info={modal.info} onClose={() => setModal(null)} />}
      {modal?.type === "password" && <ChangePassword onClose={() => setModal(null)} />}
    </div>
  );
}
