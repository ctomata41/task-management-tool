// "המשימות שלי": a personal to-do list grouped by when things are due.
import { useState } from 'preact/hooks';
import { visibleTasks, me } from '../store.js';
import { html, Icon, TaskRow, Empty } from '../ui.js';
import { QuickAdd } from '../quickadd.js';
import { today, weekEnd, weekStart, ymd, byUrgency, isOverdue, longDate } from '../util.js';

function Group({ title, tasks, tone, collapsedByDefault, showOwner = false, hint }) {
  const [open, setOpen] = useState(!collapsedByDefault);
  if (!tasks.length) return null;
  return html`<section class=${'group' + (tone ? ' ' + tone : '')}>
    <button type="button" class="group-head" aria-expanded=${open ? 'true' : 'false'} onClick=${() => setOpen(!open)}>
      <${Icon} name="chevronDown" size=${16} cls=${open ? '' : 'rot'} />
      <h2>${title}</h2><span class="count">${tasks.length}</span>
      ${hint ? html`<span class="group-hint">${hint}</span>` : null}
    </button>
    ${open ? html`<div class="rows">${tasks.map((t) => html`<${TaskRow} key=${t.id} t=${t} showOwner=${showOwner} />`)}</div>` : null}
  </section>`;
}

export function Mine({ s }) {
  const my = s.auth?.me;
  const all = visibleTasks(s);
  const mine = all.filter((t) => t.owner_id === my);
  const open = mine.filter((t) => t.status !== 'done').sort(byUrgency);
  const td = today();
  const we = weekEnd();
  const focus = open.filter((t) => t.focus);
  const rest = open.filter((t) => !t.focus);
  const overdue = rest.filter(isOverdue);
  const dueToday = rest.filter((t) => t.due === td);
  const week = rest.filter((t) => t.due && t.due > td && t.due <= we);
  const later = rest.filter((t) => t.due && t.due > we);
  const noDate = rest.filter((t) => !t.due);
  const waitingOnMe = all.filter((t) => t.status !== 'done' && t.blocked_by_person === my && t.owner_id !== my);
  const ws = weekStart();
  const doneWeek = mine.filter((t) => t.status === 'done' && t.done_at && ymd(new Date(t.done_at)) >= ws);
  const m = me();

  return html`<div class="page mine">
    <header class="page-head">
      <div><p class="eyebrow">${longDate()}</p><h1>המשימות שלי</h1></div>
      <div class="head-stats">
        <span><b>${open.length}</b> פתוחות</span>
        ${overdue.length ? html`<span class="bad"><b>${overdue.length}</b> באיחור</span>` : null}
        <span><b>${doneWeek.length}</b> הושלמו השבוע</span>
      </div>
    </header>
    <${QuickAdd} defaults=${{ owner_id: my }} />

    <${Group} title="מחכים לך" tone="tone-wait" tasks=${waitingOnMe} showOwner hint="משימות של אחרים שתקועות עליך" />
    <${Group} title="בפוקוס" tone="tone-focus" tasks=${focus} hint=${focus.length > 3 ? 'יותר מ-3 בפוקוס זה כבר לא פוקוס' : ''} />
    <${Group} title="באיחור" tone="tone-bad" tasks=${overdue} />
    <${Group} title="היום" tasks=${dueToday} />
    <${Group} title="השבוע" tasks=${week} />
    <${Group} title="בהמשך" tasks=${later} />
    <${Group} title="בלי תאריך" tasks=${noDate} />
    <${Group} title="הושלמו השבוע" tasks=${doneWeek} collapsedByDefault />

    ${!open.length && !waitingOnMe.length ? html`<${Empty} title=${`אין משימות פתוחות${m ? ', ' + m.name : ''}`} icon="check">
      הוסיפו משימה בשורה למעלה, או קחו משימה מלוח הצוות.<//>` : null}
  </div>`;
}
