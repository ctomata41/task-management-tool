// Pieces several screens share: a task row in the style of a Monday board (status in one tap, owner, date), the
// one-line add, and the project card with its stage strip.
import { useState, useRef } from 'preact/hooks';
import { html, Icon, Avatar, Faces, Pill, ProjectTag, Classified, StageStrip, Health, openMenu, dueWord, dayDiff } from './ui.js';
import { useStore, STATUS, STATUS_ORDER, setStatus, updateTask, toggleFocus, openSheet, person, project, canEditTask, addTask,
  team, visibleProjects, canSee, canSeeDetail, isCommander, leads, getState } from './store.js';
import { status, HILL, needsCommander, cardFill } from './card.js';

export function StatusButton({ t }) {
  const st = STATUS[t.status];
  const edit = canEditTask(t);
  const pick = (e) => {
    e.stopPropagation();
    if (!edit) return;
    openMenu(e, STATUS_ORDER.map((id) => ({ id, label: STATUS[id].label, dot: STATUS[id].color })), { selected: t.status, onPick: (id) => setStatus(t.id, id) });
  };
  return html`<button type="button" class=${'stbtn s-' + t.status} style=${`--c:${st.color}`} onClick=${pick} disabled=${!edit} aria-label=${`סטטוס: ${st.label}`}>${st.label}</button>`;
}

export function DueChip({ t }) {
  if (!t.due) return null;
  const n = dayDiff(t.due);
  const late = t.status !== 'done' && n < 0;
  const soon = t.status !== 'done' && n >= 0 && n <= 1;
  return html`<span class=${'due2' + (late ? ' late' : soon ? ' soon' : '')}>${dueWord(t.due)}</span>`;
}

export function TaskRow({ t, showProject = true, showOwner = true, star = false }) {
  const done = t.status === 'done';
  const check = (e) => { e.stopPropagation(); if (canEditTask(t)) setStatus(t.id, done ? 'todo' : 'done'); };
  return html`<div class=${'trow' + (done ? ' is-done' : '')} role="button" tabindex="0" onClick=${() => openSheet('task', { id: t.id })}
    onKeyDown=${(e) => { if (e.key === 'Enter') openSheet('task', { id: t.id }); }}>
    <button type="button" class=${'tcheck' + (done ? ' on' : '')} aria-label=${done ? 'להחזיר לביצוע' : 'סימון כבוצע'} onClick=${check}>${done ? html`<${Icon} name="check" size=${14} />` : null}</button>
    <div class="trow-main">
      <div class="trow-title">${t.focus && !done ? html`<span class="focus-star" title="בפוקוס היום"><${Icon} name="star" size=${13} /></span>` : null}${t.title}</div>
      <div class="trow-meta">
        ${showProject && t.project ? html`<${ProjectTag} id=${t.project} />` : null}
        ${t.external ? html`<span class="ext-chip" title="התחייבות לגורם מחוץ לצוות"><${Icon} name="send" size=${11} />ל${t.external}</span>` : null}
        ${t.fromCommander ? html`<span class="cmd-chip" title="הורד מהמפקד"><${Icon} name="flag" size=${11} />מ${person(t.by).name}</span>` : null}
        ${t.personal ? html`<span class="me-chip">אישי</span>` : null}
      </div>
    </div>
    <div class="trow-side">
      ${star && !done ? html`<button type="button" class=${'starbtn' + (t.focus ? ' on' : '')} aria-pressed=${!!t.focus} aria-label=${t.focus ? 'להוציא מהפוקוס' : 'להכניס לפוקוס של היום'} onClick=${(e) => { e.stopPropagation(); toggleFocus(t.id); }}><${Icon} name="star" size=${16} /></button>` : null}
      <${DueChip} t=${t} />
      <${StatusButton} t=${t} />
      ${showOwner ? html`<${Avatar} id=${t.owner} size=${26} />` : null}
    </div>
  </div>`;
}

