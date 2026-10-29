// The stage path on the ID card: each stage with its exit question, its fields and the outputs made in it. Whoever
// manages an open project changes the path here while it runs (design §6.3): names, exit questions, gates, fields, the
// order of stages not started yet, skipping, removing and adding. Every rule is card.js's (stageRule, gateRule) and
// every change the store's, with its own toast, undo and log line. A control that can't act now stays focusable
// (aria-disabled) and says why when pressed, under its row. A stage's fields are found by their id.
import { useState, useRef, useEffect } from 'preact/hooks';
import { html, Icon, StageStrip, Text, Seg, useFlip, keepFocus, openMenu, dueWord, dayDiff, ago, dateInput, OUT_KIND } from '../ui.js';
import { projectOutputs, openSheet, setField, setStage, renameStage, setExit, setGate, addField, renameField, removeField, addStage,
  moveStage, skipStage, unskipStage, removeStage, openLinkedBdt, isOpen, actsAsCommander, commander, sayFill, lib, typeOf } from '../store.js';
import { STAGES, CTO_TYPES, TEMPLATES, isRestricted, stageRule, gateRule, typeById, typeStages, stageLibrary, LOCKED_LINE_SHOWS_STAGE } from '../card.js';

// In a שמור / סודי project the current stage's name is on the one line the rest of the team sees (card.lockedWhere).
const NAME_HINT = 'שם השלב גלוי גם למי שלא בפרויקט. רק שם בלמ"ס.';
const nameHint = (p) => isRestricted(p) && LOCKED_LINE_SHOWS_STAGE;

export function StagesCard({ p, mgr }) {
  const [edit, setEdit] = useState(false);
  const list = useRef();
  useFlip(list); // a stage moved up or down slides to its new place
  const can = mgr && isOpen(p); // a stopped or finished project has no editing
  const editing = edit && can;
  const outs = projectOutputs(p.id);
  // The path as it stands. A reason line stays only while nothing in the path changed since it was asked for.
  const sig = p.stages.map((s) => `${s.id}:${s.state}:${s.gate}`).join('|');
  return html`<section class=${'card2' + (editing ? ' st-editing' : '')}>
    <div class="card2-head"><h2><${Icon} name="flag" size=${18} />שלבים ואבני דרך</h2>
      ${can ? html`<button type="button" class="link-btn st-toggle" onClick=${() => setEdit(!edit)}>${editing ? 'סיום עריכה' : 'עריכת השלבים'}</button>` : null}</div>
    <${StageStrip} p=${p} labels />
    <ol class="stages" ref=${list}>${p.stages.map((st, i) => html`<${StageRow} key=${st.id} p=${p} st=${st} i=${i} mgr=${mgr} edit=${editing} sig=${sig} outs=${outs.filter((o) => o.stage === st.id)} />`)}</ol>
    ${editing ? html`<${AddStage} p=${p} />` : null}
    ${!p.stages.length && !editing ? html`<div class="muted small">אין שלבים. ${can ? 'אפשר להוסיף מהספרייה דרך "עריכת השלבים".' : ''}</div>` : null}
  </section>`;
}

// After a change that takes away the control that was pressed (a skipped stage has no skip), focus stays in the row:
// on `sel` when the row has it now, else on the stage's name. Never on the top of the page.
function holdFocus(e, sel) {
  const row = e.currentTarget.closest('li.stage');
  requestAnimationFrame(() => {
    const a = document.activeElement;
    if ((a && a !== document.body && a.isConnected) || !row?.isConnected) return;
    (row.querySelector(sel) || row.querySelector('.stage-name'))?.focus();
  });
}

