// Every sheet in the manual version: a new project, closing a stage (the gate), the weekly update, a task, people,
// the commander's direction, and recording a meeting. Each is short on purpose: a few taps, then back to work.
import { useState, useEffect, useRef } from 'preact/hooks';
import { html, Icon, Avatar, Seg, Pill, Empty, dueWord, dateInput, ago, openMenu, OUT_KIND } from '../ui.js';
import { useStore, project, person, team, isCommander, canManage, canEditTask, closeSheet, openSheet, addProject, closeStage, approveGate, returnGate,
  weeklyUpdate, resolveSenior, updateTask, setStatus, deleteTask, toggleFocus, addTask, addPerson, updateProject, saveMeeting, projectOutputs,
  STATUS, STATUS_ORDER, visibleProjects, getState, toast, switchTo, resetSample } from '../store.js';
import { TEMPLATES, CLASSIFICATION, HILL, CONFIDENCE, GATE_CHOICES, currentStage, stageReady } from '../card.js';
import { MeetingSummary } from './outputs.js';
import { ownerItems, ADD } from '../table.js';

// ---------- a new project ----------
export function NewProjectBody() {
  const s = useStore();
  const cmd = isCommander();
  const [kind, setKind] = useState('team');
  const [name, setName] = useState('');
  const [cls, setCls] = useState(null);
  const [tpl, setTpl] = useState('tool');
  const [what, setWhat] = useState('');
  const [manager, setManager] = useState(s.me);
  const [partners, setPartners] = useState([]);
  const [ext, setExt] = useState(null);
  const [exts, setExts] = useState([]); // outsiders typed here: they become people only when the project is saved
  const personal = kind === 'personal';
  const ready = name.trim() && (personal || cls);
  const toggle = (id) => setPartners(partners.includes(id) ? partners.filter((x) => x !== id) : [...partners, id]);
  const save = (e) => {
    e.preventDefault();
    if (!ready) return;
    const ids = personal ? [] : partners.filter((x) => x !== manager).map((id) => {
      const x = exts.find((y) => y.id === id);
      return x ? addPerson({ name: x.name, org: x.org, account: false }).id : id;
    });
    const p = addProject({ name: name.trim(), classification: cls || 'open', template: personal ? 'blank' : tpl, what: what.trim(), manager, partners: ids, personal });
    closeSheet();
    location.hash = `#/project/${p.id}`;
    toast(personal ? 'הפרויקט האישי נפתח. רק את/ה רואה אותו' : 'הפרויקט נפתח. תעודת הזהות מחכה למילוי לאורך הדרך');
  };
  const pool = [...s.people.filter((x) => x.id !== manager), ...exts];
  const addExt = () => {
    if (!ext.name.trim()) return;
    const id = `new:${exts.length}`;
    setExts([...exts, { id, name: ext.name.trim(), org: ext.org.trim(), role: 'external' }]);
    setPartners([...partners, id]);
    setExt(null);
  };
  const face = (x) => (x.id.startsWith('new:') ? html`<span class="avatar ext pending" style="width:22px;height:22px;font-size:9px">${x.name.slice(0, 2)}</span>` : html`<${Avatar} id=${x.id} size=${22} />`);
  const enterAdds = (e) => { if (e.key === 'Enter') { e.preventDefault(); addExt(); } };
  return html`<form class="form" onSubmit=${save}>
    <${Seg} label="סוג" value=${kind} onChange=${setKind} options=${[{ id: 'team', label: 'פרויקט צוות' }, { id: 'personal', label: 'פרויקט אישי' }]} />
    ${personal ? html`<p class="muted small">פרויקט אישי נשאר רק אצלך: קורס, לימודים, משהו שלך. הוא לא מופיע לצוות ולא למפקד.</p>` : null}
    <label class="lbl" for="np-name">שם</label>
    <input id="np-name" class="input" value=${name} onInput=${(e) => setName(e.currentTarget.value)} placeholder=${personal ? 'למשל: קורס ניהול מוצר' : 'למשל: מערכת אישורי כניסה'} />
    ${personal ? null : html`
      <span class="lbl">סיווג הפרויקט</span>
      <div class="pick-2">${Object.entries(CLASSIFICATION).map(([id, c]) => html`<button type="button" class=${'opt-card' + (cls === id ? ' on' : '')} aria-pressed=${cls === id} onClick=${() => setCls(id)}>
        <span class="oc-top">${id === 'restricted' ? html`<${Icon} name="lock" size=${16} />` : html`<${Icon} name="unlock" size=${16} />`}<strong>${c.label}</strong></span><span class="muted small">${c.hint}</span></button>`)}</div>
      ${cmd ? html`<span class="lbl">מי מוביל/ה</span><div class="chips-row">${team().map((x) => html`<button type="button" class=${'person-chip' + (manager === x.id ? ' on' : '')} onClick=${() => setManager(x.id)}><${Avatar} id=${x.id} size=${22} />${x.name}</button>`)}</div>` : null}
      <span class="lbl">שותפים <span class="muted">(אפשר להוסיף גם אחר כך)</span></span>
      <div class="chips-row">${pool.map((x) => html`<button type="button" class=${'person-chip' + (partners.includes(x.id) ? ' on' : '')} aria-pressed=${partners.includes(x.id)} onClick=${() => toggle(x.id)}>${face(x)}${x.name}${x.role === 'external' ? html`<span class="muted small">· מבחוץ</span>` : null}</button>`)}
        <button type="button" class="person-chip add" aria-expanded=${!!ext} onClick=${() => setExt(ext ? null : { name: '', org: '' })}><${Icon} name="plus" size=${16} />גורם מבחוץ</button></div>
      ${ext ? html`<div class="inline-form ext-form">
        <input class="input" value=${ext.name} onInput=${(e) => setExt({ ...ext, name: e.currentTarget.value })} onKeyDown=${enterAdds} placeholder="שם" aria-label="שם השותף" />
        <input class="input" value=${ext.org} onInput=${(e) => setExt({ ...ext, org: e.currentTarget.value })} onKeyDown=${enterAdds} placeholder="מאיפה: ארגון, מחלקה, ספק" aria-label="מאיפה" />
        <button type="button" class="btn" disabled=${!ext.name.trim()} onClick=${addExt}>הוספה</button></div>` : null}
      <span class="lbl">תבנית שלבים</span>
      <div class="tpl-list">${TEMPLATES.map((t) => html`<button type="button" class=${'tpl-opt' + (tpl === t.id ? ' on' : '')} aria-pressed=${tpl === t.id} onClick=${() => setTpl(t.id)}>
        <span class="grow"><strong>${t.name}</strong><span class="muted small">${t.stages.length ? t.stages.map((k) => k).length + ' שלבים · ' : ''}${t.hint}</span></span>${tpl === t.id ? html`<${Icon} name="check" size=${16} />` : null}</button>`)}</div>
      <p class="muted small">את השלבים אפשר לשנות בכל רגע: להוסיף, לדלג, לסדר מחדש.</p>
      <label class="lbl" for="np-what">מה ולמה <span class="muted">(אפשר גם אחר כך)</span></label>
      <textarea id="np-what" class="input area" rows="2" value=${what} onInput=${(e) => setWhat(e.currentTarget.value)} placeholder="מה מנסים לעשות, ומה ישתנה אם נצליח"></textarea>
    `}
    <div class="form-actions"><button type="submit" class="btn btn-primary" disabled=${!ready}>פתיחת הפרויקט</button><button type="button" class="btn" onClick=${closeSheet}>ביטול</button></div>
  </form>`;
}

