// The core of the ID card ("ליבה", design §6.2, §6.6 and §9). From the top:
// - bands: the valley, what a linked בדה"ת brought back to its building block, and the block a בדה"ת came from;
// - rows: the type, the place in the pyramid, where the materials live, the building block, the linked בדה"תים;
// - for the Claude type, the link out to the connected platform;
// - the four core fields with their marks, the type's own facts, and readiness (TRL).
// Every rule is card.js's and every change the store's, with its own toast and undo. Values (the core fields, marks,
// facts and readiness) are the manager's, as before. The structure (the rows' menus, the card's own edit mode, the
// building block, the link) is for whoever manages an open project. A place is never changed here: its menu opens the
// confirm sheet (views/confirm.js).
import { useState, useEffect } from 'preact/hooks';
import { html, Icon, Text, openMenu } from '../ui.js';
import { useStore, project, lib, typeOf, isOpen, canSee, canSeeDetail, openSheet, placeCheck, updateProject, setType, setDomain, setMark,
  setFact, addFact, renameFact, removeFact, setTrl, setTrlTarget, addTrl, removeTrl, setLink, setParent, takeChildTrl } from '../store.js';
import { CORE, TRL_HINT, PLACES, PLACE_ORDER, DOMAINS, NO_DOMAIN, domainTitle, openTypes, typeFitWhy, placeOf, isRestricted, coreHint,
  cardFill, inValley, handBack, currentStage, nextLink, typeStages } from '../card.js';

const MARKABLE = ['forWhom', 'success', 'stopRule']; // `what` is never marked
const MARK = { unknown: 'עוד לא ידוע', classified: 'ברשת המסווגת' };
const LINK_ERR = 'הקישור צריך להוביל לפלטפורמה המחוברת, לכתובת עם /next/';
const CLAUDE_WORK = 'העבודה עם Claude נעשית בפלטפורמה המחוברת. כאן רואים את השלב ואת העדכון השבועי.';
const RETYPED = "את השלבים של הסוג החדש אפשר להוסיף ב'עריכת השלבים', תחת 'להוסיף מהסוג'";
const NO_PARENT = 'בלי אבן בניין';
const HIDDEN_PARENT = 'אבן בניין שלא מוצגת כאן';
const TRLS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const ended = (b) => (b.ended === 'done' ? 'הסתיים' : 'נעצר');

// The domain menu: the four tiers of the pyramid, the two side areas, then none.
const DOMAIN_ITEMS = [
  ...DOMAINS.filter((d) => !d.side).map((d) => ({ id: d.id, label: domainTitle(d.id) })), { sep: true },
  ...DOMAINS.filter((d) => d.side).map((d) => ({ id: d.id, label: domainTitle(d.id) })), { sep: true },
  { id: '', label: NO_DOMAIN },
];

// The type menu: the types on offer (the CTO's and the team's, then the general ones) and the project's own, even when
// it is hidden now. A type that can't hold the project where its materials live stays in view, with the reason.
function typeItems(p) {
  const L = lib();
  const list = openTypes({ ...L, types: (L.types || []).map((x) => (x.id === p.template && x.hidden ? { ...x, hidden: false } : x)) });
  return list.flatMap((x, i) => {
    const sep = i && !list[i - 1].cto !== !x.cto ? [{ sep: true }] : [];
    const why = x.id === p.template ? null : typeFitWhy(x, p);
    // A personal project never moves, so "move it first" is no way out for it.
    return [...sep, { id: x.id, label: x.name, ...(why ? { off: true, hint: p.personal ? 'פרויקט אישי תמיד בלמ"ס' : why } : {}) }];
  });
}

// The place menu: the three places, each one that can't be picked now with its reason (card.placeRule, by the store).
const placeItems = (p) => PLACE_ORDER.map((to) => {
  const r = to === placeOf(p) ? { ok: true } : placeCheck(p.id, to);
  return { id: to, label: PLACES[to].label, ...(r.ok ? {} : { off: true, hint: r.why }) };
});

// The building-block menu: the open team blocks I see (the store's asBlock), then none. Only a בדה"ת takes a block
// (store.setParent); a project of another type that still has one from before a type change can only drop it.
function parentItems(projects, p) {
  const blocks = p.template !== 'bdt' ? [] : projects.filter((x) => x.id !== p.id && !x.personal && x.template === 'block' && isOpen(x) && canSee(x));
  return [...blocks.map((x) => ({ id: x.id, label: x.name, dot: x.color })), ...(blocks.length ? [{ sep: true }] : []), { id: '', label: NO_PARENT }];
}

