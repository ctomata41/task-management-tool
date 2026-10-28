// The task table, after Monday's board: every task is one row, and its status, priority, owner and date are cells
// that change in one tap. Rows sit in coloured groups (by date, stage, status, person or project); each group ends
// with a line to add a task straight into it, and a bar that shows at a glance how much of it is done.
import { useState, useRef } from 'preact/hooks';
import { html, Icon, Avatar, ProjectTag, openMenu, dueDate, dueRel, dayDiff, dateInput, isoDay } from './ui.js';
import { useStore, STATUS, STATUS_ORDER, PRIORITY, PRIORITY_ORDER, setStatus, updateTask, toggleFocus, addTask, openSheet, person, project,
  canEditTask, canSeeTask, isOpen, team, isCommander, leads, inProject, getState, focusCount } from './store.js';
import { byRank } from './card.js';

export const COLS = {
  owner: { label: 'אחראי', w: '76px' },
  status: { label: 'סטטוס', w: '124px' },
  priority: { label: 'עדיפות', w: '112px' },
  due: { label: 'תאריך יעד', w: '112px' },
  project: { label: 'פרויקט', w: 'minmax(130px, 210px)' },
  stage: { label: 'שלב', w: '128px' },
};

const SORTERS = {
  title: (a, b) => a.title.localeCompare(b.title, 'he'),
  owner: (a, b) => person(a.owner).name.localeCompare(person(b.owner).name, 'he'),
  status: (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
  priority: (a, b) => rank(a.priority) - rank(b.priority),
  due: (a, b) => (a.due ? 0 : 1) - (b.due ? 0 : 1) || String(a.due || '').localeCompare(String(b.due || '')),
  project: (a, b) => (project(a.project)?.name || '').localeCompare(project(b.project)?.name || '', 'he'),
  stage: (a, b) => String(a.stage || '').localeCompare(String(b.stage || '')),
};
const rank = (p) => (p ? PRIORITY_ORDER.indexOf(p) : 9);
// Two projects by their place in the commander's order (card.byRank); no project at all comes last.
const byPlace = (a, b) => (a && b ? byRank(a, b) : !a - !b);
// A day's tasks: the higher priority first, then the project higher in the order.
const byDue = (a, b) => SORTERS.due(a, b) || rank(a.priority) - rank(b.priority) || byPlace(project(a.project), project(b.project));
// The focus of the day, whoever starred or pinned each task: the higher priority first, then the project higher in the
// order, then the nearer date.
export const byFocus = (a, b) => rank(a.priority) - rank(b.priority) || byPlace(project(a.project), project(b.project)) || SORTERS.due(a, b);

const readSet = (key) => { try { return new Set(JSON.parse(localStorage.getItem(key)) || []); } catch (e) { return new Set(); } };
const writeSet = (key, set) => { try { localStorage.setItem(key, JSON.stringify([...set])); } catch (e) { /* storage blocked */ } };

// groups: [{ id, name, color, tasks, add?: defaults for a new task, or null when the group takes none, focusOf?: the
// person a group of owners belongs to }]. With star, each row offers the star to whoever may use it (Row), and a person's
// group says how full their focus is (scope: the project the table shows, so the hint can say how much is outside it).
// ask: the ask this table breaks down, so its rows don't repeat "בקשת יואש", and a sheet opened from a row returns to it.
// emptyIcon: the mark beside `empty`, a check where nothing left to do is good news.
export function TaskTable({ groups, cols = ['owner', 'status', 'priority', 'due'], memory = 'm.tt', star = false, empty = 'אין משימות כאן.', emptyIcon = 'check', ask = null, scope = null }) {
  useStore();
  const [sort, setSort] = useState(null);
  const [closed, setClosed] = useState(() => readSet(`${memory}.closed`));
  const tmpl = `var(--bar-w) minmax(0, 1fr) ${cols.map((c) => COLS[c].w).join(' ')}`;
  const toggle = (id) => { const n = new Set(closed); if (n.has(id)) n.delete(id); else n.add(id); setClosed(n); writeSet(`${memory}.closed`, n); };
  const sortBy = (key) => setSort(!sort || sort.key !== key ? { key, dir: 1 } : sort.dir === 1 ? { key, dir: -1 } : null);
  const shown = groups.filter((g) => g.tasks.length || g.add);
  if (!shown.length) return html`<div class="m-empty"><${Icon} name=${emptyIcon} size=${20} /><span>${empty}</span></div>`;
  return html`<div class="ttable" style=${`--cols:${tmpl}`}>
    ${shown.map((g) => {
      const list = sort ? [...g.tasks].sort((a, b) => SORTERS[sort.key](a, b) * sort.dir) : g.tasks;
      const isClosed = closed.has(g.id);
      const hint = g.hint || (star && g.focusOf ? focusHint(g.focusOf, scope, g.tasks) : null);
      return html`<section class=${'tgrp' + (isClosed ? ' closed' : '')} key=${g.id} style=${`--gc:${g.color}`}>
        <header class="tgrp-head">
          <button type="button" class="tgrp-tog" aria-expanded=${!isClosed} onClick=${() => toggle(g.id)}><${Icon} name=${isClosed ? 'chevronLeft' : 'chevronDown'} size=${18} />
            <h3>${g.name}</h3></button>
          <span class="tgrp-n">${g.tasks.length} ${g.tasks.length === 1 ? 'משימה' : 'משימות'}</span>
          ${hint ? html`<span class="muted small">${hint}</span>` : null}
          ${isClosed || g.tasks.length ? html`<${Battery} tasks=${g.tasks} cls="tgrp-batt" />` : null}
        </header>
        ${isClosed ? null : html`<div class="tt" role="table" aria-label=${g.name}>
          <div class="tt-row tt-th" role="row">
            <span class="tc-bar" aria-hidden="true"></span>
            <button type="button" role="columnheader" class="tc th-title" onClick=${() => sortBy('title')}>משימה${arrow(sort, 'title')}</button>
            ${cols.map((c) => html`<button type="button" role="columnheader" class=${'tc th c-' + c} onClick=${() => sortBy(c)}>${COLS[c].label}${arrow(sort, c)}</button>`)}
          </div>
          ${list.map((t) => html`<${Row} key=${t.id} t=${t} cols=${cols} star=${star} ask=${ask} />`)}
          ${g.add ? html`<${AddRow} defaults=${g.add} placeholder=${g.addLabel} />` : null}
          ${list.length ? html`<div class="tt-row tt-sum" role="row" aria-label="סיכום">
            <span class="tc-bar" aria-hidden="true"></span><span class="tc"></span>
            ${cols.map((c) => html`<span class=${'tc c-' + c}>${c === 'status' ? html`<${Battery} tasks=${list} />` : c === 'priority' ? html`<${Battery} tasks=${list} by="priority" />` : null}</span>`)}
          </div>` : null}
        </div>`}
      </section>`;
    })}
  </div>`;
}
const arrow = (sort, key) => (sort && sort.key === key ? html`<${Icon} name=${sort.dir === 1 ? 'chevronDown' : 'chevronUp'} size=${13} />` : null);
// How full a person's focus is, their stars and the pins together, as the cap in toggleFocus counts it: "בפוקוס 2/3".
// The cap counts all of it, other projects and personal work too, so the hint says how much of it is outside this
// project ("בפוקוס 3/3 · 1 מחוץ לפרויקט"), without naming where. Someone without an account takes no star, so their
// group says nothing.
function focusHint(id, scope, shown) {
  const x = person(id);
  if (!x.id || x.account === false) return null;
  const n = focusCount(id);
  const here = scope
    ? getState().tasks.filter((t) => t.owner === id && t.focus && t.status !== 'done' && t.project === scope).length
    : shown.filter((t) => t.focus && t.status !== 'done').length;
  return `בפוקוס ${n}/3${n > here ? ` · ${n - here} ${scope ? 'מחוץ לפרויקט' : 'לא כאן'}` : ''}`;
}

// How a group divides by status (or priority): one bar, each colour as wide as its share.
export function Battery({ tasks, by = 'status', cls = '' }) {
  const order = by === 'status' ? STATUS_ORDER : [...PRIORITY_ORDER, null];
  const meta = by === 'status' ? STATUS : PRIORITY;
  const parts = order.map((k) => ({ k, n: tasks.filter((t) => (by === 'status' ? t.status === k : (t.priority || null) === k)).length })).filter((x) => x.n);
  if (!tasks.length) return null;
  const words = parts.map((x) => `${x.k ? meta[x.k].label : 'בלי'}: ${x.n}`).join(' · ');
  return html`<span class=${'batt ' + cls} role="img" aria-label=${words} title=${words}>${parts.map((x) => html`<i style=${`flex:${x.n};--c:${x.k ? meta[x.k].color : 'var(--fill-2)'}`}></i>`)}</span>`;
}

// The star on a task, as toggleFocus allows it: the owner's own, or a pin from whoever runs the project, never for
// someone without an account. A star its owner set (or another lead's pin) shows, but only they take it out (locked).
export function focusStar(t) {
  const me = getState().me;
  const mine = t.owner === me;
  const who = person(t.owner);
  const show = t.status !== 'done' && (mine || (leads(project(t.project)) && !t.personal && !!who.id && who.account !== false));
  const locked = show && !!t.focus && !mine && t.focusBy !== me;
  const label = mine ? (t.focus ? 'להוציא מהפוקוס' : 'לפוקוס של היום') : locked ? `בפוקוס של ${who.name}` : `${t.focus ? 'להוציא מהפוקוס' : 'לפוקוס'} של ${who.name}`;
  return { show, mine, locked, label };
}

function Row({ t, cols, star, ask }) {
  const s = getState();
  const done = t.status === 'done';
  const edit = canEditTask(t);
  const p = project(t.project);
  const fs = focusStar(t);
  // The ask this task serves, as far as I may see it: never for outside partners, and never past a project's lock.
  const up = t.parent && t.parent !== ask ? s.tasks.find((x) => x.id === t.parent && x.ask && canSeeTask(x)) : null;
  // An ask stays with its project's manager, so its owner cell is fixed (store.updateTask holds it too).
  const own = edit && !t.ask;
  // From the table that breaks an ask down, a sheet opened from a row returns to the ask (closeSheet).
  const back = ask ? { backTo: ask } : {};
  const open = () => openSheet('task', { id: t.id, ...back });
  const menuStatus = (e) => { e.stopPropagation(); if (edit) openMenu(e, STATUS_ORDER.map((id) => ({ id, label: STATUS[id].label, dot: STATUS[id].color })), { selected: t.status, onPick: (id) => setStatus(t.id, id) }); };
  const menuPrio = (e) => { e.stopPropagation(); if (edit) openMenu(e, [...PRIORITY_ORDER.map((id) => ({ id, label: PRIORITY[id].label, dot: PRIORITY[id].color })), { id: '', label: 'בלי עדיפות' }], { selected: t.priority || '', onPick: (id) => updateTask(t.id, { priority: id || null }) }); };
  const menuOwner = (e) => { e.stopPropagation(); if (own) openMenu(e, ownerItems(p, ownerPool(t, p)), { selected: t.owner, onPick: (id) => (id === ADD ? openSheet('partner', { id: p.id, task: t.id, ...back }) : updateTask(t.id, { owner: id })) }); };
  const st = STATUS[t.status];
  const pr = t.priority ? PRIORITY[t.priority] : null;
  const n = t.due ? dayDiff(t.due) : null;
  const late = !done && n !== null && n < 0;
  const stage = p?.stages.find((x) => x.id === t.stage);
  return html`<div class=${'tt-row tt-task' + (done ? ' is-done' : '')} role="row" data-task=${t.id}>
    <span class="tc-bar" aria-hidden="true"></span>
    <div class="tc tc-title" role="cell">
      <button type="button" class=${'tcheck' + (done ? ' on' : '')} disabled=${!edit} aria-label=${done ? 'להחזיר לעבודה' : 'סימון כבוצע'} onClick=${(e) => { e.stopPropagation(); setStatus(t.id, done ? 'todo' : 'done'); }}>${done ? html`<${Icon} name="check" size=${13} />` : null}</button>
      <button type="button" class="tt-open" onClick=${open}>
        <span class="tt-name">${t.title}</span>
        <span class="tt-chips">
          ${t.external ? html`<span class="ext-chip" title="התחייבות לגורם מחוץ לצוות"><${Icon} name="send" size=${11} />ל${t.external}</span>` : null}
          ${t.fromCommander ? html`<span class="cmd-chip" title="הורד מהמפקד"><${Icon} name="flag" size=${11} />מ${person(t.by).name}</span>` : null}
          ${t.focus && t.focusBy && t.focusBy !== t.owner ? html`<span class="pin-chip" title=${`${person(t.focusBy).name} הוסיף/ה לפוקוס`}><${Icon} name="star" size=${11} />מ${person(t.focusBy).name}</span>` : null}
          ${up ? html`<span class="ask-chip" title=${up.title}><${Icon} name="flag" size=${11} />בקשת ${person(up.by).name}</span>` : null}
          ${t.notes ? html`<span class="note-ic" title="יש הערות"><${Icon} name="message" size=${13} /></span>` : null}
          ${cols.includes('project') && p ? html`<span class="m-only"><${ProjectTag} id=${p.id} /></span>` : null}
        </span>
      </button>
      ${star && fs.show ? html`<button type="button" class=${'starbtn' + (t.focus ? ' on' : '')} aria-pressed=${!!t.focus} disabled=${fs.locked} aria-label=${fs.label} title=${fs.mine ? null : fs.label}
        onClick=${(e) => { e.stopPropagation(); followStar(e.currentTarget, t.id); toggleFocus(t.id); }}><${Icon} name="star" size=${15} /></button>` : null}
    </div>
    ${cols.map((c) => {
      if (c === 'owner') return html`<div class="tc c-owner" role="cell"><button type="button" class="cell-btn" disabled=${!own} aria-label=${`אחראי: ${person(t.owner).name}`} onClick=${menuOwner}><${Avatar} id=${t.owner} size=${28} /></button></div>`;
      if (c === 'status') return html`<div class="tc c-status" role="cell"><button type="button" class=${'cell-fill' + (t.status === 'todo' ? ' quiet' : '') + (st.ink === 'light' ? ' light' : '')} style=${`--c:${st.color}`} disabled=${!edit} aria-label=${`סטטוס: ${st.label}`} onClick=${menuStatus}>${st.label}</button></div>`;
      if (c === 'priority') return html`<div class="tc c-priority" role="cell"><button type="button" class=${'cell-fill' + (pr ? '' : ' empty') + (pr?.ink === 'light' ? ' light' : '')} style=${pr ? `--c:${pr.color}` : ''} disabled=${!edit} aria-label=${`עדיפות: ${pr ? pr.label : 'בלי'}`} onClick=${menuPrio}>${pr ? pr.label : ''}</button></div>`;
      if (c === 'due') return html`<div class="tc c-due" role="cell"><label class=${'cell-date' + (late ? ' late' : !done && n !== null && n <= 1 ? ' soon' : '') + (done ? ' done' : '')}>
        ${edit ? html`<input type="date" value=${dateInput(t.due)} aria-label="תאריך יעד" onClick=${(e) => e.stopPropagation()} onInput=${(e) => updateTask(t.id, { due: e.currentTarget.value || null })} />` : null}
        ${t.due ? html`<${DueLines} iso=${t.due} late=${late} />` : html`<span class="muted">—</span>`}</label></div>`;
      if (c === 'project') return html`<div class="tc c-project" role="cell">${p ? html`<${ProjectTag} id=${p.id} />` : html`<span class="muted small">—</span>`}</div>`;
      if (c === 'stage') return html`<div class="tc c-stage" role="cell"><span class="small">${stage ? stage.name : '—'}</span></div>`;
      return null;
    })}
  </div>`;
}

// In Today the star moves its row into the focus group or out of it. Focus that was on the star goes with it to its
// new place, rather than to the top of the page.
function followStar(b, id) {
  if (document.activeElement !== b) return;
  requestAnimationFrame(() => { if (!b.isConnected) document.querySelector(`.tt-task[data-task="${id}"] .starbtn`)?.focus({ preventScroll: true }); });
}

// A date cell, as on Monday, with the day itself first and under it how far it is ("מחר", "לפני 3 ימים").
export function DueLines({ iso, late }) {
  return html`<span class="cd-date">${late ? html`<${Icon} name="alert" size=${12} />` : null}${dueDate(iso)}</span><span class="cd-rel">${dueRel(iso)}</span>`;
}

// Who a task can be given to: the project's people; with no project, the whole team for the commander and only
// myself for anyone else. The commander never reaches past a manager, so in a team project he doesn't run he can give
// it only to its manager, and it goes as an ask (store.updateTask).
export function ownerPool(t, p) {
  const me = getState().me;
  if (p && !p.personal && isCommander() && !leads(p)) return [...new Set([t.owner, p.manager].filter(Boolean))];
  return p ? [p.manager, ...p.partners] : isCommander() ? team().map((x) => x.id) : [me];
}
// The owner menu: the pool, and for whoever runs the project, a way to bring in someone new who takes the task.
export const ADD = '+partner';
export function ownerItems(p, pool) {
  const items = pool.map((id) => ({ id, label: person(id).name + (person(id).role === 'external' ? ` · ${person(id).org || 'מבחוץ'}` : ''), person: id }));
  return p && !p.personal && isOpen(p) && leads(p) ? [...items, { id: ADD, label: 'הוספת שותף לפרויקט…', icon: 'plus' }] : items;
}

function AddRow({ defaults, placeholder = 'להוסיף משימה' }) {
  const [v, setV] = useState('');
  const ref = useRef();
  const add = (e) => {
    e.preventDefault();
    const title = v.trim();
    if (!title) return;
    addTask({ ...defaults, title });
    setV('');
    ref.current?.focus();
  };
  return html`<form class="tt-row tt-add" onSubmit=${add}>
    <span class="tc-bar" aria-hidden="true"></span>
    <label class="tc tc-title"><${Icon} name="plus" size=${16} /><input ref=${ref} value=${v} onInput=${(e) => setV(e.currentTarget.value)} placeholder=${`+ ${placeholder}`} aria-label=${placeholder} enterkeyhint="done" /></label>
    ${v.trim() ? html`<button type="submit" class="btn btn-primary sm tt-add-go">הוספה</button>` : null}
  </form>`;
}

// The bar above a board: search, one person, how to group, and whether to show what is done.
// On a project's board, whoever runs it also gets a + at the end of the faces, to add a partner.
export function BoardBar({ search, setSearch, people, who, setWho, groupBy, setGroupBy, groupOptions, showDone, setShowDone, onAddPerson, children }) {
  return html`<div class="bbar">
    <label class="bbar-search"><${Icon} name="search" size=${16} /><input type="search" value=${search} onInput=${(e) => setSearch(e.currentTarget.value)} placeholder="חיפוש" aria-label="חיפוש משימה" /></label>
    ${people && (people.length > 1 || onAddPerson) ? html`<div class="bbar-people" role="group" aria-label="סינון לפי אדם">
      ${people.map((id) => html`<button type="button" class=${'pf' + (who === id ? ' on' : '')} aria-pressed=${who === id} title=${person(id).name} onClick=${() => setWho(who === id ? null : id)}><${Avatar} id=${id} size=${28} /></button>`)}
      ${onAddPerson ? html`<button type="button" class="pf pf-add" title="הוספת שותף" aria-label="הוספת שותף לפרויקט" onClick=${onAddPerson}><${Icon} name="plus" size=${16} /></button>` : null}
    </div>` : null}
    ${groupOptions ? html`<button type="button" class="bbar-btn" onClick=${(e) => openMenu(e, groupOptions, { selected: groupBy, onPick: setGroupBy })}><${Icon} name="layers" size=${15} />קיבוץ: ${groupOptions.find((o) => o.id === groupBy)?.label}</button>` : null}
    ${setShowDone ? html`<button type="button" class=${'bbar-btn' + (showDone ? ' on' : '')} aria-pressed=${showDone} onClick=${() => setShowDone(!showDone)}><${Icon} name="check" size=${15} />${showDone ? 'מציג בוצעו' : 'בוצעו מוסתרות'}</button>` : null}
    ${children}
  </div>`;
}

export function matches(t, q, who) {
  if (who && t.owner !== who) return false;
  if (!q) return true;
  const s = q.trim().toLowerCase();
  return t.title.toLowerCase().includes(s) || (t.external || '').toLowerCase().includes(s) || (project(t.project)?.name || '').toLowerCase().includes(s);
}

// Ways to group a list of tasks into coloured groups.
const DATE_GROUPS = [
  { id: 'late', name: 'באיחור', color: 'var(--s-blocked)' },
  { id: 'today', name: 'היום', color: 'var(--s-progress)' },
  { id: 'week', name: 'השבוע', color: 'var(--accent)' },
  { id: 'later', name: 'בהמשך', color: 'var(--s-waiting)' },
  { id: 'none', name: 'בלי תאריך', color: 'var(--s-todo)' },
  { id: 'done', name: 'בוצעו', color: 'var(--s-done)' },
];
const isoIn = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return isoDay(d); }; // the local day, not the UTC one
export function groupTasks(tasks, by, base = {}) {
  if (by === 'date') {
    const pick = (t) => { if (t.status === 'done') return 'done'; if (!t.due) return 'none'; const n = dayDiff(t.due); return n < 0 ? 'late' : n === 0 ? 'today' : n <= 6 ? 'week' : 'later'; };
    const addFor = { today: { due: isoIn(0) }, week: { due: isoIn(3) }, later: { due: isoIn(14) }, none: {} };
    return DATE_GROUPS.map((g) => ({ ...g, tasks: tasks.filter((t) => pick(t) === g.id).sort(byDue), add: addFor[g.id] && base ? { ...base, ...addFor[g.id] } : null }))
      .filter((g) => g.tasks.length || g.id === 'today');
  }
  if (by === 'status') return STATUS_ORDER.map((k) => ({ id: k, name: STATUS[k].label, color: STATUS[k].color, tasks: tasks.filter((t) => t.status === k), add: base ? { ...base, status: k } : null })).filter((g) => g.tasks.length);
  if (by === 'priority') return [...PRIORITY_ORDER, null].map((k) => ({ id: k || 'none', name: k ? PRIORITY[k].label : 'בלי עדיפות', color: k ? PRIORITY[k].color : 'var(--fill-2)', tasks: tasks.filter((t) => (t.priority || null) === k), add: base ? { ...base, priority: k } : null })).filter((g) => g.tasks.length);
  if (by === 'owner') {
    // A new task goes only to someone in the project, and an outside partner adds only their own (store.addTask).
    const p = project(base?.project);
    const me = getState().me;
    const takes = (id) => !p || (inProject(p, id) && (person(me).role !== 'external' || id === me));
    const ids = [...new Set(tasks.map((t) => t.owner))];
    return ids.map((id) => ({ id, name: person(id).name, color: person(id).color, focusOf: id, tasks: tasks.filter((t) => t.owner === id), add: base && takes(id) ? { ...base, owner: id } : null }));
  }
  if (by === 'project') {
    // In the commander's order: placed projects by place, then the rest, and tasks without a project last. Only a
    // project that still runs, and that I'm in, takes a new task from its group (the commander's goes as an ask).
    const ids = [...new Set(tasks.map((t) => t.project || ''))];
    const takes = (p) => !p || (isOpen(p) && (isCommander() || inProject(p)));
    return ids.map((id) => { const p = project(id); return { id: id || 'none', name: p ? p.name : 'בלי פרויקט', color: p ? p.color : 'var(--s-todo)', tasks: tasks.filter((t) => (t.project || '') === id), add: base && takes(p) ? { ...base, project: id || null } : null }; })
      .sort((a, b) => byPlace(project(a.id), project(b.id)));
  }
  return [{ id: 'all', name: 'משימות', color: 'var(--accent)', tasks, add: base }];
}
