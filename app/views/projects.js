// Projects: the list (cards or a timeline) and the project page. A project has a lead and partners and three streams
// under it (spec): decisions, human assignments ("מטלות") and Claude tasks, which stay folded until someone opens them.
// A new project waits as proposed until the commander decides to open it; a classified project carries only an approved
// unclassified name, its lead and its status.
import { useState } from 'preact/hooks';
import {
  visibleTasks, person, openTask, updateProject, updateTask, createProject, archiveProject, setProjectStage, requestStop,
  createDecision, openModal, closeModal, openMenu, getState, setPref, isCommand, flagItem,
} from '../store.js';
import {
  html, Icon, Avatar, Progress, HealthPill, Empty, StatusPill, OwnerButton, PriorityButton, DueButton, FocusStar, Modal, Seg,
  InlineText, AutoText, BlmsNote, ConfirmButton, copyText, pickPerson, humanPeople, navigate,
} from '../ui.js';
import { QuickAdd } from '../quickadd.js';
import { Group } from './mine.js';
import { DecisionCard, FlagBar } from './decisions.js';
import { CommitmentRow } from './commitments.js';
import {
  STAGE, isClaude, canSee, visibleProjects, projectSummary, commanderOf, gateOptions,
} from '../model.js';
import { projectBrief } from '../export.js';
import { STATUSES, isOverdue, byUrgency, shortDate, today, addDays, diffDays, weekStart, HEALTH_BY, timeAgo } from '../util.js';

const COLORS = ['#2F6FED', '#0C8599', '#D9480F', '#2B8A3E', '#AE3EC9', '#C2255C', '#5F3DC4', '#E67700'];
// Every project gets a time budget of 2, 6 or 12 weeks (spec). It is kept as the target date, counted from the start.
const BUDGETS = [{ id: '2', label: 'שבועיים' }, { id: '6', label: '6 שבועות' }, { id: '12', label: '12 שבועות' }];

const daysWord = (n) => (n === 1 ? 'יום' : n === 2 ? 'יומיים' : `${n} ימים`);
const weeksWord = (n) => (n === 1 ? 'שבוע' : n === 2 ? 'שבועיים' : `${n} שבועות`);
function budgetOf(p) {
  if (!p.start_date || !p.target_date) return null;
  const weeks = Math.max(1, Math.round(diffDays(p.start_date, p.target_date) / 7));
  const left = diffDays(today(), p.target_date);
  const text = left < 0 ? `נגמר לפני ${daysWord(-left)}` : left === 0 ? 'נגמר היום'
    : left < 14 ? `${left === 1 ? 'נשאר' : 'נשארו'} ${daysWord(left)}` : `נשארו ${weeksWord(Math.round(left / 7))}`;
  return { weeks, left, text };
}

function StageChip({ stage }) {
  return html`<span class=${'stage-chip s-' + stage}>${STAGE[stage]?.label || ''}</span>`;
}
function Faces({ p, size = 22 }) {
  const lead = person(p.owner_id);
  const partners = (p.partner_ids || []).map(person).filter(Boolean);
  return html`<span class="faces">
    ${lead ? html`<${Avatar} p=${lead} size=${size} title=${'מוביל: ' + lead.name} />` : null}
    ${partners.map((x) => html`<${Avatar} key=${x.id} p=${x} size=${size} title=${'בשותפות: ' + x.name} />`)}</span>`;
}

