// "חסמים": everything stuck, waiting on someone, or late, so it can be cleared fast. A blocker goes straight to whoever can
// release it (spec), and its age is counted in workdays.
import { useState } from 'preact/hooks';
import { visibleTasks, person, updateTask, openTask } from '../store.js';
import { html, Icon, Avatar, StatusPill, ProjectChip, DueButton, Empty, AgeChip, Seg } from '../ui.js';
import { TeamSwitch } from './daily.js';
import { since, canSee, answerer, isClaude } from '../model.js';
import { isOverdue, byUrgency } from '../util.js';

function BlockCard({ t, s }) {
  const owner = person(answerer(t));
  const by = person(t.blocked_by_person);
  return html`<article class="bcard" onClick=${() => openTask(t.id)} role="button" tabindex="0" onKeyDown=${(e) => { if (e.key === 'Enter') openTask(t.id); }}>
    <div class="bcard-top">
      <${StatusPill} t=${t} size="sm" />
      <${AgeChip} at=${since(t, ['blocked', 'waiting'], s)} prefix="תקוע" />
    </div>
    <h3 class="bcard-title">${isClaude(t) ? html`<${Icon} name="sparkle" size=${13} cls="claude-ic" />` : null}${t.title}</h3>
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
  let open = visibleTasks(s).filter((t) => t.status !== 'done' && canSee(t, s));
  if (filter === 'me') open = open.filter((t) => t.blocked_by_person === my || answerer(t) === my);
  const at = (t) => new Date(since(t, ['blocked', 'waiting'], s)).getTime();
  const oldest = (a, b) => at(a) - at(b);
  const blocked = open.filter((t) => t.status === 'blocked').sort(oldest);
  const waiting = open.filter((t) => t.status === 'waiting').sort(oldest);
  const overdue = open.filter((t) => isOverdue(t) && t.status !== 'blocked' && t.status !== 'waiting').sort(byUrgency);
  return html`<div class="page blockers">
    <header class="page-head">
      <div><h1>חסמים</h1><p class="sub">מה תקוע, על מי מחכים ומה באיחור. משחררים בלחיצה, והוותיק ביותר ראשון.</p></div>
      <div class="head-actions">
        <${Seg} label="של מי" value=${filter} onChange=${setFilter} options=${[{ id: 'all', label: 'כל הצוות' }, { id: 'me', label: 'קשורים אליי' }]} />
        <${TeamSwitch} on="blockers" />
      </div>
    </header>
    <section class="bsec">
      <h2><span class="dot" style="background:var(--s-blocked)"></span>תקועות <span class="count">${blocked.length}</span></h2>
      ${blocked.length ? html`<div class="bgrid">${blocked.map((t) => html`<${BlockCard} key=${t.id} t=${t} s=${s} />`)}</div>`
        : html`<p class="none">שום דבר לא תקוע.</p>`}
    </section>
    <section class="bsec">
      <h2><span class="dot" style="background:var(--s-waiting)"></span>ממתינות לאחר <span class="count">${waiting.length}</span></h2>
      ${waiting.length ? html`<div class="bgrid">${waiting.map((t) => html`<${BlockCard} key=${t.id} t=${t} s=${s} />`)}</div>`
        : html`<p class="none">שום דבר לא מחכה לאחרים.</p>`}
    </section>
    <section class="bsec">
      <h2><span class="dot" style="background:var(--p-high)"></span>באיחור <span class="count">${overdue.length}</span></h2>
      ${overdue.length ? html`<div class="rows">${overdue.map((t) => html`<div class="orow" key=${t.id} onClick=${() => openTask(t.id)} role="button" tabindex="0"
          onKeyDown=${(e) => { if (e.key === 'Enter') openTask(t.id); }}>
          <${StatusPill} t=${t} size="sm" /><span class="orow-title">${t.title}</span>
          <span class="orow-who"><${Avatar} p=${person(answerer(t))} size=${22} />${person(answerer(t))?.name || ''}</span>
          <${DueButton} t=${t} />
        </div>`)}</div>`
        : html`<p class="none">שום דבר לא באיחור.</p>`}
    </section>
    ${!blocked.length && !waiting.length && !overdue.length ? html`<${Empty} title="הדרך פנויה" icon="check">אין חסמים ואין איחורים כרגע.<//>` : null}
  </div>`;
}
