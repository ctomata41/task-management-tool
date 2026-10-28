// Projects: the portfolio as one table (a row per project: stage, health, how much is done, what is next), and a
// project's page. The page opens on its board (tasks grouped by stage, Monday style); the ID card, outputs, the log of
// decisions and assumptions, and the people are one tab away.
import { useState, useRef, useEffect } from 'preact/hooks';
import { html, Icon, Avatar, Faces, Pill, Seg, Classified, Health, StageStrip, Empty, openMenu, dueWord, dayDiff, ago, dateInput, OUT_KIND, LEVEL } from '../ui.js';
import { TaskTable, BoardBar, Battery, groupTasks, matches } from '../table.js';
import { useStore, project, person, canManage, canSee, isCommander, teamProjects, personalProjects, projectTasks, projectOutputs, openSheet,
  updateProject, setField, setStage, addStage, moveStage, skipStage, removeStage, addLog, resolveSenior, team, getState } from '../store.js';
import { status, currentStage, HILL, CONFIDENCE, HEALTH, STAGES, CLASSIFICATION, needsCommander, cardFill, TEMPLATES } from '../card.js';
import { OutputCard } from './outputs.js';

export function Projects() {
  const s = useStore();
  const [filter, setFilter] = useState('all');
  const all = teamProjects();
  const live = all.filter((p) => p.phase !== 'stopped' && p.phase !== 'done');
  const isMine = (p) => p.manager === s.me || p.partners.includes(s.me);
  const personal = personalProjects();
  let groups;
  if (filter === 'closed') groups = [{ id: 'closed', name: 'נסגרו', color: 'var(--s-todo)', list: all.filter((p) => p.phase === 'stopped' || p.phase === 'done') }];
  else {
    groups = [
      { id: 'mine', name: 'הפרויקטים שלי', color: 'var(--accent)', list: live.filter(isMine) },
      { id: 'team', name: 'שאר הצוות', color: 'var(--s-waiting)', list: filter === 'mine' ? [] : live.filter((p) => !isMine(p)) },
      { id: 'personal', name: 'אישי', hint: 'רק את/ה רואה', color: 'var(--s-progress)', list: personal },
    ];
  }
  return html`<div class="page">
    <header class="page-head2"><h1>פרויקטים</h1>
      <button type="button" class="btn btn-primary" onClick=${() => openSheet('newproject')}><${Icon} name="plus" size=${16} />פרויקט חדש</button></header>
    <${Seg} label="סינון" value=${filter} onChange=${setFilter} options=${[{ id: 'all', label: 'פעילים', n: live.length }, { id: 'mine', label: 'שלי' }, { id: 'closed', label: 'נסגרו' }]} />
    ${groups.some((g) => g.list.length) ? html`<div class="ttable ptable">${groups.filter((g) => g.list.length).map((g) => html`<section class="tgrp" key=${g.id} style=${`--gc:${g.color}`}>
      <header class="tgrp-head"><span class="tgrp-tog"><h3>${g.name}</h3></span><span class="tgrp-n">${g.list.length}</span>${g.hint ? html`<span class="muted small">${g.hint}</span>` : null}</header>
      <div class="tt" role="table" aria-label=${g.name}>
        <div class="tt-row tt-th" role="row"><span class="tc-bar"></span><span class="tc th-title">פרויקט</span><span class="tc th c-owner">מוביל/ה</span><span class="tc th c-pstage">שלב</span><span class="tc th c-status">מצב</span><span class="tc th c-prog">משימות</span><span class="tc th c-due">הבא בתור</span></div>
        ${g.list.map((p) => html`<${ProjectRow} key=${p.id} p=${p} />`)}
      </div></section>`)}</div>` : html`<${Empty} icon="layers">אין כאן פרויקטים.</${Empty}>`}
  </div>`;
}

