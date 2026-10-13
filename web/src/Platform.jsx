import React, { useState, useEffect, useCallback } from "react";
import { api, readImageFile } from "./api.js";
import { Panel, Modal, Pill, StatCard, formatTimestamp, CSS } from "./App.jsx";
import { APP_NAME, APP_LOGO } from "./brand.js";
import { Icon } from "./icons.jsx";


/* Platform administration (at /platform): a menu for managing schools, the activity log, system and security settings, and administrator accounts. */

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
          <img src={APP_LOGO} alt="" width={64} height={64} style={{ flexShrink: 0 }} />
          <div>
            <div className="brand-name">PLATFORM ADMINISTRATION</div>
            <div className="brand-sub">{APP_NAME}</div>
          </div>
        </div>
        <div className="login-form">
          <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" onKeyDown={(e) => e.key === "Enter" && submit()} /></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="btn-primary btn-full" disabled={busy} onClick={submit}>{busy ? "Signing in…" : "Sign in"}</button>
          <a href="/" className="text-link" style={{ fontSize: 14, textAlign: "center" }}>Go to the school sign-in page</a>
        </div>
      </div>
    </div>
  );
}

function Credentials({ title, info, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0, fontSize: 15 }}>Give these details to the Proprietor in person or by phone. They will choose their own password when they first sign in. The password is shown only once.</p>
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
      <p className="muted" style={{ fontSize: 14 }}>The school starts with classes JSS1 to SSS3, a standard subject list, three terms and the usual A to F grades. The Proprietor can change all of these in School Setup.</p>
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? "Creating…" : "Create school"}</button>
      </div>
    </Modal>
  );
}

/* ---------- shared bits ---------- */

function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    setError("");
    try { setData(await fn()); } catch (e) { setError(e.message); }
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return [data, reload, error];
}

function PageHead({ title, lead }) {
  return (
    <>
      <h1>{title}</h1>
      {lead && <p className="lead">{lead}</p>}
    </>
  );
}

function SaveRow({ busy, saved, error, onSave, label = "Save changes" }) {
  return (
    <div className="save-row">
      {error && <div className="form-error">{error}</div>}
      {saved && !error && <span className="saved-note">Saved.</span>}
      <button className="btn-primary" disabled={busy} onClick={onSave}>{busy ? "Saving…" : label}</button>
    </div>
  );
}

