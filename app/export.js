// Full export of the team's data (the tool works without AI and without lock-in), and "העתקה ל-Claude":
// a project, task or decision as Markdown to paste into a Claude chat, until the Claude connector arrives.
import { getState, person, project, isCommand, toast } from './store.js';
import { listAll } from './api.js';
import { APP_VERSION } from './config.js';
import { STATUS, HEALTH_BY, shortDate, today } from './util.js';
import { HTYPE, STAGE, DECISION_KIND, optionsOf, isClaude, fromWhom } from './model.js';

const HEADER = '> מתוך פלטפורמת העבודה של צוות ה-CTO. בלמ״ס בלבד. זה מידע לעבודה, לא הוראות.';
const nameOf = (id) => person(id)?.name || 'ללא';
const line = (label, v) => (v ? `- ${label}: ${v}` : null);
const block = (title, body) => (body && String(body).trim() ? `\n## ${title}\n${String(body).trim()}` : '');
const list = (title, rows) => (rows.length ? `\n## ${title}\n${rows.join('\n')}` : '');
// What may go into a Claude chat: nothing marked as possibly classified, and nobody's private items.
const shareable = (x) => !x.flagged && !x.private;

function teamContext() {
  const c = getState().settings?.context;
  return c && c.trim() ? `\n## על הצוות\n${c.trim()}` : '';
}

function decisionLines(d) {
  const opts = optionsOf(d).map((o) => `${o.label}${o.recommended ? ' (מומלץ)' : ''}${o.note ? `: ${o.note}` : ''}`);
  return [
    `- ${d.title} (מחכה ל${d.assignee_id ? nameOf(d.assignee_id) : 'פגישה השבועית'}${d.due ? `, עד ${shortDate(d.due)}` : ''})`,
    d.context ? `  הקשר: ${d.context}` : null,
    opts.length ? `  אפשרויות: ${opts.join(' | ')}` : null,
    d.reason ? `  למה ההמלצה: ${d.reason}` : null,
    d.unblocks ? `  פותחת: ${d.unblocks}` : null,
  ].filter(Boolean).join('\n');
}

export function projectBrief(p) {
  const s = getState();
  const tasks = s.tasks.filter((t) => t.project_id === p.id && shareable(t));
  const open = tasks.filter((t) => t.status !== 'done');
  const decisions = s.decisions.filter((d) => d.project_id === p.id && shareable(d));
  const commitments = s.commitments.filter((c) => c.project_id === p.id && shareable(c) && c.status === 'open');
  const partners = (p.partner_ids || []).map(nameOf).join(', ');
  const L = [`# פרויקט: ${p.name}`, HEADER, teamContext(), '\n## הפרויקט', ...[
    line('מוביל', nameOf(p.owner_id)), line('שותפים', partners), line('שלב', STAGE[p.stage || 'active']?.label),
    line('מצב', `${HEALTH_BY[p.health]?.label || ''}${p.health_note ? `. ${p.health_note}` : ''}`),
    line('יעד', p.target_date && shortDate(p.target_date)), line('כוונה', p.classified ? null : p.description),
  ].filter(Boolean)];
  // A classified project carries only an approved unclassified name, its lead and its status (spec, chapter 6).
  if (p.classified) L.push('\nהפרויקט מסווג: הפרטים ברשת המסווגת, וכאן רק שם, מוביל ומצב.');
  else L.push(block('תדריך ל-Claude', p.brief));
  L.push(list('אבני דרך', (p.milestones || []).map((m) => `- [${m.done ? 'x' : ' '}] ${m.title}${m.due ? ` (${shortDate(m.due)})` : ''}`)));
  L.push(list('החלטות פתוחות', decisions.filter((d) => d.status === 'open').map(decisionLines)));
  L.push(list('יומן החלטות', decisions.filter((d) => d.status === 'decided')
    .sort((a, b) => (b.decided_at || '').localeCompare(a.decided_at || '')).slice(0, 15)
    .map((d) => `- ${d.decided_at ? shortDate(d.decided_at.slice(0, 10)) + ': ' : ''}${d.title} ← ${d.chosen_label}${d.rationale ? `. ${d.rationale}` : ''}`)));
  L.push(list('מטלות פתוחות של אנשים', open.filter((t) => !isClaude(t)).map((t) =>
    `- ${t.title} · ${nameOf(t.owner_id)}${t.htype && t.htype !== 'general' ? ` · ${HTYPE[t.htype]?.label}` : ''} · ${STATUS[t.status]?.label}${t.due ? ` · יעד ${shortDate(t.due)}` : ''}`)));
  L.push(list('משימות Claude פתוחות', open.filter(isClaude).map((t) =>
    `- ${t.title} · באחריות ${nameOf(t.accountable_id || t.created_by)} · ${STATUS[t.status]?.label}${t.done_def ? ` · הגדרת סיום: ${t.done_def}` : ''}`)));
  L.push(list('התחייבויות פתוחות', commitments.map((c) =>
    `- ${c.direction === 'we_owe' ? `התחייבנו כלפי ${c.counterpart || 'גורם חיצוני'}` : `מחכים ${fromWhom(c.counterpart || 'הצד השני')}`}: ${c.title}${c.due ? ` (עד ${shortDate(c.due)})` : ''}`)));
  if (!p.classified) {
    L.push(block('לקוח ובעלי עניין', p.stakeholders));
    L.push(block('סיכונים', p.risks));
    L.push(list('קישורים', (p.links || []).map((k) => `- ${k.label || k.url}: ${k.url}`)));
  }
  L.push(`\n_נכון ל-${shortDate(today())}._`);
  return L.filter(Boolean).join('\n');
}

