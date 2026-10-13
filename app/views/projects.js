// Projects: a list with health and progress, and a project page with a table (Monday-style groups) or a kanban board.
import { useState } from 'preact/hooks';
import {
  visibleTasks, person, openTask, updateProject, updateTask, createProject, archiveProject, openModal, closeModal, openMenu, getState, setPref,
} from '../store.js';
import {
  html, Icon, Avatar, Progress, HealthPill, Empty, StatusPill, OwnerButton, PriorityButton, DueButton, FocusStar, Modal, navigate,
} from '../ui.js';
import { QuickAdd } from '../quickadd.js';
import { STATUSES, isOverdue, isStuck, byUrgency, shortDate, today, addDays, diffDays, weekStart, HEALTH_BY } from '../util.js';

const COLORS = ['#2F6FED', '#0C8599', '#D9480F', '#2B8A3E', '#AE3EC9', '#C2255C', '#5F3DC4', '#E67700'];

function stats(tasks, id) {
  const pt = tasks.filter((t) => t.project_id === id);
  return { total: pt.length, done: pt.filter((t) => t.status === 'done').length, stuck: pt.filter(isStuck).length, overdue: pt.filter(isOverdue).length, open: pt.filter((t) => t.status !== 'done').length };
}

// Projects on a time axis, from start date to target date. RTL: time runs from right (earlier) to left (later).
function Timeline({ projects, tasks }) {
  const dated = projects.filter((p) => p.start_date || p.target_date);
  const undated = projects.filter((p) => !p.start_date && !p.target_date);
  const td = today();
  const starts = dated.map((p) => p.start_date || p.target_date);
  const ends = dated.map((p) => p.target_date || p.start_date);
  let from = weekStart(starts.length ? [...starts, td].sort()[0] : td);
  let to = addDays([...ends, addDays(td, 21)].sort().slice(-1)[0], 7);
  if (diffDays(from, to) < 42) to = addDays(from, 42);
  const span = diffDays(from, to);
  const pos = (d) => `${(diffDays(from, d) / span) * 100}%`;
  const weeks = [];
  for (let d = from; d < to; d = addDays(d, 7)) weeks.push(d);
  return html`<div class="timeline card">
    <div class="tl-grid">
      <div class="tl-head"><span class="tl-name"></span><div class="tl-track">
        ${weeks.map((w) => html`<span class="tl-week" key=${w} style=${`inset-inline-start:${pos(w)}`}>${shortDate(w)}</span>`)}
      </div></div>
      ${dated.map((p) => {
        const st = stats(tasks, p.id);
        const a = p.start_date || p.target_date;
        const b = p.target_date || p.start_date;
        const pct = st.total ? Math.round((st.done / st.total) * 100) : 0;
        return html`<a class="tl-row" href=${'#/project/' + p.id} key=${p.id}>
          <span class="tl-name"><i style=${`background:${(HEALTH_BY[p.health] || {}).color || 'var(--fg-3)'}`} title=${(HEALTH_BY[p.health] || {}).label || ''}></i>${p.name}</span>
          <div class="tl-track">
            ${weeks.map((w) => html`<span class="tl-line" key=${w} style=${`inset-inline-start:${pos(w)}`}></span>`)}
            <span class="tl-today" style=${`inset-inline-start:${pos(td)}`} title="היום"></span>
            <span class="tl-bar" style=${`inset-inline-start:${pos(a)};width:max(${(Math.max(1, diffDays(a, b) + 1) / span) * 100}%, 26px);--pc:${p.color || 'var(--accent)'}`}
              title=${`${shortDate(a)} עד ${shortDate(b)}`}>
              <span class="tl-fill" style=${`width:${pct}%`}></span><span class="tl-label">${st.done}/${st.total}</span>
            </span>
          </div>
        </a>`;
      })}
    </div>
    ${undated.length ? html`<p class="tl-undated muted">בלי תאריכים: ${undated.map((p, i) => html`${i ? ', ' : ''}<a href=${'#/project/' + p.id}>${p.name}</a>`)}. מוסיפים התחלה ויעד בעמוד הפרויקט.</p>` : null}
  </div>`;
}