// Projects on a time axis, from start date to target date. RTL: time runs from right (earlier) to left (later).
function Timeline({ projects }) {
  const dated = projects.filter((p) => p.start_date || p.target_date);
  const undated = projects.filter((p) => !p.start_date && !p.target_date);
  const td = today();
  const starts = dated.map((p) => p.start_date || p.target_date);
  const ends = dated.map((p) => p.target_date || p.start_date);
  const from = weekStart(starts.length ? [...starts, td].sort()[0] : td);
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
        const x = projectSummary(p);
        const a = p.start_date || p.target_date;
        const b = p.target_date || p.start_date;
        const pct = x.total ? Math.round((x.done / x.total) * 100) : 0;
        return html`<a class=${'tl-row' + (p.stage === 'proposed' ? ' proposed' : '')} href=${'#/project/' + p.id} key=${p.id}>
          <span class="tl-name"><i style=${`background:${(HEALTH_BY[p.health] || {}).color || 'var(--fg-3)'}`} title=${(HEALTH_BY[p.health] || {}).label || ''}></i>${p.name}</span>
          <div class="tl-track">
            ${weeks.map((w) => html`<span class="tl-line" key=${w} style=${`inset-inline-start:${pos(w)}`}></span>`)}
            <span class="tl-today" style=${`inset-inline-start:${pos(td)}`} title="היום"></span>
            <span class="tl-bar" style=${`inset-inline-start:${pos(a)};width:max(${(Math.max(1, diffDays(a, b) + 1) / span) * 100}%, 26px);--pc:${p.color || 'var(--accent)'}`}
              title=${`${shortDate(a)} עד ${shortDate(b)}`}>
              <span class="tl-fill" style=${`width:${pct}%`}></span><span class="tl-label">${p.stage === 'proposed' ? 'מוצע' : `${x.done}/${x.total}`}</span>
            </span>
          </div>
        </a>`;
      })}
    </div>
    ${undated.length ? html`<p class="tl-undated muted">בלי תאריכים: ${undated.map((p, i) => html`${i ? ', ' : ''}<a href=${'#/project/' + p.id}>${p.name}</a>`)}. מוסיפים התחלה ותקציב זמן בעמוד הפרויקט.</p>` : null}
  </div>`;
}

function ProjectCard({ p }) {
  const x = projectSummary(p);
  const stage = p.stage || 'active';
  const b = budgetOf(p);
  return html`<a class=${'pcard st-' + stage} href=${'#/project/' + p.id}>
    <div class="pcard-top">
      <span class="pcard-icon" style=${`background:${p.color || 'var(--accent)'}`}>${p.name.slice(0, 1)}</span>
      <div class="pcard-name"><strong>${p.name}</strong>${p.classified ? html`<span class="muted"><${Icon} name="lock" size=${12} /> מסווג: הפרטים ברשת המסווגת</span>` : p.grp ? html`<span class="muted">${p.grp}</span>` : null}</div>
      ${stage === 'active' ? html`<${HealthPill} p=${p} />` : html`<${StageChip} stage=${stage} />`}
    </div>
    ${stage === 'proposed' ? html`<p class="pcard-note">מחכה להחלטה על פתיחה. בינתיים חוקרים ומתכננים.</p>`
      : p.health_note ? html`<p class="pcard-note">${p.health_note}</p>` : null}
    <div class="pcard-streams">
      <span title="החלטות פתוחות"><${Icon} name="decision" size=${14} />${x.decisions.length}</span>
      <span title="מטלות פתוחות"><${Icon} name="check" size=${14} />${x.human}</span>
      <span title="משימות Claude פתוחות"><${Icon} name="sparkle" size=${14} />${x.claude}</span>
      ${x.commitments.length ? html`<span title="התחייבויות פתוחות"><${Icon} name="swap" size=${14} />${x.commitments.length}</span>` : null}
      <span class="grow"></span>
      ${x.lateCommitments ? html`<span class="badge bad">${x.lateCommitments === 1 ? 'התחייבות באיחור' : `${x.lateCommitments} התחייבויות באיחור`}</span>` : null}
      ${x.stuck ? html`<span class="badge warn">${x.stuck === 1 ? 'חסם' : `${x.stuck} חסמים`}</span>` : null}
    </div>
    ${x.total ? html`<div class="pcard-prog"><${Progress} value=${x.done} total=${x.total} /><span>${x.done}/${x.total}</span></div>` : null}
    <div class="pcard-foot">
      <${Faces} p=${p} />
      <span class="grow"></span>
      ${b ? html`<span class=${'muted' + (b.left < 0 && stage === 'active' ? ' late-text' : '')}>${b.text}</span>`
        : p.target_date ? html`<span class="muted">יעד ${shortDate(p.target_date)}</span>` : null}
    </div>
  </a>`;
}

export function Projects({ s }) {
  const view = s.prefs.projectsView || 'cards';
  const all = visibleProjects(s);
  const proposed = all.filter((p) => p.stage === 'proposed');
  const active = all.filter((p) => (p.stage || 'active') === 'active');
  const stopped = all.filter((p) => p.stage === 'stopped');
  const order = { off_track: 0, at_risk: 1, on_track: 2 };
  active.sort((a, b) => (order[a.health] ?? 3) - (order[b.health] ?? 3));
  return html`<div class="page projects">
    <header class="page-head">
      <div><h1>פרויקטים</h1><p class="sub">${active.length} פעילים${proposed.length ? ` · ${proposed.length} מחכים להחלטה על פתיחה` : ''}${stopped.length ? ` · ${stopped.length} נעצרו` : ''}</p></div>
      <div class="head-actions">
        <${Seg} label="תצוגה" value=${view} onChange=${(v) => setPref('projectsView', v)}
          options=${[{ id: 'cards', label: 'כרטיסים', icon: 'grid' }, { id: 'timeline', label: 'ציר זמן', icon: 'calendar' }]} />
        <button type="button" class="btn btn-primary" onClick=${() => openModal('newproject')}><${Icon} name="plus" size=${16} />פרויקט חדש</button>
      </div>
    </header>
    ${!all.length ? html`<${Empty} title="אין עדיין פרויקטים" icon="folder">פרויקט מרכז החלטות, מטלות ועבודה של Claude סביב יעד אחד. פרויקט חדש נפתח בהחלטה של המפקד.<//>` : null}
    ${all.length && view === 'timeline' ? html`<${Timeline} projects=${[...proposed, ...active]} />` : null}
    ${all.length && view !== 'timeline' ? html`
      ${proposed.length ? html`<section class="psec"><header class="section-head"><h2>מחכים להחלטה על פתיחה</h2><span class="count">${proposed.length}</span></header>
        <div class="proj-grid">${proposed.map((p) => html`<${ProjectCard} key=${p.id} p=${p} />`)}</div></section>` : null}
      ${active.length ? html`<section class="psec">${proposed.length ? html`<header class="section-head"><h2>פעילים</h2><span class="count">${active.length}</span></header>` : null}
        <div class="proj-grid">${active.map((p) => html`<${ProjectCard} key=${p.id} p=${p} />`)}</div></section>` : null}
      ${stopped.length ? html`<details class="stopped"><summary>נעצרו (${stopped.length})</summary>
        <div class="proj-grid">${stopped.map((p) => html`<${ProjectCard} key=${p.id} p=${p} />`)}</div></details>` : null}` : null}
  </div>`;
}

export function NewProjectModal() {
  const s = getState();
  const my = s.auth?.me || '';
  const cmd = commanderOf(s);
  const [name, setName] = useState('');
  const [owner, setOwner] = useState(my);
  const [partners, setPartners] = useState([]);
  const [start, setStart] = useState(today());
  const [budget, setBudget] = useState('6');
  const [desc, setDesc] = useState('');
  const [classified, setClassified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [color] = useState(COLORS[s.projects.length % COLORS.length]);
  const people = humanPeople().filter((p) => p.is_team);
  const toggle = (id) => setPartners(partners.includes(id) ? partners.filter((x) => x !== id) : [...partners, id]);
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    const begin = start || today();
    const p = await createProject({
      name, owner_id: owner || null, partner_ids: partners.filter((x) => x !== owner), description: classified ? null : desc.trim() || null,
      color, start_date: begin, target_date: addDays(begin, Number(budget) * 7), classified,
    });
    setBusy(false);
    if (p) { closeModal(); navigate('#/project/' + p.id); }
  };
  return html`<${Modal} title="פרויקט חדש">
    <form class="form" onSubmit=${submit}>
      <label class="lbl" for="np-name">${classified ? 'שם בלמ״ס לפרויקט' : 'שם הפרויקט'}</label>
      <input id="np-name" class="input" value=${name} onInput=${(e) => setName(e.currentTarget.value)} autoFocus required
        placeholder=${classified ? 'שם שאושר כבלמ״ס' : 'למשל: דוח רבעוני לדרג הבכיר'} />
      <div class="form-2">
        <div><label class="lbl" for="np-owner">מוביל</label>
          <select id="np-owner" class="input" value=${owner} onChange=${(e) => setOwner(e.currentTarget.value)}>
            ${people.map((p) => html`<option value=${p.id}>${p.name}</option>`)}
          </select></div>
        <div><label class="lbl" for="np-start">התחלה</label>
          <input id="np-start" class="input" type="date" value=${start} onChange=${(e) => setStart(e.currentTarget.value)} /></div>
      </div>
      <span class="lbl">שותפים</span>
      <div class="chips-pick" role="group" aria-label="שותפים">
        ${people.filter((p) => p.id !== owner).map((p) => html`<button type="button" key=${p.id} aria-pressed=${partners.includes(p.id) ? 'true' : 'false'}
          class=${'pick-chip' + (partners.includes(p.id) ? ' on' : '')} onClick=${() => toggle(p.id)}><${Avatar} p=${p} size=${18} />${p.name}</button>`)}
      </div>
      <span class="lbl">תקציב זמן</span>
      <${Seg} label="תקציב זמן" value=${budget} onChange=${setBudget} options=${BUDGETS} />
      ${!classified ? html`<label class="lbl" for="np-desc">כוונה בשורה אחת</label>
        <input id="np-desc" class="input" value=${desc} onInput=${(e) => setDesc(e.currentTarget.value)} placeholder="מה ייחשב הצלחה?" />` : null}
      <label class="check-row"><input type="checkbox" checked=${classified} onChange=${(e) => setClassified(e.currentTarget.checked)} />
        <span><b>פרויקט מסווג.</b> כאן יופיעו רק שם בלמ״ס, מוביל ומצב, והפרטים נשארים ברשת המסווגת.</span></label>
      ${cmd && cmd.id !== my ? html`<p class="hint-box"><${Icon} name="decision" size=${15} /><span>הפרויקט ייפתח כמוצע, ו${cmd.name} יקבל כרטיס החלטה על פתיחה.
        עד ההחלטה אפשר לחקור ולתכנן, בלי להוציא כסף ובלי להתחייב לגורם חיצוני.</span></p>` : null}
      <${BlmsNote} />
      <div class="form-actions"><button type="submit" class="btn btn-primary" disabled=${!name.trim() || busy}>${cmd && cmd.id !== my ? 'פתיחה כמוצע' : 'יצירת פרויקט'}</button>
        <button type="button" class="btn" onClick=${closeModal}>ביטול</button></div>
    </form>
  <//>`;
}

