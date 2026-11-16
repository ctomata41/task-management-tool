// "לוח צוות": the team's open work, one column per project (spec, round 3: the team view is arranged by project and never
// counts per person). Claude tasks stay hidden unless someone turns them on.
import { useState } from 'preact/hooks';
import { visibleTasks, openTask, setPref, person } from '../store.js';
import { html, Icon, StatusPill, DueButton, FocusStar, HealthPill, OwnerButton } from '../ui.js';
import { QuickAdd } from '../quickadd.js';
import { TeamSwitch } from './daily.js';
import { liveProjects, isClaude, canSee, STAGE } from '../model.js';
import { byUrgency, isOverdue } from '../util.js';

function Card({ t }) {
  return html`<div class=${'kcard' + (isOverdue(t) ? ' overdue' : '') + (isClaude(t) ? ' is-claude' : '')} onClick=${() => openTask(t.id)} role="button" tabindex="0"
    onKeyDown=${(e) => { if (e.key === 'Enter') openTask(t.id); }}>
    <div class="kcard-title">${isClaude(t) ? html`<${Icon} name="sparkle" size=${13} cls="claude-ic" />` : null}${t.title}</div>
    <div class="kcard-meta">
      <${StatusPill} t=${t} size="sm" />
      <${DueButton} t=${t} empty="" />
      <span class="grow"></span>
      <${FocusStar} t=${t} />
      <${OwnerButton} t=${t} size=${22} />
    </div>
  </div>`;
}

function Column({ p, tasks, adding, setAdding }) {
  const key = p ? p.id : 'none';
  const lead = p && person(p.owner_id);
  const stage = p?.stage || 'active';
  return html`<section class="col">
    <header class="col-head">
      ${p ? html`<span class="pcard-icon" style=${`background:${p.color || 'var(--accent)'}`}>${p.name.slice(0, 1)}</span>`
        : html`<span class="pcard-icon none"><${Icon} name="user" size=${16} /></span>`}
      <div class="col-who">${p ? html`<a href=${'#/project/' + p.id}><strong>${p.name}</strong></a>` : html`<strong>בלי פרויקט</strong>`}
        <span class="muted">${p ? (lead ? `מוביל: ${lead.name}` : '') : 'מטלות אישיות וכלליות'}</span></div>
      ${p ? (stage === 'active' ? html`<${HealthPill} p=${p} />` : html`<span class=${'stage-chip s-' + stage}>${STAGE[stage].label}</span>`) : null}
    </header>
    ${p?.health_note ? html`<p class="col-note">${p.health_note}</p>` : null}
    <div class="col-body">
      ${tasks.map((t) => html`<${Card} key=${t.id} t=${t} />`)}
      ${!tasks.length ? html`<p class="col-empty">אין עבודה פתוחה</p>` : null}
    </div>
    ${adding === key
      ? html`<div class="col-add"><${QuickAdd} defaults=${p ? { project_id: p.id } : {}} placeholder="מטלה חדשה… (@שם, מחר, !)" autoFocus onDone=${() => setAdding(null)} /></div>`
      : html`<button type="button" class="col-add-btn" onClick=${() => setAdding(key)}><${Icon} name="plus" size=${16} />מטלה${p ? ' בפרויקט' : ''}</button>`}
  </section>`;
}

export function Team({ s }) {
  const showClaude = !!s.prefs.showClaude;
  const [adding, setAdding] = useState(null);
  const projects = liveProjects(s);
  const ids = new Set(projects.map((p) => p.id));
  const open = visibleTasks(s).filter((t) => t.status !== 'done' && canSee(t, s) && (showClaude || !isClaude(t)));
  const byProject = (pid) => open.filter((t) => t.project_id === pid).sort(byUrgency);
  const loose = open.filter((t) => !t.project_id || !ids.has(t.project_id)).sort(byUrgency);
  const claudeN = visibleTasks(s).filter((t) => t.status !== 'done' && isClaude(t) && canSee(t, s)).length;
  return html`<div class="page team">
    <header class="page-head"><div><h1>לוח צוות</h1><p class="sub">כל העבודה הפתוחה, לפי פרויקט. הדחוף ביותר למעלה.</p></div>
      <div class="head-actions">
        <button type="button" class=${'btn sm' + (showClaude ? ' on' : '')} aria-pressed=${showClaude ? 'true' : 'false'} onClick=${() => setPref('showClaude', !showClaude)}>
          <${Icon} name="sparkle" size=${15} />${showClaude ? 'הסתרת משימות Claude' : `משימות Claude${claudeN ? ` (${claudeN})` : ''}`}</button>
        <${TeamSwitch} on="team" />
      </div></header>
    <div class="board">
      ${projects.map((p) => html`<${Column} key=${p.id} p=${p} tasks=${byProject(p.id)} adding=${adding} setAdding=${setAdding} />`)}
      <${Column} p=${null} tasks=${loose} adding=${adding} setAdding=${setAdding} />
    </div>
  </div>`;
}