// After a change that takes away the control that was pressed (a mark, a link, a row), focus moves to the first of
// `sels` inside the same part of the card (`box`), never to the top of the page. Called before the change; it acts
// after the render, and only if focus was lost.
function refocus(from, box, ...sels) {
  const el = from.closest(box);
  requestAnimationFrame(() => {
    const a = document.activeElement;
    if ((a && a !== document.body && a.isConnected) || !el?.isConnected) return;
    sels.map((s) => el.querySelector(s)).find(Boolean)?.focus();
  });
}

export function CoreCard({ p, mgr }) {
  const s = useStore();
  const [edit, setEdit] = useState(false);
  const [retyped, setRetyped] = useState(null); // the type just picked here, for the line about its stages
  useEffect(() => { setEdit(false); setRetyped(null); }, [p.id]);
  const can = mgr && isOpen(p);
  const editing = edit && can;
  const t = typeOf(p);
  const restricted = isRestricted(p);
  const place = placeOf(p);
  const fill = cardFill(p);
  // The linked בדה"תים I see at all (one I can't see doesn't exist for me, not even as "a linked one").
  const kids = p.personal ? [] : s.projects.filter((x) => x.parent === p.id && x.id !== p.id && canSee(x));
  const parent = p.parent ? project(p.parent) : null;
  const shown = parent && canSee(parent) ? parent : null;
  // The line about the new type's stages shows only while it has one the project lacks (by key): the stages card's
  // "להוסיף מהסוג" lists exactly those.
  const toAdd = !!retyped && retyped === p.template && typeStages(t).some((d) => !p.stages.some((x) => x.key === d.key));
  const pickType = (id) => { if (id !== p.template && setType(p.id, id)) setRetyped(id); };
  const pickPlace = (to) => { if (to !== placeOf(project(p.id))) openSheet('confirm', { what: 'place', pid: p.id, to }); };
  const pickParent = (id) => { if ((id || null) !== (p.parent || null)) setParent(p.id, id || null); };
  const onMenu = (items, selected, onPick) => (can ? (e) => openMenu(e, items(), { selected, onPick }) : null);

  return html`<section class=${'card2 co-card' + (editing ? ' co-editing' : '')}>
    <div class="card2-head"><h2><${Icon} name="idcard" size=${18} />ליבה</h2>
      <div class="co-head-r">
        <span class="muted small" title="שדות שמולאו, סומנו 'עוד לא ידוע' או 'ברשת המסווגת', עד השלב הנוכחי">${fill.done} מתוך ${fill.of} מולאו</span>
        ${can ? html`<button type="button" class="link-btn co-toggle" onClick=${() => setEdit(!edit)}>${editing ? 'סיום עריכה' : 'עריכה'}</button>` : null}
      </div></div>

    ${inValley(p) ? html`<div class="note-band why"><${Icon} name="alert" size=${16} /><span>TRL ${p.trl}, ועדיין אין גוף שהתחייב לקלוט. כאן טכנולוגיות נוטות להיתקע. כדאי לסגור עניין או כוונה עם גוף במנהלת.</span></div>` : null}
    <${HandBack} p=${p} kids=${kids} can=${can} />
    ${shown ? html`<div class="note-band co-from"><${Icon} name="link" size=${16} /><span>נפתח מתוך <a href=${`#/project/${shown.id}`}>${shown.name}</a></span></div>` : null}

    <div class="facts co-rows">
      <${Row} label="סוג" value=${t?.name || 'בלי סוג'} onMenu=${onMenu(() => typeItems(p), p.template, pickType)} />
      ${p.personal ? null : html`
        <${Row} label="רובד" value=${domainTitle(p.domain)} onMenu=${onMenu(() => DOMAIN_ITEMS, p.domain || '', (id) => setDomain(p.id, id || null))} />
        <${Row} label="איפה החומרים" value=${PLACES[place].label} onMenu=${onMenu(() => placeItems(p), place, pickPlace)} />`}
      ${!p.personal && (p.template === 'bdt' || p.parent) ? html`<${Row} label="אבן הבניין" value=${shown ? shown.name : p.parent ? HIDDEN_PARENT : NO_PARENT}
        href=${shown ? `#/project/${shown.id}` : null} onMenu=${onMenu(() => parentItems(s.projects, p), p.parent || '', pickParent)} />` : null}
      ${kids.length ? html`<div class="fact-row"><span class="core-l" id="co-kids-l">בדה"ת מקושרים</span>
        <div class="chips-row co-chips" role="group" aria-labelledby="co-kids-l">${kids.map((k) => html`<a key=${k.id} class="qchip" href=${`#/project/${k.id}`}>
          <i style=${`background:${k.color}`}></i><span class="co-chip-t">${k.name}</span></a>`)}</div></div>` : null}
    </div>
    <p class="co-note" role="status">${toAdd ? RETYPED : null}</p>

    ${t?.link === 'next' || p.link ? html`<${Platform} key=${p.id} p=${p} can=${can} restricted=${restricted} />` : null}

    <div class="core">
      ${CORE.map((f) => html`<${CoreField} key=${f.key} p=${p} f=${f} t=${t} mgr=${mgr} restricted=${restricted} />`)}
      ${editing ? html`<${FactsEditor} p=${p} />` : (p.facts || []).map((f) => html`<${FactRow} key=${f.id} p=${p} f=${f} mgr=${mgr} restricted=${restricted} />`)}
      ${p.trl !== undefined ? html`
        <${TrlRow} cls="co-trl-now" id="co-trl-now-l" label="מוכנות היום" value=${p.trl} mgr=${mgr} onPick=${(n) => setTrl(p.id, n)} />
        <${TrlRow} cls="co-trl-to" id="co-trl-to-l" label="מוכנות היעד" value=${p.trlTarget ?? null} mgr=${mgr} onPick=${(n) => setTrlTarget(p.id, n)}>
          <p class="co-hint">${TRL_HINT}</p>
          ${editing ? html`<button type="button" class="link-btn co-trl-remove" onClick=${(e) => { refocus(e.currentTarget, '.co-card', '.co-trl-add', '.co-toggle'); removeTrl(p.id); }}>להסיר את המוכנות</button>` : null}
        </${TrlRow}>`
      : editing ? html`<div class="core-row"><span aria-hidden="true"></span><div class="co-cell">
          <button type="button" class="btn sm co-trl-add" onClick=${(e) => { refocus(e.currentTarget, '.co-card', '.co-trl-remove', '.co-toggle'); addTrl(p.id); }}><${Icon} name="plus" size=${14} />מוכנות טכנולוגית (TRL)</button></div></div>` : null}
    </div>
  </section>`;
}

// One of the rows at the top: a menu for whoever manages an open project, else the value (a link when it leads somewhere).
function Row({ label, value, onMenu, href }) {
  return html`<div class="fact-row"><span class="core-l">${label}</span>
    ${onMenu ? html`<button type="button" class="fact-btn" aria-haspopup="menu" aria-label=${`${label}: ${value}`} onClick=${onMenu}>
        <span class="co-v">${value}</span><${Icon} name="chevronDown" size=${14} cls="co-chev" /></button>`
      : href ? html`<a class="co-val co-link" href=${href}>${value}</a>`
      : html`<span class="co-val">${value}</span>`}</div>`;
}

// What the block's linked בדה"תים brought back (card.handBack). Whoever sees a בדה"ת in full reads its name, its TRL
// and its recommendation; anyone else only that a linked one ended. The block's manager can take a higher TRL.
// Whoever sees a בדה"ת only as its line must not learn its TRL (design §4.2), not even from whether it shows here:
// before the block's flight stage a row means a higher TRL to take, so for them the row waits for the flight stage.
function HandBack({ p, kids, can }) {
  const flight = currentStage(p)?.key === 'flight';
  const list = handBack(p, kids).filter((b) => flight || canSeeDetail(project(b.id)));
  if (!list.length) return null;
  return html`<div class="note-band co-back"><${Icon} name="link" size=${16} /><div class="grow co-back-list">${list.map((b) => {
    const c = project(b.id);
    const detail = !!c && canSeeDetail(c);
    const text = detail ? [`הבדה"ת ${b.name} ${ended(b)}`, b.trl !== null && `TRL ${b.trl}`, b.rec && `ההמלצה: ${b.rec}`].filter(Boolean).join(' · ')
      : `בדה"ת מקושר ${ended(b)}`;
    return html`<div class="co-back-row" key=${b.id}><span>${text}</span>
      ${can && detail && b.take ? html`<button type="button" class="btn sm co-take" onClick=${(e) => {
        refocus(e.currentTarget, '.co-card', '.co-trl-now .trl-n[aria-pressed="true"]', '.co-trl-now .trl-n');
        takeChildTrl(p.id, b.id);
      }}>לעדכן כאן ל-TRL ${b.trl}</button>` : null}</div>`;
  })}</div></div>`;
}

// The Claude type's link out (design §9): the band and "לפתוח בפלטפורמה", or the line that there is none yet, with an
// inline field to add one. Only a link to /next/ is kept (card.nextLink), so a link from older data that isn't one is
// treated as none. A שמור / סודי project takes no link (the store refuses), so it isn't offered there. The field always
// opens clean: Chromium blurs it as Escape removes it, and that blur's check must not carry over to the next opening.
function Platform({ p, can, restricted }) {
  const [adding, setAdding] = useState(false);
  const [v, setV] = useState('');
  const [bad, setBad] = useState(false);
  const href = p.link ? nextLink(p.link, location.origin) : null;
  const badLink = (x) => !!String(x).trim() && !nextLink(x, location.origin);
  const close = (e) => { refocus(e.currentTarget, '.co-platform', '.co-addlink', '.co-open'); setAdding(false); setV(''); setBad(false); };
  const save = (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!v.trim() || !setLink(p.id, v)) { setBad(true); form.querySelector('input')?.focus(); return; }
    refocus(form, '.co-platform', '.co-open');
    setAdding(false); setV(''); setBad(false);
  };
  return html`<div class="core-row co-platform">
    <span class="core-l">בפלטפורמה</span>
    <div class="co-cell">
      ${href ? html`
        <div class="note-band co-claude"><${Icon} name="sparkle" size=${16} /><span>${CLAUDE_WORK}</span></div>
        <div class="co-acts">
          <a class="link-btn co-open" href=${href} target="_blank" rel="noopener"><${Icon} name="external" size=${15} />לפתוח בפלטפורמה</a>
          ${can ? html`<button type="button" class="link-btn co-unlink" onClick=${(e) => { refocus(e.currentTarget, '.co-platform', '.co-addlink', '.co-none'); setLink(p.id, ''); }}>להסיר את הקישור</button>` : null}
        </div>`
      : html`
        <p class="co-none" tabindex="-1">עוד לא נוסף קישור לפרויקט בפלטפורמה</p>
        ${can && !restricted && !adding ? html`<button type="button" class="link-btn co-addlink" onClick=${(e) => { refocus(e.currentTarget, '.co-platform', '.co-platform input'); setAdding(true); setBad(false); }}>להוסיף קישור</button>` : null}
        ${can && !restricted && adding ? html`<form class="inline-form co-linkform" onSubmit=${save}>
            <input class=${'input sm' + (bad ? ' bad' : '')} dir="ltr" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false"
              value=${v} aria-label="קישור לפרויקט בפלטפורמה" aria-invalid=${bad ? 'true' : null} aria-describedby=${bad ? 'co-link-err' : null}
              onInput=${(e) => { setV(e.currentTarget.value); if (bad) setBad(false); }} onBlur=${(e) => setBad(badLink(e.currentTarget.value))}
              onKeyDown=${(e) => { if (e.key === 'Escape') { e.preventDefault(); close(e); } }} />
            <button type="submit" class="btn sm btn-primary">שמירה</button>
            <button type="button" class="btn sm" onClick=${close}>ביטול</button>
          </form>
          ${bad ? html`<p class="co-err" id="co-link-err" role="alert">${LINK_ERR}</p>` : null}` : null}`}
    </div>
  </div>`;
}

// A core field. forWhom, success and stopRule can be marked "עוד לא ידוע", or in a שמור / סודי project "ברשת המסווגת"
// (the store's setMark): a marked field shows its mark instead of the text, and the manager can take the mark off.
function CoreField({ p, f, t, mgr, restricted }) {
  const markable = MARKABLE.includes(f.key);
  const mark = markable ? p.marks?.[f.key] || null : null;
  const empty = !String(p[f.key] ?? '').trim();
  return html`<div class="core-row">
    <label class="core-l">${f.label}</label>
    <div class="co-cell">
      ${mark ? html`<${Marked} mark=${mark} label=${f.label} onUndo=${mgr ? (e) => { refocus(e.currentTarget, '.core-row', '.co-mark', '.ftext'); setMark(p.id, f.key, null); } : null} />`
      : html`<${Text} label=${f.label} value=${p[f.key]} placeholder=${mgr ? coreHint(t, f.key) : 'עוד לא מולא'} disabled=${!mgr} onSave=${(v) => updateProject(p.id, { [f.key]: v })} />
        ${mgr && markable && empty ? html`<${Marks} label=${f.label} restricted=${restricted} onMark=${(e, m) => { refocus(e.currentTarget, '.core-row', '.co-undo'); setMark(p.id, f.key, m); }} />` : null}`}
    </div>
  </div>`;
}

// A mark in place of a value: "ברשת המסווגת" as the classification tag, "עוד לא ידוע" as a quiet capsule.
function Marked({ mark, label, onUndo }) {
  return html`<div class="co-marked">
    ${mark === 'classified' ? html`<span class="cls-tag sm"><${Icon} name="lock" size=${11} />${MARK.classified}</span>` : html`<span class="co-tag">${MARK.unknown}</span>`}
    ${onUndo ? html`<button type="button" class="link-btn small co-undo" aria-label=${`ביטול הסימון '${MARK[mark]}': ${label}`} onClick=${onUndo}>ביטול</button>` : null}
  </div>`;
}

// The marks an empty field can take, under it.
function Marks({ label, restricted, onMark }) {
  return html`<div class="co-marks">
    <button type="button" class="link-btn small co-mark" aria-label=${`לסמן '${MARK.unknown}': ${label}`} onClick=${(e) => onMark(e, 'unknown')}>${MARK.unknown}</button>
    ${restricted ? html`<button type="button" class="link-btn small co-mark" aria-label=${`לסמן '${MARK.classified}': ${label}`} onClick=${(e) => onMark(e, 'classified')}>${MARK.classified}</button>` : null}
  </div>`;
}

// One of the type's facts (design §2.5): a text with the same marks as the core fields, or a choice, one chip per option
// plus the marks, where one chip at most is pressed. Its hint sits under it.
function FactRow({ p, f, mgr, restricted }) {
  const hint = f.hint ? html`<p class="co-hint">${f.hint}</p>` : null;
  const mark = f.classified ? 'classified' : f.unknown ? 'unknown' : null;
  if (f.kind === 'choice') {
    const id = `co-f-${f.id}`;
    const set = (patch) => setFact(p.id, f.id, patch);
    const chosen = mark ? null : (f.options || []).find((o) => o.id === f.value) || null;
    return html`<div class="core-row">
      <span class="core-l" id=${id}>${f.label}</span>
      <div class="co-cell">
        ${mgr ? html`<div class="chips-row co-chips" role="group" aria-labelledby=${id}>
          ${(f.options || []).map((o) => html`<button type="button" key=${o.id} class="qchip" aria-pressed=${chosen?.id === o.id}
            onClick=${() => set({ value: chosen?.id === o.id ? '' : o.id, unknown: false, classified: false })}><span class="co-chip-t">${o.label}</span></button>`)}
          <button type="button" class="qchip" aria-pressed=${mark === 'unknown'}
            onClick=${() => set(mark === 'unknown' ? { unknown: false } : { value: '', unknown: true, classified: false })}><span class="co-chip-t">${MARK.unknown}</span></button>
          ${restricted || mark === 'classified' ? html`<button type="button" class="qchip" aria-pressed=${mark === 'classified'}
            onClick=${() => set(mark === 'classified' ? { classified: false } : { value: '', unknown: false, classified: true })}><${Icon} name="lock" size=${12} /><span class="co-chip-t">${MARK.classified}</span></button>` : null}
        </div>`
        : mark ? html`<${Marked} mark=${mark} label=${f.label} />`
        : html`<div class=${'ftext ro' + (chosen ? '' : ' muted')}>${chosen ? chosen.label : 'עוד לא מולא'}</div>`}
        ${hint}
      </div>
    </div>`;
  }
  return html`<div class="core-row">
    <label class="core-l">${f.label}</label>
    <div class="co-cell">
      ${mark ? html`<${Marked} mark=${mark} label=${f.label} onUndo=${mgr ? (e) => { refocus(e.currentTarget, '.core-row', '.co-mark', '.ftext'); setFact(p.id, f.id, { [mark]: false }); } : null} />`
      : html`<${Text} label=${f.label} value=${f.value} placeholder=${mgr ? 'לכתוב כאן' : 'עוד לא מולא'} disabled=${!mgr} onSave=${(v) => setFact(p.id, f.id, { value: v })} />
        ${mgr && !String(f.value ?? '').trim() ? html`<${Marks} label=${f.label} restricted=${restricted} onMark=${(e, m) => { refocus(e.currentTarget, '.core-row', '.co-undo'); setFact(p.id, f.id, { [m]: true }); }} />` : null}`}
      ${hint}
    </div>
  </div>`;
}

// Edit mode: the facts' names, each with "להסיר" (with undo, from the store), and "+ שדה בליבה" for a text fact.
function FactsEditor({ p }) {
  return html`<div class="core-row">
    <span class="core-l">שדות בליבה</span>
    <div class="co-cell co-fe-list">
      ${(p.facts || []).map((f) => html`<${FactEdit} key=${f.id} p=${p} f=${f} />`)}
      <${AddFact} p=${p} />
    </div>
  </div>`;
}

// A fact's name, and its removal. An emptied name goes back to what it was. Removing hands focus to the next fact's
// remove, else the one before it, else the card's edit toggle (never a text field, which would raise a phone's keyboard).
function FactEdit({ p, f }) {
  const [k, setK] = useState(0);
  const remove = (e) => {
    const row = e.currentTarget.closest('.co-fe');
    const rows = [...row.parentElement.children].filter((x) => x.matches('.co-fe'));
    const n = rows.indexOf(row);
    const to = [rows[n + 1], rows[n - 1]].filter(Boolean).map((x) => x.querySelector('.co-remove'));
    const card = row.closest('.co-card');
    removeFact(p.id, f.id);
    requestAnimationFrame(() => {
      const a = document.activeElement;
      if (a && a !== document.body && a.isConnected) return;
      [...to, card?.querySelector('.co-toggle')].find((x) => x?.isConnected)?.focus();
    });
  };
  return html`<div class="co-fe">
    <${Text} key=${k} label="שם השדה" value=${f.label} multiline=${false} onSave=${(v) => { if (!renameFact(p.id, f.id, v)) setK(k + 1); }} />
    <button type="button" class="link-btn co-remove" aria-label=${`להסיר את השדה '${f.label}'`} onClick=${remove}>להסיר</button>
  </div>`;
}

function AddFact({ p }) {
  const [name, setName] = useState('');
  const add = (e) => { e.preventDefault(); const v = name.trim(); if (v && addFact(p.id, v)) setName(''); };
  return html`<form class="inline-form co-add" onSubmit=${add}>
    <input class="input sm" value=${name} onInput=${(e) => setName(e.currentTarget.value)} placeholder="שם השדה" aria-label="שם השדה החדש" />
    <button type="submit" class="btn sm" aria-label="להוסיף שדה בליבה" disabled=${!name.trim()}><${Icon} name="plus" size=${14} />שדה בליבה</button>
  </form>`;
}

// Readiness today or the target: TRL 1 to 9, or "עוד לא ידוע" (null). Pressed is the value; lit is everything up to it.
function TrlRow({ cls, id, label, value, mgr, onPick, children }) {
  return html`<div class="core-row">
    <span class="core-l" id=${id}>${label}</span>
    <div class="co-cell">
      <div class=${'trl ' + cls} role="group" aria-labelledby=${id}>
        ${TRLS.map((n) => html`<button type="button" class=${'trl-n' + (value != null && n <= value ? ' on' : '')} disabled=${!mgr} aria-pressed=${value === n}
          aria-label=${`TRL ${n}`} onClick=${() => onPick(n)}>${n}</button>`)}
        ${mgr ? html`<button type="button" class="qchip co-trl-unknown" aria-pressed=${value == null} onClick=${() => onPick(null)}>${MARK.unknown}</button>`
          : html`<span class="muted small">${value == null ? MARK.unknown : `TRL ${value}`}</span>`}
      </div>
      ${children}
    </div>
  </div>`;
}