function TableView({ tasks, projectId }) {
  const [collapsed, setCollapsed] = useState({ done: true });
  const [addingIn, setAddingIn] = useState(null);
  const checklist = getState().checklist;
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
          ${rows.map((t) => {
            const sub = checklist.filter((c) => c.task_id === t.id);
            return html`<div class=${'tr' + (t._pending ? ' is-pending' : '') + (isClaude(t) ? ' is-claude' : '')} role="row" key=${t.id} onClick=${() => openTask(t.id)}>
              <span class="td-title" role="cell">${t.title}${sub.length ? html`<span class="sub-count">${sub.filter((c) => c.done).length}/${sub.length}</span>` : null}</span>
              <span role="cell"><${OwnerButton} t=${t} size=${24} /></span>
              <span role="cell"><${StatusPill} t=${t} /></span>
              <span role="cell"><${DueButton} t=${t} empty="—" /></span>
              <span role="cell"><${PriorityButton} t=${t} /></span>
              <span role="cell"><${FocusStar} t=${t} /></span>
            </div>`;
          })}
          ${addingIn === st.id
            ? html`<div class="tr add-row"><${QuickAdd} defaults=${{ project_id: projectId, status: st.id }} autoFocus placeholder="מטלה חדשה בקבוצה" onDone=${() => setAddingIn(null)} /></div>`
            : html`<button type="button" class="tr add-btn" onClick=${() => setAddingIn(st.id)}><${Icon} name="plus" size=${15} />הוספה</button>`}
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
          ${rows.map((t) => html`<div class=${'kcard' + (isOverdue(t) ? ' overdue' : '') + (isClaude(t) ? ' is-claude' : '')} key=${t.id} draggable="true"
            onDragStart=${(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; }}
            onClick=${() => openTask(t.id)} role="button" tabindex="0" onKeyDown=${(e) => { if (e.key === 'Enter') openTask(t.id); }}>
            <div class="kcard-title">${isClaude(t) ? html`<${Icon} name="sparkle" size=${13} cls="claude-ic" />` : null}${t.title}</div>
            <div class="kcard-meta">
              <${OwnerButton} t=${t} size=${22} />
              <${DueButton} t=${t} empty="" />
              <span class="grow"></span>
              <${PriorityButton} t=${t} compact />
              <${FocusStar} t=${t} />
            </div>
          </div>`)}
          ${addingIn === st.id
            ? html`<${QuickAdd} defaults=${{ project_id: projectId, status: st.id }} autoFocus placeholder="מטלה חדשה" onDone=${() => setAddingIn(null)} />`
            : html`<button type="button" class="col-add-btn" onClick=${() => setAddingIn(st.id)}><${Icon} name="plus" size=${15} />הוספה</button>`}
        </div>
      </section>`;
    })}
  </div>`;
}