export function Projects({ s }) {
  const tasks = visibleTasks(s);
  const view = s.prefs.projectsView || 'cards';
  return html`<div class="page projects">
    <header class="page-head">
      <div><h1>פרויקטים</h1><p class="sub">${s.projects.length} פרויקטים פעילים</p></div>
      <div class="head-actions">
        <div class="seg" role="tablist">
          <button type="button" role="tab" aria-selected=${view === 'cards' ? 'true' : 'false'} class=${view === 'cards' ? 'on' : ''} onClick=${() => setPref('projectsView', 'cards')}><${Icon} name="grid" size=${16} />כרטיסים</button>
          <button type="button" role="tab" aria-selected=${view === 'timeline' ? 'true' : 'false'} class=${view === 'timeline' ? 'on' : ''} onClick=${() => setPref('projectsView', 'timeline')}><${Icon} name="calendar" size=${16} />ציר זמן</button>
        </div>
        <button type="button" class="btn btn-primary" onClick=${() => openModal('newproject')}><${Icon} name="plus" size=${16} />פרויקט חדש</button>
      </div>
    </header>
    ${s.projects.length && view === 'timeline' ? html`<${Timeline} projects=${s.projects} tasks=${tasks} />` : null}
    ${s.projects.length && view !== 'timeline' ? html`<div class="proj-grid">
      ${s.projects.map((p) => {
        const st = stats(tasks, p.id);
        const owner = person(p.owner_id);
        return html`<a class="pcard" href=${'#/project/' + p.id} key=${p.id}>
          <div class="pcard-top">
            <span class="pcard-icon" style=${`background:${p.color || 'var(--accent)'}`}>${p.name.slice(0, 1)}</span>
            <div class="pcard-name"><strong>${p.name}</strong>${p.grp ? html`<span class="muted">${p.grp}</span>` : null}</div>
            <${HealthPill} p=${p} />
          </div>
          ${p.health_note ? html`<p class="pcard-note">${p.health_note}</p>` : null}
          <div class="pcard-prog"><${Progress} value=${st.done} total=${st.total} /><span>${st.done}/${st.total}</span></div>
          <div class="pcard-foot">
            ${owner ? html`<span class="pcard-owner"><${Avatar} p=${owner} size=${22} />${owner.name}</span>` : null}
            <span class="grow"></span>
            ${st.overdue ? html`<span class="badge bad">${st.overdue} באיחור</span>` : null}
            ${st.stuck ? html`<span class="badge warn">${st.stuck} תקועות</span>` : null}
            ${p.target_date ? html`<span class="muted">יעד ${shortDate(p.target_date)}</span>` : null}
          </div>
        </a>`;
      })}
    </div>` : null}
    ${s.projects.length ? null : html`<${Empty} title="אין עדיין פרויקטים" icon="folder">פרויקט מרכז משימות סביב יעד אחד. צרו את הראשון.<//>`}
  </div>`;
}

export function NewProjectModal() {
  const s = getState();
  const [name, setName] = useState('');
  const [owner, setOwner] = useState(s.auth?.me || '');
  const [start, setStart] = useState(today());
  const [target, setTarget] = useState('');
  const [desc, setDesc] = useState('');
  const [color] = useState(COLORS[s.projects.length % COLORS.length]);
  const submit = async (e) => {
    e.preventDefault();
    const p = await createProject({ name, owner_id: owner || null, target_date: target || null, description: desc || null, color, start_date: start || null });
    if (p) { closeModal(); navigate('#/project/' + p.id); }
  };
  return html`<${Modal} title="פרויקט חדש">
    <form class="form" onSubmit=${submit}>
      <label class="lbl" for="np-name">שם הפרויקט</label>
      <input id="np-name" class="input" value=${name} onInput=${(e) => setName(e.currentTarget.value)} autoFocus required placeholder="למשל: דוח רבעוני לדרג הבכיר" />
      <label class="lbl" for="np-owner">אחראי</label>
      <select id="np-owner" class="input" value=${owner} onChange=${(e) => setOwner(e.currentTarget.value)}>
        ${s.people.map((p) => html`<option value=${p.id}>${p.name}</option>`)}
      </select>
      <div class="form-2">
        <div><label class="lbl" for="np-start">התחלה</label>
          <input id="np-start" class="input" type="date" value=${start} onChange=${(e) => setStart(e.currentTarget.value)} /></div>
        <div><label class="lbl" for="np-target">תאריך יעד</label>
          <input id="np-target" class="input" type="date" value=${target} onChange=${(e) => setTarget(e.currentTarget.value)} /></div>
      </div>
      <label class="lbl" for="np-desc">מטרה בשורה אחת</label>
      <input id="np-desc" class="input" value=${desc} onInput=${(e) => setDesc(e.currentTarget.value)} placeholder="מה ייחשב הצלחה?" />
      <div class="form-actions"><button type="submit" class="btn btn-primary" disabled=${!name.trim()}>יצירת פרויקט</button>
        <button type="button" class="btn" onClick=${closeModal}>ביטול</button></div>
    </form>
  <//>`;
}

