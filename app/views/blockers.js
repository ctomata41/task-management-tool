// "חסמים": everything stuck, waiting on someone, or late, so it can be cleared fast.
import { useState } from 'preact/hooks';
import { visibleTasks, person, updateTask, openTask } from '../store.js';
import { html, Icon, Avatar, StatusPill, ProjectChip, DueButton, Empty } from '../ui.js';
import { isOverdue, byUrgency } from '../util.js';
import { stuckSince } from './overview.js';

function BlockCard({ t, s }) {
  const owner = person(t.owner_id);
  const by = person(t.blocked_by_person);
  const d = stuckSince(t, s.activity);
  return html`<article class="bcard" onClick=${() => openTask(t.id)} role="button" tabindex="0">
    <div class="bcard-top">
      <${StatusPill} t=${t} size="sm" />
      <span class=${'days' + (d >= 2 ? ' bad' : '')}>${d === 0 ? 'מהיום' : `${d} ימים`}</span>
    </div>
    <h3 class="bcard-title">${t.title}</h3>
    ${t.blocked_reason ? html`<p class="bcard-reason">${t.blocked_reason}</p>` : html`<p class="bcard-reason muted">לא צוינה סיבה</p>`}
    <div class="bcard-who">
      <span><${Avatar} p=${owner} size=${22} />${owner?.name || 'ללא אחראי'}</span>
      ${by ? html`<span class="arrow">מחכה ל־</span><span><${Avatar} p=${by} size=${22} />${by.name}</span>` : null}
    </div>
    <div class="bcard-foot">
      ${t.project_id ? html`<${ProjectChip} id=${t.project_id} />` : html`<span></span>`}
      <button type="button" class="btn sm" onClick=${(e) => { e.stopPropagation(); updateTask(t.id, { status: 'in_progress' }); }}>
        <${Icon} name="unlock" size=${15} />שוחרר</button>
    </div>
  </article>`;
}

export function Blockers({ s }) {
  const my = s.auth?.me;
  const [filter, setFilter] = useState('all');
  let open = visibleTasks(s).filter((t) => t.status !== 'done');
  if (filter === 'me') open = open.filter((t) => t.blocked_by_person === my || t.owner_id === my);
  const blocked = open.filter((t) => t.status === 'blocked');
  const waiting = open.filter((t) => t.status === 'waiting');
  const overdue = open.filter((t) => isOverdue(t) && t.status !== 'blocked' && t.status !== 'waiting').sort(byUrgency);
  const sortStuck = (a, b) => stuckSince(b, s.activity) - stuckSince(a, s.activity);
  return html`<div class="page blockers">
    <header class="page-head">
      <div><h1>חסמים</h1><p class="sub">מה תקוע, על מי מחכים, ומה באיחור. משחררים חסם בלחיצה.</p></div>
      <div class="seg">
        <button type="button" class=${filter === 'all' ? 'on' : ''} onClick=${() => setFilter('all')}>כל הצוות</button>
        <button type="button" class=${filter === 'me' ? 'on' : ''} onClick=${() => setFilter('me')}>קשורים אליי</button>
      </div>
    </header>
    <section class="bsec">
      <h2><span class="dot" style="background:var(--s-blocked)"></span>תקועות <span class="count">${blocked.length}</span></h2>
      ${blocked.length ? html`<div class="bgrid">${blocked.sort(sortStuck).map((t) => html`<${BlockCard} key=${t.id} t=${t} s=${s} />`)}</div>`
        : html`<p class="none">אין משימות תקועות.</p>`}
    </section>
    <section class="bsec">
      <h2><span class="dot" style="background:var(--s-waiting)"></span>ממתינות לאחר <span class="count">${waiting.length}</span></h2>
      ${waiting.length ? html`<div class="bgrid">${waiting.sort(sortStuck).map((t) => html`<${BlockCard} key=${t.id} t=${t} s=${s} />`)}</div>`
        : html`<p class="none">אף משימה לא מחכה לאחרים.</p>`}
    </section>
    <section class="bsec">
      <h2><span class="dot" style="background:var(--p-high)"></span>באיחור <span class="count">${overdue.length}</span></h2>
      ${overdue.length ? html`<div class="rows">${overdue.map((t) => html`<div class="orow" key=${t.id} onClick=${() => openTask(t.id)} role="button" tabindex="0">
          <${StatusPill} t=${t} size="sm" /><span class="orow-title">${t.title}</span>
          <span class="orow-who"><${Avatar} p=${person(t.owner_id)} size=${22} />${person(t.owner_id)?.name || ''}</span>
          <${DueButton} t=${t} />
        </div>`)}</div>`
        : html`<p class="none">אין משימות באיחור.</p>`}
    </section>
    ${!blocked.length && !waiting.length && !overdue.length ? html`<${Empty} title="הדרך פנויה" icon="check">אין חסמים ואין איחורים כרגע.<//>` : null}
  </div>`;
}