// ---------- the streams: decisions, מטלות, Claude tasks and the project's external commitments ----------
function Streams({ s, p, tasks, skip }) {
  const my = s.auth?.me;
  const [showLog, setShowLog] = useState(false);
  const decisions = s.decisions.filter((d) => d.project_id === p.id && canSee(d, s));
  const open = decisions.filter((d) => d.status === 'open' && d.id !== skip).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const log = decisions.filter((d) => d.status !== 'open').sort((a, b) => (b.decided_at || b.updated_at || '').localeCompare(a.decided_at || a.updated_at || ''));
  const human = tasks.filter((t) => !isClaude(t));
  const claude = tasks.filter(isClaude);
  const humanOpen = human.filter((t) => t.status !== 'done').sort(byUrgency);
  const humanDone = human.filter((t) => t.status === 'done').sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
  const claudeOpen = claude.filter((t) => t.status !== 'done').sort(byUrgency);
  const review = claudeOpen.filter((t) => t.status === 'review').length;
  const commitments = s.commitments.filter((c) => c.project_id === p.id && canSee(c, s));
  const cOpen = commitments.filter((c) => c.status === 'open').sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  return html`<div class="streams">
    <section class="stream">
      <header class="section-head"><h2><${Icon} name="decision" size=${17} />החלטות</h2><span class="count">${open.length}</span>
        <span class="muted small">אנשים מחליטים, Claude מבצע</span><span class="grow"></span>
        <button type="button" class="btn sm" onClick=${() => openModal('decision', { defaults: { project_id: p.id } })}><${Icon} name="plus" size=${14} />החלטה</button></header>
      ${open.length ? html`<div class="dc-grid">${open.map((d) => html`<${DecisionCard} key=${d.id} d=${d} compact showProject=${false} />`)}</div>`
        : html`<p class="none">אין החלטות פתוחות בפרויקט.</p>`}
      ${log.length ? html`<button type="button" class="link sm" onClick=${() => setShowLog(!showLog)}>${showLog ? 'הסתרת יומן ההחלטות' : `יומן ההחלטות (${log.length})`}</button>` : null}
      ${showLog ? html`<div class="rows dlog">${log.map((d) => html`<button type="button" class="dlog-row" key=${d.id} onClick=${() => openModal('decisionView', { id: d.id })}>
        <span class="dlog-date">${d.decided_at ? shortDate(d.decided_at.slice(0, 10)) : ''}</span>
        <span class="dlog-main"><span class="dlog-title">${d.title}</span>
          <span class="dlog-meta">${d.status === 'decided' ? html`<b>${d.chosen_label}</b>` : html`<span class="muted">בוטלה</span>`}${d.rationale ? html`<span class="muted"> · ${d.rationale}</span>` : null}</span></span>
        <span class="dlog-side"><span class="muted small">${person(d.decided_by)?.name || ''}</span></span>
      </button>`)}</div>` : null}
    </section>

    <section class="stream">
      <${Group} title="מטלות" tasks=${humanOpen} showOwner showProject=${false} hint="מה שאדם עושה: פגישה, קובץ, חיבור כלי, הזדהות, תשלום או עבודה אישית">
        <${QuickAdd} defaults=${{ project_id: p.id, owner_id: my }} placeholder=${'מטלה חדשה ב' + p.name + '… (@שם, מחר, !)'} />
      <//>
      ${humanDone.length ? html`<${Group} title="מטלות שהושלמו" tasks=${humanDone} showOwner showProject=${false} collapsedByDefault />` : null}
    </section>

    <section class="stream tone-claude">
      <${Group} title="משימות Claude" tasks=${claudeOpen} showOwner showProject=${false} collapsedByDefault
        hint=${review ? `${review} מחכות לבדיקה` : 'Claude מבצע מטעם אדם אחראי, ורק אדם סוגר'}>
        <${QuickAdd} defaults=${{ kind: 'claude', accountable_id: my, project_id: p.id }} placeholder="משימה ל-Claude… (@שם לאחראי)" />
      <//>
    </section>

    <section class="stream">
      <header class="section-head"><h2><${Icon} name="swap" size=${17} />התחייבויות</h2><span class="count">${cOpen.length}</span>
        <span class="grow"></span>
        <button type="button" class="btn sm" onClick=${() => openModal('commitment', { defaults: { project_id: p.id } })}><${Icon} name="plus" size=${14} />התחייבות</button></header>
      ${cOpen.length ? html`<div class="rows">${cOpen.map((c) => html`<${CommitmentRow} key=${c.id} c=${c} showProject=${false} />`)}</div>`
        : html`<p class="none">אין התחייבויות פתוחות לגורמים מחוץ לצוות.</p>`}
    </section>
  </div>`;
}

