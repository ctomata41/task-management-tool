// The types page (design §6.4): every type a project can start from, and one type's DNA. A type is what a new project
// copies: its stages (each with an exit question, who closes it, its usual days and its fields), its own core fields,
// hints for the four core fields, where its materials live by default, its pyramid domain and its readiness (TRL).
// Changing a type never touches a project already open.
// The whole team reads it. The commander, and whoever the commander gave the permission to (store.canEditTypes),
// change it for everyone, only through the store's type actions, which check every change (card.checkTypePatch).
// A structural change (a stage, a gate, a field, a fact, the place, the domain, readiness, hiding, going back to the
// default, a copy, a new type) shows a toast with ביטול and writes the same line to the types' log. Text (a name, a
// description, a question, a label, a hint, the usual days) saves when its field is left, with a log line and no toast.
// Outside partners don't see the page.
import { useState, useRef, useEffect } from 'preact/hooks';
import { html, Icon, Text, Seg, Empty, Pill, useFlip, keepFocus, openMenu, ago, saveOnEnter } from '../ui.js';
import { useStore, person, commander, lib, canEditTypes, typeLog, setTypeDef, typeCheck, newType, duplicateType, hideType, resetType,
  hasOverride, openProjectsOfType } from '../store.js';
import { CORE, DOMAINS, PYRAMID_ORDER, NO_DOMAIN, domainTitle, PLACES, PLACE_ORDER, placesFor, STAGES, typeById, openTypes, typeStages, stageLibrary, gateCount,
  coreHint, CTO_TYPES, TEMPLATES } from '../card.js';

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const stagesWord = (n) => (!n ? 'בלי שלבים מראש' : n === 1 ? 'שלב אחד' : `${n} שלבים`);
const gatesWord = (g) => (g === 1 ? 'שער אחד באישור המפקד' : `${g} שערים באישור המפקד`);
const daysWord = (n) => (n === 1 ? 'יום אחד בערך' : n === 2 ? 'יומיים בערך' : `${n} ימים בערך`);
const placeWord = (t) => (PLACES[t.place] ? PLACES[t.place].label : 'בוחרים בפתיחה');
const allowedLine = (t) => `מותר: ${placesFor(t).map((pl) => PLACES[pl].label).join(' · ')}`; // a place's label has a comma of its own
const codeOf = (id) => [...CTO_TYPES, ...TEMPLATES].find((x) => x.id === id) || null;
const NONE = '-'; // the menu item for "no value": no domain, no default place, no readiness target

// A type just made or copied opens in edit mode, with focus on its title.
let editNext = null;

// A change to type `id`, worked out from the type as it is now: fn gets it and returns the patch, or nothing. A
// structural change says "הסוג '{name}' עודכן" with ביטול; a text change gets only its log line (store.setTypeDef).
function change(id, fn, structural = true) {
  const cur = typeById(lib(), id);
  const patch = cur && fn(cur);
  return !!patch && setTypeDef(id, patch, structural ? `הסוג '${cur.name}' עודכן` : undefined);
}
// The path as stage definitions (card.typeStages). `fn` gets them and returns the new list, or nothing.
const changeStages = (id, fn, structural = true) => change(id, (cur) => { const list = fn(typeStages(cur)); return list && { stages: list }; }, structural);
const setAt = (list, i, fn) => list.map((x, k) => (k === i ? fn(x) : x));
// A stage's field is its label, or { label, where: 'classified' } when it starts on the classified network.
const fieldLabel = (f) => (typeof f === 'string' ? f : f.label);
const fieldCls = (f) => typeof f !== 'string' && f?.where === 'classified';
const asField = (label, cls) => (cls ? { label, where: 'classified' } : label);
// Rows are keyed by the stage's key; a key that repeats (only a broken edit could make one) gets a count.
const rowKeys = (list) => { const seen = new Map(); return list.map((d) => { const n = seen.get(d.key) || 0; seen.set(d.key, n + 1); return n ? `${d.key}#${n}` : d.key; }); };
// After a change that takes away the control that was pressed, focus goes to `to` (a function that finds it), unless
// something else already has it.
function refocus(to) {
  requestAnimationFrame(() => {
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected) return;
    to()?.focus();
  });
}

export function TypesPage({ id }) {
  const s = useStore();
  if (person(s.me).role === 'external') return html`<div class="page"><${Empty} icon="lock">העמוד הזה רק לצוות</${Empty}></div>`;
  return id ? html`<${TypePage} id=${id} />` : html`<${TypesList} />`;
}