// One project as a row of the portfolio table: where it stands, how it feels, how much of its work is done.
function ProjectRow({ p }) {
  const s = getState();
  const st = status(p);
  const h0 = HEALTH[st.health];
  const tasks = s.tasks.filter((t) => t.project === p.id);
  const done = tasks.filter((t) => t.status === 'done').length;
  const next = tasks.filter((t) => t.status !== 'done' && t.due).sort((a, b) => String(a.due).localeCompare(String(b.due)))[0];
  const asks = isCommander() ? needsCommander(p, s.tasks) : [];
  return html`<a class="tt-row tt-task prow" role="row" href=${`#/project/${p.id}`} style=${`--pc:${p.color}`}>
    <span class="tc-bar" aria-hidden="true"></span>
    <span class="tc tc-title" role="cell"><span class="pdot" style=${`background:${p.color}`}></span><span class="tt-open"><span class="tt-name">${p.name}</span>
      <span class="tt-chips"><${Classified} p=${p} small />${st.pending ? html`<${Pill} color="var(--s-waiting)">מחכה לאישור</${Pill}>` : null}${asks.length ? html`<${Pill} color="var(--h-off)">צריך אותך · ${asks.length}</${Pill}>` : null}${st.stale ? html`<span class="stale">לא עודכן</span>` : null}</span></span></span>
    <span class="tc c-owner" role="cell"><${Avatar} id=${p.manager} size=${28} /></span>
    <span class="tc c-pstage" role="cell"><span class="small"><b>${st.where}</b>${st.n ? html` <span class="muted">${Math.min(st.idx, st.n)}/${st.n}</span>` : null}</span><${StageStrip} p=${p} /></span>
    <span class="tc c-status" role="cell"><span class=${'cell-fill' + (st.health === 'hold' || st.health === 'stopped' ? ' quiet' : '') + (st.health === 'stuck' ? ' light' : '')} style=${`--c:${h0.color}`}>${h0.label}</span></span>
    <span class="tc c-prog" role="cell">${tasks.length ? html`<${Battery} tasks=${tasks} /><span class="muted small">${done}/${tasks.length}</span>` : html`<span class="muted small">—</span>`}</span>
    <span class="tc c-due" role="cell">${next ? html`<span class=${'cell-date' + (dayDiff(next.due) < 0 ? ' late' : '')} title=${next.title}>${dueWord(next.due)}</span>` : html`<span class="muted small">—</span>`}</span>
  </a>`;
}

const TABS = [
  { id: 'tasks', label: 'משימות' },
  { id: 'card', label: 'תעודת זהות' },
  { id: 'outputs', label: 'תוצרים' },
  { id: 'log', label: 'יומן' },
  { id: 'people', label: 'אנשים' },
];

export function ProjectPage({ id }) {
  const s = useStore();
  const p = project(id);
  const [tab, setTab] = useState('tasks');
  if (!p || !canSee(p)) return html`<div class="page"><${Empty} icon="lock">הפרויקט לא נמצא, או שאין לך גישה אליו.</${Empty}></div>`;
  const mgr = canManage(p);
  const st = status(p);
  const tasks = projectTasks(p.id);
  const openTasks = tasks.filter((t) => t.status !== 'done').length;
  const outs = projectOutputs(p.id);
  const tabs = TABS.map((t) => ({ ...t, n: t.id === 'tasks' ? openTasks || null : t.id === 'outputs' ? outs.length || null : null }));
  return html`<div class="page proj2" style=${`--bar:${p.color}`}>
    <header class="proj2-head">
      <div class="grow">
        <div class="eyebrow">${p.personal ? 'פרויקט אישי' : html`בניהול ${person(p.manager).name}`}${p.template ? ` · ${TEMPLATES.find((t) => t.id === p.template)?.name || ''}` : ''}</div>
        <h1>${p.name}</h1>
        <div class="proj2-tags"><${Health} p=${p} /><${Classified} p=${p} />${st.n ? html`<span class="muted small">${st.where} · שלב ${Math.min(st.idx, st.n)} מתוך ${st.n}</span>` : null}</div>
      </div>
      <div class="head-acts">
        ${mgr && !p.personal && p.phase !== 'stopped' ? html`<button type="button" class="btn" onClick=${() => openSheet('weekly', { id: p.id })}><${Icon} name="hill" size=${16} />עדכון שבועי</button>` : null}
        ${mgr && currentStage(p) && p.phase !== 'stopped' ? html`<button type="button" class="btn btn-primary" onClick=${() => openSheet('gate', { id: p.id })}><${Icon} name="check" size=${16} />${currentStage(p).state === 'pending' && isCommander() ? 'אישור השלב' : 'סגירת שלב'}</button>` : null}
        ${isCommander() && !p.personal ? html`<button type="button" class="btn" onClick=${() => openSheet('direct', { id: p.id })}><${Icon} name="flag" size=${16} />להוריד משימה</button>` : null}
      </div>
    </header>
    <${Seg} label="חלקי הפרויקט" value=${tab} onChange=${setTab} options=${tabs} cls="proj-tabs" />
    ${tab === 'card' ? html`<${IdCard} p=${p} mgr=${mgr} />` : null}
    ${tab === 'tasks' ? html`<${TasksBoard} p=${p} mgr=${mgr} />` : null}
    ${tab === 'outputs' ? html`<${ProjectOutputs} p=${p} />` : null}
    ${tab === 'log' ? html`<${Log} p=${p} mgr=${mgr} />` : null}
    ${tab === 'people' ? html`<${People} p=${p} mgr=${mgr} />` : null}
  </div>`;
}

// ---------- the ID card ----------
function Text({ value, onSave, placeholder, disabled, multiline = true, label }) {
  const [v, setV] = useState(value || '');
  const ref = useRef();
  useEffect(() => setV(value || ''), [value]);
  const grow = () => { const el = ref.current; if (el && multiline) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } };
  useEffect(grow, [v]);
  if (disabled) return html`<div class=${'ftext ro' + (v ? '' : ' muted')}>${v || placeholder}</div>`;
  const save = () => { if ((v || '') !== (value || '')) onSave(v.trim()); };
  return multiline
    ? html`<textarea ref=${ref} class="ftext" rows="1" value=${v} placeholder=${placeholder} aria-label=${label} onInput=${(e) => setV(e.currentTarget.value)} onBlur=${save}></textarea>`
    : html`<input class="ftext" value=${v} placeholder=${placeholder} aria-label=${label} onInput=${(e) => setV(e.currentTarget.value)} onBlur=${save} onKeyDown=${(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />`;
}

const CORE = [
  { key: 'what', label: 'מה ולמה', hint: 'מה מנסים לעשות, ומה ישתנה אם נצליח. משפט אחד, בלי ז׳רגון' },
  { key: 'forWhom', label: 'למי', hint: 'הדורש או הלקוח, ומי ישתמש בתוצר' },
  { key: 'success', label: 'איך נדע שהצלחנו', hint: 'המבחן בסוף. אפשר למלא עד סוף התיחום' },
  { key: 'stopRule', label: 'תנאי עצירה', hint: 'אם עד תאריך X לא קרה Y, עוצרים או משנים כיוון' },
];

function IdCard({ p, mgr }) {
  const s = useStore();
  const [edit, setEdit] = useState(false);
  const cur = currentStage(p);
  const asks = needsCommander(p, s.tasks);
  const fill = cardFill(p);
  const outs = projectOutputs(p.id);
  return html`<div class="idcard">
    ${p.classification === 'restricted' ? html`<div class="note-band lock"><${Icon} name="lock" size=${16} /><span><b>${CLASSIFICATION.restricted.label}.</b> כאן מנהלים את הפרויקט בלבד. החומרים עצמם נשארים ברשת המסווגת, ושדה שנמצא שם מסומן ככזה ולא נחשב חסר.</span></div>` : null}
    ${p.needsSenior ? html`<div class="note-band senior"><${Icon} name="flag" size=${16} /><div class="grow"><b>צריך בכיר:</b> ${p.needsSenior.what}${p.needsSenior.by ? html` <span class="muted">· עד ${dueWord(p.needsSenior.by)}</span>` : null}</div>
      ${isCommander() ? html`<button type="button" class="btn sm" onClick=${() => openSheet('resolve', { id: p.id })}>טיפלתי</button>` : null}</div>` : null}
    ${isCommander() && asks.filter((a) => a.kind !== 'senior').length ? html`<div class="note-band why"><${Icon} name="alert" size=${16} /><div class="grow">${asks.filter((a) => a.kind !== 'senior').map((a) => html`<div><b>${a.why}:</b> ${a.text}</div>`)}</div></div>` : null}

    <section class="card2">
      <div class="card2-head"><h2><${Icon} name="idcard" size=${18} />ליבה</h2><span class="muted small" title="שדות שמולאו, סומנו 'עוד לא ידוע' או 'ברשת המסווגת', עד השלב הנוכחי">${fill.done} מתוך ${fill.of} מולאו</span></div>
      <div class="core">
        ${CORE.map((f) => html`<div class="core-row"><label class="core-l">${f.label}</label>
          <${Text} label=${f.label} value=${p[f.key]} placeholder=${mgr ? f.hint : 'עוד לא ידוע'} disabled=${!mgr} onSave=${(v) => updateProject(p.id, { [f.key]: v })} /></div>`)}
        ${p.trl !== undefined ? html`<div class="core-row"><label class="core-l">מוכנות טכנולוגית</label>
          <div class="trl">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => html`<button type="button" class=${'trl-n' + (n <= p.trl ? ' on' : '')} disabled=${!mgr} aria-label=${`TRL ${n}`} onClick=${() => updateProject(p.id, { trl: n })}>${n}</button>`)}<span class="muted small">TRL ${p.trl}</span></div></div>` : null}
      </div>
    </section>

    <section class="card2">
      <div class="card2-head"><h2><${Icon} name="flag" size=${18} />שלבים ואבני דרך</h2>
        ${mgr ? html`<button type="button" class="link-btn" onClick=${() => setEdit(!edit)}>${edit ? 'סיום עריכה' : 'עריכת השלבים'}</button>` : null}</div>
      <${StageStrip} p=${p} labels />
      <ol class="stages">${p.stages.map((st, i) => html`<${StageRow} key=${st.id} p=${p} st=${st} i=${i} mgr=${mgr} edit=${edit} outs=${outs.filter((o) => o.stage === st.id)} />`)}</ol>
      ${edit ? html`<${AddStage} p=${p} />` : null}
      ${!p.stages.length && !edit ? html`<div class="muted small">אין שלבים. ${mgr ? 'אפשר להוסיף מהספרייה דרך "עריכת השלבים".' : ''}</div>` : null}
    </section>

    ${!p.personal ? html`<section class="card2">
      <div class="card2-head"><h2><${Icon} name="hill" size=${18} />איפה זה עומד</h2><span class="muted small">עודכן ${ago(p.lastUpdate)}</span></div>
      <div class="state-grid">
        <div class="state-cell"><span class="muted small">על הגבעה</span><${Hill} at=${p.hill || 'up'} /><strong>${HILL[p.hill || 'up'].label}</strong></div>
        <div class="state-cell"><span class="muted small">ביטחון</span><span class="conf-dot" style=${`--c:${(CONFIDENCE[p.confidence] || CONFIDENCE.on).color}`}></span><strong>${(CONFIDENCE[p.confidence] || CONFIDENCE.on).label}</strong>${p.confNote ? html`<span class="small">${p.confNote}</span>` : null}</div>
      </div>
      ${(p.updates || []).length > 1 ? html`<div class="upd-trail" aria-label="העדכונים האחרונים">${p.updates.slice(0, 8).reverse().map((u) => html`<span class="upd-dot" style=${`--c:${CONFIDENCE[u.confidence].color}`} title=${`${ago(u.at)} · ${CONFIDENCE[u.confidence].label} · ${HILL[u.hill].short}`}></span>`)}<span class="muted small">שבועות אחרונים</span></div>` : null}
      ${mgr ? html`<button type="button" class="btn block" onClick=${() => openSheet('weekly', { id: p.id })}>עדכון שבועי</button>` : null}
    </section>` : null}
  </div>`;
}

// Uphill: still working out how. The top: the approach is known. Downhill: finishing.
function Hill({ at }) {
  const x = { up: 26, top: 50, down: 76 }[at];
  const y = { up: 20, top: 9, down: 20 }[at];
  return html`<svg class="hill" viewBox="0 0 100 34" width="110" height="38" aria-hidden="true">
    <path d="M4 30 C 30 30, 34 8, 50 8 S 70 30, 96 30" fill="none" stroke="var(--line-strong)" stroke-width="2" />
    <circle cx=${x} cy=${y} r="5" fill="var(--accent)" /></svg>`;
}

function StageRow({ p, st, i, mgr, edit, outs }) {
  const cur = st.state === 'active' || st.state === 'pending';
  const reached = st.state !== 'todo';
  const [open, setOpen] = useState(cur);
  const icon = { done: 'check', skipped: 'chevronLeft', active: 'target', pending: 'clock', todo: '' }[st.state];
  const word = { done: st.closedAt ? `נסגר ${ago(st.closedAt)}` : 'נסגר', skipped: 'דילגנו', active: 'עכשיו', pending: 'מחכה לאישור המפקד', todo: '' }[st.state];
  return html`<li class=${'stage s-' + st.state + (open ? ' open' : '')}>
    <div class="stage-line">
      <span class="stage-ic">${icon ? html`<${Icon} name=${icon} size=${14} />` : i + 1}</span>
      <button type="button" class="stage-name" onClick=${() => setOpen(!open)} aria-expanded=${open}>${st.name}${st.gate === 'commander' ? html`<span class="gate-mark" title="סגירת השלב באישור המפקד"><${Icon} name="shield" size=${13} /></span>` : null}</button>
      <span class="muted small">${word}</span>
      ${cur && (st.target || mgr) ? html`<label class=${'stage-target' + (st.target && new Date(st.target) < new Date() ? ' late' : '')}><${Icon} name="calendar" size=${13} />
        ${mgr ? html`<input type="date" value=${dateInput(st.target)} onInput=${(e) => setStage(p.id, st.id, { target: e.currentTarget.value || null })} aria-label="יעד לשלב" />` : null}${st.target ? `יעד ${dueWord(st.target)}` : 'יעד'}</label>` : null}
      <span class="grow"></span>
      ${edit ? html`<span class="stage-edit">
        <button type="button" class="icon-btn sm" aria-label="למעלה" onClick=${() => moveStage(p.id, st.id, -1)}><${Icon} name="chevronUp" size=${16} /></button>
        <button type="button" class="icon-btn sm" aria-label="למטה" onClick=${() => moveStage(p.id, st.id, 1)}><${Icon} name="chevronDown" size=${16} /></button>
        ${st.state === 'todo' || st.state === 'active' ? html`<button type="button" class="icon-btn sm" aria-label="לדלג" title="לדלג על השלב" onClick=${() => skipStage(p.id, st.id)}><${Icon} name="chevronLeft" size=${16} /></button>` : null}
        ${st.state === 'todo' ? html`<button type="button" class="icon-btn sm danger" aria-label="להסיר" onClick=${() => removeStage(p.id, st.id)}><${Icon} name="trash" size=${16} /></button>` : null}
      </span>` : null}
    </div>
    ${open ? html`<div class="stage-body">
      ${st.exit ? html`<div class="exit-q"><span class="muted small">כדי לעבור הלאה:</span> ${st.exit}</div>` : null}
      ${reached || mgr ? st.fields.map((f, k) => html`<${StageField} p=${p} st=${st} f=${f} k=${k} mgr=${mgr} />`) : null}
      ${!reached && !st.fields.length ? html`<div class="muted small">ימולא כשנגיע לשלב.</div>` : null}
      ${outs.length ? html`<div class="evidence"><span class="muted small">תוצרים בשלב:</span>${outs.map((o) => html`<button type="button" class="ev-chip" onClick=${() => openSheet('output', { id: o.id })}><${Icon} name=${(OUT_KIND[o.kind] || OUT_KIND.link).icon} size=${13} />${o.title}</button>`)}</div>` : null}
    </div>` : null}
  </li>`;
}

function StageField({ p, st, f, k, mgr }) {
  const restricted = p.classification === 'restricted';
  if (f.classified) return html`<div class="sfield"><label class="core-l">${f.label}</label><span class="cls-tag sm"><${Icon} name="lock" size=${11} />ברשת המסווגת</span>
    ${mgr ? html`<button type="button" class="link-btn small" onClick=${() => setField(p.id, st.id, k, { classified: false })}>ביטול</button>` : null}</div>`;
  if (f.unknown) return html`<div class="sfield"><label class="core-l">${f.label}</label><span class="muted">עוד לא ידוע</span>
    ${mgr ? html`<button type="button" class="link-btn small" onClick=${() => setField(p.id, st.id, k, { unknown: false })}>למלא</button>` : null}</div>`;
  return html`<div class="sfield"><label class="core-l">${f.label}</label>
    <${Text} label=${f.label} value=${f.value} placeholder=${mgr ? 'לכתוב כאן' : 'עוד לא מולא'} disabled=${!mgr} onSave=${(v) => setField(p.id, st.id, k, { value: v })} />
    ${mgr && !f.value ? html`<span class="sfield-acts"><button type="button" class="link-btn small" onClick=${() => setField(p.id, st.id, k, { unknown: true })}>עוד לא ידוע</button>
      ${restricted ? html`<button type="button" class="link-btn small" onClick=${() => setField(p.id, st.id, k, { classified: true })}>ברשת המסווגת</button>` : null}</span>` : null}
  </div>`;
}

function AddStage({ p }) {
  const [name, setName] = useState('');
  const have = new Set(p.stages.map((s) => s.key));
  const lib = Object.entries(STAGES).filter(([k]) => !have.has(k));
  return html`<div class="add-stage">
    <div class="muted small">להוסיף מהספרייה:</div>
    <div class="chips-row">${lib.map(([k, v]) => html`<button type="button" class="qchip" onClick=${() => addStage(p.id, k)}><${Icon} name="plus" size=${13} />${v.name}</button>`)}</div>
    <form class="inline-form" onSubmit=${(e) => { e.preventDefault(); if (name.trim()) { addStage(p.id, null, name.trim()); setName(''); } }}>
      <input class="input" value=${name} onInput=${(e) => setName(e.currentTarget.value)} placeholder="או שלב משלך, למשל 'ניסוי שטח'" aria-label="שם השלב" />
      <button type="submit" class="btn" disabled=${!name.trim()}>הוספה</button></form>
  </div>`;
}

// ---------- tasks: the project's board, grouped by stage by default ----------
const BOARD_GROUPS = [{ id: 'stage', label: 'שלב' }, { id: 'status', label: 'סטטוס' }, { id: 'owner', label: 'אחראי' }, { id: 'priority', label: 'עדיפות' }, { id: 'date', label: 'תאריך' }];
function TasksBoard({ p, mgr }) {
  const s = useStore();
  const [by, setBy] = useState('stage');
  const [search, setSearch] = useState('');
  const [who, setWho] = useState(null);
  const [showDone, setShowDone] = useState(true);
  const all = projectTasks(p.id);
  const tasks = all.filter((t) => matches(t, search, who) && (showDone || t.status !== 'done'));
  const cur = currentStage(p);
  const isMember = mgr || p.partners.includes(s.me);
  const base = isMember ? { project: p.id } : null;
  const PAL = ['var(--accent)', 'var(--s-waiting)', 'var(--s-done)', 'var(--s-progress)', 'var(--h-risk)', 'var(--s-blocked)'];
  const groups = by === 'stage'
    ? [...p.stages.filter((st) => tasks.some((t) => t.stage === st.id) || st === cur).map((st) => ({ id: st.id, name: st.name, color: st.state === 'done' ? 'var(--s-done)' : st === cur ? 'var(--accent)' : PAL[(p.stages.indexOf(st) + 1) % PAL.length],
        hint: st === cur ? 'עכשיו' : st.state === 'done' ? 'נסגר' : st.state === 'skipped' ? 'דילגנו' : null, tasks: tasks.filter((t) => t.stage === st.id), add: base ? { ...base, stage: st.id } : null })),
      { id: 'none', name: 'בלי שלב', color: 'var(--s-todo)', tasks: tasks.filter((t) => !t.stage || !p.stages.some((x) => x.id === t.stage)), add: null }]
    : groupTasks(tasks, by, base);
  // Groups already in order of stage: the current stage leads, closed stages fold away to the end.
  if (by === 'stage') groups.sort((a, b) => (b.hint === 'עכשיו') - (a.hint === 'עכשיו') || (a.hint === 'נסגר') - (b.hint === 'נסגר'));
  return html`<div class="board2">
    <${BoardBar} search=${search} setSearch=${setSearch} people=${[p.manager, ...p.partners]} who=${who} setWho=${setWho} groupBy=${by} setGroupBy=${setBy} groupOptions=${BOARD_GROUPS} showDone=${showDone} setShowDone=${setShowDone} />
    <${TaskTable} key=${by} groups=${groups} memory=${`m.board.${p.id}.${by}`} cols=${by === 'stage' ? ['owner', 'status', 'priority', 'due'] : ['owner', 'status', 'priority', 'due', 'stage']} empty="אין משימות שמתאימות לחיפוש." />
  </div>`;
}

function ProjectOutputs({ p }) {
  useStore();
  const outs = projectOutputs(p.id);
  const restricted = p.classification === 'restricted';
  return html`<div class="sec">
    <div class="board2-bar"><div class="grow muted small">${restricted ? 'בפרויקט שמור/סודי מעלים רק חומר בלמ"ס. לחומר שברשת המסווגת מוסיפים מצביע: שם ומיקום, בלי התוכן.' : 'כל תוצר כאן נגיש לכל השותפים בפרויקט.'}</div>
      <button type="button" class="btn" onClick=${() => openSheet('meeting', { project: p.id })}><${Icon} name="mic" size=${16} />הקלטת פגישה</button>
      <button type="button" class="btn btn-primary" onClick=${() => openSheet('newoutput', { project: p.id })}><${Icon} name="plus" size=${16} />תוצר</button></div>
    ${outs.length ? html`<div class="ogrid">${outs.map((o) => html`<${OutputCard} key=${o.id} o=${o} showProject=${false} />`)}</div>` : html`<${Empty} icon="file">עוד אין תוצרים.</${Empty}>`}
  </div>`;
}

function Log({ p, mgr }) {
  useStore();
  const [kind, setKind] = useState('decision');
  const [text, setText] = useState('');
  const log = p.log || [];
  const member = mgr || p.partners.includes(getState().me);
  return html`<div class="sec">
    ${member ? html`<form class="log-add" onSubmit=${(e) => { e.preventDefault(); if (text.trim()) { addLog(p.id, { kind, text: text.trim() }); setText(''); } }}>
      <${Seg} label="סוג" value=${kind} onChange=${setKind} options=${[{ id: 'decision', label: 'החלטה' }, { id: 'assumption', label: 'הנחה או סיכון' }]} />
      <input class="input" value=${text} onInput=${(e) => setText(e.currentTarget.value)} placeholder=${kind === 'decision' ? 'מה הוחלט, ולמה' : 'מה אנחנו מניחים, ומה יקרה אם זה לא נכון'} aria-label="תוכן" />
      <button type="submit" class="btn btn-primary" disabled=${!text.trim()}>רישום</button></form>` : null}
    ${log.length ? html`<div class="group">${log.map((l) => html`<div class="log-row">
      <span class=${'log-ic ' + l.kind}><${Icon} name=${l.kind === 'decision' ? 'decision' : 'bulb'} size=${15} /></span>
      <div class="grow"><div>${l.text}</div><div class="muted small">${person(l.who).name} · ${ago(l.at)}${l.gate ? ' · החלטת שער' : ''}${l.kind === 'decision' && l.reversible === false ? ' · לא הפיכה' : ''}</div></div>
    </div>`)}</div>` : html`<${Empty} icon="decision">עוד אין החלטות או הנחות ביומן.</${Empty}>`}
  </div>`;
}

function People({ p, mgr }) {
  useStore();
  const ids = [p.manager, ...p.partners];
  const remove = (id) => updateProject(p.id, { partners: p.partners.filter((x) => x !== id) });
  return html`<div class="sec">
    <div class="group">${ids.map((id) => { const x = person(id); return html`<div class="person-row">
      <${Avatar} id=${id} size=${36} />
      <div class="grow"><strong>${x.name}</strong><div class="muted small">${id === p.manager ? 'מנהל/ת הפרויקט' : 'שותף/ה'}${x.role === 'external' ? ` · ${x.org || 'מחוץ לצוות'}` : ''}${x.role === 'external' ? (x.account ? ' · עובד/ת במערכת, רק בפרויקטים שלו' : ' · לא משתמש/ת במערכת') : ''}</div></div>
      ${id === p.manager && isCommander() ? html`<button type="button" class="btn sm" onClick=${(e) => openMenu(e, team().map((t) => ({ id: t.id, label: t.name, person: t.id })), { selected: p.manager, onPick: (m) => updateProject(p.id, { manager: m, partners: p.partners.filter((q) => q !== m) }) })}>החלפה</button>` : null}
      ${id !== p.manager && mgr ? html`<button type="button" class="icon-btn sm danger" aria-label=${`להוציא את ${x.name}`} onClick=${() => remove(id)}><${Icon} name="x" size=${16} /></button>` : null}
    </div>`; })}</div>
    ${mgr && !p.personal ? html`<button type="button" class="btn" onClick=${() => openSheet('partner', { id: p.id })}><${Icon} name="plus" size=${16} />הוספת שותף</button>` : null}
  </div>`;
}