function StageRow({ p, st, i, mgr, edit, sig, outs }) {
  const cur = st.state === 'active' || st.state === 'pending';
  const reached = st.state !== 'todo';
  const [open, setOpen] = useState(cur);
  // What the target field shows while it's being typed in, so a store update can't wipe a year typed halfway.
  const [draft, setDraft] = useState(null);
  // A disabled control's reason: under the stage's line ('line') or under its gate ('gate'), with the request to the
  // commander when only the commander may do it.
  const [why, setWhy] = useState(null);
  useEffect(() => setWhy(null), [edit]);
  const say = (at, text, ask = null) => setWhy(text ? { at, text, ask, sig } : null);
  const shown = why && why.sig === sig ? why : null;
  const icon = { done: 'check', skipped: 'chevronLeft', active: 'target', pending: 'clock', todo: '' }[st.state];
  const word = { done: st.closedAt ? `נסגר ${ago(st.closedAt)}` : 'נסגר', skipped: 'דילגנו', active: 'עכשיו', pending: 'מחכה לאישור המפקד', todo: '' }[st.state];
  // Saved when cleared or inside the field's range, not while a year is half typed: "0002-11-06" is no target.
  const setTarget = (e) => { const f = e.currentTarget; setDraft(f.value); if (!f.validity.rangeUnderflow && !f.validity.rangeOverflow) setStage(p.id, st.id, { target: f.value || null }); };
  const live = st.state === 'todo' || cur;
  // The block's flight stage opens a linked בדה"ת (design §6.6), for whoever manages the block while the stage is ahead or
  // now, and while the team hasn't hidden the בדה"ת type from opening a project (§2.3).
  const linkBdt = mgr && isOpen(p) && !p.personal && p.template === 'block' && st.key === 'flight' && (st.state === 'todo' || st.state === 'active')
    && !typeById(lib(), 'bdt')?.hidden;
  return html`<li class=${'stage s-' + st.state + (open ? ' open' : '')}>
    <div class="stage-line">
      <span class="stage-ic">${icon ? html`<${Icon} name=${icon} size=${14} />` : i + 1}</span>
      <button type="button" class="stage-name" onClick=${() => setOpen(!open)} aria-expanded=${open}>${st.name}${st.gate === 'commander' ? html`<span class="gate-mark" title="סגירת השלב באישור המפקד"><${Icon} name="shield" size=${13} /></span>` : null}${edit ? html`<${Icon} name=${open ? 'chevronUp' : 'chevronDown'} size=${14} cls="st-chev" />` : null}</button>
      <span class="muted small">${word}</span>
      ${cur && (st.target || mgr) ? html`<label class=${'stage-target' + (st.target && dayDiff(st.target) < 0 ? ' late' : '')}><${Icon} name="calendar" size=${13} />
        ${mgr ? html`<input type="date" value=${draft ?? dateInput(st.target)} min="2000-01-01" max="2100-12-31" onInput=${setTarget} onBlur=${() => setDraft(null)} aria-label="יעד לשלב" />` : null}${st.target ? `יעד ${dueWord(st.target)}` : 'יעד'}</label>` : null}
      <span class="grow"></span>
      ${edit && live ? html`<${PathControls} p=${p} st=${st} i=${i} say=${say} />` : null}
      ${edit && st.state === 'skipped' && stageRule(p, st.id, 'unskip').ok ? html`<button type="button" class="link-btn st-unskip"
        onClick=${(e) => { say(null); holdFocus(e, '.st-btn[data-a="skip"]'); unskipStage(p.id, st.id); }}>להחזיר למסלול</button>` : null}
    </div>
    ${edit ? html`<${WhyLine} p=${p} st=${st} why=${shown?.at === 'line' ? shown : null} />` : null}
    ${open ? html`<div class="stage-body">
      ${edit ? html`<${StageEditor} p=${p} st=${st} live=${live} why=${shown?.at === 'gate' ? shown : null} say=${say} />` : html`
        ${st.exit ? html`<div class="exit-q"><span class="muted small">כדי לעבור הלאה:</span> ${st.exit}</div>` : null}
        ${reached || mgr ? st.fields.map((f) => html`<${StageField} key=${f.id} p=${p} st=${st} f=${f} mgr=${mgr} />`) : null}
        ${!reached && !st.fields.length ? html`<div class="muted small">ימולא כשנגיע לשלב.</div>` : null}
        ${outs.length ? html`<div class="evidence"><span class="muted small">תוצרים בשלב:</span>${outs.map((o) => html`<button type="button" class="ev-chip" onClick=${() => openSheet('output', { id: o.id })}><${Icon} name=${(OUT_KIND[o.kind] || OUT_KIND.link).icon} size=${13} />${o.title}</button>`)}</div>` : null}`}
      ${linkBdt ? html`<div class="st-flight"><button type="button" class="btn sm" onClick=${() => openLinkedBdt(p.id)}><${Icon} name="plus" size=${15} />לפתוח בדה"ת מקושר</button></div>` : null}
    </div>` : null}
  </li>`;
}