// ---------- about the project: intent, the brief for Claude, stakeholders, risks, milestones and links ----------
const newId = () => Math.random().toString(36).slice(2, 10);

function Milestones({ p }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const list = [...(p.milestones || [])].sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  const save = (milestones) => updateProject(p.id, { milestones });
  const add = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    save([...(p.milestones || []), { id: newId(), title: title.trim(), due: due || null, done: false }]);
    setTitle('');
    setDue('');
  };
  const td = today();
  return html`<div class="ms">
    ${list.length ? html`<ul class="ms-list">${list.map((m) => html`<li key=${m.id} class=${m.done ? 'done' : ''}>
      <button type="button" class=${'cbox' + (m.done ? ' on' : '')} role="checkbox" aria-checked=${m.done ? 'true' : 'false'} aria-label=${m.done ? 'סימון כפתוחה' : 'סימון כהושגה'}
        onClick=${() => save((p.milestones || []).map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)))}>${m.done ? html`<${Icon} name="check" size=${13} />` : null}</button>
      <span class="ms-title">${m.title}</span>
      ${m.due ? html`<span class=${'due-chip' + (!m.done && m.due < td ? ' late' : '')}>${shortDate(m.due)}</span>` : null}
      <button type="button" class="icon-btn sm" aria-label="הסרת אבן הדרך" onClick=${() => save((p.milestones || []).filter((x) => x.id !== m.id))}><${Icon} name="x" size=${14} /></button>
    </li>`)}</ul>` : html`<p class="none">עוד אין אבני דרך. אבן הדרך הבאה מופיעה בשורה של הפרויקט בתצוגת הצוות ובפגישה.</p>`}
    <form class="ms-add" onSubmit=${add}>
      <input class="input" value=${title} onInput=${(e) => setTitle(e.currentTarget.value)} placeholder="אבן דרך חדשה" aria-label="אבן דרך חדשה" />
      <input class="input date" type="date" value=${due} onChange=${(e) => setDue(e.currentTarget.value)} aria-label="מועד אבן הדרך" />
      <button type="submit" class="btn sm" disabled=${!title.trim()}>הוספה</button>
    </form>
  </div>`;
}

function Links({ p }) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const links = p.links || [];
  const add = (e) => {
    e.preventDefault();
    let u = url.trim();
    if (!u) return;
    if (!/^https?:\/\//.test(u)) u = 'https://' + u;
    updateProject(p.id, { links: [...links, { id: newId(), label: label.trim() || null, url: u }] });
    setLabel('');
    setUrl('');
  };
  return html`<div class="links">
    ${links.length ? html`<ul class="link-list">${links.map((k, i) => html`<li key=${k.id || i}>
      <a href=${k.url} target="_blank" rel="noopener noreferrer"><${Icon} name="link" size=${14} />${k.label || k.url.replace(/^https?:\/\//, '').slice(0, 60)}</a>
      <button type="button" class="icon-btn sm" aria-label="הסרת הקישור" onClick=${() => updateProject(p.id, { links: links.filter((_, j) => j !== i) })}><${Icon} name="x" size=${14} /></button>
    </li>`)}</ul>` : null}
    <form class="link-add" onSubmit=${add}>
      <input class="input" value=${label} onInput=${(e) => setLabel(e.currentTarget.value)} placeholder="שם (לא חובה)" aria-label="שם הקישור" />
      <input class="input" value=${url} onInput=${(e) => setUrl(e.currentTarget.value)} placeholder="כתובת: מאגר, מסמך, תיקייה" aria-label="כתובת הקישור" dir="ltr" />
      <button type="submit" class="btn sm" disabled=${!url.trim()}>הוספה</button>
    </form>
  </div>`;
}

