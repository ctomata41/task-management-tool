// The task table, after Monday's board: every task is one row, and its status, priority, owner and date are cells
// that change in one tap. Rows sit in coloured groups (by date, stage, status, person or project); each group ends
// with a line to add a task straight into it, and a bar that shows at a glance how much of it is done.
import { useState, useRef } from 'preact/hooks';
import { html, Icon, Avatar, ProjectTag, openMenu, dueWord, dayDiff, dateInput } from './ui.js';
import { useStore, STATUS, STATUS_ORDER, PRIORITY, PRIORITY_ORDER, setStatus, updateTask, toggleFocus, addTask, openSheet, person, project,
  canEditTask, team, isCommander, getState } from './store.js';

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

const readSet = (key) => { try { return new Set(JSON.parse(localStorage.getItem(key)) || []); } catch (e) { return new Set(); } };
const writeSet = (key, set) => { try { localStorage.setItem(key, JSON.stringify([...set])); } catch (e) { /* storage blocked */ } };

// groups: [{ id, name, color, tasks, add?: defaults for a new task, or null when the group takes none }]
export function TaskTable({ groups, cols = ['owner', 'status', 'priority', 'due'], memory = 'm.tt', star = false, empty = 'אין משימות כאן.' }) {
  useStore();
  const [sort, setSort] = useState(null);
  const [closed, setClosed] = useState(() => readSet(`${memory}.closed`));
  const tmpl = `var(--bar-w) minmax(0, 1fr) ${cols.map((c) => COLS[c].w).join(' ')}`;
  const toggle = (id) => { const n = new Set(closed); if (n.has(id)) n.delete(id); else n.add(id); setClosed(n); writeSet(`${memory}.closed`, n); };
  const sortBy = (key) => setSort(!sort || sort.key !== key ? { key, dir: 1 } : sort.dir === 1 ? { key, dir: -1 } : null);
  const shown = groups.filter((g) => g.tasks.length || g.add);
  if (!shown.length) return html`<div class="m-empty"><${Icon} name="check" size=${20} /><span>${empty}</span></div>`;
  return html`<div class="ttable" style=${`--cols:${tmpl}`}>
    ${shown.map((g) => {
      const list = sort ? [...g.tasks].sort((a, b) => SORTERS[sort.key](a, b) * sort.dir) : g.tasks;
      const isClosed = closed.has(g.id);
      return html`<section class=${'tgrp' + (isClosed ? ' closed' : '')} key=${g.id} style=${`--gc:${g.color}`}>
        <header class="tgrp-head">
          <button type="button" class="tgrp-tog" aria-expanded=${!isClosed} onClick=${() => toggle(g.id)}><${Icon} name=${isClosed ? 'chevronLeft' : 'chevronDown'} size=${18} />
            <h3>${g.name}</h3></button>
          <span class="tgrp-n">${g.tasks.length} ${g.tasks.length === 1 ? 'משימה' : 'משימות'}</span>
          ${g.hint ? html`<span class="muted small">${g.hint}</span>` : null}
          ${isClosed || g.tasks.length ? html`<${Battery} tasks=${g.tasks} cls="tgrp-batt" />` : null}
        </header>
        ${isClosed ? null : html`<div class="tt" role="table" aria-label=${g.name}>
          <div class="tt-row tt-th" role="row">
            <span class="tc-bar" aria-hidden="true"></span>
            <button type="button" role="columnheader" class="tc th-title" onClick=${() => sortBy('title')}>משימה${arrow(sort, 'title')}</button>
            ${cols.map((c) => html`<button type="button" role="columnheader" class=${'tc th c-' + c} onClick=${() => sortBy(c)}>${COLS[c].label}${arrow(sort, c)}</button>`)}
          </div>
          ${list.map((t) => html`<${Row} key=${t.id} t=${t} cols=${cols} star=${star} />`)}
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

// How a group divides by status (or priority): one bar, each colour as wide as its share.
export function Battery({ tasks, by = 'status', cls = '' }) {
  const order = by === 'status' ? STATUS_ORDER : [...PRIORITY_ORDER, null];
  const meta = by === 'status' ? STATUS : PRIORITY;
  const parts = order.map((k) => ({ k, n: tasks.filter((t) => (by === 'status' ? t.status === k : (t.priority || null) === k)).length })).filter((x) => x.n);
  if (!tasks.length) return null;
  const words = parts.map((x) => `${x.k ? meta[x.k].label : 'בלי'}: ${x.n}`).join(' · ');
  return html`<span class=${'batt ' + cls} role="img" aria-label=${words} title=${words}>${parts.map((x) => html`<i style=${`flex:${x.n};--c:${x.k ? meta[x.k].color : 'var(--fill-2)'}`}></i>`)}</span>`;
}

function Row({ t, cols, star }) {
  const s = getState();
  const done = t.status === 'done';
  const edit = canEditTask(t);
  const p = project(t.project);
  const pool = p ? [p.manager, ...p.partners] : isCommander() ? team().map((x) => x.id) : [s.me];
  const open = () => openSheet('task', { id: t.id });
  const menuStatus = (e) => { e.stopPropagation(); if (edit) openMenu(e, STATUS_ORDER.map((id) => ({ id, label: STATUS[id].label, dot: STATUS[id].color })), { selected: t.status, onPick: (id) => setStatus(t.id, id) }); };
  const menuPrio = (e) => { e.stopPropagation(); if (edit) openMenu(e, [...PRIORITY_ORDER.map((id) => ({ id, label: PRIORITY[id].label, dot: PRIORITY[id].color })), { id: '', label: 'בלי עדיפות' }], { selected: t.priority || '', onPick: (id) => updateTask(t.id, { priority: id || null }) }); };
  const menuOwner = (e) => { e.stopPropagation(); if (edit) openMenu(e, pool.map((id) => ({ id, label: person(id).name, person: id })), { selected: t.owner, onPick: (id) => updateTask(t.id, { owner: id }) }); };
  const st = STATUS[t.status];
  const pr = t.priority ? PRIORITY[t.priority] : null;
  const n = t.due ? dayDiff(t.due) : null;
  const late = !done && n !== null && n < 0;
  const stage = p?.stages.find((x) => x.id === t.stage);
  return html`<div class=${'tt-row tt-task' + (done ? ' is-done' : '')} role="row">
    <span class="tc-bar" aria-hidden="true"></span>
    <div class="tc tc-title" role="cell">
      <button type="button" class=${'tcheck' + (done ? ' on' : '')} disabled=${!edit} aria-label=${done ? 'להחזיר לעבודה' : 'סימון כבוצע'} onClick=${(e) => { e.stopPropagation(); setStatus(t.id, done ? 'todo' : 'done'); }}>${done ? html`<${Icon} name="check" size=${13} />` : null}</button>
      <button type="button" class="tt-open" onClick=${open}>
        <span class="tt-name">${t.title}</span>
        <span class="tt-chips">
          ${t.external ? html`<span class="ext-chip" title="התחייבות לגורם מחוץ לצוות"><${Icon} name="send" size=${11} />ל${t.external}</span>` : null}
          ${t.fromCommander ? html`<span class="cmd-chip" title="הורד מהמפקד"><${Icon} name="flag" size=${11} />מ${person(t.by).name}</span>` : null}
          ${t.notes ? html`<span class="note-ic" title="יש הערות"><${Icon} name="message" size=${13} /></span>` : null}
          ${cols.includes('project') && p ? html`<span class="m-only"><${ProjectTag} id=${p.id} /></span>` : null}
        </span>
      </button>
      ${star && !done ? html`<button type="button" class=${'starbtn' + (t.focus ? ' on' : '')} aria-pressed=${!!t.focus} aria-label=${t.focus ? 'להוציא מהפוקוס' : 'לפוקוס של היום'} onClick=${(e) => { e.stopPropagation(); toggleFocus(t.id); }}><${Icon} name="star" size=${15} /></button>` : null}
    </div>
    ${cols.map((c) => {
      if (c === 'owner') return html`<div class="tc c-owner" role="cell"><button type="button" class="cell-btn" disabled=${!edit} aria-label=${`אחראי: ${person(t.owner).name}`} onClick=${menuOwner}><${Avatar} id=${t.owner} size=${28} /></button></div>`;
      if (c === 'status') return html`<div class="tc c-status" role="cell"><button type="button" class=${'cell-fill' + (t.status === 'todo' ? ' quiet' : '') + (st.ink === 'light' ? ' light' : '')} style=${`--c:${st.color}`} disabled=${!edit} aria-label=${`סטטוס: ${st.label}`} onClick=${menuStatus}>${st.label}</button></div>`;
      if (c === 'priority') return html`<div class="tc c-priority" role="cell"><button type="button" class=${'cell-fill' + (pr ? '' : ' empty') + (pr?.ink === 'light' ? ' light' : '')} style=${pr ? `--c:${pr.color}` : ''} disabled=${!edit} aria-label=${`עדיפות: ${pr ? pr.label : 'בלי'}`} onClick=${menuPrio}>${pr ? pr.label : ''}</button></div>`;
      if (c === 'due') return html`<div class="tc c-due" role="cell"><label class=${'cell-date' + (late ? ' late' : !done && n !== null && n <= 1 ? ' soon' : '') + (done ? ' done' : '')}>
        ${edit ? html`<input type="date" value=${dateInput(t.due)} aria-label="תאריך יעד" onClick=${(e) => e.stopPropagation()} onInput=${(e) => updateTask(t.id, { due: e.currentTarget.value || null })} />` : null}
        ${late ? html`<${Icon} name="alert" size=${13} />` : null}${t.due ? dueWord(t.due) : html`<span class="muted">—</span>`}</label></div>`;
      if (c === 'project') return html`<div class="tc c-project" role="cell">${p ? html`<${ProjectTag} id=${p.id} />` : html`<span class="muted small">—</span>`}</div>`;
      if (c === 'stage') return html`<div class="tc c-stage" role="cell"><span class="small">${stage ? stage.name : '—'}</span></div>`;
      return null;
    })}
  </div>`;
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
export function BoardBar({ search, setSearch, people, who, setWho, groupBy, setGroupBy, groupOptions, showDone, setShowDone, children }) {
  return html`<div class="bbar">
    <label class="bbar-search"><${Icon} name="search" size=${16} /><input type="search" value=${search} onInput=${(e) => setSearch(e.currentTarget.value)} placeholder="חיפוש" aria-label="חיפוש משימה" /></label>
    ${people && people.length > 1 ? html`<div class="bbar-people" role="group" aria-label="סינון לפי אדם">
      ${people.map((id) => html`<button type="button" class=${'pf' + (who === id ? ' on' : '')} aria-pressed=${who === id} title=${person(id).name} onClick=${() => setWho(who === id ? null : id)}><${Avatar} id=${id} size=${28} /></button>`)}
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
const isoIn = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
export function groupTasks(tasks, by, base = {}) {
  if (by === 'date') {
    const pick = (t) => { if (t.status === 'done') return 'done'; if (!t.due) return 'none'; const n = dayDiff(t.due); return n < 0 ? 'late' : n === 0 ? 'today' : n <= 6 ? 'week' : 'later'; };
    const addFor = { today: { due: isoIn(0) }, week: { due: isoIn(3) }, later: { due: isoIn(14) }, none: {} };
    return DATE_GROUPS.map((g) => ({ ...g, tasks: tasks.filter((t) => pick(t) === g.id).sort(SORTERS.due), add: addFor[g.id] && base ? { ...base, ...addFor[g.id] } : null }))
      .filter((g) => g.tasks.length || g.id === 'today');
  }
  if (by === 'status') return STATUS_ORDER.map((k) => ({ id: k, name: STATUS[k].label, color: STATUS[k].color, tasks: tasks.filter((t) => t.status === k), add: base ? { ...base, status: k } : null })).filter((g) => g.tasks.length);
  if (by === 'priority') return [...PRIORITY_ORDER, null].map((k) => ({ id: k || 'none', name: k ? PRIORITY[k].label : 'בלי עדיפות', color: k ? PRIORITY[k].color : 'var(--fill-2)', tasks: tasks.filter((t) => (t.priority || null) === k), add: base ? { ...base, priority: k } : null })).filter((g) => g.tasks.length);
  if (by === 'owner') {
    const ids = [...new Set(tasks.map((t) => t.owner))];
    return ids.map((id) => ({ id, name: person(id).name, color: person(id).color, tasks: tasks.filter((t) => t.owner === id), add: base ? { ...base, owner: id } : null }));
  }
  if (by === 'project') {
    const ids = [...new Set(tasks.map((t) => t.project || ''))];
    return ids.map((id) => { const p = project(id); return { id: id || 'none', name: p ? p.name : 'בלי פרויקט', color: p ? p.color : 'var(--s-todo)', tasks: tasks.filter((t) => (t.project || '') === id), add: base ? { ...base, project: id || null } : null }; })
      .sort((a, b) => (a.id === 'none') - (b.id === 'none'));
  }
  return [{ id: 'all', name: 'משימות', color: 'var(--accent)', tasks, add: base }];
}