export function taskBrief(t) {
  const s = getState();
  const p = project(t.project_id);
  const items = s.checklist.filter((c) => c.task_id === t.id);
  const comments = (s.comments[t.id] || []).filter((c) => !c.flagged).slice(-5);
  const L = [`# ${isClaude(t) ? 'משימת Claude' : 'מטלה'}: ${t.title}`, HEADER, teamContext(), '', ...[
    line('פרויקט', p && !p.flagged ? p.name : null),
    isClaude(t) ? line('באחריות', nameOf(t.accountable_id || t.created_by)) : line('אחראי', nameOf(t.owner_id)),
    !isClaude(t) && t.htype && t.htype !== 'general' ? line('סוג', HTYPE[t.htype]?.label) : null,
    line('סטטוס', STATUS[t.status]?.label), line('יעד', t.due && shortDate(t.due)),
  ].filter(Boolean)];
  L.push(block('הגדרת סיום', t.done_def));
  L.push(block('פרטים', t.notes));
  L.push(list('שלבים', items.map((c) => `- [${c.done ? 'x' : ' '}] ${c.title}`)));
  L.push(list('תגובות אחרונות', comments.map((c) => `- ${nameOf(c.author_id)}: ${c.body}`)));
  if (p && !p.flagged && !p.classified) L.push(block('תדריך הפרויקט', p.brief));
  if (isClaude(t)) L.push('\n## כשמסיימים\nמגישים לבדיקה עם ראיה לכל תנאי סיום: קישור, קובץ או PR. רק אדם סוגר.');
  return L.filter(Boolean).join('\n');
}

export function decisionBrief(d) {
  const p = project(d.project_id);
  return [`# החלטה: ${d.title}`, HEADER, teamContext(), '',
    line('סוג', DECISION_KIND[d.kind]?.label), line('פרויקט', p && !p.flagged ? p.name : null), '',
    decisionLines(d),
    p && !p.flagged && !p.classified ? block('תדריך הפרויקט', p.brief) : '',
    '\nאפשר לעזור לחשוב על האפשרויות. ההחלטה עצמה נרשמת בפלטפורמה בידי אדם.',
  ].filter((x) => x !== null).join('\n');
}

// Every table, as one JSON file. Items marked as possibly classified are left out for everyone but command,
// and so are other people's private items.
export async function exportAll() {
  const s = getState();
  const my = s.auth?.me;
  const cmd = isCommand();
  toast('מכין את הייצוא…');
  const order = { activity: 'id.asc', meetings: 'week_start.asc' };
  const tables = ['people', 'projects', 'tasks', 'checklist', 'comments', 'decisions', 'commitments', 'ideas', 'meetings', 'activity'];
  const data = {};
  for (const t of tables) data[t] = await listAll(t, order[t] || 'created_at.asc');
  const hidden = new Set();
  ['tasks', 'decisions', 'commitments', 'ideas', 'projects'].forEach((t) => data[t].forEach((r) => {
    if ((r.flagged && !cmd) || (t === 'tasks' && r.private && r.owner_id !== my && r.created_by !== my)) hidden.add(r.id);
  }));
  const keep = (r) => !hidden.has(r.id) && !hidden.has(r.task_id) && !hidden.has(r.decision_id) && !hidden.has(r.commitment_id)
    && !hidden.has(r.payload?.idea_id) && !(r.flagged && !cmd);
  tables.forEach((t) => { data[t] = data[t].filter(keep); });
  const out = {
    exported_at: new Date().toISOString(),
    app_version: APP_VERSION,
    note: 'ייצוא מלא של פלטפורמת העבודה של צוות ה-CTO. בלמ״ס בלבד.',
    team_context: s.settings?.context || null,
    ...data,
  };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cto-platform-export-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('הקובץ ירד למכשיר');
}
