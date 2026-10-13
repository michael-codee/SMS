import React, { useState } from "react";
import { Panel, Seal } from "./App.jsx";
import { readImageFile } from "./api.js";

/* The Proprietor's screen for making the system fit their school. Each panel saves on its own. */

function useSaver(act) {
  const [state, setState] = useState({ busy: false, error: "", saved: false });
  const save = async (name, body) => {
    setState({ busy: true, error: "", saved: false });
    try {
      await act(name, body);
      setState({ busy: false, error: "", saved: true });
      setTimeout(() => setState((s) => ({ ...s, saved: false })), 2500);
      return true;
    } catch (e) {
      setState({ busy: false, error: e.message, saved: false });
      return false;
    }
  };
  return [state, save];
}

function SaveBar({ state, onSave, label = "Save" }) {
  return (
    <>
      {state.error && <div className="form-error" style={{ marginTop: 12 }}>{state.error}</div>}
      <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
        <button className="btn-primary" disabled={state.busy} onClick={onSave}>{state.busy ? "Saving…" : label}</button>
        {state.saved && <span className="saved-note">Saved.</span>}
      </div>
    </>
  );
}

function ListEditor({ items, setItems, placeholder, extra }) {
  const update = (i, patch) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };
  return (
    <>
      {items.map((it, i) => (
        <div className="setup-row" key={it.id || `new-${i}`}>
          <input value={it.name} onChange={(e) => update(i, { name: e.target.value })} placeholder={placeholder} />
          {extra && extra(it, i, update)}
          <button className="icon-btn" title="Move up" aria-label="Move up" onClick={() => move(i, -1)}>↑</button>
          <button className="icon-btn" title="Move down" aria-label="Move down" onClick={() => move(i, 1)}>↓</button>
          <button className="icon-btn" title="Remove" aria-label="Remove" onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button className="btn-ghost btn-small" onClick={() => setItems([...items, { name: "" }])}>Add</button>
    </>
  );
}

function ProfilePanel({ db, act }) {
  const s = db.settings;
  const [name, setName] = useState(db.school.name);
  const [motto, setMotto] = useState(s.motto);
  const [location, setLocation] = useState(s.location);
  const [currency, setCurrency] = useState(s.currency);
  const [prefix, setPrefix] = useState(s.admissionPrefix);
  const [colors, setColors] = useState(s.colors);
  const [state, save] = useSaver(act);
  const [logoState, saveLogo] = useSaver(act);

  const pickLogo = async (e) => {
    try {
      const dataUrl = await readImageFile(e.target.files?.[0], 400);
      if (dataUrl) await saveLogo("setLogo", { logo: dataUrl });
    } catch (err) {
      window.alert(err.message);
    }
    e.target.value = "";
  };

  const color = (key, label) => (
    <label>{label}
      <span className="color-input">
        <input type="color" value={colors[key]} onChange={(e) => setColors({ ...colors, [key]: e.target.value })} />
        <input value={colors[key]} onChange={(e) => setColors({ ...colors, [key]: e.target.value })} maxLength={7} />
      </span>
    </label>
  );

  return (
    <Panel title="School profile">
      <div className="id-photo-row">
        <Seal size={56} />
        <label className="id-photo-input">School crest or logo (PNG or JPEG)
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={pickLogo} />
        </label>
        {db.school.logoUrl && <button className="btn-ghost btn-small" disabled={logoState.busy} onClick={() => saveLogo("setLogo", { logo: null })}>Remove crest</button>}
      </div>
      {logoState.error && <div className="form-error" style={{ marginBottom: 12 }}>{logoState.error}</div>}
      <div className="setup-grid">
        <label style={{ gridColumn: "1 / -1" }}>School name
          <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>Motto
          <input value={motto} maxLength={120} onChange={(e) => setMotto(e.target.value)} placeholder="e.g. Knowledge · Excellence · Service" />
        </label>
        <label>Location line
          <input value={location} maxLength={120} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Ltd. · Freetown" />
        </label>
        <label>Currency symbol
          <input value={currency} maxLength={6} onChange={(e) => setCurrency(e.target.value)} placeholder="Le" />
        </label>
        <label>Admission number prefix
          <input value={prefix} maxLength={12} onChange={(e) => setPrefix(e.target.value.toUpperCase())} placeholder={db.school.code} />
        </label>
        {color("primary", "Main colour (headings, menu)")}
        {color("accent", "Highlight colour (buttons)")}
        {color("banner", "Sign-in banner colour")}
      </div>
      <p className="muted" style={{ fontSize: 14 }}>New pupils get admission numbers like {prefix || db.school.code}/{String(s.currentYear).slice(0, 4)}/001. Your school code for signing in is <b className="mono">{db.school.code}</b>. School type: <b>{db.settings.schoolType === "preprimary" ? "Pre-Primary School" : "Secondary School"}</b> (set by the platform administrator).</p>
      <SaveBar state={state} onSave={() => save("updateSettings", { patch: { name, motto, location, currency, admissionPrefix: prefix, colors } })} label="Save profile" />
    </Panel>
  );
}

function CalendarPanel({ db, act }) {
  const s = db.settings;
  const [terms, setTerms] = useState(s.terms.map((t) => ({ name: t })));
  const [currentTerm, setCurrentTerm] = useState(s.currentTerm);
  const [currentYear, setCurrentYear] = useState(s.currentYear);
  const [state, save] = useSaver(act);
  const names = terms.map((t) => t.name.trim()).filter(Boolean);
  const changing = currentTerm !== s.currentTerm || currentYear !== s.currentYear;

  const onSave = () => {
    if (changing && !window.confirm(`Move the whole school to ${currentTerm}, ${currentYear}? Grades, attendance and fees will be recorded against the new term from now on. Earlier terms stay saved.`)) return;
    save("updateSettings", { patch: { terms: names, currentTerm, currentYear } });
  };

  return (
    <Panel title="Academic year and terms">
      <div className="setup-grid">
        <label>Academic year
          <input value={currentYear} maxLength={20} onChange={(e) => setCurrentYear(e.target.value)} placeholder="2025/2026" />
        </label>
        <label>Current term
          <select value={currentTerm} onChange={(e) => setCurrentTerm(e.target.value)}>
            {names.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <p className="muted" style={{ fontSize: 14, marginBottom: 6 }}>Terms in the year, in order:</p>
      <ListEditor items={terms} setItems={setTerms} placeholder="Term name" />
      {changing && <div className="notice" style={{ marginTop: 12 }}>When you save, each pupil's fee from the current term is copied to the new term. You can then change fees in Finance.</div>}
      <SaveBar state={state} onSave={onSave} label="Save calendar" />
    </Panel>
  );
}

function ClassesPanel({ db, act }) {
  const [items, setItems] = useState(db.classes.map((c) => ({ id: c.id, name: c.name })));
  const [state, save] = useSaver(act);
  const counts = Object.fromEntries(db.classes.map((c) => [c.id, db.pupils.filter((p) => p.classId === c.id).length]));
  return (
    <Panel title="Classes">
      <ListEditor items={items} setItems={setItems} placeholder="Class name, e.g. JSS1"
        extra={(it) => it.id ? <span className="muted" style={{ fontSize: 13.5, whiteSpace: "nowrap" }}>{counts[it.id] || 0} pupils</span> : null} />
      <p className="muted" style={{ fontSize: 14 }}>A class with pupils in it cannot be removed. Move its pupils first by editing them.</p>
      <SaveBar state={state} onSave={() => save("saveClasses", { classes: items.filter((i) => i.name.trim()) })} label="Save classes" />
    </Panel>
  );
}

function SubjectsPanel({ db, act }) {
  const [items, setItems] = useState(db.subjectList.map((x) => ({ id: x.id, name: x.name })));
  const [state, save] = useSaver(act);
  return (
    <Panel title="Subjects">
      <ListEditor items={items} setItems={setItems} placeholder="Subject name" />
      <p className="muted" style={{ fontSize: 14 }}>Renaming a subject keeps its grades. Removing a subject hides it from report cards; its past grades stay in backups.</p>
      <SaveBar state={state} onSave={() => save("saveSubjects", { subjects: items.filter((i) => i.name.trim()) })} label="Save subjects" />
    </Panel>
  );
}

function AssessmentPanel({ db, act }) {
  const [parts, setParts] = useState(db.settings.assessment.map((p) => ({ ...p, name: p.label })));
  const [state, save] = useSaver(act);
  const total = parts.reduce((s, p) => s + (Number(p.max) || 0), 0);
  return (
    <Panel title="How marks are made up">
      <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>Each subject's total is out of 100. List the parts and the most marks each can earn. Best set before the year starts.</p>
      <ListEditor items={parts} setItems={setParts} placeholder="Part name, e.g. Exam"
        extra={(it, i, update) => <input className="narrow" type="number" min="1" max="100" value={it.max ?? ""} onChange={(e) => update(i, { max: e.target.value })} aria-label="Maximum marks" />} />
      <p style={{ fontSize: 14.5, color: total === 100 ? "var(--ink)" : "var(--red)" }}>Total: {total} / 100</p>
      <SaveBar state={state} onSave={() => save("updateSettings", { patch: { assessment: parts.filter((p) => p.name.trim()).map((p) => ({ key: p.key, label: p.name.trim(), max: Number(p.max) })) } })} label="Save marks breakdown" />
    </Panel>
  );
}

function GradeScalePanel({ db, act }) {
  const [rows, setRows] = useState(db.settings.gradeScale.map((r) => ({ ...r })));
  const [showPosition, setShowPosition] = useState(db.settings.showClassPosition !== false);
  const [state, save] = useSaver(act);
  const update = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <Panel title="Grades and report cards">
      <table className="data-table">
        <thead><tr><th>Grade</th><th>From</th><th>To</th><th>Remark</th><th></th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td><input value={r.grade} maxLength={4} onChange={(e) => update(i, { grade: e.target.value })} style={{ width: 60 }} /></td>
              <td><input type="number" min="0" max="100" value={r.min} onChange={(e) => update(i, { min: e.target.value })} style={{ width: 70 }} /></td>
              <td><input type="number" min="0" max="100" value={r.max} onChange={(e) => update(i, { max: e.target.value })} style={{ width: 70 }} /></td>
              <td><input value={r.remark} maxLength={40} onChange={(e) => update(i, { remark: e.target.value })} /></td>
              <td><button className="icon-btn" aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn-ghost btn-small" style={{ marginTop: 8 }} onClick={() => setRows([...rows, { grade: "", min: 0, max: 0, remark: "" }])}>Add grade</button>
      <label className="check-chip" style={{ marginTop: 14, display: "inline-flex" }}>
        <input type="checkbox" checked={showPosition} onChange={(e) => setShowPosition(e.target.checked)} /> Show class position on report cards
      </label>
      <SaveBar state={state} onSave={() => save("updateSettings", {
        patch: { gradeScale: rows.map((r) => ({ grade: r.grade.trim(), min: Number(r.min), max: Number(r.max), remark: r.remark.trim() })), showClassPosition: showPosition },
      })} label="Save grades" />
    </Panel>
  );
}

export function SchoolSetupView({ db, act }) {
  // each panel restarts from the saved values whenever its own part of the settings changes on the server
  const s = db.settings;
  const key = (...parts) => JSON.stringify(parts);
  return (
    <>
      <h1>School Setup</h1>
      <p className="lead">Make the system fit {db.school.name}. Changes apply to everyone in your school straight away.</p>
      <ProfilePanel key={key(db.school.name, s.motto, s.location, s.currency, s.admissionPrefix, s.colors, db.school.logoUrl)} db={db} act={act} />
      <CalendarPanel key={key(s.terms, s.currentTerm, s.currentYear)} db={db} act={act} />
      <ClassesPanel key={key(db.classes.map((c) => [c.id, c.name]))} db={db} act={act} />
      <SubjectsPanel key={key(db.subjectList)} db={db} act={act} />
      <AssessmentPanel key={key(s.assessment)} db={db} act={act} />
      <GradeScalePanel key={key(s.gradeScale, s.showClassPosition)} db={db} act={act} />
    </>
  );
}