function PasswordForm({ forced, onDone }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async () => {
    setError("");
    if (next !== again) { setError("The two new passwords are different."); return; }
    setBusy(true);
    try {
      await api.platformChangePassword(current, next);
      setDone(true);
      setCurrent(""); setNext(""); setAgain("");
      if (onDone) await onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="form-grid">
      <label className="form-span">{forced ? "Temporary password" : "Current password"}<input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></label>
      <label>New password<input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></label>
      <label>New password again<input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" onKeyDown={(e) => e.key === "Enter" && submit()} /></label>
      <p className="muted form-span" style={{ margin: 0 }}>Use a long password that is not used anywhere else and does not contain your username. Your other signed-in devices are signed out when you change it.</p>
      <div className="form-span"><SaveRow busy={busy} saved={done} error={error} onSave={submit} label="Change password" /></div>
    </div>
  );
}

/* ---------- Manage schools ---------- */

function SchoolsPage({ setModal, setError, version }) {
  const [schools, reload, loadError] = useLoad(() => api.platformSchools(), [version]);
  const run = async (fn) => {
    setError("");
    try { await fn(); await reload(); } catch (e) { setError(e.message); }
  };
  const list = schools || [];
  const active = list.filter((s) => s.active).length;
  return (
    <>
      <PageHead title="Manage schools" lead="Add schools, switch them off or on, and give a Proprietor a new password." />
      {loadError && <div className="form-error" style={{ marginBottom: 12 }}>{loadError}</div>}
      <div className="stat-grid">
        <StatCard label="Schools" value={list.length} />
        <StatCard label="Active" value={active} tone="gold" />
        <StatCard label="Pupils (all schools)" value={list.reduce((s, x) => s + x.pupils, 0)} />
        <StatCard label="Accounts (all schools)" value={list.reduce((s, x) => s + x.accounts, 0)} />
      </div>
      <Panel title="Schools" action={<button className="btn-primary btn-small" onClick={() => setModal({ type: "create" })}>+ Add a school</button>}>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Code</th><th>Name</th><th>Pupils</th><th>Accounts</th><th>Last activity</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {schools && list.length === 0 && <tr><td colSpan={7} className="rc-empty">No schools yet. Add the first one.</td></tr>}
              {!schools && <tr><td colSpan={7} className="rc-empty">Loading…</td></tr>}
              {list.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.code}</td>
                  <td><a className="text-link" href={`/?school=${encodeURIComponent(s.code)}`} target="_blank" rel="noreferrer">{s.name}</a></td>
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
                      <button className={"btn-small " + (s.active ? "btn-danger" : "btn-ghost")} onClick={() => {
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
    </>
  );
}

/* ---------- Platform activity (audit log) ---------- */

function ActivityPage() {
  const [audit, , error] = useLoad(() => api.platformAudit());
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [shown, setShown] = useState(100);
  const all = audit || [];
  const actions = [...new Set(all.map((a) => a.action))].sort();
  const needle = q.trim().toLowerCase();
  const rows = all.filter((a) => (!action || a.action === action) &&
    (!needle || `${a.actor} ${a.action} ${a.details}`.toLowerCase().includes(needle)));
  return (
    <>
      <PageHead title="Platform activity" lead="Every sign-in and change made by platform administrators, newest first. School activity is in each school's own Audit Log." />
      {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="row-actions">
        <input className="audit-search" placeholder="Search who or what…" value={q} onChange={(e) => { setQ(e.target.value); setShown(100); }} />
        <label className="inline-label">Type
          <select value={action} onChange={(e) => { setAction(e.target.value); setShown(100); }}>
            <option value="">All</option>
            {actions.map((a) => <option key={a}>{a}</option>)}
          </select>
        </label>
        <span className="muted">{rows.length} {rows.length === 1 ? "entry" : "entries"}</span>
      </div>
      <Panel title="Audit log">
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
            <tbody>
              {!audit && <tr><td colSpan={4} className="rc-empty">Loading…</td></tr>}
              {audit && rows.length === 0 && <tr><td colSpan={4} className="rc-empty">Nothing matches.</td></tr>}
              {rows.slice(0, shown).map((a) => (
                <tr key={a.id}><td className="muted" style={{ whiteSpace: "nowrap" }}>{formatTimestamp(a.timestamp)}</td><td>{a.actor}</td><td><Pill>{a.action}</Pill></td><td className="muted">{a.details}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > shown && <div style={{ textAlign: "center", padding: "12px 0 4px" }}><button className="btn-ghost btn-small" onClick={() => setShown(shown + 100)}>Show more</button></div>}
      </Panel>
    </>
  );
}

/* ---------- System settings ---------- */

function useSettingsForm() {
  const [settings, reload, loadError] = useLoad(() => api.platformSettings());
  const [form, setForm] = useState(null);
  const [state, setState] = useState({ busy: false, saved: false, error: "" });
  useEffect(() => { if (settings) setForm(settings); }, [settings]);
  const set = (k, numeric) => (e) => { setForm({ ...form, [k]: numeric ? e.target.value.replace(/[^0-9]/g, "") : e.target.value }); setState({ busy: false, saved: false, error: "" }); };
  const save = async (keys) => {
    setState({ busy: true, saved: false, error: "" });
    try {
      const patch = {};
      for (const k of keys) patch[k] = typeof settings[k] === "number" ? Number(form[k]) : form[k];
      await api.platformSaveSettings(patch);
      await reload();
      setState({ busy: false, saved: true, error: "" });
    } catch (e) {
      setState({ busy: false, saved: false, error: e.message });
    }
  };
  return { form, set, save, state, loadError };
}

function Info({ label, children }) {
  return <div><span>{label}</span><b>{children}</b></div>;
}

function SystemPage() {
  const [info, , infoError] = useLoad(() => api.platformSystem());
  const { form, set, save, state, loadError } = useSettingsForm();
  return (
    <>
      <PageHead title="System settings" lead="What every school sees, and how the system is running." />
      {(infoError || loadError) && <div className="form-error" style={{ marginBottom: 12 }}>{infoError || loadError}</div>}
      <Panel title="Messages to all schools">
        {form && (
          <div className="form-grid" style={{ paddingTop: 10 }}>
            <label className="form-span">Notice shown to everyone at every school (leave empty for none)
              <textarea rows={3} value={form.notice} onChange={set("notice")} maxLength={300} placeholder="e.g. The system will be down for maintenance on Saturday from 8pm to 10pm." />
            </label>
            <label className="form-span">Help contact shown on the sign-in page (leave empty for none)
              <input value={form.supportContact} onChange={set("supportContact")} maxLength={160} placeholder="e.g. Elite Network Limited support: +232 00 000 000" />
            </label>
            <div className="form-span"><SaveRow {...state} onSave={() => save(["notice", "supportContact"])} /></div>
          </div>
        )}
      </Panel>
      <Panel title="System information">
        {info ? (
          <div className="profile-grid" style={{ paddingTop: 12 }}>
            <Info label="Version">{info.version}</Info>
            <Info label="Running since">{formatTimestamp(info.startedAt)}</Info>
            <Info label="Schools">{info.schools} ({info.activeSchools} active)</Info>
            <Info label="Pupils / accounts">{info.pupils} / {info.accounts}</Info>
            <Info label="People signed in now">{info.signedIn}</Info>
            <Info label="Database">PostgreSQL {String(info.databaseVersion).split(" ")[0]}</Info>
            <Info label="Database-level separation of schools">{info.rowSecurity ? <Pill tone="gold">On</Pill> : <Pill tone="red">Off</Pill>}</Info>
          </div>
        ) : <p className="muted">Loading…</p>}
      </Panel>
    </>
  );
}

/* ---------- Security settings ---------- */

function SecurityPage() {
  const { form, set, save, state, loadError } = useSettingsForm();
  const [sessions, reloadSessions] = useLoad(() => api.platformSessions());
  const [msg, setMsg] = useState("");
  const others = (sessions || []).filter((s) => !s.current).length;
  return (
    <>
      <PageHead title="Security settings" lead="Rules for every account on the platform. Each school's Proprietor also sets their own sign-out time and lockout in Security & Backups." />
      {loadError && <div className="form-error" style={{ marginBottom: 12 }}>{loadError}</div>}
      {form && (
        <Panel title="Sign-in rules">
          <div className="form-grid" style={{ paddingTop: 10 }}>
            <label>Platform administrators are signed out after this many idle minutes
              <input inputMode="numeric" value={form.adminIdleMinutes} onChange={set("adminIdleMinutes", true)} />
            </label>
            <label>Lock an administrator account after this many wrong passwords
              <input inputMode="numeric" value={form.adminLockoutThreshold} onChange={set("adminLockoutThreshold", true)} />
            </label>
            <label>Shortest password allowed, for every account (8 to 32 characters)
              <input inputMode="numeric" value={form.minPasswordLength} onChange={set("minPasswordLength", true)} />
            </label>
            <span />
            <label>New schools: sign people out after this many idle minutes
              <input inputMode="numeric" value={form.newSchoolSessionTimeoutMinutes} onChange={set("newSchoolSessionTimeoutMinutes", true)} />
            </label>
            <label>New schools: lock an account after this many wrong passwords
              <input inputMode="numeric" value={form.newSchoolLockoutThreshold} onChange={set("newSchoolLockoutThreshold", true)} />
            </label>
            <div className="form-span"><SaveRow {...state} onSave={() => save(["adminIdleMinutes", "adminLockoutThreshold", "minPasswordLength", "newSchoolSessionTimeoutMinutes", "newSchoolLockoutThreshold"])} /></div>
          </div>
        </Panel>
      )}
      <Panel title="Where you are signed in" action={others > 0 && (
        <button className="btn-ghost btn-small" onClick={async () => {
          try { await api.platformSignOutOthers(); setMsg("Your other devices are signed out."); await reloadSessions(); } catch (e) { setMsg(e.message); }
        }}>Sign out all other devices</button>
      )}>
        {msg && <div className="notice" style={{ marginTop: 12 }}>{msg}</div>}
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Signed in</th><th>Last used</th><th>Network address</th><th>Device</th></tr></thead>
            <tbody>
              {(sessions || []).map((s, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatTimestamp(s.signedIn)} {s.current && <Pill tone="gold">This device</Pill>}</td>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{formatTimestamp(s.lastSeen)}</td>
                  <td className="mono">{s.ip || "—"}</td>
                  <td className="muted">{describeDevice(s.device)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function describeDevice(ua) {
  ua = String(ua || "");
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone or iPad" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

/* ---------- Account: password, administrators, sign out ---------- */

function AddAdmin({ onClose, onAdded }) {
  const [f, setF] = useState({ name: "", username: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError("");
    try { onAdded(await api.platformAddAdmin(f)); } catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <Modal title="Add a platform administrator" onClose={onClose}>
      <div className="form-grid">
        <label className="form-span">Full name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} /></label>
        <label className="form-span">Username<input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} maxLength={40} autoCapitalize="none" /></label>
      </div>
      <p className="muted">They get a temporary password and choose their own when they first sign in. Administrators can add schools and reset passwords, but cannot see pupil records.</p>
      {error && <div className="form-error">{error}</div>}
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? "Adding…" : "Add administrator"}</button>
      </div>
    </Modal>
  );
}

function AdminCredentials({ info, onClose }) {
  return (
    <Modal title="Administrator sign-in details" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>Give these to {info.name} in person or by phone. The password is shown only once, and they must change it when they first sign in.</p>
      <div className="profile-grid" style={{ marginBottom: 12 }}>
        <div><span>Web address</span><b className="mono">{window.location.origin}/platform</b></div>
        <div><span>Username</span><b className="mono">{info.username}</b></div>
      </div>
      <div className="temp-pwd-box"><span className="mono temp-pwd-value">{info.tempPassword}</span></div>
      <div className="modal-actions"><button className="btn-primary" onClick={onClose}>Done</button></div>
    </Modal>
  );
}

function AccountPage({ me, onSignOut }) {
  const [admins, reload, error] = useLoad(() => api.platformAdmins());
  const [modal, setModal] = useState(null);
  const [actionError, setActionError] = useState("");
  const act = async (fn) => {
    setActionError("");
    try { await fn(); await reload(); } catch (e) { setActionError(e.message); }
  };
  return (
    <>
      <PageHead title="Password & sign out" lead={`Signed in as ${me.name} (${me.username}). Change your password, manage the other platform administrators, or sign out.`} />
      <Panel title="Change my password">
        <div style={{ paddingTop: 10 }}><PasswordForm /></div>
      </Panel>
      <Panel title="Platform administrators" action={<button className="btn-primary btn-small" onClick={() => setModal({ type: "add" })}>+ Add administrator</button>}>
        {(error || actionError) && <div className="form-error" style={{ marginTop: 12 }}>{error || actionError}</div>}
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Username</th><th>Last sign-in</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(admins || []).map((a) => (
                <tr key={a.id}>
                  <td>{a.name} {a.you && <Pill tone="gold">You</Pill>}</td>
                  <td className="mono">{a.username}</td>
                  <td className="muted">{a.lastLogin ? formatTimestamp(a.lastLogin) : "Never"}</td>
                  <td>{a.locked ? <Pill tone="red">Locked</Pill> : a.mustChange ? <Pill>Temporary password</Pill> : <Pill tone="gold">Active</Pill>}</td>
                  <td>
                    {!a.you && (
                      <div className="row-actions" style={{ margin: 0, gap: 6, flexWrap: "nowrap" }}>
                        <button className="btn-ghost btn-small" onClick={() => {
                          if (window.confirm(`Give ${a.name} a new temporary password? Their current password stops working.`)) {
                            act(async () => setModal({ type: "creds", info: await api.platformResetAdmin(a.id) }));
                          }
                        }}>Reset password</button>
                        <button className="btn-danger btn-small" onClick={() => {
                          if (window.confirm(`Remove ${a.name} as a platform administrator? They can no longer sign in.`)) act(() => api.platformRemoveAdmin(a.id));
                        }}>Remove</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Sign out">
        <div className="save-row" style={{ justifyContent: "space-between", paddingTop: 12 }}>
          <span className="muted">Always sign out on a shared computer.</span>
          <button className="btn-ghost" onClick={onSignOut}>Sign out</button>
        </div>
      </Panel>
      {modal?.type === "add" && <AddAdmin onClose={() => setModal(null)} onAdded={(info) => { setModal({ type: "creds", info }); reload(); }} />}
      {modal?.type === "creds" && <AdminCredentials info={modal.info} onClose={() => setModal(null)} />}
    </>
  );
}

/* ---------- the menu and pages ---------- */

const MENU = [
  ["schools", "Manage schools", "school"],
  ["activity", "Platform activity", "list"],
  ["system", "System settings", "gear"],
  ["security", "Security settings", "shield"],
  ["account", "Password & sign out", "key"],
];

function PlatformShell({ me, onSignOut }) {
  const [view, setView] = useState(() => {
    const h = window.location.hash.slice(1);
    return MENU.some(([k]) => k === h) ? h : "schools";
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [error, setError] = useState("");
  const go = (k) => { setView(k); setMobileOpen(false); setError(""); window.history.replaceState(null, "", `#${k}`); };
  const [schoolsVersion, setSchoolsVersion] = useState(0);
  const reloadSchools = () => setSchoolsVersion((v) => v + 1);
  return (
    <div className="shell">
      {mobileOpen && <div className="sidebar-scrim" onClick={() => setMobileOpen(false)} />}
      <aside className={"sidebar" + (mobileOpen ? " sidebar-open" : "")}>
        <div className="sidebar-brand">
          <img src={APP_LOGO} alt="" width={44} height={44} />
          <div>
            <div className="sb-name">{APP_NAME}</div>
            <div className="sb-sub">Platform administration</div>
          </div>
        </div>
        <nav>
          {MENU.map(([key, label, icon]) => (
            <button key={key} className={"nav-item" + (view === key ? " nav-active" : "")} onClick={() => go(key)}>
              <Icon name={icon} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="who">
            <div className="who-name">{me.name}</div>
            <div className="who-role">Platform administrator</div>
          </div>
          <button className="btn-ghost btn-small btn-icon" onClick={onSignOut}><Icon name="logout" size={16} /> Sign out</button>
        </div>
      </aside>
      <div className="content-area">
        <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)} aria-label="Open menu">☰ Menu</button>
        <main className="content" key={view}>
          {!me.rowSecurity && <div className="form-error" style={{ marginBottom: 12 }}>Database-level separation between schools is switched off because the database user cannot create roles. The app still separates schools itself. See README, "Database user".</div>}
          {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}
          {view === "schools" && <SchoolsPage setModal={setModal} setError={setError} version={schoolsVersion} />}
          {view === "activity" && <ActivityPage />}
          {view === "system" && <SystemPage />}
          {view === "security" && <SecurityPage />}
          {view === "account" && <AccountPage me={me} onSignOut={onSignOut} />}
        </main>
      </div>
      {modal?.type === "create" && <CreateSchool onClose={() => setModal(null)} onCreated={(info) => { setModal({ type: "creds", title: "School created", info }); reloadSchools(); }} />}
      {modal?.type === "creds" && <Credentials title={modal.title} info={modal.info} onClose={() => setModal(null)} />}
    </div>
  );
}

function ForcedPassword({ me, onDone, onSignOut }) {
  return (
    <div className="login-screen">
      <div className="login-card" style={{ maxWidth: 560 }}>
        <div className="login-brand">
          <img src={APP_LOGO} alt="" width={64} height={64} style={{ flexShrink: 0 }} />
          <div>
            <div className="brand-name">CHOOSE YOUR PASSWORD</div>
            <div className="brand-sub">Welcome, {me.name}</div>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>You signed in with a temporary password. Choose your own before you continue.</p>
        <PasswordForm forced onDone={onDone} />
        <p style={{ textAlign: "center", marginBottom: 0 }}><button className="link-btn" onClick={onSignOut}>Sign out</button></p>
      </div>
    </div>
  );
}

export default function PlatformApp() {
  const [me, setMe] = useState(null);
  const [status, setStatus] = useState("loading");

  const load = useCallback(async () => {
    try {
      setMe(await api.platformMe());
      setStatus("ready");
    } catch (e) {
      setStatus("signedout");
    }
  }, []);

  useEffect(() => { load(); document.title = `Platform administration — ${APP_NAME}`; }, [load]);

  const signOut = async () => { await api.logout(); setMe(null); setStatus("signedout"); window.history.replaceState(null, "", "/platform"); };

  let page;
  if (status === "loading") page = <div className="loading-screen"><img src={APP_LOGO} alt="" width={72} height={72} className="pulse" /><p>Loading…</p></div>;
  else if (status === "signedout") page = <Login onDone={load} />;
  else if (me.mustChangePassword) page = <ForcedPassword me={me} onDone={load} onSignOut={signOut} />;
  else page = <PlatformShell me={me} onSignOut={signOut} />;

  return (
    <div className="dia-root">
      <style>{CSS}</style>
      {page}
    </div>
  );
}