// Who may not change types reads why, and where a change to one project is made instead.
const NoGrant = () => html`<p class="note-band ty-grant"><${Icon} name="key" size=${16} />
  <span>רק בהרשאה מ${commander().name} אפשר לשנות סוג לכל הצוות. שינוי בפרויקט אחד עושים בתוך הפרויקט.</span></p>`;

// ---------- the list ----------
function TypesList() {
  const [adding, setAdding] = useState(false);
  const opener = useRef();
  const L = lib();
  const can = canEditTypes();
  const shown = openTypes(L); // the CTO types, the team's own, then the general ones
  const hidden = L.types.filter((t) => t.hidden);
  const groups = [
    { id: 'cto', name: 'סוגי ה-CTO', list: shown.filter((t) => t.cto) },
    { id: 'general', name: 'סוגים כלליים', list: shown.filter((t) => !t.cto) },
    { id: 'hidden', name: 'מוסתרים', list: [...hidden.filter((t) => t.cto && !t.team), ...hidden.filter((t) => t.team), ...hidden.filter((t) => !t.cto)] },
  ].filter((g) => g.list.length);
  const close = () => { setAdding(false); opener.current?.focus(); };
  return html`<div class="page ty-list">
    <header class="page-head2"><div>
      <h1>סוגי פרויקטים</h1>
      <p class="sub">מה מקבל פרויקט חדש מכל סוג: שלבים, שערים, שדות ואיפה החומרים. שינוי כאן לא נוגע בפרויקטים שכבר נפתחו.</p>
      <p class="ty-demo">בגרסת הדמו השינויים נשמרים רק בדפדפן הזה.</p></div>
      ${can ? html`<div class="head-acts"><button type="button" class="btn btn-primary" ref=${opener} aria-expanded=${adding ? 'true' : 'false'} aria-controls="ty-new"
        onClick=${() => setAdding(!adding)}><${Icon} name="plus" size=${16} />סוג חדש</button></div>` : null}
    </header>
    ${can && adding ? html`<${NewTypeForm} onCancel=${close} />` : null}
    ${can ? null : html`<${NoGrant} />`}
    ${groups.map((g) => html`<section class="sec" key=${g.id} aria-labelledby=${`ty-g-${g.id}`}>
      <div class="sec-head"><h2 id=${`ty-g-${g.id}`}>${g.name}</h2></div>
      <ul class="group ty-rows">${g.list.map((t) => html`<${TypeRow} key=${t.id} t=${t} />`)}</ul>
    </section>`)}
    <${TypeLog} />
  </div>`;
}

// A type as a row: its name, what it is for, and what a project gets from it.
function TypeRow({ t }) {
  const g = gateCount(t);
  const line = [stagesWord(typeStages(t).length), g ? gatesWord(g) : null, placeWord(t)].filter(Boolean).join(' · ');
  return html`<li><a class="ty-row" href=${`#/types/${t.id}`}>
    <span class="ty-main"><strong class="ty-name">${t.name}</strong>${t.hint ? html`<span class="ty-hint">${t.hint}</span>` : null}<span class="ty-meta">${line}</span></span>
    <${Icon} name="chevronLeft" size=${16} /></a></li>`;
}

// "סוג חדש": a team type with no stages that allows every place, by its name. It opens at once, ready to edit.
function NewTypeForm({ onCancel }) {
  const [name, setName] = useState('');
  const field = useRef();
  useEffect(() => { field.current?.focus(); }, []);
  const create = (e) => {
    e.preventDefault();
    const id = name.trim() ? newType(name) : null;
    if (!id) return;
    editNext = id;
    location.hash = `#/types/${id}`;
  };
  return html`<form class="card2 ty-new" id="ty-new" onSubmit=${create}>
    <div class="inline-form">
      <input class="input" ref=${field} value=${name} onInput=${(e) => setName(e.currentTarget.value)} placeholder="שם הסוג" aria-label="שם הסוג"
        onKeyDown=${(e) => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }} />
      <button type="submit" class="btn btn-primary" disabled=${!name.trim()}>יצירה</button>
    </div>
  </form>`;
}

// The types' log, newest first: five lines, then all of them (the store keeps the last 20).
function TypeLog() {
  const [all, setAll] = useState(false);
  const list = useRef();
  const log = typeLog(20);
  if (!log.length) return null;
  const more = () => { setAll(true); requestAnimationFrame(() => list.current?.children[5]?.focus()); };
  return html`<section class="sec" aria-labelledby="ty-log-h">
    <div class="sec-head"><h2 id="ty-log-h">שינויים אחרונים</h2></div>
    <ul class="group ty-log" ref=${list}>${(all ? log : log.slice(0, 5)).map((l) => html`<li key=${l.id} class="ty-log-row" tabindex="-1">
      <b>${person(l.who).name}</b> · ${l.text} · <span class="muted">${ago(l.at)}</span></li>`)}</ul>
    ${!all && log.length > 5 ? html`<button type="button" class="link-btn ty-more" onClick=${more}>עוד</button>` : null}
  </section>`;
}