// Move up, move down, skip and remove, on a stage that is ahead or now. Each asks card.stageRule: a control that may
// act runs its store action; one that may not shows its reason under the row. A move with no stage on that side has
// nothing to say, so it only keeps its place. Every control is keyed, so the one pressed stays the same element. A row
// that moves is put back in the list, though, which takes focus off it: each action hands focus back into the row.
function PathControls({ p, st, i, say }) {
  const cmd = actsAsCommander(p); // in a personal project its owner decides its gates
  const ctl = (action, icon, label, aria, run, cls = '') => {
    const r = stageRule(p, st.id, action, cmd);
    const press = (e) => {
      if (r.ok) { say(null); run(e); return; }
      // Only the commander may skip or remove a stage with a commander gate: the manager can ask for it in the weekly update.
      const ask = (action === 'skip' || action === 'remove') && r.why.includes('{commander}') && !p.personal ? action : null;
      say('line', sayFill(r.why), ask);
    };
    return html`<button type="button" key=${action} data-a=${action} class=${'icon-btn st-btn' + cls} aria-label=${aria} title=${label}
      aria-disabled=${r.ok ? null : 'true'} onClick=${press}><${Icon} name=${icon} size=${16} /></button>`;
  };
  const edge = (action) => html`<span key=${action} class="st-btn st-ghost" aria-hidden="true"></span>`;
  return html`<span class="stage-edit">
    ${i > 0 ? ctl('up', 'chevronUp', 'להזיז למעלה', `להזיז את '${st.name}' למעלה`, (e) => { holdFocus(e, '.st-btn[data-a="up"]'); moveStage(p.id, st.id, -1); }) : edge('up')}
    ${i < p.stages.length - 1 ? ctl('down', 'chevronDown', 'להזיז למטה', `להזיז את '${st.name}' למטה`, (e) => { holdFocus(e, '.st-btn[data-a="down"]'); moveStage(p.id, st.id, 1); }) : edge('down')}
    ${ctl('skip', 'chevronLeft', 'לדלג על השלב', `לדלג על '${st.name}'`, (e) => { holdFocus(e, '.st-unskip'); skipStage(p.id, st.id); })}
    ${ctl('remove', 'trash', 'להסיר את השלב', `להסיר את '${st.name}'`, (e) => { keepFocus(e, 'li.stage'); removeStage(p.id, st.id); }, ' danger')}
  </span>`;
}

// The reason a control can't act, read out when it appears (role status). On a commander gate it ends with the request
// to the commander, which opens the weekly update with "צריך בכיר?" on "כן" and the request written in (WeeklyBody).
function WhyLine({ p, st, why }) {
  const ask = why?.ask ? () => openSheet('weekly', { id: p.id, senior: why.ask === 'skip' ? `לדלג על שלב '${st.name}'` : `להסיר את שלב '${st.name}'` }) : null;
  return html`<p class="st-why" role="status">${why ? html`<span>${why.text}</span>${ask ? html`<button type="button" class="link-btn" onClick=${ask}>לבקש מ${commander().name}</button>` : null}` : null}</p>`;
}