function InlineText({ value, onSave, cls, placeholder }) {
  const [v, setV] = useState(value || '');
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return html`<button type="button" class=${'inline-text ' + (cls || '') + (value ? '' : ' muted')} onClick=${() => { setV(value || ''); setEditing(true); }}>${value || placeholder}</button>`;
  }
  const done = () => { setEditing(false); if ((v || '').trim() !== (value || '')) onSave((v || '').trim()); };
  return html`<input class=${'inline-input ' + (cls || '')} value=${v} autoFocus onInput=${(e) => setV(e.currentTarget.value)} onBlur=${done}
    onKeyDown=${(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setV(value || ''); setEditing(false); } }} />`;
}

function TableView({ tasks, projectId }) {
  const [collapsed, setCollapsed] = useState({ done: true });
  const [addingIn, setAddingIn] = useState(null);
  return html`<div class="ptable">
    ${STATUSES.map((st) => {
      const rows = tasks.filter((t) => t.status === st.id).sort(byUrgency);
      if (!rows.length && st.id !== 'todo' && st.id !== 'in_progress') return null;
      const isCollapsed = collapsed[st.id];
      return html`<section class="pgroup" key=${st.id} style=${`--c:${st.color}`}>
        <button type="button" class="pgroup-head" onClick=${() => setCollapsed({ ...collapsed, [st.id]: !isCollapsed })} aria-expanded=${isCollapsed ? 'false' : 'true'}>
          <${Icon} name="chevronDown" size=${16} cls=${isCollapsed ? 'rot' : ''} /><span class="pgroup-name">${st.label}</span><span class="count">${rows.length}</span>
        </button>
        ${isCollapsed ? null : html`<div class="tbl" role="table">
          <div class="tr th" role="row"><span role="columnheader">משימה</span><span role="columnheader">אחראי</span><span role="columnheader">סטטוס</span><span role="columnheader">יעד</span><span role="columnheader">עדיפות</span><span role="columnheader" class="sr">פוקוס</span></div>
          ${rows.map((t) => html`<div class=${'tr' + (t._pending ? ' is-pending' : '')} role="row" key=${t.id} onClick=${() => openTask(t.id)}>
            <span class="td-title" role="cell">${t.title}${getState().checklist.some((c) => c.task_id === t.id) ? html`<span class="sub-count">${getState().checklist.filter((c) => c.task_id === t.id && c.done).length}/${getState().checklist.filter((c) => c.task_id === t.id).length}</span>` : null}</span>
            <span role="cell"><${OwnerButton} t=${t} size=${24} /></span>
            <span role="cell"><${StatusPill} t=${t} /></span>
            <span role="cell"><${DueButton} t=${t} empty="—" /></span>
            <span role="cell"><${PriorityButton} t=${t} /></span>
            <span role="cell"><${FocusStar} t=${t} /></span>
          </div>`)}
          ${addingIn === st.id
            ? html`<div class="tr add-row"><${QuickAdd} defaults=${{ project_id: projectId, status: st.id }} autoFocus placeholder="משימה חדשה בקבוצה" onDone=${() => setAddingIn(null)} /></div>`
            : html`<button type="button" class="tr add-btn" onClick=${() => setAddingIn(st.id)}><${Icon} name="plus" size=${15} />הוספת משימה</button>`}
        </div>`}
      </section>`;
    })}
  </div>`;
}

function KanbanView({ tasks, projectId }) {
  const [over, setOver] = useState(null);
  const [addingIn, setAddingIn] = useState(null);
  const onDrop = (e, status) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData('text/plain');
    const t = tasks.find((x) => x.id === id);
    if (t && t.status !== status) updateTask(id, { status });
  };
  return html`<div class="kanban">
    ${STATUSES.map((st) => {
      const rows = tasks.filter((t) => t.status === st.id).sort(byUrgency);
      return html`<section class=${'kcol' + (over === st.id ? ' over' : '')} key=${st.id} style=${`--c:${st.color}`}
        onDragOver=${(e) => { e.preventDefault(); setOver(st.id); }} onDragLeave=${() => setOver(null)} onDrop=${(e) => onDrop(e, st.id)}>
        <header class="kcol-head"><span class="kcol-name">${st.label}</span><span class="count">${rows.length}</span></header>
        <div class="kcol-body">
          ${rows.map((t) => {
            const owner = person(t.owner_id);
            return html`<div class=${'kcard' + (isOverdue(t) ? ' overdue' : '')} key=${t.id} draggable="true"
              onDragStart=${(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; }}
              onClick=${() => openTask(t.id)} role="button" tabindex="0">
              <div class="kcard-title">${t.title}</div>
              <div class="kcard-meta">
                <${Avatar} p=${owner} size=${22} />
                <${DueButton} t=${t} empty="" />
                <span class="grow"></span>
                <${PriorityButton} t=${t} compact />
                <${FocusStar} t=${t} />
              </div>
            </div>`;
          })}
          ${addingIn === st.id
            ? html`<${QuickAdd} defaults=${{ project_id: projectId, status: st.id }} autoFocus placeholder="משימה חדשה" onDone=${() => setAddingIn(null)} />`
            : html`<button type="button" class="col-add-btn" onClick=${() => setAddingIn(st.id)}><${Icon} name="plus" size=${15} />הוספה</button>`}
        </div>
      </section>`;
    })}
  </div>`;
}