// ---------- one type ----------
function TypePage({ id }) {
  useStore();
  const head = useRef();
  const fresh = useRef(false);
  const [edit, setEdit] = useState(() => { const on = editNext === id; if (on) { editNext = null; fresh.current = true; } return on; });
  useEffect(() => {
    // Focus left the button that made this type with the page it was on, so it goes to the new page's title.
    if (!fresh.current || !head.current) return;
    head.current.tabIndex = -1;
    head.current.focus({ preventScroll: true });
  }, []);
  const t = typeById(lib(), id);
  const back = html`<a class="link-btn ty-back" href="#/types"><${Icon} name="chevronRight" size=${16} />סוגי פרויקטים</a>`;
  // A type that isn't here (a link to one made in another browser, or the toast's ביטול of a type just made or copied)
  // still gets a title, as a page does, and focus lands on it when what held it went with the type (ui.Toast).
  if (!t) return html`<div class="page ty-page">${back}
    <header class="page-head2 ty-head"><div class="ty-title"><h1>הסוג הזה לא נמצא</h1></div></header></div>`;
  const can = canEditTypes();
  const editing = edit && can;
  const n = openProjectsOfType(t.id);
  return html`<div class=${'page ty-page' + (editing ? ' ty-editing' : '')}>
    ${back}
    <header class="page-head2 ty-head"><div class="ty-title">
      <div class="eyebrow">${t.team ? 'סוג פרויקט · נוצר בצוות' : 'סוג פרויקט'}</div>
      <h1 ref=${head}>${t.name}</h1>
      ${t.hidden ? html`<div class="ty-tags"><${Pill} color="var(--fg-3)">מוסתר מפתיחת פרויקט</${Pill}></div>` : null}</div>
      ${can ? html`<div class="head-acts"><button type="button" class=${'btn' + (editing ? ' btn-primary' : '')} onClick=${() => setEdit(!edit)}>
        ${editing ? 'סיום עריכה' : html`<${Icon} name="edit" size=${16} />עריכה`}</button></div>` : null}
    </header>
    ${can ? null : html`<${NoGrant} />`}
    <${General} t=${t} edit=${editing} />
    <${Path} t=${t} edit=${editing} />
    <${Facts} t=${t} edit=${editing} />
    <${Hints} t=${t} edit=${editing} />
    ${n ? html`<p class="ty-foot">${n === 1 ? 'פרויקט אחד פתוח מהסוג הזה. הוא לא ישתנה.' : `${n} פרויקטים פתוחים מהסוג הזה. הם לא ישתנו.`}</p>` : null}
    ${can ? html`<${Actions} t=${t} />` : null}
  </div>`;
}

// A row of a card: its label, and what it holds.
const row = (label, body) => html`<div class="core-row"><span class="core-l">${label}</span><div class="ty-cell">${body}</div></div>`;
const readText = (text, quiet = false) => html`<div class=${'ftext ro' + (quiet ? ' muted' : '')}>${text}</div>`;
// A value that opens a menu of its choices, growing from it.
const pick = (label, value, onClick) => html`<button type="button" class="fact-btn ty-pick" aria-haspopup="menu" aria-label=${`${label}: ${value}`} onClick=${onClick}>
  <span>${value}</span><${Icon} name="chevronDown" size=${14} /></button>`;