// ---------- closing a stage ----------
export function GateBody({ id }) {
  const s = useStore();
  const p = project(id);
  const cur = p && currentStage(p);
  const [choice, setChoice] = useState('next');
  const [note, setNote] = useState('');
  const [ev, setEv] = useState([]);
  const [backTo, setBackTo] = useState('');
  if (!p) return null;
  if (!cur) return html`<${Empty}>אין שלב פתוח בפרויקט הזה.</${Empty}>`;
  const cmd = isCommander();
  const pending = cur.state === 'pending';
  // The commander answers a stage that waits for approval: approve, or return it with a direction.
  if (pending && cmd) {
    return html`<div class="form">
      <div class="gate-q"><span class="muted small">שלב ${cur.name} · השאלה לסגירה</span><strong>${cur.exit || 'האם השלב הושלם?'}</strong></div>
      <${StageEvidence} p=${p} st=${cur} />
      <label class="lbl" for="g-note">הערה או הכוונה</label>
      <textarea id="g-note" class="input area" rows="2" value=${note} onInput=${(e) => setNote(e.currentTarget.value)} placeholder="לא חובה כשמאשרים. כשמחזירים: מה חסר"></textarea>
      <div class="form-actions">
        <button type="button" class="btn btn-primary" onClick=${() => { approveGate(p.id, note.trim()); closeSheet(); }}>לאשר ולהמשיך</button>
        <button type="button" class="btn" disabled=${!note.trim()} onClick=${() => { returnGate(p.id, note.trim()); closeSheet(); }}>להחזיר עם ההכוונה</button>
      </div></div>`;
  }
  if (pending) return html`<div class="form"><div class="note-band why"><${Icon} name="clock" size=${16} /><span>שלב ${cur.name} מחכה לאישור של המפקד מאז ${ago(cur.askedAt)}. אין צורך לעשות כלום. אם משהו השתנה, אפשר לרשום את זה בהחלטות.</span></div></div>`;
  const outs = projectOutputs(p.id).filter((o) => o.stage === cur.id);
  const tasks = s.tasks.filter((t) => t.project === p.id && t.stage === cur.id);
  const open = tasks.filter((t) => t.status !== 'done').length;
  const empty = cur.fields.filter((f) => !(f.value && f.value.trim()) && !f.unknown && !f.classified).map((f) => f.label);
  const before = p.stages.slice(0, p.stages.indexOf(cur)).filter((x) => x.state === 'done' || x.state === 'skipped');
  const waits = choice === 'next' && cur.gate === 'commander' && !cmd;
  const save = () => {
    if (choice === 'stop' && !note.trim()) return;
    closeStage(p.id, { choice, note: note.trim(), evidence: ev, backTo: backTo || null });
    closeSheet();
  };
  return html`<div class="form">
    <div class="gate-q"><span class="muted small">שלב ${cur.name} · כדי לעבור הלאה</span><strong>${cur.exit || 'האם השלב הושלם?'}</strong></div>
    <div class="gate-facts">
      <span>${tasks.length ? (open ? html`<b class="warn-t">${open} משימות פתוחות</b> מתוך ${tasks.length}` : html`<b class="ok-t">כל ${tasks.length} המשימות בוצעו</b>`) : 'אין משימות בשלב'}</span>
      ${empty.length ? html`<span>לא מולא: ${empty.join(', ')}</span>` : cur.fields.length ? html`<span class="ok-t">כל השדות של השלב מולאו</span>` : null}
    </div>
    <span class="lbl">מה עושים</span>
    <div class="choice-list">${Object.entries(GATE_CHOICES).map(([k, c]) => (k === 'back' && !before.length ? null : html`<button type="button" class=${'choice' + (choice === k ? ' on' : '') + (k === 'stop' ? ' danger' : '')} aria-pressed=${choice === k} onClick=${() => setChoice(k)}>
      <${Icon} name=${c.icon} size=${17} /><span class="grow">${c.label}</span>${choice === k ? html`<${Icon} name="check" size=${16} />` : null}</button>`))}</div>
    ${choice === 'next' && outs.length ? html`<span class="lbl">הראיות לסגירה</span><div class="chips-row">${outs.map((o) => html`<button type="button" class=${'person-chip' + (ev.includes(o.id) ? ' on' : '')} aria-pressed=${ev.includes(o.id)} onClick=${() => setEv(ev.includes(o.id) ? ev.filter((x) => x !== o.id) : [...ev, o.id])}><${Icon} name=${(OUT_KIND[o.kind] || OUT_KIND.link).icon} size=${14} />${o.title}</button>`)}</div>` : null}
    ${choice === 'back' ? html`<label class="lbl" for="g-back">לאיזה שלב</label><select id="g-back" class="input" value=${backTo} onChange=${(e) => setBackTo(e.currentTarget.value)}>
      <option value="">לשלב הקודם</option>${before.map((x) => html`<option value=${x.id}>${x.name}</option>`)}</select>` : null}
    <label class="lbl" for="g-note">${choice === 'stop' ? 'למה עוצרים (חובה)' : 'מה למדנו, במשפט'}</label>
    <textarea id="g-note" class="input area" rows="2" value=${note} onInput=${(e) => setNote(e.currentTarget.value)} placeholder=${choice === 'stop' ? 'עצירה היא החלטה טובה כשיודעים למה. זה נשמר בהחלטות' : 'לא חובה. נשמר בהחלטות הפרויקט'}></textarea>
    ${waits ? html`<p class="note-band why"><${Icon} name="shield" size=${16} /><span>שלב ${cur.name} נסגר באישור המפקד. הבקשה תגיע אליו עם הראיות, ועד אז השלב מסומן "מחכה לאישור".</span></p>` : null}
    <div class="form-actions"><button type="button" class=${'btn ' + (choice === 'stop' ? 'danger' : 'btn-primary')} disabled=${choice === 'stop' && !note.trim()} onClick=${save}>${waits ? 'לבקש אישור' : choice === 'next' ? `לסגור את ${cur.name}` : GATE_CHOICES[choice].label}</button>
      <button type="button" class="btn" onClick=${closeSheet}>ביטול</button></div>
  </div>`;
}