function About({ s, p }) {
  const creator = person(p.created_by);
  const markClassified = () => updateProject(p.id, { classified: true, description: null, brief: null, stakeholders: null, risks: null, links: [] });
  return html`<div class="about">
    ${p.classified ? html`<section class="about-sec"><p class="classified-box"><${Icon} name="lock" size=${16} /><span>
        <b>פרויקט מסווג.</b> כאן מופיעים רק השם הבלמ״סי, המוביל, המצב ואבני הדרך. הכוונה, התדריך ושאר הפרטים נשארים ברשת המסווגת.</span></p></section>`
      : html`
      <section class="about-sec">
        <h3>כוונה</h3>
        <${AutoText} cls="field-text" rows=${2} value=${p.description} label="כוונה" placeholder="מה ייחשב הצלחה, בשורה או שתיים"
          onSave=${(v) => updateProject(p.id, { description: v.trim() || null })} />
      </section>
      <section class="about-sec">
        <h3><${Icon} name="sparkle" size=${15} />תדריך ל-Claude</h3>
        <p class="muted small">מה Claude צריך לדעת כדי לעבוד על הפרויקט: מטרה, מה כבר הוחלט, אילוצים ואיפה החומרים. נכנס ל"העתקה ל-Claude", ובהמשך גם למחבר.</p>
        <${AutoText} cls="field-text" rows=${4} value=${p.brief} label="תדריך ל-Claude" placeholder="למשל: הכלי משרת ארבעה אנשים. עובדים בעברית. המאגר נמצא ב…"
          onSave=${(v) => updateProject(p.id, { brief: v.trim() || null })} />
        <div><button type="button" class="btn sm" onClick=${() => copyText(projectBrief(p), 'הפרויקט הועתק. אפשר להדביק בשיחה עם Claude.')}><${Icon} name="copy" size=${14} />העתקת הפרויקט ל-Claude</button></div>
      </section>
      <section class="about-sec">
        <h3>לקוח ובעלי עניין</h3>
        <${AutoText} cls="field-text" rows=${2} value=${p.stakeholders} label="לקוח ובעלי עניין" placeholder="למי זה, ומי עוד צריך לדעת"
          onSave=${(v) => updateProject(p.id, { stakeholders: v.trim() || null })} />
      </section>
      <section class="about-sec">
        <h3>סיכונים</h3>
        <${AutoText} cls="field-text" rows=${2} value=${p.risks} label="סיכונים" placeholder="מה עלול להשתבש, ומה עושים לגבי זה"
          onSave=${(v) => updateProject(p.id, { risks: v.trim() || null })} />
      </section>`}
    <section class="about-sec">
      <h3><${Icon} name="flag" size=${15} />אבני דרך</h3>
      <${Milestones} p=${p} />
    </section>
    ${!p.classified ? html`<section class="about-sec">
      <h3><${Icon} name="link" size=${15} />קישורים</h3>
      <${Links} p=${p} />
    </section>` : null}
    <section class="about-sec">
      <h3><${Icon} name="lock" size=${15} />פרויקט מסווג</h3>
      ${p.classified
        ? html`<div><button type="button" class="btn sm" onClick=${() => updateProject(p.id, { classified: false })}>ביטול הסימון כמסווג</button></div>`
        : html`<p class="muted small">כשחלק מהעבודה מסווג, הפרויקט מופיע כאן רק בשם בלמ״ס, עם מוביל ומצב. הסימון מוחק מהכלי את הכוונה, התדריך, בעלי העניין, הסיכונים והקישורים.</p>
          <div><${ConfirmButton} label="סימון כמסווג" confirm="למחוק את הפרטים ולסמן כמסווג?" cls="btn sm" onConfirm=${markClassified} /></div>`}
    </section>
    <${BlmsNote} />
    <p class="meta-foot">${creator ? `נפתח על ידי ${creator.name} · ` : ''}${p.created_at ? timeAgo(p.created_at) : ''}${p.updated_at ? ` · עודכן ${timeAgo(p.updated_at)}` : ''}</p>
  </div>`;
}