// "כללי": the name and what the type is for, its domain, where its materials live by default and why, and readiness.
function General({ t, edit }) {
  const [nk, setNk] = useState(0);
  const set = (patch) => change(t.id, () => patch);
  const text = (patch) => change(t.id, () => patch, false);
  const domain = t.domain ? domainTitle(t.domain) : NO_DOMAIN;
  const target = t.trlTarget ? `TRL ${t.trlTarget}` : 'בלי';
  // A code type's places are fixed by code; a team type's only when it was copied from one that limits them.
  const allowed = !t.team || placesFor(t).length < PLACE_ORDER.length ? html`<p class="ty-allowed">${allowedLine(t)}</p>` : null;
  if (!edit) {
    return html`<section class="card2" aria-labelledby="ty-gen-h">
      <div class="card2-head"><h2 id="ty-gen-h"><${Icon} name="settings" size=${18} />כללי</h2></div>
      <div class="core">
        ${t.hint ? row('תיאור', readText(t.hint)) : null}
        ${row('רובד', readText(domain))}
        ${row('איפה החומרים כברירת מחדל', html`${readText(placeWord(t))}${allowed}`)}
        ${t.why ? row('הסבר להצעה', readText(t.why)) : null}
        ${row('מוכנות טכנולוגית (TRL)', readText(t.trl ? 'כן' : 'לא'))}
        ${t.trl ? row('מוכנות היעד', readText(target)) : null}
      </div>
    </section>`;
  }
  const tiers = PYRAMID_ORDER.map((d) => DOMAINS.find((x) => x.id === d)).filter(Boolean);
  const item = (d) => ({ id: d.id, label: domainTitle(d.id) });
  const pickDomain = (e) => openMenu(e, [...tiers.filter((d) => d.n).map(item), { sep: true }, ...tiers.filter((d) => d.side).map(item), { sep: true }, { id: NONE, label: NO_DOMAIN }],
    { selected: t.domain ?? NONE, onPick: (v) => { const d = v === NONE ? null : v; if (d !== (t.domain ?? null)) set({ domain: d }); } });
  // The value reads as the menu item it is: a place, or "לבחור בכל פתיחה".
  const pickPlace = (e) => openMenu(e, [...placesFor(t).map((pl) => ({ id: pl, label: PLACES[pl].label, hint: PLACES[pl].hint })), { sep: true }, { id: NONE, label: 'לבחור בכל פתיחה' }],
    { selected: t.place ?? NONE, onPick: (v) => { const pl = v === NONE ? null : v; if (pl !== (t.place ?? null)) set({ place: pl }); } });
  const pickTarget = (e) => openMenu(e, [...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((x) => ({ id: x, label: `TRL ${x}` })), { sep: true }, { id: NONE, label: 'בלי' }],
    { selected: t.trlTarget ?? NONE, onPick: (v) => { const x = v === NONE ? null : v; if (x !== (t.trlTarget ?? null)) set({ trlTarget: x }); } });
  return html`<section class="card2" aria-labelledby="ty-gen-h">
    <div class="card2-head"><h2 id="ty-gen-h"><${Icon} name="settings" size=${18} />כללי</h2></div>
    <div class="core">
      ${row('שם הסוג', html`<${Text} key=${nk} label="שם הסוג" value=${t.name} multiline=${false} onSave=${(v) => { if (!v || !text({ name: v })) setNk(nk + 1); }} />`)}
      ${row('תיאור', html`<${Text} label="תיאור" value=${t.hint} onSave=${(v) => text({ hint: v })} />`)}
      ${row('רובד', pick('רובד', domain, pickDomain))}
      ${row('איפה החומרים כברירת מחדל', html`${pick('איפה החומרים כברירת מחדל', PLACES[t.place] ? PLACES[t.place].label : 'לבחור בכל פתיחה', pickPlace)}${allowed}`)}
      ${row('הסבר להצעה', html`<${Text} label="הסבר להצעה" value=${t.why} onSave=${(v) => text({ why: v })} />`)}
      ${row('מוכנות טכנולוגית (TRL)', html`<button type="button" class=${'toggle ty-switch' + (t.trl ? ' on' : '')} role="switch" aria-checked=${t.trl ? 'true' : 'false'}
        aria-label="מוכנות טכנולוגית (TRL)" onClick=${() => set({ trl: !t.trl })}><span></span></button>`)}
      ${t.trl ? row('מוכנות היעד', pick('מוכנות היעד', target, pickTarget)) : null}
    </div>
  </section>`;
}

// "שלבים": the path a new project gets, as a project's stages look: each with its gate mark and usual days. A stage
// opens to its exit question and fields; in edit mode to everything about it. Stages move up and down, are removed,
// and are added from the library or by name.
function Path({ t, edit }) {
  const list = useRef();
  useFlip(list); // a stage moved up or down slides to its new place
  const defs = typeStages(t);
  const keys = rowKeys(defs);
  const [open, setOpen] = useState(() => new Set());
  // A reason a control can't act, under it: { key, at: 'gate' | 'remove', text }. It goes with any change to the types.
  const [why, setWhy] = useState(null);
  useEffect(() => setWhy(null), [t, edit]);
  const toggle = (k) => setOpen((o) => { const x = new Set(o); if (x.has(k)) x.delete(k); else x.add(k); return x; });
  return html`<section class="card2 ty-path" aria-labelledby="ty-path-h">
    <div class="card2-head"><h2 id="ty-path-h"><${Icon} name="flag" size=${18} />שלבים</h2></div>
    ${defs.length ? html`<ol class="stages ty-stages" ref=${list}>${defs.map((d, i) => html`<${StageDef} key=${keys[i]} t=${t} d=${d} i=${i} n=${defs.length} edit=${edit}
      open=${open.has(keys[i])} onToggle=${() => toggle(keys[i])} why=${why?.key === keys[i] ? why : null}
      say=${(at, text) => setWhy(text ? { key: keys[i], at, text } : null)} />`)}</ol>` : html`<p class="muted small">בלי שלבים מראש</p>`}
    ${edit ? html`<${AddStageDef} t=${t} defs=${defs} />` : null}
  </section>`;
}

