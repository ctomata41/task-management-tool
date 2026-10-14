// The project model from the spec: a project has a lead and partners, and three streams under it:
// decisions (people decide), Claude tasks (Claude does the work for an accountable person, hidden by default)
// and human assignments, "מטלות" (what Claude cannot do on its own: a meeting, a file, connecting a tool, signing in, paying).
// This module holds the labels, the routing rules, and the derived views: "what is waiting for me", what rises to the team
// and to command, and one line per project.
import { getState, person, project, visibleTasks } from './store.js';
import { today, isOverdue, isStuck, ageOf, byUrgency, workdaysUntil, dueLabel, HEALTH_BY } from './util.js';

export const HTYPES = [
  { id: 'general', label: 'עבודה', icon: 'check' },
  { id: 'meeting', label: 'פגישה', icon: 'calendar' },
  { id: 'file', label: 'קובץ', icon: 'file' },
  { id: 'connect', label: 'חיבור כלי', icon: 'plug' },
  { id: 'auth', label: 'הזדהות', icon: 'key' },
  { id: 'payment', label: 'תשלום', icon: 'card' },
  { id: 'other', label: 'אחר', icon: 'more' },
];
export const HTYPE = Object.fromEntries(HTYPES.map((h) => [h.id, h]));

// A decision's kind routes it (spec, round 3): opening or stopping a project goes to the commander, and to the deputy
// after 3 workdays without an answer; prioritizing between projects goes to the weekly meeting; the rest to the lead or a partner.
export const DECISION_KINDS = [
  { id: 'direction', label: 'בחירת כיוון', short: 'כיוון', route: 'המוביל או שותף בפרויקט' },
  { id: 'approval', label: 'אישור התקדמות', short: 'אישור', route: 'המוביל או שותף בפרויקט' },
  { id: 'gate', label: 'פתיחה או עצירה של פרויקט', short: 'פתיחה או עצירה', route: 'המפקד' },
  { id: 'priority', label: 'תעדוף בין פרויקטים', short: 'תעדוף', route: 'הפגישה השבועית' },
];
export const DECISION_KIND = Object.fromEntries(DECISION_KINDS.map((k) => [k.id, k]));
// Options a decision gets when nobody wrote any, by kind. A direction decision without options is answered in words.
export const DEFAULT_OPTIONS = { approval: ['אישור', 'החזרה לתיקון'], gate: ['כן', 'לא', 'לא עכשיו'], direction: [], priority: [] };
export const GATE_ESCALATE_WORK_HOURS = 72; // 3 workdays

export function optionsOf(d) {
  if (d.options && d.options.length) return d.options;
  return (DEFAULT_OPTIONS[d.kind] || []).map((label, i) => ({ key: 'k' + i, label }));
}
// The options of a gate decision. The effect is what the database does to the project when that option is chosen.
export function gateOptions(what) {
  return what === 'stop'
    ? [{ key: 'stop', label: 'לעצור', effect: 'stop' }, { key: 'go', label: 'להמשיך', recommended: true }]
    : [{ key: 'open', label: 'לפתוח', effect: 'open', recommended: true }, { key: 'later', label: 'לא עכשיו' }, { key: 'no', label: 'לא לפתוח', effect: 'stop' }];
}

export const STAGES = [
  { id: 'proposed', label: 'מוצע' },
  { id: 'active', label: 'פעיל' },
  { id: 'stopped', label: 'נעצר' },
];
export const STAGE = Object.fromEntries(STAGES.map((x) => [x.id, x]));

export const isClaude = (t) => t.kind === 'claude';
export const isAgent = (p) => !!p && (p.is_agent || p.name === 'Claude');
export const commanderOf = (s = getState()) => s.people.find((p) => p.is_team && p.role === 'מפקד') || s.people.find((p) => p.is_command) || null;
// The deputy takes a gate decision the commander has not answered: the other member of command.
export function deputyOf(s = getState()) {
  const c = commanderOf(s);
  return s.people.find((p) => p.is_command && p.is_team && p.id !== c?.id) || null;
}
// The person a task is answered for: the accountable person of a Claude task, otherwise its owner.
export function answerer(t) { return isClaude(t) ? t.accountable_id || t.created_by : t.owner_id; }
export function reviewerOf(t) { return t.accountable_id || t.created_by; }

// Items marked as possibly classified are hidden from everyone but command until checked.
export function canSee(item, s = getState()) {
  if (!item || !item.flagged) return true;
  return !!(s.people.find((p) => p.id === s.auth?.me)?.is_command);
}
export const openDecisions = (s = getState()) => s.decisions.filter((d) => d.status === 'open' && canSee(d, s));
export const visibleCommitments = (s = getState()) => s.commitments.filter((c) => canSee(c, s));
export const visibleProjects = (s = getState()) => s.projects.filter((p) => canSee(p, s));
export const liveProjects = (s = getState()) => visibleProjects(s).filter((p) => (p.stage || 'active') !== 'stopped');