// The banner at the top of a project that is proposed, stopped, or has a stop request waiting.
function StageBanner({ s, p, gate }) {
  const cmd = isCommand(s);
  const commander = commanderOf(s);
  const stage = p.stage || 'active';
  const ask = () => createDecision({
    project_id: p.id, kind: 'gate', title: `לפתוח את הפרויקט "${p.name}"?`, assignee_id: commander?.id || null,
    options: gateOptions('open'), flagged: !!p.flagged,
  }, { guard: false });
  if (stage === 'proposed') {
    return html`<section class="stage-banner s-proposed">
      <p class="sb-text"><${Icon} name="decision" size=${17} /><span><b>מוצע.</b> ${gate ? `מחכה להחלטה של ${person(gate.assignee_id)?.name || 'המפקד'} על פתיחה.` : 'עוד לא נשלח כרטיס החלטה על פתיחה.'}
        עד ההחלטה אפשר לחקור ולתכנן, בלי להוציא כסף ובלי להתחייב לגורם חיצוני.</span></p>
      ${gate ? html`<${DecisionCard} d=${gate} showProject=${false} />`
        : cmd ? html`<div><button type="button" class="btn btn-primary sm" onClick=${() => setProjectStage(p, 'open')}>לפתוח את הפרויקט</button></div>`
        : html`<div><button type="button" class="btn sm" onClick=${ask}>שליחת כרטיס פתיחה ל${commander?.name || 'מפקד'}</button></div>`}
    </section>`;
  }
  if (stage === 'stopped') {
    return html`<section class="stage-banner s-stopped">
      <p class="sb-text"><${Icon} name="octagon" size=${17} /><span><b>הפרויקט נעצר.</b> הוא לא מופיע בתצוגת הצוות ובפגישה, וההיסטוריה שלו נשמרת.</span></p>
      ${cmd ? html`<div><${ConfirmButton} label="לפתוח מחדש" confirm="לפתוח את הפרויקט מחדש?" cls="btn sm" onConfirm=${() => setProjectStage(p, 'open')} /></div>` : null}
    </section>`;
  }
  if (gate) {
    return html`<section class="stage-banner s-stop-ask">
      <p class="sb-text"><${Icon} name="decision" size=${17} /><span><b>החלטה על המשך הפרויקט</b> מחכה ל${person(gate.assignee_id)?.name || 'מפקד'}.</span></p>
      <${DecisionCard} d=${gate} showProject=${false} />
    </section>`;
  }
  return null;
}