function StageDef({ t, d, i, n, edit, open, onToggle, why, say }) {
  // Only while the stage is still where this row put it (another change may have moved it).
  const move = (dir) => changeStages(t.id, (list) => {
    const j = i + dir;
    if (list[i]?.key !== d.key || j < 0 || j >= list.length) return null;
    const out = [...list];
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  });
  // At either end a move stays in place, focusable, so focus never drops when a stage reaches the top or the bottom.
  // Moving a row down puts its node back in the list after the next one, which takes focus off the button pressed in
  // it; the button is the same one, now in the row's new place, so focus goes back to it.
  const mv = (dir, icon, label) => {
    const edge = dir < 0 ? i === 0 : i === n - 1;
    return html`<button type="button" class="icon-btn ty-mv" aria-label=${`להזיז את '${d.name}' ${label}`} title=${`להזיז ${label}`} aria-disabled=${edge ? 'true' : null}
      onClick=${(e) => { if (!edge) { const btn = e.currentTarget; say(null); refocus(() => btn); move(dir); } }}><${Icon} name=${icon} size=${16} /></button>`;
  };
  return html`<li class=${'stage ty-stage' + (open ? ' open' : '')}>
    <div class="stage-line">
      <span class="stage-ic" aria-hidden="true">${i + 1}</span>
      <button type="button" class="stage-name" aria-expanded=${open ? 'true' : 'false'} onClick=${onToggle}>${d.name}${d.gate === 'commander'
        ? html`<span class="gate-mark" title="סגירת השלב באישור המפקד"><${Icon} name="shield" size=${13} /><span class="sr"> · באישור המפקד</span></span>` : null}
        <${Icon} name=${open ? 'chevronUp' : 'chevronDown'} size=${14} cls="ty-chev" /></button>
      <span class="ty-days">${daysWord(d.days)}</span>
      ${edit ? html`<span class="ty-move">${mv(-1, 'chevronUp', 'למעלה')}${mv(1, 'chevronDown', 'למטה')}</span>` : null}
    </div>
    ${open ? html`<div class="stage-body ty-body">${edit ? html`<${StageEditor} t=${t} d=${d} i=${i} why=${why} say=${say} />` : html`<${StageRead} d=${d} />`}</div>` : null}
  </li>`;
}

const ClsTag = () => html`<span class="cls-tag sm"><${Icon} name="lock" size=${11} />מתחיל ברשת המסווגת</span>`;

function StageRead({ d }) {
  return html`${d.exit ? html`<div class="exit-q"><span class="muted small">כדי לעבור הלאה:</span> ${d.exit}</div>` : null}
    ${d.fields.length ? html`<div class="ty-flist-wrap"><span class="muted small">שדות:</span>
      <ul class="ty-flist">${d.fields.map((f, k) => html`<li key=${k}><span>${fieldLabel(f)}</span>${fieldCls(f) ? html`<${ClsTag} />` : null}</li>`)}</ul></div>`
      : html`<p class="muted small ty-none">בלי שדות</p>`}`;
}