function StageEvidence({ p, st }) {
  const outs = projectOutputs(p.id).filter((o) => st.evidence.includes(o.id) || o.stage === st.id);
  const filled = st.fields.filter((f) => f.value || f.classified || f.unknown);
  return html`<div class="sec">
    ${filled.length ? html`<div class="ev-fields">${filled.map((f) => html`<div><span class="muted small">${f.label}</span><div>${f.classified ? html`<span class="cls-tag sm"><${Icon} name="lock" size=${11} />ברשת המסווגת</span>` : f.unknown ? html`<span class="muted">עוד לא ידוע</span>` : f.value}</div></div>`)}</div>` : null}
    ${outs.length ? html`<div class="chips-row">${outs.map((o) => html`<button type="button" class="ev-chip" onClick=${() => openSheet('output', { id: o.id })}><${Icon} name=${(OUT_KIND[o.kind] || OUT_KIND.link).icon} size=${13} />${o.title}</button>`)}</div>` : html`<span class="muted small">לא צורפו תוצרים לשלב.</span>`}
  </div>`;
}

export function ReturnBody({ id }) {
  const [note, setNote] = useState('');
  const p = project(id);
  if (!p) return null;
  return html`<form class="form" onSubmit=${(e) => { e.preventDefault(); if (note.trim()) { returnGate(id, note.trim()); closeSheet(); } }}>
    <p class="muted">השלב יחזור ל${person(p.manager).name} עם מה שכתבת, וזה יירשם בהחלטות.</p>
    <textarea class="input area" rows="3" value=${note} onInput=${(e) => setNote(e.currentTarget.value)} placeholder="מה חסר כדי לאשר" aria-label="הכוונה"></textarea>
    <div class="form-actions"><button type="submit" class="btn btn-primary" disabled=${!note.trim()}>להחזיר</button><button type="button" class="btn" onClick=${closeSheet}>ביטול</button></div>
  </form>`;
}

