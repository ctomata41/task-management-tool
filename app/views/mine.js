// A person's own work under "מה מחכה לי": their מטלות grouped by when they are due, and the Claude tasks they are
// accountable for, folded by default (the spec hides Claude's technical work unless someone opens it).
import { useState } from 'preact/hooks';
import { visibleTasks } from '../store.js';
import { html, Icon, TaskRow } from '../ui.js';
import { QuickAdd } from '../quickadd.js';
import { today, weekEnd, weekStart, ymd, byUrgency, isOverdue } from '../util.js';
import { isClaude, canSee } from '../model.js';

export function Group({ title, tasks, tone, collapsedByDefault, showOwner = false, showProject = true, hint, children }) {
  const [open, setOpen] = useState(!collapsedByDefault);
  if (!tasks.length && !children) return null;
  return html`<section class=${'group' + (tone ? ' ' + tone : '')}>
    <button type="button" class="group-head" aria-expanded=${open ? 'true' : 'false'} onClick=${() => setOpen(!open)}>
      <${Icon} name="chevronDown" size=${16} cls=${open ? '' : 'rot'} />
      <h2>${title}</h2><span class="count">${tasks.length}</span>
      ${hint ? html`<span class="group-hint">${hint}</span>` : null}
    </button>
    ${open ? html`${tasks.length ? html`<div class="rows">${tasks.map((t) => html`<${TaskRow} key=${t.id} t=${t} showOwner=${showOwner} showProject=${showProject} />`)}</div>` : null}${children || null}` : null}
  </section>`;
}

export function MyWork({ s, pid, exclude = new Set(), self = true }) {
  const all = visibleTasks(s).filter((t) => canSee(t, s) && !exclude.has(t.id));
  const mine = all.filter((t) => !isClaude(t) && t.owner_id === pid);
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
  const ws = weekStart();
  const doneWeek = mine.filter((t) => t.status === 'done' && t.done_at && ymd(new Date(t.done_at)) >= ws);
  const claude = all.filter((t) => isClaude(t) && (t.accountable_id || t.created_by) === pid && t.status !== 'done').sort(byUrgency);
  const running = claude.filter((t) => t.status === 'in_progress').length;
  const claudeHint = [running ? `${running} בעבודה` : null, claude.length - running ? `${claude.length - running} ממתינות` : null].filter(Boolean).join(' · ');

  return html`<section class="my-work">
    <header class="section-head"><h2>${self ? 'המטלות שלי' : 'המטלות'}</h2>
      <span class="muted small">${open.length ? `${open.length} פתוחות` : 'אין מטלות פתוחות'}${overdue.length ? ` · ${overdue.length} באיחור` : ''}</span></header>
    ${self ? html`<${QuickAdd} defaults=${{ owner_id: pid }} placeholder="מטלה חדשה… למשל: לקבוע פגישה עם ממונה הביטחון מחר !" />` : null}
    <${Group} title="בפוקוס" tone="tone-focus" tasks=${focus} hint=${focus.length > 3 ? 'יותר מ-3 בפוקוס זה כבר לא פוקוס' : ''} />
    <${Group} title="באיחור" tone="tone-bad" tasks=${overdue} />
    <${Group} title="היום" tasks=${dueToday} />
    <${Group} title="השבוע" tasks=${week} />
    <${Group} title="בהמשך" tasks=${later} />
    <${Group} title="בלי תאריך" tasks=${noDate} />
    <${Group} title="משימות Claude באחריות" tone="tone-claude" tasks=${claude} collapsedByDefault hint=${claudeHint || 'Claude מבצע, ואדם בודק וסוגר'} />
    <${Group} title="הושלמו השבוע" tasks=${doneWeek} collapsedByDefault />
  </section>`;
}