// One stage in edit mode. Its name, exit question, usual days and field labels save when their field is left; who
// closes it, its fields and its place in the path are structural. Lowering a commander gate, or removing a stage that
// has one, is the commander's (card.checkTypePatch); for anyone else the control says why when pressed.
function StageEditor({ t, d, i, why, say }) {
  const [nk, setNk] = useState(0);
  const [days, setDays] = useState(null); // what is typed, until the field is left
  const here = (list) => list[i]?.key === d.key;
  const edit = (fn, structural = true) => changeStages(t.id, (list) => (here(list) ? setAt(list, i, fn) : null), structural);
  const defs = typeStages(t);
  const refused = (stages) => { const r = typeCheck(t.id, { stages }); return r.ok ? null : r.why || ' '; };
  const gateWhy = (g) => (g === d.gate ? null : refused(setAt(defs, i, (x) => ({ ...x, gate: g }))));
  const removeWhy = refused(defs.filter((_, k) => k !== i));
  const opt = (g, label) => ({ id: g, label, disabled: !!gateWhy(g) });
  const saveDays = (v) => {
    setDays(null);
    const x = Number(v);
    if (Number.isInteger(x) && x >= 1 && x <= 730 && x !== d.days) edit((s) => ({ ...s, days: x }), false);
  };
  const remove = (e) => {
    if (removeWhy) { say('remove', removeWhy); return; }
    say(null);
    keepFocus(e, 'li.ty-stage');
    changeStages(t.id, (list) => (here(list) ? list.filter((_, k) => k !== i) : null));
  };
  return html`<div class="ty-editor">
    ${row('שם השלב', html`<${Text} key=${nk} label="שם השלב" value=${d.name} multiline=${false} onSave=${(v) => { if (!v || !edit((s) => ({ ...s, name: v }), false)) setNk(nk + 1); }} />`)}
    ${row('שאלת היציאה', html`<${Text} label="שאלת היציאה" value=${d.exit} placeholder="מה צריך להיות נכון כדי לעבור הלאה?" onSave=${(v) => edit((s) => ({ ...s, exit: v }), false)} />`)}
    ${row('סגירת השלב', html`<${Seg} label="סגירת השלב" cls="ty-gate" value=${d.gate} options=${[opt('manager', 'בפרויקט'), opt('commander', 'באישור המפקד')]}
        onChange=${(g) => { say(null); if (g !== d.gate) edit((s) => ({ ...s, gate: g })); }} onDisabled=${(g) => say('gate', gateWhy(g))} />
      <p class="ty-why" role="status">${why?.at === 'gate' ? why.text : null}</p>`)}
    ${row('ימים בערך', html`<input class="input sm ty-days-in" type="number" inputmode="numeric" min="1" max="730" step="1" value=${days ?? d.days} aria-label="ימים בערך"
      onInput=${(e) => setDays(e.currentTarget.value)} onBlur=${(e) => saveDays(e.currentTarget.value)} onKeyDown=${(e) => saveOnEnter(e, (el) => saveDays(el.value))} />`)}
    ${row('שדות', html`<div class="ty-flds">${d.fields.map((f, k) => html`<${FieldDef} key=${k} t=${t} d=${d} i=${i} k=${k} f=${f} />`)}</div>
      <${AddFieldDef} t=${t} d=${d} i=${i} />`)}
    <div class="ty-remove">
      <button type="button" class="link-btn ty-rm" aria-disabled=${removeWhy ? 'true' : null} onClick=${remove}><${Icon} name="trash" size=${15} />להסיר מהמסלול</button>
      <p class="ty-why" role="status">${why?.at === 'remove' ? why.text : null}</p>
    </div>
  </div>`;
}

// A field of a stage: its label, whether it starts on the classified network, and its removal.
function FieldDef({ t, d, i, k, f }) {
  const [nk, setNk] = useState(0);
  const label = fieldLabel(f);
  const cls = fieldCls(f);
  const edit = (fn, structural = true) => changeStages(t.id, (list) => (list[i]?.key === d.key && list[i].fields[k] !== undefined
    ? setAt(list, i, (s) => ({ ...s, fields: fn(s.fields) })) : null), structural);
  const rename = (v) => { if (!v || !edit((fs) => setAt(fs, k, (x) => asField(v, fieldCls(x))), false)) setNk(nk + 1); };
  const remove = (e) => {
    const row0 = e.currentTarget.closest('.ty-fld');
    const rows = [...row0.parentElement.children];
    const n = rows.indexOf(row0);
    const body = row0.closest('.ty-body');
    edit((fs) => fs.filter((_, j) => j !== k));
    // To the next field's removal (now in this row's place), else the one before, else the field to add one.
    refocus(() => [...body.querySelectorAll('.ty-fld .ty-x')][n] || [...body.querySelectorAll('.ty-fld .ty-x')][n - 1] || body.querySelector('.ty-add-fld input'));
  };
  return html`<div class="ty-fld">
    <${Text} key=${nk} label="שם השדה" value=${label} multiline=${false} onSave=${rename} />
    <span class="ty-fld-acts">
      <button type="button" class="qchip ty-cls" aria-pressed=${cls ? 'true' : 'false'} aria-label=${`מתחיל ברשת המסווגת: ${label}`}
        onClick=${() => edit((fs) => setAt(fs, k, (x) => asField(fieldLabel(x), !fieldCls(x))))}>
        <${Icon} name="lock" size=${13} />מתחיל ברשת המסווגת</button>
      <button type="button" class="icon-btn ty-x" aria-label=${`להסיר את השדה '${label}'`} title="להסיר את השדה" onClick=${remove}><${Icon} name="x" size=${16} /></button>
    </span>
  </div>`;
}