// ---------- the weekly update: three taps ----------
export function WeeklyBody({ id }) {
  const p = project(id);
  const [hill, setHill] = useState(p?.hill || 'up');
  const [conf, setConf] = useState(p?.confidence || 'on');
  const [note, setNote] = useState(p?.confNote || '');
  const [senior, setSenior] = useState(!!p?.needsSenior);
  const [what, setWhat] = useState(p?.needsSenior?.what || '');
  const [by, setBy] = useState(dateInput(p?.needsSenior?.by));
  if (!p) return null;
  const needNote = conf !== 'on';
  const ready = (!needNote || note.trim()) && (!senior || what.trim());
  const save = () => { weeklyUpdate(p.id, { hill, confidence: conf, note: note.trim(), senior: senior ? { what: what.trim(), by: by || null } : null }); closeSheet(); };
  return html`<div class="form weekly">
    <span class="lbl">1. איפה אנחנו על הגבעה</span>
    <div class="hill-pick">${Object.entries(HILL).map(([k, v]) => html`<button type="button" class=${'hill-opt' + (hill === k ? ' on' : '')} aria-pressed=${hill === k} onClick=${() => setHill(k)}>
      <svg viewBox="0 0 100 34" width="72" height="26" aria-hidden="true"><path d="M4 30 C 30 30, 34 8, 50 8 S 70 30, 96 30" fill="none" stroke="currentColor" stroke-opacity="0.35" stroke-width="2.5" />
      <circle cx=${{ up: 26, top: 50, down: 76 }[k]} cy=${{ up: 20, top: 9, down: 20 }[k]} r="6" fill="currentColor" /></svg><span>${v.label}</span></button>`)}</div>
    <span class="lbl">2. כמה בטוחים</span>
    <div class="conf-pick">${Object.entries(CONFIDENCE).map(([k, v]) => html`<button type="button" class=${'conf-opt' + (conf === k ? ' on' : '')} style=${`--c:${v.color}`} aria-pressed=${conf === k} onClick=${() => setConf(k)}><span class="conf-dot"></span>${v.label}</button>`)}</div>
    ${needNote ? html`<input class="input" value=${note} onInput=${(e) => setNote(e.currentTarget.value)} placeholder=${conf === 'stuck' ? 'על מה נתקענו, במשפט' : 'מה הסיכון, במשפט'} aria-label="למה" />` : null}
    <span class="lbl">3. צריך בכיר?</span>
    <${Seg} label="צריך בכיר" value=${senior ? 'yes' : 'no'} onChange=${(v) => setSenior(v === 'yes')} options=${[{ id: 'no', label: 'לא' }, { id: 'yes', label: 'כן' }]} />
    ${senior ? html`<input class="input" value=${what} onInput=${(e) => setWhat(e.currentTarget.value)} placeholder="מה בדיוק צריך, למשל: לפתוח דלת למחלקת המחשוב" aria-label="מה צריך" />
      <label class="lbl" for="w-by">עד מתי</label><input id="w-by" class="input" type="date" value=${by} onInput=${(e) => setBy(e.currentTarget.value)} />
      <p class="muted small">זה מגיע ישר לתמונת המצב של המפקד, עם הסיבה.</p>` : null}
    <div class="form-actions"><button type="button" class="btn btn-primary" disabled=${!ready} onClick=${save}>שמירה</button><button type="button" class="btn" onClick=${closeSheet}>ביטול</button></div>
  </div>`;
}