// One line to add a task: the title, and optional chips for project, owner and date. Enter adds it. A task added under an
// ask carries its parent and the ask's priority. What the commander adds in a project someone else runs goes to its
// manager as an ask (addTask), so the line says so and offers only the manager.
export function QuickAdd({ project: pid, stage, parent, priority, personal, placeholder = 'משימה חדשה…', ownerDefault }) {
  const s = useStore();
  const [title, setTitle] = useState('');
  const [proj, setProj] = useState(pid || null);
  const [owner, setOwner] = useState(ownerDefault || s.me);
  const [due, setDue] = useState('');
  const ref = useRef();
  const p = proj ? project(proj) : null;
  const asAsk = isCommander() && !!p && !p.personal && !leads(p);
  const people = p ? [p.manager, ...p.partners].filter((id, i, a) => a.indexOf(id) === i) : [s.me];
  const pool = asAsk ? [p.manager] : p ? people : (isCommander() ? team().map((x) => x.id) : [s.me]);
  const who = pool.includes(owner) ? owner : asAsk ? p.manager : s.me;
  const submit = (e) => {
    e.preventDefault();
    const v = title.trim();
    if (!v) return;
    addTask({ title: v, project: proj, stage: stage || null, owner: who, due: due || null, personal: !!personal, ...(parent ? { parent } : {}), ...(priority ? { priority } : {}) });
    setTitle(''); setDue('');
    ref.current?.focus();
  };
  const pickProject = (e) => openMenu(e, [{ id: '', label: personal ? 'בלי פרויקט' : 'בלי פרויקט (רק אצלי)', icon: 'user' }, ...visibleProjects().filter((x) => (personal ? x.personal : !x.personal) && x.phase !== 'stopped' && canSeeDetail(x)).map((x) => ({ id: x.id, label: x.name, dot: x.color }))],
    { selected: proj || '', onPick: (id) => setProj(id || null) });
  const pickOwner = (e) => openMenu(e, pool.map((id) => ({ id, label: person(id).name + (person(id).role === 'external' ? ` · ${person(id).org || 'מבחוץ'}` : ''), person: id })), { selected: who, onPick: setOwner });
  return html`<form class="qadd" onSubmit=${submit}>
    <span class="qadd-plus"><${Icon} name="plus" size=${16} /></span>
    <input ref=${ref} class="qadd-input" value=${title} onInput=${(e) => setTitle(e.currentTarget.value)} placeholder=${asAsk ? `תגיע כבקשה ל${person(p.manager).name}` : placeholder} aria-label="כותרת המשימה" enterkeyhint="done" />
    ${pid ? null : html`<button type="button" class="qchip qproj" onClick=${pickProject}>${p ? html`<i style=${`background:${p.color}`}></i>${p.name}` : html`<${Icon} name="layers" size=${14} />פרויקט`}</button>`}
    ${pool.length > 1 || asAsk ? html`<button type="button" class="qchip" onClick=${pickOwner} aria-label=${`אחראי: ${person(who).name}`}><${Avatar} id=${who} size=${20} /></button>` : null}
    <label class="qchip date"><${Icon} name="calendar" size=${14} /><input type="date" value=${due} onInput=${(e) => setDue(e.currentTarget.value)} aria-label="תאריך יעד" />${due ? dueWord(due) : null}</label>
    <button type="submit" class="btn btn-primary sm" disabled=${!title.trim()}>הוספה</button>
  </form>`;
}

export function ProjectCard({ p }) {
  const st = status(p);
  const asks = isCommander() ? needsCommander(p, getState().tasks) : [];
  const fill = cardFill(p);
  return html`<a class="pcard2" href=${`#/project/${p.id}`} style=${`--bar:${p.color}`}>
    <div class="pc-top"><strong class="pc-name">${p.name}</strong><${Classified} p=${p} small /></div>
    <div class="pc-where"><span class="pc-stage">${st.where}</span>${st.n ? html`<span class="muted small">שלב ${Math.min(st.idx, st.n)} מתוך ${st.n}</span>` : null}</div>
    <${StageStrip} p=${p} />
    <div class="pc-foot">
      <${Health} p=${p} />
      ${p.phase !== 'stopped' && p.phase !== 'done' ? html`<span class="muted small"><${Icon} name="hill" size=${13} /> ${HILL[p.hill || 'up'].short}</span>` : null}
      ${st.pending ? html`<${Pill} color="var(--s-waiting)">מחכה לאישור</${Pill}>` : null}
      ${asks.length ? html`<${Pill} color="var(--h-off)">צריך אותך · ${asks.length}</${Pill}>` : null}
      ${st.stale ? html`<span class="stale" title="לא עודכן יותר משבוע">לא עודכן</span>` : null}
      <span class="grow"></span>
      <span class="muted small" title="כמה מתעודת הזהות מולא עד השלב הנוכחי">${fill.done}/${fill.of}</span>
      <${Faces} ids=${[p.manager, ...p.partners]} size=${22} />
    </div>
  </a>`;
}