// One stage in edit mode: its name, its exit question, who closes it, and its fields. Names and questions save when
// the field is left; a name can't be emptied, so an empty one goes back to what it was. A personal project has no
// "סגירת השלב": the commander never sees it, so its stages always close in the project.
function StageEditor({ p, st, live, why, say }) {
  const cmd = actsAsCommander(p);
  const [nk, setNk] = useState(0);
  const hint = nameHint(p);
  const hintId = `st-hint-${st.id}`;
  const opt = (gate, label) => ({ id: gate, label, disabled: !gateRule(st, gate, cmd).ok });
  return html`<div class="st-editor">
    <div class="core-row"><label class="core-l">שם השלב</label>
      <div class="st-cell"><${Text} key=${nk} label="שם השלב" value=${st.name} multiline=${false} describedBy=${hint ? hintId : null} onSave=${(v) => { if (!renameStage(p.id, st.id, v)) setNk(nk + 1); }} />
        ${hint ? html`<p class="st-hint" id=${hintId}><${Icon} name="lock" size=${12} />${NAME_HINT}</p>` : null}</div></div>
    <div class="core-row"><label class="core-l">שאלת היציאה</label>
      <${Text} label="שאלת היציאה" value=${st.exit} placeholder="מה צריך להיות נכון כדי לעבור הלאה?" onSave=${(v) => setExit(p.id, st.id, v)} /></div>
    ${live && !p.personal ? html`<div class="core-row"><span class="core-l">סגירת השלב</span>
      <div class="st-cell"><${Seg} label="סגירת השלב" cls="st-gate" value=${st.gate} options=${[opt('manager', 'בפרויקט'), opt('commander', 'באישור המפקד')]}
        onChange=${(g) => { say(null); if (g !== st.gate) setGate(p.id, st.id, g); }}
        onDisabled=${(g) => say('gate', sayFill(gateRule(st, g, cmd).why))} />
        <p class="st-why" role="status">${why ? html`<span>${why.text}</span>` : null}</p></div></div>` : null}
    <div class="core-row"><span class="core-l">שדות</span>
      <div class="st-cell sf-list">${st.fields.map((f) => html`<${FieldEdit} key=${f.id} p=${p} st=${st} f=${f} />`)}
        <${AddField} p=${p} st=${st} /></div></div>
  </div>`;
}

// A field's name, and its removal (the toast's ביטול brings it back with its value). Focus goes on to the next field's
// remove, else the one before it, else the stage's name.
function FieldEdit({ p, st, f }) {
  const [k, setK] = useState(0);
  const remove = (e) => {
    const row = e.currentTarget.closest('.sf-edit');
    const rows = [...row.parentElement.children].filter((x) => x.matches('.sf-edit'));
    const n = rows.indexOf(row);
    const to = [rows[n + 1], rows[n - 1]].filter(Boolean).map((x) => x.querySelector('.sf-x'));
    const stage = row.closest('li.stage');
    removeField(p.id, st.id, f.id);
    requestAnimationFrame(() => {
      const a = document.activeElement;
      if (a && a !== document.body && a.isConnected) return;
      [...to, stage?.querySelector('.stage-name')].find((x) => x?.isConnected)?.focus();
    });
  };
  return html`<div class="sf-edit">
    <${Text} key=${k} label="שם השדה" value=${f.label} multiline=${false} onSave=${(v) => { if (!renameField(p.id, st.id, f.id, v)) setK(k + 1); }} />
    ${f.classified ? html`<span class="cls-tag sm"><${Icon} name="lock" size=${11} />ברשת המסווגת</span>` : null}
    <button type="button" class="icon-btn st-btn sf-x" aria-label=${`להסיר את השדה '${f.label}'`} title="להסיר את השדה" onClick=${remove}><${Icon} name="x" size=${16} /></button>
  </div>`;
}

// "+ שדה": a field with the name typed in. In a project that is all on the classified network it starts marked (store).
function AddField({ p, st }) {
  const [name, setName] = useState('');
  const add = (e) => { e.preventDefault(); const v = name.trim(); if (v && addField(p.id, st.id, v)) setName(''); };
  return html`<form class="inline-form sf-add" onSubmit=${add}>
    <input class="input sm" value=${name} onInput=${(e) => setName(e.currentTarget.value)} placeholder="שם השדה" aria-label="שם השדה" />
    <button type="submit" class="btn sm" aria-label="להוסיף שדה" disabled=${!name.trim()}><${Icon} name="plus" size=${14} />שדה</button></form>`;
}