export function ResolveBody({ id }) {
  const p = project(id);
  const [note, setNote] = useState('');
  if (!p?.needsSenior) return html`<${Empty}>הבקשה כבר טופלה.</${Empty}>`;
  return html`<form class="form" onSubmit=${(e) => { e.preventDefault(); resolveSenior(id, note.trim()); closeSheet(); }}>
    <div class="gate-q"><span class="muted small">${person(p.manager).name} ביקש/ה</span><strong>${p.needsSenior.what}</strong></div>
    <label class="lbl" for="r-note">מה עשית</label>
    <input id="r-note" class="input" value=${note} onInput=${(e) => setNote(e.currentTarget.value)} placeholder="למשל: דיברתי עם ראש מחלקת המחשוב, הסביבה תיפתח ביום ראשון" />
    <div class="form-actions"><button type="submit" class="btn btn-primary">סימון כטופל</button><button type="button" class="btn" onClick=${closeSheet}>ביטול</button></div>
  </form>`;
}

// ---------- the commander hands down a task ----------
export function DirectBody({ id }) {
  const p = project(id);
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState(p?.manager);
  const [due, setDue] = useState('');
  if (!p) return null;
  const people = [p.manager, ...p.partners];
  return html`<form class="form" onSubmit=${(e) => { e.preventDefault(); if (!title.trim()) return; addTask({ title: title.trim(), project: p.id, owner, due: due || null }); closeSheet(); }}>
    <p class="muted small">המשימה תופיע אצל מי שבחרת עם הסימון "מהמפקד", ובפרויקט בשלב הנוכחי.</p>
    <label class="lbl" for="d-title">מה צריך לעשות</label>
    <input id="d-title" class="input" value=${title} onInput=${(e) => setTitle(e.currentTarget.value)} placeholder="למשל: להציג לי את תוכנית הפיילוט" />
    <span class="lbl">למי</span>
    <div class="chips-row">${people.map((x) => html`<button type="button" class=${'person-chip' + (owner === x ? ' on' : '')} onClick=${() => setOwner(x)}><${Avatar} id=${x} size=${22} />${person(x).name}</button>`)}</div>
    <label class="lbl" for="d-due">עד מתי</label><input id="d-due" class="input" type="date" value=${due} onInput=${(e) => setDue(e.currentTarget.value)} />
    <div class="form-actions"><button type="submit" class="btn btn-primary" disabled=${!title.trim()}>להוריד את המשימה</button><button type="button" class="btn" onClick=${closeSheet}>ביטול</button></div>
  </form>`;
}