// A gate decision the commander has not answered for 3 workdays is the deputy's to take.
export const gateEscalated = (d) => d.kind === 'gate' && d.status === 'open' && ageOf(d.created_at).work >= GATE_ESCALATE_WORK_HOURS;
export function decidesFor(d, pid, s = getState()) {
  if (d.assignee_id === pid) return true;
  return gateEscalated(d) && deputyOf(s)?.id === pid && d.assignee_id === commanderOf(s)?.id;
}

// When a task went into its current stuck or review state, from the activity log.
export function since(t, kinds, s = getState()) {
  const a = s.activity.find((x) => x.task_id === t.id && x.kind === 'status' && kinds.includes(x.payload?.to));
  return a ? a.at : t.updated_at || t.created_at;
}

export const commitmentLate = (c) => c.status === 'open' && !!c.due && c.due < today();
// Reminders come 5 workdays and 1 workday before an external commitment is due (spec).
export const commitmentSoon = (c, days = 5) => c.status === 'open' && !!c.due && workdaysUntil(c.due) <= days;
export function commitmentWhen(c) {
  if (!c.due) return '';
  const n = workdaysUntil(c.due);
  if (n < 0) { const late = -n; return late === 1 ? 'באיחור של יום' : `באיחור של ${late} ימים`; }
  return dueLabel(c.due);
}
export const counterpartOf = (c) => c.counterpart || (c.direction === 'they_owe' ? 'הצד השני' : 'גורם חיצוני');
// "ל" + a free-text name: "ליונתן", but "אל הדרג הבכיר" (ל would swallow the ה) and "ל-Microsoft".
export const toWhom = (name) => (/^ה/.test(name) ? `אל ${name}` : /^[א-ת]/.test(name) ? `ל${name}` : `ל-${name}`);
export const fromWhom = (name) => (/^[א-ת]/.test(name) ? `מ${name}` : `מ-${name}`);

// ---------- "מה מחכה לי": one queue of what needs this person now, each item with its age ----------
export function waitingFor(pid, s = getState()) {
  if (!pid) return [];
  const items = [];
  const tasks = visibleTasks(s).filter((t) => canSee(t, s));
  openDecisions(s).filter((d) => decidesFor(d, pid, s))
    .forEach((d) => items.push({ type: 'decision', key: 'd' + d.id, d, at: d.created_at, due: d.due }));
  tasks.filter((t) => t.status === 'review' && reviewerOf(t) === pid && t.owner_id !== pid)
    .forEach((t) => items.push({ type: 'review', key: 'r' + t.id, t, at: since(t, ['review'], s), due: t.due }));
  tasks.filter((t) => !isClaude(t) && t.htype && t.htype !== 'general' && t.owner_id === pid && t.status !== 'done' && t.status !== 'review')
    .forEach((t) => items.push({ type: 'assignment', key: 'a' + t.id, t, at: t.created_at, due: t.due }));
  tasks.filter((t) => t.status !== 'done' && isStuck(t) && t.blocked_by_person === pid && t.owner_id !== pid)
    .forEach((t) => items.push({ type: 'unblock', key: 'u' + t.id, t, at: since(t, ['blocked', 'waiting'], s), due: t.due }));
  visibleCommitments(s).filter((c) => c.owner_id === pid && commitmentSoon(c))
    .forEach((c) => items.push({ type: 'commitment', key: 'c' + c.id, c, at: c.created_at, due: c.due }));
  const td = today();
  const late = (x) => (x.due && x.due < td ? 0 : x.due === td ? 1 : 2);
  return items.sort((a, b) => late(a) - late(b) || new Date(a.at) - new Date(b.at));
}