export function ProjectPage({ s, id }) {
  const p = s.projects.find((x) => x.id === id);
  if (!p) {
    return html`<div class="page"><${Empty} title="הפרויקט לא נמצא" icon="folder">ייתכן שהוא הועבר לארכיון. <a href="#/projects">חזרה לפרויקטים</a><//></div>`;
  }
  const tasks = visibleTasks(s).filter((t) => t.project_id === p.id);
  const st = stats(tasks, p.id);
  const view = s.prefs.projectView || 'table';
  const owner = person(p.owner_id);
  const pickOwner = (e) => openMenu(e.currentTarget, s.people.map((x) => ({ id: x.id, label: x.name, person: x })), (oid) => updateProject(p.id, { owner_id: oid }), p.owner_id);
  const more = (e) => openMenu(e.currentTarget, [{ id: 'archive', label: 'העברה לארכיון', icon: 'trash', danger: true }], () => { archiveProject(p.id); navigate('#/projects'); });
  return html`<div class="page project">
    <a class="back" href="#/projects"><${Icon} name="chevronRight" size=${16} />פרויקטים</a>
    <header class="proj-head">
      <span class="pcard-icon lg" style=${`background:${p.color || 'var(--accent)'}`}>${p.name.slice(0, 1)}</span>
      <div class="proj-head-main">
        <${InlineText} cls="h1" value=${p.name} onSave=${(v) => v && updateProject(p.id, { name: v })} />
        <${InlineText} cls="desc" value=${p.description} placeholder="הוסיפו מטרה בשורה אחת" onSave=${(v) => updateProject(p.id, { description: v || null })} />
      </div>
      <button type="button" class="icon-btn" aria-label="אפשרויות" onClick=${more}><${Icon} name="more" /></button>
    </header>
    <div class="proj-facts">
      <div class="fact"><span class="fact-l">מצב</span><${HealthPill} p=${p} onPick=${(h) => updateProject(p.id, { health: h })} /></div>
      <div class="fact wide"><span class="fact-l">למה</span><${InlineText} value=${p.health_note} placeholder="משפט אחד על המצב" onSave=${(v) => updateProject(p.id, { health_note: v || null })} /></div>
      <div class="fact"><span class="fact-l">אחראי</span><button type="button" class="owner-btn" onClick=${pickOwner}><${Avatar} p=${owner} size=${22} /><span class="owner-name">${owner?.name || 'ללא'}</span></button></div>
      <div class="fact"><span class="fact-l">התחלה</span><${DueButton} t=${p} field="start_date" empty="בלי תאריך" label="תאריך התחלה" onSave=${(v) => updateProject(p.id, { start_date: v })} /></div>
      <div class="fact"><span class="fact-l">יעד</span><${DueButton} t=${p} field="target_date" empty="בלי יעד" onSave=${(v) => updateProject(p.id, { target_date: v })} /></div>
      <div class="fact"><span class="fact-l">התקדמות</span><span class="fact-prog"><${Progress} value=${st.done} total=${st.total} />${st.done}/${st.total}</span></div>
    </div>
    <div class="view-bar">
      <div class="seg" role="tablist">
        <button type="button" role="tab" aria-selected=${view === 'table' ? 'true' : 'false'} class=${view === 'table' ? 'on' : ''} onClick=${() => setPref('projectView', 'table')}><${Icon} name="table" size=${16} />טבלה</button>
        <button type="button" role="tab" aria-selected=${view === 'kanban' ? 'true' : 'false'} class=${view === 'kanban' ? 'on' : ''} onClick=${() => setPref('projectView', 'kanban')}><${Icon} name="kanban" size=${16} />קנבן</button>
      </div>
      <span class="muted">${st.open} פתוחות${st.overdue ? ` · ${st.overdue} באיחור` : ''}${st.stuck ? ` · ${st.stuck} תקועות` : ''}</span>
    </div>
    <${QuickAdd} defaults=${{ project_id: p.id, owner_id: s.auth?.me }} placeholder=${'משימה חדשה ב' + p.name + '… (@שם, מחר, !)'} />
    ${view === 'kanban' ? html`<${KanbanView} tasks=${tasks} projectId=${p.id} />` : html`<${TableView} tasks=${tasks} projectId=${p.id} />`}
  </div>`;
}