// ---------- one task ----------
export function TaskBody({ id }) {
  const s = useStore();
  const t = s.tasks.find((x) => x.id === id);
  const [title, setTitle] = useState(t?.title || '');
  const [notes, setNotes] = useState(t?.notes || '');
  useEffect(() => { setTitle(t?.title || ''); setNotes(t?.notes || ''); }, [id]);
  if (!t) return html`<${Empty}>המשימה נמחקה.</${Empty}>`;
  const edit = canEditTask(t);
  const p = project(t.project);
  const pool = p ? [p.manager, ...p.partners] : isCommander() ? team().map((x) => x.id) : [s.me];
  const save = (patch) => updateTask(t.id, patch);
  const pickOwner = (e) => openMenu(e, ownerItems(p, pool), { selected: t.owner, onPick: (o) => (o === ADD ? openSheet('partner', { id: p.id, task: t.id, back: true }) : save({ owner: o })) });
  const pickProject = (e) => openMenu(e, [{ id: '', label: 'בלי פרויקט', icon: 'user' }, ...visibleProjects().filter((x) => x.phase !== 'stopped' && (t.personal ? x.personal : !x.personal)).map((x) => ({ id: x.id, label: x.name, dot: x.color }))],
    { selected: t.project || '', onPick: (pid) => { const np = project(pid); save({ project: pid || null, stage: np ? currentStage(np)?.id || null : null }); } });
  const pickStage = (e) => openMenu(e, p.stages.map((x) => ({ id: x.id, label: x.name })), { selected: t.stage, onPick: (sid) => save({ stage: sid }) });
  const stage = p?.stages.find((x) => x.id === t.stage);
  return html`<div class="form tsheet">
    ${edit ? html`<textarea class="input area title-in" rows="1" value=${title} onInput=${(e) => setTitle(e.currentTarget.value)} onBlur=${() => title.trim() && title !== t.title && save({ title: title.trim() })} aria-label="כותרת"></textarea>` : html`<h3>${t.title}</h3>`}
    ${t.fromCommander ? html`<div class="note-band why"><${Icon} name="flag" size=${16} /><span>הורד/ה מ${person(t.by).name}</span></div>` : null}
    <div class="st-pick">${STATUS_ORDER.map((k) => html`<button type="button" class=${'st-opt' + (t.status === k ? ' on' : '')} style=${`--c:${STATUS[k].color}`} disabled=${!edit} aria-pressed=${t.status === k} onClick=${() => setStatus(t.id, k)}>${STATUS[k].label}</button>`)}</div>
    <div class="facts">
      <div class="fact-row"><span class="core-l">אחראי/ת</span><button type="button" class="fact-btn" disabled=${!edit} onClick=${pickOwner}><${Avatar} id=${t.owner} size=${22} />${person(t.owner).name}</button></div>
      <div class="fact-row"><span class="core-l">פרויקט</span><button type="button" class="fact-btn" disabled=${!edit} onClick=${pickProject}>${p ? html`<i class="pdot" style=${`background:${p.color}`}></i>${p.name}` : 'בלי פרויקט'}</button></div>
      ${p && p.stages.length ? html`<div class="fact-row"><span class="core-l">שלב</span><button type="button" class="fact-btn" disabled=${!edit} onClick=${pickStage}>${stage ? stage.name : 'בלי שלב'}</button></div>` : null}
      <div class="fact-row"><span class="core-l">תאריך יעד</span><label class="fact-btn"><input type="date" value=${dateInput(t.due)} disabled=${!edit} onInput=${(e) => save({ due: e.currentTarget.value || null })} />${t.due ? dueWord(t.due) : 'בלי תאריך'}</label></div>
      ${!t.personal ? html`<div class="fact-row"><span class="core-l">התחייבות חיצונית</span>
        <input class="input sm" value=${t.external || ''} disabled=${!edit} placeholder="למי הבטחנו, אם למישהו מחוץ לצוות" onChange=${(e) => save({ external: e.currentTarget.value.trim() || null })} aria-label="התחייבות חיצונית" /></div>` : null}
    </div>
    ${t.external ? html`<p class="muted small">התחייבות לגורם חיצוני מגיעה למפקד אם היא באיחור או בסכנה (פחות משלושה ימי עבודה והיא לא בעבודה).</p>` : null}
    <label class="lbl" for="t-notes">הערות</label>
    <textarea id="t-notes" class="input area" rows="3" value=${notes} disabled=${!edit} onInput=${(e) => setNotes(e.currentTarget.value)} onBlur=${() => notes !== (t.notes || '') && save({ notes })} placeholder="פרטים, קישורים, מה כבר נעשה"></textarea>
    <div class="muted small">נוצרה ע"י ${person(t.by).name} · ${ago(t.createdAt)}</div>
    ${edit ? html`<div class="form-actions">
      ${t.owner === s.me && t.status !== 'done' ? html`<button type="button" class="btn" onClick=${() => toggleFocus(t.id)}><${Icon} name="star" size=${16} />${t.focus ? 'להוציא מהפוקוס' : 'לפוקוס של היום'}</button>` : null}
      <span class="grow"></span>
      <button type="button" class="btn danger" onClick=${() => { deleteTask(t.id); closeSheet(); }}><${Icon} name="trash" size=${16} />מחיקה</button></div>` : null}
  </div>`;
}