// ---------- what rises: only significant items reach the team and command views ----------
// Significant = waiting two workdays or more, late or about to be late toward someone outside the team, a blocker on
// high-priority work, or a project marked at risk. A small item stuck for a day stays with its owner and the project lead.
const passed = (age) => (age.label === 'יום' ? 'עבר יום' : age.label === 'עכשיו' ? 'עבר רגע' : `עברו ${age.label}`);
export function significant(s = getState()) {
  const out = [];
  const td = today();
  const tasks = visibleTasks(s).filter((t) => canSee(t, s) && t.status !== 'done');
  openDecisions(s).forEach((d) => {
    const age = ageOf(d.created_at);
    if (d.due && d.due < td) out.push({ type: 'decision', key: 'd' + d.id, d, at: d.created_at, why: 'עבר המועד להחלטה' });
    else if (age.work >= 48) out.push({ type: 'decision', key: 'd' + d.id, d, at: d.created_at, why: `${passed(age)} בלי החלטה` });
  });
  tasks.filter(isStuck).forEach((t) => {
    const at = since(t, ['blocked', 'waiting'], s);
    const age = ageOf(at);
    if (age.work >= 48) out.push({ type: 'stuck', key: 's' + t.id, t, at, why: `${passed(age)} בלי שחרור החסם` });
    else if (t.priority === 'high') out.push({ type: 'stuck', key: 's' + t.id, t, at, why: 'חסם על עבודה בעדיפות גבוהה' });
  });
  tasks.filter((t) => t.status === 'review').forEach((t) => {
    const at = since(t, ['review'], s);
    const age = ageOf(at);
    if (age.work >= 48) out.push({ type: 'review', key: 'r' + t.id, t, at, why: `${passed(age)} בלי בדיקה` });
  });
  visibleCommitments(s).filter((c) => c.status === 'open' && c.due).forEach((c) => {
    const n = workdaysUntil(c.due);
    const cp = counterpartOf(c);
    if (n < 0) out.push({ type: 'commitment', key: 'c' + c.id, c, at: c.created_at, why: c.direction === 'we_owe' ? `המסירה ${toWhom(cp)} ${commitmentWhen(c)}` : `${cp} ${commitmentWhen(c)}` });
    else if (c.direction === 'we_owe' && n <= 1) out.push({ type: 'commitment', key: 'c' + c.id, c, at: c.created_at, why: `המסירה ${toWhom(cp)} ${dueLabel(c.due)}` });
  });
  // Warning signs in a project (spec): the lead marked it at risk, its time budget ran out, a milestone is late while it is
  // marked on track, or nobody updated it for seven workdays. One line per project, the first sign that applies.
  liveProjects(s).forEach((p) => {
    const at = p.updated_at || p.created_at;
    const add = (why, when = at) => out.push({ type: 'project', key: 'p' + p.id, p, at: when, why });
    if (p.health === 'at_risk' || p.health === 'off_track') return add(`הפרויקט מסומן ${HEALTH_BY[p.health]?.label || ''}${p.health_note ? ': ' + p.health_note : ''}`);
    if (p.stage === 'proposed') return null;
    if (p.target_date && p.target_date < td) return add('תקציב הזמן נגמר. להמשיך, לשנות או לעצור?', p.target_date);
    const ms = (p.milestones || []).find((m) => !m.done && m.due && m.due < td);
    if (ms) return add(`אבן הדרך "${ms.title}" באיחור, והפרויקט מסומן ${HEALTH_BY.on_track.label}`, ms.due);
    if (ageOf(at).work >= 7 * 24) return add('אין עדכון שבעה ימי עבודה');
    return null;
  });
  return out.sort((a, b) => new Date(a.at) - new Date(b.at));
}

// ---------- one project at a glance, for the command view, the team view and the weekly meeting ----------
export function projectSummary(p, s = getState()) {
  const tasks = visibleTasks(s).filter((t) => t.project_id === p.id && canSee(t, s));
  const open = tasks.filter((t) => t.status !== 'done');
  const decisions = openDecisions(s).filter((d) => d.project_id === p.id);
  const commitments = visibleCommitments(s).filter((c) => c.project_id === p.id && c.status === 'open');
  const ms = (p.milestones || []).filter((m) => !m.done).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'))[0] || null;
  return {
    total: tasks.length,
    done: tasks.length - open.length,
    stuck: open.filter(isStuck).length,
    overdue: open.filter(isOverdue).length,
    review: open.filter((t) => t.status === 'review').length,
    claude: open.filter(isClaude).length,
    human: open.filter((t) => !isClaude(t)).length,
    decisions,
    commitments,
    lateCommitments: commitments.filter(commitmentLate).length,
    nextMilestone: ms,
    lead: person(p.owner_id),
    partners: (p.partner_ids || []).map(person).filter(Boolean),
  };
}
// The status line and what matters next, in one line.
export function projectLine(p, s = getState()) {
  const x = projectSummary(p, s);
  const bits = [];
  if (p.stage === 'proposed') bits.push('מחכה להחלטה על פתיחה');
  if (p.health_note) bits.push(p.health_note);
  if (x.nextMilestone) bits.push(`הבא: ${x.nextMilestone.title}${x.nextMilestone.due ? ' ' + dueLabel(x.nextMilestone.due) : ''}`);
  if (x.decisions.length) bits.push(x.decisions.length === 1 ? 'החלטה אחת פתוחה' : `${x.decisions.length} החלטות פתוחות`);
  if (x.lateCommitments) bits.push(x.lateCommitments === 1 ? 'התחייבות אחת באיחור' : `${x.lateCommitments} התחייבויות באיחור`);
  if (x.stuck) bits.push(x.stuck === 1 ? 'חסם אחד' : `${x.stuck} חסמים`);
  return { text: bits.join(' · ') || 'אין עדכון', x };
}

export const isMember = (p, pid) => !!pid && (p.owner_id === pid || (p.partner_ids || []).includes(pid));
export function projectName(id) { return project(id)?.name || ''; }
export function sortOpen(list) { return [...list].sort(byUrgency); }
// Median of a list of numbers (team-level figures only: the tool never compares people).
export function median(nums) {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