// "+ שדה": a field with the label typed in, at the end of the stage's fields.
function AddFieldDef({ t, d, i }) {
  const [name, setName] = useState('');
  const add = (e) => {
    e.preventDefault();
    const v = name.trim();
    if (v && changeStages(t.id, (list) => (list[i]?.key === d.key ? setAt(list, i, (s) => ({ ...s, fields: [...s.fields, v] })) : null))) setName('');
  };
  return html`<form class="inline-form ty-add-fld" onSubmit=${add}>
    <input class="input sm" value=${name} onInput=${(e) => setName(e.currentTarget.value)} placeholder="שם השדה" aria-label="שם השדה" />
    <button type="submit" class="btn sm" aria-label="להוסיף שדה" disabled=${!name.trim()}><${Icon} name="plus" size=${14} />שדה</button></form>`;
}

// Adding goes at the end of the path: a stage from the library, minus what the path has, or a new one by name: its own
// key, closed in the project, 14 days, no fields. The library (card.stageLibrary) starts from the type as the code has
// it, so a stage taken off a code type's path comes first, then the classic ones, then the other types'. The first
// LIB_CHIPS are chips; "עוד מהספרייה…" opens all of it as a menu, grouped as on a project's card (stages.js). A chip
// that was added goes away, and focus moves to the chip now in its place.
const LIB_CHIPS = 8;
function libraryItems(list, t) {
  const own = new Set(typeStages(t).map((d) => d.key));
  const group = (d) => (own.has(d.key) ? 0 : STAGES[d.key] ? 1 : 2);
  const items = [];
  let was = null;
  for (const d of list) {
    const g = group(d);
    if (was !== null && g !== was) items.push({ sep: true });
    was = g;
    items.push({ id: d.key, label: d.name });
  }
  return items;
}
function AddStageDef({ t, defs }) {
  const [name, setName] = useState('');
  const have = new Set(defs.map((d) => d.key));
  const base = codeOf(t.id) || t;
  const more = stageLibrary(lib(), base).filter((d) => !have.has(d.key));
  const add = (d) => changeStages(t.id, (list) => (list.some((x) => x.key === d.key) ? null
    : [...list, { ...d, fields: d.fields.map((f) => (typeof f === 'string' ? f : { ...f })) }]));
  const fromLib = (e, d) => { keepFocus(e, '.qchip'); add(d); };
  const all = (e) => {
    const box = e.currentTarget.closest('.ty-add');
    openMenu(e, libraryItems(more, base), { selected: null, onPick: (k) => {
      const d = more.find((x) => x.key === k);
      // The menu hands focus back to "עוד מהספרייה…"; when the chips now hold the rest, to the last of them.
      if (d && add(d)) refocus(() => box.querySelector('.ty-lib .qchip:last-child') || box.querySelector('input'));
    } });
  };
  const own = (e) => {
    e.preventDefault();
    const v = name.trim();
    if (v && changeStages(t.id, (list) => [...list, { key: `k${uid()}`, name: v, exit: '', gate: 'manager', days: 14, fields: [] }])) setName('');
  };
  return html`<div class="ty-add">
    ${more.length ? html`<div class="muted small" id="ty-lib-h">להוסיף מהספרייה:</div>
      <div class="chips-row ty-lib" role="group" aria-labelledby="ty-lib-h">${more.slice(0, LIB_CHIPS).map((d) => html`<button type="button" key=${d.key} class="qchip"
        onClick=${(e) => fromLib(e, d)}><${Icon} name="plus" size=${13} /><span class="ty-chip-t">${d.name}</span></button>`)}
        ${more.length > LIB_CHIPS ? html`<button type="button" key="more" class="qchip lib-more" aria-haspopup="menu" onClick=${all}>עוד מהספרייה…</button>` : null}</div>` : null}
    <form class="inline-form" onSubmit=${own}>
      <input class="input" value=${name} onInput=${(e) => setName(e.currentTarget.value)} placeholder="שם השלב" aria-label="שם השלב החדש" />
      <button type="submit" class="btn" disabled=${!name.trim()}><${Icon} name="plus" size=${16} />שלב חדש</button></form>
  </div>`;
}