function StageField({ p, st, f, mgr }) {
  const restricted = isRestricted(p);
  if (f.classified) return html`<div class="sfield"><label class="core-l">${f.label}</label><span class="cls-tag sm"><${Icon} name="lock" size=${11} />ברשת המסווגת</span>
    ${mgr ? html`<button type="button" class="link-btn small" onClick=${() => setField(p.id, st.id, f.id, { classified: false })}>ביטול</button>` : null}</div>`;
  if (f.unknown) return html`<div class="sfield"><label class="core-l">${f.label}</label><span class="muted">עוד לא ידוע</span>
    ${mgr ? html`<button type="button" class="link-btn small" onClick=${() => setField(p.id, st.id, f.id, { unknown: false })}>למלא</button>` : null}</div>`;
  return html`<div class="sfield"><label class="core-l">${f.label}</label>
    <${Text} label=${f.label} value=${f.value} placeholder=${mgr ? 'לכתוב כאן' : 'עוד לא מולא'} disabled=${!mgr} onSave=${(v) => setField(p.id, st.id, f.id, { value: v })} />
    ${mgr && !f.value ? html`<span class="sfield-acts"><button type="button" class="link-btn small" onClick=${() => setField(p.id, st.id, f.id, { unknown: true })}>עוד לא ידוע</button>
      ${restricted ? html`<button type="button" class="link-btn small" onClick=${() => setField(p.id, st.id, f.id, { classified: true })}>ברשת המסווגת</button>` : null}</span>` : null}
  </div>`;
}

// The library menu, in the order card.stageLibrary gives it (the type's own stages, the classic ones, then the other
// types'), with a separator between those groups. The type's own include its code path, where a stage the team took
// off it still is.
function libraryItems(list, t) {
  const code = [...CTO_TYPES, ...TEMPLATES].find((x) => x.id === t?.id);
  const own = new Set([...typeStages(t), ...typeStages(code)].map((d) => d.key));
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

// Adding goes at the end of the path: a stage of the project's type it doesn't have yet (by key), any stage from the
// library, or one of the team's own by name. A chip that was added goes away, and focus moves to the chip now in its place.
// The chips are one group, named by the line over them ("להוסיף מהסוג:"), or, with no such line, as adding a stage.
function AddStage({ p }) {
  const [name, setName] = useState('');
  const t = typeOf(p);
  const have = new Set(p.stages.map((s) => s.key));
  const mine = typeStages(t).filter((d) => !have.has(d.key));
  const more = stageLibrary(lib(), t).filter((d) => !have.has(d.key));
  const hint = nameHint(p);
  const pick = (e) => openMenu(e, libraryItems(more, t), { selected: null, onPick: (k) => addStage(p.id, k) });
  const own = (e) => { e.preventDefault(); const v = name.trim(); if (v && addStage(p.id, null, v)) setName(''); };
  return html`<div class="add-stage">
    ${mine.length ? html`<div class="muted small" id="st-add-l">להוסיף מהסוג:</div>` : null}
    ${mine.length || more.length ? html`<div class="chips-row" role="group" aria-labelledby=${mine.length ? 'st-add-l' : null} aria-label=${mine.length ? null : 'להוסיף שלב'}>
      ${mine.map((d) => html`<button type="button" key=${d.key} class="qchip" onClick=${(e) => { keepFocus(e, '.qchip'); addStage(p.id, d.key); }}><${Icon} name="plus" size=${13} /><span class="st-chip-t">${d.name}</span></button>`)}
      ${more.length ? html`<button type="button" key="more" class="qchip lib-more" aria-haspopup="menu" onClick=${pick}>עוד מהספרייה…</button>` : null}</div>` : null}
    <form class="inline-form" onSubmit=${own}>
      <input class="input" value=${name} onInput=${(e) => setName(e.currentTarget.value)} placeholder="או שלב משלך, למשל 'ניסוי שטח'" aria-label="שם השלב"
        aria-describedby=${hint ? 'st-add-hint' : null} />
      <button type="submit" class="btn" disabled=${!name.trim()}>הוספה</button></form>
    ${hint ? html`<p class="st-hint" id="st-add-hint"><${Icon} name="lock" size=${12} />${NAME_HINT}</p>` : null}
  </div>`;
}