// ---------- people ----------
// From a task's owner menu, the new partner also takes the task (and from the task sheet, it opens again after).
export function PartnerBody({ id, task }) {
  const s = useStore();
  const p = project(id);
  const [mode, setMode] = useState('pick');
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [account, setAccount] = useState('no');
  if (!p) return null;
  const inIt = new Set([p.manager, ...p.partners]);
  const pool = s.people.filter((x) => !inIt.has(x.id));
  const add = (pid) => {
    updateProject(p.id, { partners: [...p.partners, pid] });
    if (task) updateTask(task, { owner: pid });
    toast(`${person(pid).name} נוסף/ה לפרויקט${task ? ' ואחראי/ת על המשימה' : ''}`);
  };
  const done = closeSheet; // with `back`, closing returns to the task
  return html`<div class="form">
    <${Seg} label="מי" value=${mode} onChange=${setMode} options=${[{ id: 'pick', label: 'מהרשימה' }, { id: 'new', label: 'גורם חיצוני חדש' }]} />
    ${mode === 'pick' ? (pool.length ? html`<div class="who-list">${pool.map((x) => html`<button type="button" class="who-row" onClick=${() => { add(x.id); done(); }}><${Avatar} id=${x.id} size=${34} />
      <div class="grow"><strong>${x.name}</strong><span class="muted small">${x.role === 'external' ? `${x.org || 'מבחוץ'}${x.account ? '' : ' · בלי משתמש'}` : x.title}</span></div><${Icon} name="plus" size=${18} /></button>`)}</div>` : html`<${Empty}>כולם כבר בפרויקט.</${Empty}>`)
    : html`<form class="form" onSubmit=${(e) => { e.preventDefault(); if (!name.trim()) return; const x = addPerson({ name: name.trim(), org: org.trim(), account: account === 'yes' }); add(x.id); done(); }}>
      <label class="lbl" for="pp-name">שם</label><input id="pp-name" class="input" value=${name} onInput=${(e) => setName(e.currentTarget.value)} />
      <label class="lbl" for="pp-org">מאיפה</label><input id="pp-org" class="input" value=${org} onInput=${(e) => setOrg(e.currentTarget.value)} placeholder="ארגון, מחלקה, ספק" />
      <span class="lbl">עובד/ת במערכת?</span>
      <${Seg} label="משתמש" value=${account} onChange=${setAccount} options=${[{ id: 'no', label: 'רק ברשימה' }, { id: 'yes', label: 'עם גישה לפרויקט הזה' }]} />
      <p class="muted small">${account === 'yes' ? 'יקבל/תקבל קישור אישי ויראה/תראה רק את הפרויקטים שהוא/היא שותף/ה בהם.' : 'אפשר לשייך לו/לה משימות. מי שמנהל את הפרויקט מעדכן בשבילו/ה.'}</p>
      <div class="form-actions"><button type="submit" class="btn btn-primary" disabled=${!name.trim()}>הוספה</button></div></form>`}
  </div>`;
}

export function WhoBody() {
  const s = useStore();
  const role = (x) => (x.role === 'commander' ? 'מפקד' : x.role === 'external' ? `${x.org || 'מבחוץ'} · מבחוץ` : x.title);
  return html`<div class="who-list">
    <p class="muted small">גרסת דמו: אפשר לראות את המערכת בעיניים של כל אחד ואחת. כל אחד רואה רק את מה שמותר לו.</p>
    ${s.people.filter((x) => x.account !== false).map((x) => html`<button type="button" class=${'who-row' + (x.id === s.me ? ' on' : '')} onClick=${() => switchTo(x.id)}>
      <${Avatar} id=${x.id} size=${36} /><div class="grow"><strong>${x.name}</strong><span class="muted small">${role(x)}</span></div>${x.id === s.me ? html`<${Icon} name="check" />` : null}</button>`)}
    <button type="button" class="btn block" onClick=${() => { resetSample(); closeSheet(); }}>להחזיר את נתוני הדוגמה</button>
  </div>`;
}