// "שדות בליבה": the type's own core fields, read as they are (a choice field with its options). In edit mode one can be
// removed, and "+ שדה בליבה" adds a text field.
function Facts({ t, edit }) {
  const [name, setName] = useState('');
  const facts = t.facts || [];
  const remove = (e, k, f) => {
    keepFocus(e, 'li.ty-fact');
    change(t.id, (cur) => (cur.facts?.[k]?.label === f.label ? { facts: cur.facts.filter((_, j) => j !== k) } : null));
  };
  const add = (e) => {
    e.preventDefault();
    const v = name.trim();
    if (v && change(t.id, (cur) => ({ facts: [...(cur.facts || []), { key: `k${uid()}`, label: v, hint: '', kind: 'text' }] }))) setName('');
  };
  return html`<section class="card2" aria-labelledby="ty-facts-h">
    <div class="card2-head"><h2 id="ty-facts-h"><${Icon} name="checklist" size=${18} />שדות בליבה</h2></div>
    ${facts.length ? html`<ul class="ty-facts">${facts.map((f, k) => html`<li class="ty-fact" key=${f.key || `${k}:${f.label}`}>
      <div class="ty-fact-main"><span class="ty-fact-l"><strong>${f.label}</strong>${f.where === 'classified' ? html`<${ClsTag} />` : null}</span>
        ${f.hint ? html`<span class="ty-fact-hint">${f.hint}</span>` : null}
        ${f.kind === 'choice' && f.options?.length ? html`<span class="ty-opts">${f.options.map((o) => o.label).join(' · ')}</span>` : null}</div>
      ${edit ? html`<button type="button" class="icon-btn ty-x" aria-label=${`להסיר את השדה '${f.label}'`} title="להסיר את השדה" onClick=${(e) => remove(e, k, f)}><${Icon} name="x" size=${16} /></button>` : null}
    </li>`)}</ul>` : html`<p class="muted small">אין לסוג הזה שדות משלו.</p>`}
    ${edit ? html`<form class="inline-form ty-add-fact" onSubmit=${add}>
      <input class="input" value=${name} onInput=${(e) => setName(e.currentTarget.value)} placeholder="שם השדה" aria-label="שם השדה בליבה" />
      <button type="submit" class="btn" disabled=${!name.trim()}><${Icon} name="plus" size=${16} />שדה בליבה</button></form>` : null}
  </section>`;
}

// "רמזים לשדות הליבה": what a new project of this type shows in the four core fields before they are filled. A field
// left empty shows the general hint (card.CORE), which reads quieter.
function Hints({ t, edit }) {
  const save = (key, v) => change(t.id, (cur) => {
    const h = { ...(cur.hints || {}) };
    if (v) h[key] = v; else delete h[key];
    return { hints: h };
  }, false);
  return html`<section class="card2" aria-labelledby="ty-hints-h">
    <div class="card2-head"><h2 id="ty-hints-h"><${Icon} name="bulb" size=${18} />רמזים לשדות הליבה</h2></div>
    <div class="core">${CORE.map((f) => html`<div class="core-row" key=${f.key}><span class="core-l">${f.label}</span>
      ${edit ? html`<${Text} label=${f.label} value=${t.hints?.[f.key] || ''} placeholder=${f.hint} onSave=${(v) => save(f.key, v)} />`
        : readText(coreHint(t, f.key), !t.hints?.[f.key])}</div>`)}</div>
  </section>`;
}

// A copy of the type as the team's own, hiding it from the opening sheet or bringing it back, and for a code type the
// team changed, going back to the code. Going back counts as a change to the path, so it would lower a gate the team
// added only with the commander (store.resetType); then it says why when pressed.
function Actions({ t }) {
  const [why, setWhy] = useState(null);
  useEffect(() => setWhy(null), [t]);
  const code = codeOf(t.id);
  const back = code && hasOverride(t.id) ? typeCheck(t.id, { stages: code.stages }) : null;
  const dup = () => { const id = duplicateType(t.id); if (id) { editNext = id; location.hash = `#/types/${id}`; } };
  const reset = (e) => {
    if (!back.ok) { setWhy(back.why); return; }
    setWhy(null);
    const box = e.currentTarget.parentElement;
    if (resetType(t.id)) refocus(() => box.querySelector('.btn')); // the button goes with the team's changes
  };
  return html`<div class="ty-actions">
    <div class="ty-acts">
      <button type="button" class="btn" onClick=${dup}><${Icon} name="copy" size=${16} />לשכפל</button>
      <button type="button" class="btn" onClick=${() => hideType(t.id, !t.hidden)}><${Icon} name="eye" size=${16} />${t.hidden ? 'להחזיר לפתיחת פרויקט' : 'להסתיר מפתיחת פרויקט'}</button>
      ${back ? html`<button type="button" class="btn" aria-disabled=${back.ok ? null : 'true'} onClick=${reset}><${Icon} name="undo" size=${16} />לחזור לברירת המחדל</button>` : null}
    </div>
    <p class="ty-why" role="status">${why}</p>
  </div>`;
}
