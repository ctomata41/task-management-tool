// One line per activity-log entry, for the team view, the task drawer and "מאז שהיית כאן", and where a tap on it leads.
import { person, openTask, openDecision, openModal, getState } from './store.js';
import { html, navigate } from './ui.js';
import { STATUS, HEALTH_BY, shortDate } from './util.js';
import { STAGE, toWhom, fromWhom } from './model.js';

const st = (id) => STATUS[id]?.label || id;
const name = (id) => person(id)?.name || 'מישהו';

export function activityWhat(a) {
  const p = a.payload || {};
  const title = p.title || '';
  const we = p.direction !== 'they_owe';
  const from = p.counterpart ? ' ' + fromWhom(p.counterpart) : '';
  switch (a.kind) {
    case 'created': return html`${p.kind === 'claude' ? 'משימת Claude חדשה' : 'מטלה חדשה'}: <b>${title}</b>`;
    case 'status': return html`<b>${title}</b> ← <span class="st" style=${`--c:${STATUS[p.to]?.color}`}>${st(p.to)}</span>`;
    case 'assigned': return html`<b>${title}</b> עברה ל${name(p.to)}`;
    case 'comment': return html`תגובה על <b>${title}</b>: ${p.body || ''}`;
    case 'due': return html`<b>${title}</b>: יעד ${p.to ? shortDate(p.to) : 'הוסר'}`;
    case 'decision_new': return html`החלטה חדשה: <b>${title}</b>`;
    case 'decision_decided': return html`הוחלט: <b>${title}</b> ← ${p.chosen || ''}`;
    case 'decision_open': return html`ההחלטה נפתחה מחדש: <b>${title}</b>`;
    case 'decision_cancelled': return html`ההחלטה בוטלה: <b>${title}</b>`;
    case 'decision_assigned': return html`ההחלטה עברה ל${name(p.to)}: <b>${title}</b>`;
    case 'commitment_new': return html`התחייבות חדשה${we ? (p.counterpart ? ` כלפי ${p.counterpart}` : '') : from}: <b>${title}</b>`;
    case 'commitment_done': return html`${we ? 'נמסר' + (p.counterpart ? ' ' + toWhom(p.counterpart) : '') : 'התקבל' + from}: <b>${title}</b>`;
    case 'commitment_open': return html`ההתחייבות נפתחה מחדש: <b>${title}</b>`;
    case 'commitment_cancelled': return html`ההתחייבות בוטלה: <b>${title}</b>`;
    case 'commitment_assigned': return html`ההתחייבות עברה ל${name(p.to)}: <b>${title}</b>`;
    case 'commitment_due': return html`מועד חדש ל<b>${title}</b>: ${p.to ? shortDate(p.to) : 'בלי מועד'}`;
    case 'project_new': return html`פרויקט חדש${p.stage === 'proposed' ? ' (מוצע)' : ''}: <b>${title}</b>`;
    case 'project_stage': return html`הפרויקט <b>${title}</b>: ${p.to === 'active' ? 'נפתח' : p.to === 'stopped' ? 'נעצר' : STAGE[p.to]?.label || p.to}`;
    case 'project_health': return html`<b>${title}</b>: ${HEALTH_BY[p.to]?.label || p.to}${p.note ? `. ${p.note}` : ''}`;
    case 'project_lead': return html`<b>${title}</b>: מוביל חדש, ${name(p.to)}`;
    case 'project_archived': return html`הפרויקט <b>${title}</b> הועבר לארכיון`;
    case 'idea_new': return html`רעיון חדש לסל: <b>${title}</b>`;
    default: return title;
  }
}

export function activityLine(a) {
  return html`<span class="act-who">${person(a.actor_id)?.name || 'מערכת'}</span><span class="act-what">${activityWhat(a)}</span>`;
}

// Where an entry leads: the task, the decision, the commitments page, the project, or the idea basket.
export function openActivity(a) {
  const s = getState();
  if (a.task_id) { if (s.tasks.some((t) => t.id === a.task_id)) openTask(a.task_id); return; }
  if (a.decision_id) { if (s.decisions.some((d) => d.id === a.decision_id)) openDecision(a.decision_id); return; }
  if (a.commitment_id) { navigate('#/commitments'); if (s.commitments.some((c) => c.id === a.commitment_id)) openModal('commitment', { id: a.commitment_id }); return; }
  if (a.kind === 'idea_new') { navigate('#/weekly'); return; }
  if (a.project_id && s.projects.some((p) => p.id === a.project_id)) navigate('#/project/' + a.project_id);
}
// Entries about items the viewer cannot see (archived, or marked as possibly classified) are left out.
export function visibleActivity(list, s = getState()) {
  const cmd = !!s.people.find((p) => p.id === s.auth?.me)?.is_command;
  const hidden = new Set([
    ...s.tasks.filter((t) => t.flagged && !cmd).map((t) => t.id),
    ...s.decisions.filter((d) => d.flagged && !cmd).map((d) => d.id),
    ...s.commitments.filter((c) => c.flagged && !cmd).map((c) => c.id),
  ]);
  const privateIds = new Set(s.tasks.filter((t) => t.private && t.owner_id !== s.auth?.me && t.created_by !== s.auth?.me).map((t) => t.id));
  return list.filter((a) => !hidden.has(a.task_id) && !hidden.has(a.decision_id) && !hidden.has(a.commitment_id) && !privateIds.has(a.task_id)
    && !(a.task_id && !s.tasks.some((t) => t.id === a.task_id)));
}
