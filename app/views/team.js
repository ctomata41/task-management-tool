// "לוח צוות": one column per team member with their open work, most urgent first.
import { useState } from 'preact/hooks';
import { visibleTasks, team, openTask } from '../store.js';
import { html, Icon, Avatar, StatusPill, DueButton, ProjectChip, FocusStar } from '../ui.js';
import { QuickAdd } from '../quickadd.js';
import { TeamSwitch } from './daily.js';
import { byUrgency, isOverdue, isStuck } from '../util.js';

function Card({ t }) {
  return html`<div class=${'kcard' + (isOverdue(t) ? ' overdue' : '')} onClick=${() => openTask(t.id)} role="button" tabindex="0"
    onKeyDown=${(e) => { if (e.key === 'Enter') openTask(t.id); }}>
    <div class="kcard-title">${t.title}</div>
    <div class="kcard-meta">
      <${StatusPill} t=${t} size="sm" />
      <${DueButton} t=${t} empty="" />
      <span class="grow"></span>
      <${FocusStar} t=${t} />
    </div>
    ${t.project_id ? html`<div class="kcard-proj"><${ProjectChip} id=${t.project_id} /></div>` : null}
  </div>`;
}

export function Team({ s }) {
  const tasks = visibleTasks(s).filter((t) => t.status !== 'done');
  const people = team();
  const [adding, setAdding] = useState(null);
  const unassigned = tasks.filter((t) => !t.owner_id || !s.people.some((p) => p.id === t.owner_id && p.is_team));
  return html`<div class="page team">
    <header class="page-head"><div><h1>לוח צוות</h1><p class="sub">כל המשימות הפתוחות, לפי אחראי. הדחוף ביותר למעלה.</p></div>
      <${TeamSwitch} on="team" /></header>
    <div class="board">
      ${people.map((p) => {
        const mine = tasks.filter((t) => t.owner_id === p.id).sort(byUrgency);
        const od = mine.filter(isOverdue).length;
        const st = mine.filter(isStuck).length;
        return html`<section class="col" key=${p.id}>
          <header class="col-head">
            <${Avatar} p=${p} size=${30} />
            <div class="col-who"><strong>${p.name}</strong><span class="muted">${p.role || ''}</span></div>
            <span class="count">${mine.length}</span>
          </header>
          ${od || st ? html`<div class="col-flags">${od ? html`<span class="badge bad">${od} באיחור</span>` : null}${st ? html`<span class="badge warn">${st} תקועות</span>` : null}</div>` : null}
          <div class="col-body">
            ${mine.map((t) => html`<${Card} key=${t.id} t=${t} />`)}
            ${!mine.length ? html`<p class="col-empty">אין משימות פתוחות</p>` : null}
          </div>
          ${adding === p.id
            ? html`<div class="col-add"><${QuickAdd} defaults=${{ owner_id: p.id }} placeholder=${'משימה ל' + p.name} autoFocus onDone=${() => setAdding(null)} /></div>`
            : html`<button type="button" class="col-add-btn" onClick=${() => setAdding(p.id)}><${Icon} name="plus" size=${16} />משימה ל${p.name}</button>`}
        </section>`;
      })}
      ${unassigned.length ? html`<section class="col">
        <header class="col-head"><span class="avatar" data-empty="" style="width:30px;height:30px"></span>
          <div class="col-who"><strong>אחרים / ללא אחראי</strong><span class="muted">כולל Claude ואנשים מחוץ לצוות</span></div>
          <span class="count">${unassigned.length}</span></header>
        <div class="col-body">${unassigned.sort(byUrgency).map((t) => html`<${Card} key=${t.id} t=${t} />`)}</div>
      </section>` : null}
    </div>
  </div>`;
}