export function ProjectPage({ s, id }) {
  const p = s.projects.find((x) => x.id === id);
  if (!p || !canSee(p, s)) {
    return html`<div class="page"><${Empty} title="הפרויקט לא נמצא" icon="folder">ייתכן שהוא הועבר לארכיון. <a href="#/projects">חזרה לפרויקטים</a><//></div>`;
  }
  const cmd = isCommand(s);
  const tasks = visibleTasks(s).filter((t) => t.project_id === p.id && canSee(t, s));
  const x = projectSummary(p, s);
  const tab = s.prefs.projectTab || 'streams';
  const stage = p.stage || 'active';
  const gate = s.decisions.find((d) => d.project_id === p.id && d.kind === 'gate' && d.status === 'open' && canSee(d, s));
  const lead = person(p.owner_id);
  const partners = (p.partner_ids || []).map(person).filter(Boolean);
  const b = budgetOf(p);
  const pickLead = (e) => pickPerson(e.currentTarget, { selected: p.owner_id, onPick: (pid) => pid && updateProject(p.id, {
    owner_id: pid, partner_ids: (p.partner_ids || []).filter((q) => q !== pid),
  }) });
  const pickPartners = (e) => openMenu(e.currentTarget, humanPeople().filter((q) => q.is_team && q.id !== p.owner_id).map((q) => ({
    id: q.id, label: q.name, person: q, icon: (p.partner_ids || []).includes(q.id) ? 'check' : undefined,
  })), (pid) => {
    const cur = p.partner_ids || [];
    updateProject(p.id, { partner_ids: cur.includes(pid) ? cur.filter((q) => q !== pid) : [...cur, pid] });
  });
  const pickBudget = (e) => openMenu(e.currentTarget, BUDGETS.map((o) => ({ id: o.id, label: o.label })), (w) => {
    const begin = p.start_date || today();
    updateProject(p.id, { start_date: begin, target_date: addDays(begin, Number(w) * 7) });
  }, b ? String(b.weeks) : null);
  const more = (e) => {
    const items = [{ id: 'copy', label: 'העתקה ל-Claude', icon: 'copy' }];
    if (cmd && stage === 'proposed') items.push({ id: 'open', label: 'לפתוח את הפרויקט', icon: 'check' });
    if (cmd && stage === 'active') items.push({ id: 'stop', label: 'לעצור את הפרויקט', icon: 'octagon' });
    if (cmd && stage === 'stopped') items.push({ id: 'open', label: 'לפתוח מחדש', icon: 'undo' });
    if (!cmd && stage === 'active' && !gate) items.push({ id: 'askStop', label: 'לבקש לעצור את הפרויקט', icon: 'octagon' });
    if (!p.flagged) items.push({ id: 'flag', label: 'סימון כחשוד במידע מסווג', icon: 'alert' });
    items.push({ id: 'archive', label: 'העברה לארכיון', icon: 'trash', danger: true });
    openMenu(e.currentTarget, items, (k) => {
      if (k === 'copy') copyText(projectBrief(p), 'הפרויקט הועתק. אפשר להדביק בשיחה עם Claude.');
      if (k === 'open') setProjectStage(p, 'open');
      if (k === 'stop') setProjectStage(p, 'stop');
      if (k === 'askStop') requestStop(p);
      if (k === 'flag') { flagItem('project', p.id); if (!cmd) navigate('#/projects'); }
      if (k === 'archive') { archiveProject(p.id); navigate('#/projects'); }
    });
  };
  const tabs = [
    { id: 'streams', label: 'זרמים', icon: 'list' },
    { id: 'table', label: 'טבלה', icon: 'table' },
    { id: 'kanban', label: 'קנבן', icon: 'kanban' },
    { id: 'about', label: 'על הפרויקט', icon: 'file' },
  ];
  return html`<div class=${'page project st-' + stage}>
    <a class="back" href="#/projects"><${Icon} name="chevronRight" size=${16} />פרויקטים</a>
    ${p.flagged ? html`<${FlagBar} kind="project" id=${p.id} />` : null}
    <header class="proj-head">
      <span class="pcard-icon lg" style=${`background:${p.color || 'var(--accent)'}`}>${p.name.slice(0, 1)}</span>
      <div class="proj-head-main">
        <div class="proj-title-row"><${InlineText} cls="h1" value=${p.name} placeholder="שם הפרויקט" onSave=${(v) => v && updateProject(p.id, { name: v })} />
          ${stage !== 'active' ? html`<${StageChip} stage=${stage} />` : null}
          ${p.classified ? html`<span class="stage-chip s-classified"><${Icon} name="lock" size=${12} />מסווג</span>` : null}</div>
        ${p.classified ? html`<p class="desc muted">הפרטים ברשת המסווגת.</p>`
          : html`<${InlineText} cls="desc" value=${p.description} placeholder="כוונה בשורה אחת: מה ייחשב הצלחה?" onSave=${(v) => updateProject(p.id, { description: v || null })} />`}
      </div>
      <button type="button" class="icon-btn" aria-label="אפשרויות לפרויקט" onClick=${more}><${Icon} name="more" /></button>
    </header>

    <${StageBanner} s=${s} p=${p} gate=${gate} />

    <div class="proj-facts">
      ${stage === 'active' ? html`<div class="fact"><span class="fact-l">מצב</span><${HealthPill} p=${p} onPick=${(h) => updateProject(p.id, { health: h })} /></div>` : null}
      <div class="fact wide"><span class="fact-l">שורת מצב</span><${InlineText} value=${p.health_note} placeholder="משפט אחד: איפה הפרויקט עומד" onSave=${(v) => updateProject(p.id, { health_note: v || null })} /></div>
      <div class="fact"><span class="fact-l">מוביל</span><button type="button" class="owner-btn" onClick=${pickLead} aria-label=${'מוביל: ' + (lead?.name || 'ללא')}><${Avatar} p=${lead} size=${22} /><span class="owner-name">${lead?.name || 'ללא'}</span></button></div>
      <div class="fact"><span class="fact-l">שותפים</span><button type="button" class="owner-btn faces-btn" onClick=${pickPartners} aria-label="שותפים בפרויקט">
        ${partners.length ? partners.map((q) => html`<${Avatar} key=${q.id} p=${q} size=${22} />`) : html`<span class="owner-name muted">הוספה</span>`}</button></div>
      <div class="fact"><span class="fact-l">התחלה</span><${DueButton} t=${p} field="start_date" empty="בלי תאריך" label="תאריך התחלה" late=${false} onSave=${(v) => updateProject(p.id, { start_date: v })} /></div>
      <div class="fact"><span class="fact-l">תקציב זמן</span><button type="button" class=${'field-btn' + (b && b.left < 0 && stage === 'active' ? ' late-text' : '')} onClick=${pickBudget}>
        ${b ? `${weeksWord(b.weeks)} · ${b.text}` : html`<span class="muted">לקבוע</span>`}</button></div>
      <div class="fact"><span class="fact-l">יעד</span><${DueButton} t=${p} field="target_date" empty="בלי יעד" label="תאריך יעד" late=${!!(p.target_date && p.target_date < today() && stage === 'active')} onSave=${(v) => updateProject(p.id, { target_date: v })} /></div>
      ${x.nextMilestone ? html`<div class="fact"><span class="fact-l">הבא</span><span class="fact-v">${x.nextMilestone.title}${x.nextMilestone.due ? ` · ${shortDate(x.nextMilestone.due)}` : ''}</span></div>` : null}
      ${x.total ? html`<div class="fact"><span class="fact-l">התקדמות</span><span class="fact-prog"><${Progress} value=${x.done} total=${x.total} />${x.done}/${x.total}</span></div>` : null}
    </div>

    <div class="view-bar">
      <${Seg} label="תצוגת הפרויקט" value=${tab} onChange=${(v) => setPref('projectTab', v)} options=${tabs} />
      <span class="muted">${x.decisions.length ? `${x.decisions.length} החלטות פתוחות · ` : ''}${x.human} מטלות · ${x.claude} משימות Claude${x.lateCommitments ? ` · ${x.lateCommitments} התחייבויות באיחור` : ''}</span>
    </div>
    ${tab === 'streams' ? html`<${Streams} s=${s} p=${p} tasks=${tasks} skip=${gate?.id} />` : null}
    ${tab === 'table' ? html`<${TableView} tasks=${tasks} projectId=${p.id} />` : null}
    ${tab === 'kanban' ? html`<${KanbanView} tasks=${tasks} projectId=${p.id} />` : null}
    ${tab === 'about' ? html`<${About} s=${s} p=${p} />` : null}
  </div>`;
}