// ---------- recording a meeting ----------
// Before: name, purpose, project. During: a timer. After: the summary (decisions, tasks with owners, open questions, the
// next step) is saved as an output with the raw recording attached. In this demo the summary is a sample; the live
// version sends the recording to the same summarizer the platform already uses.
export function MeetingBody({ project: pid }) {
  const s = useStore();
  const [step, setStep] = useState('details');
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [proj, setProj] = useState(pid || '');
  const [sec, setSec] = useState(0);
  const [saved, setSaved] = useState(null);
  const rec = useRef(null);
  const p = project(proj);
  const restricted = p?.classification === 'restricted';
  useEffect(() => {
    if (step !== 'rec') return undefined;
    const t = setInterval(() => setSec((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [step]);
  useEffect(() => () => { try { rec.current?.stream?.getTracks().forEach((x) => x.stop()); } catch (e) { /* nothing to stop */ } }, []);
  const start = async () => {
    setSec(0);
    setStep('rec');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.start();
      rec.current = { mr, stream, chunks };
    } catch (e) {
      rec.current = null; // no microphone here: the demo still walks through the flow
    }
  };
  const stop = () => {
    setStep('work');
    const finish = (audio) => {
      const minutes = Math.max(1, Math.round(sec / 60));
      const m = saveMeeting({ project: proj || null, title: title.trim(), purpose: purpose.trim(), minutes, state: 'done', audio,
        summary: { decisions: ['(דוגמה) ממשיכים בכיוון שהוצג'], tasks: [{ text: '(דוגמה) לשלוח סיכום לשותפים', owner: person(s.me).name }], questions: ['(דוגמה) מי מאשר את השלב הבא?'], next: '(דוגמה) פגישת המשך בשבוע הבא' } });
      setTimeout(() => { setSaved(m); setStep('done'); }, 900);
    };
    const r = rec.current;
    if (r && r.mr.state !== 'inactive') {
      r.mr.onstop = () => { r.stream.getTracks().forEach((x) => x.stop()); finish(URL.createObjectURL(new Blob(r.chunks, { type: r.mr.mimeType || 'audio/webm' }))); };
      r.mr.stop();
    } else finish(null);
  };
  const mm = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  if (step === 'details') {
    return html`<form class="form" onSubmit=${(e) => { e.preventDefault(); if (title.trim() && !restricted) start(); }}>
      <label class="lbl" for="m-title">שם הפגישה</label><input id="m-title" class="input" value=${title} onInput=${(e) => setTitle(e.currentTarget.value)} placeholder="למשל: פגישה עם הקב״ט" />
      <label class="lbl" for="m-purpose">מטרה</label><input id="m-purpose" class="input" value=${purpose} onInput=${(e) => setPurpose(e.currentTarget.value)} placeholder="מה רוצים לצאת איתו מהפגישה" />
      <label class="lbl" for="m-proj">פרויקט</label><select id="m-proj" class="input" value=${proj} onChange=${(e) => setProj(e.currentTarget.value)}>
        <option value="">בלי פרויקט</option>${visibleProjects().filter((x) => x.phase !== 'stopped').map((x) => html`<option value=${x.id}>${x.name}</option>`)}</select>
      ${restricted ? html`<div class="note-band lock"><${Icon} name="lock" size=${16} /><span>זה פרויקט שמור/סודי. לא מקליטים כאן את הפגישות שלו. אפשר לרשום את ההחלטות בלשונית "החלטות", בלי פרטים מסווגים.</span></div>`
        : html`<p class="muted small">מבקשים רשות מכל המשתתפים לפני שמקליטים. בסוף נשמר סיכום כתוצר, וההקלטה המקורית מצורפת אליו.</p>`}
      <div class="form-actions"><button type="submit" class="btn btn-primary" disabled=${!title.trim() || restricted}><${Icon} name="mic" size=${16} />להתחיל להקליט</button><button type="button" class="btn" onClick=${closeSheet}>ביטול</button></div>
    </form>`;
  }
  if (step === 'rec') {
    return html`<div class="rec-stage"><span class="rec-dot" aria-hidden="true"></span><div class="rec-time" aria-live="off">${mm}</div>
      <div class="muted">${title}${p ? ` · ${p.name}` : ''}</div>
      <button type="button" class="btn btn-primary rec-stop" onClick=${stop}><${Icon} name="pause" size=${16} />לסיים ולסכם</button></div>`;
  }
  if (step === 'work') return html`<div class="rec-stage"><span class="spinner"></span><div class="muted">מסכמים את הפגישה…</div></div>`;
  return html`<div class="form">
    <div class="note-band ok"><${Icon} name="check" size=${16} /><span>הסיכום נשמר כתוצר${p ? ` בפרויקט ${p.name}` : ''}.</span></div>
    <${MeetingSummary} m=${saved} />
    <p class="muted small">בגרסת הדמו הסיכום לדוגמה. בגרסה החיה הוא נכתב מההקלטה עצמה.</p>
    <div class="form-actions"><button type="button" class="btn btn-primary" onClick=${() => openSheet('output', { id: saved.output })}>לפתוח את התוצר</button><button type="button" class="btn" onClick=${closeSheet}>סגירה</button></div>
  </div>`;
}
