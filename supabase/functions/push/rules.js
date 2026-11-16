// The notification rules as plain functions of the data, so they run the same in the push function and in the tests.
// Spec, chapter 9: a phone notification goes out right away only for a blocker, an assignment or a mention that a person
// made; everything else waits for one digest a day; nothing goes out in the team's quiet hours, except a blocker that puts
// an external commitment at risk. The commander hears right away only about opening or stopping a project.
export const TZ = 'Asia/Jerusalem';
const DAY = 86400000;
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// ---------- local time and workdays (the work week is Sunday to Thursday, as in app/util.js) ----------
export function localNow(now = new Date()) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
    dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday),
  };
}
export const localDate = (iso) => localNow(new Date(iso)).date;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const addDays = (s, n) => new Date(parse(s) + n * DAY).toISOString().slice(0, 10);
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / DAY);
const weekday = (s) => new Date(parse(s)).getUTCDay();
export const isWorkday = (s) => weekday(s) <= 4;
// Workdays from today until a date: 0 = today, negative = late. Friday and Saturday do not count.
export function workdaysUntil(today, due) {
  const n = diffDays(today, due);
  if (n <= 0) return n;
  let w = 0;
  for (let i = 1; i <= n; i++) if (isWorkday(addDays(today, i))) w++;
  return w;
}
// Whole workdays that passed since a date, not counting that date.
export const workdaysSince = (from, today) => Math.max(0, workdaysUntil(from, today));

const minutesOf = (t, fallback) => {
  if (!t) return fallback;
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
};
// The quiet hours from the team's work agreement (team_settings): a nightly window, and whole days off.
export function isQuiet(settings, l) {
  if ((settings?.quiet_days || []).includes(l.dow)) return true;
  const from = minutesOf(settings?.quiet_from, 19 * 60);
  const to = minutesOf(settings?.quiet_to, 8 * 60);
  if (from === to) return false;
  return from < to ? l.minutes >= from && l.minutes < to : l.minutes >= from || l.minutes < to;
}

// ---------- wording ----------
export function dueLabel(today, due) {
  const n = diffDays(today, due);
  if (n === 0) return 'היום';
  if (n === 1) return 'מחר';
  if (n === -1) return 'אתמול';
  if (n < 0) return `לפני ${-n} ימים`;
  if (n < 7) return 'יום ' + DAYS[weekday(due)];
  const [, m, d] = due.split('-').map(Number);
  return `${d}/${m}`;
}
// Same as app/model.js: "ליונתן", "אל הדרג הבכיר", "ל-Microsoft"; "מיונתן", "מ-Microsoft".
export const toWhom = (name) => (/^ה/.test(name) ? `אל ${name}` : /^[א-ת]/.test(name) ? `ל${name}` : `ל-${name}`);
export const fromWhom = (name) => (/^[א-ת]/.test(name) ? `מ${name}` : `מ-${name}`);
const counterpartOf = (c) => c.counterpart || (c.direction === 'they_owe' ? 'הצד השני' : 'גורם חיצוני');
const waited = (iso, today) => {
  const n = diffDays(localDate(iso), today);
  return n <= 0 ? 'מהיום' : n === 1 ? 'מאתמול' : `${n} ימים`;
};
export const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
};
const HIDDEN = 'פריט שמחכה לבדיקת הפיקוד'; // the text of an item marked as possibly classified never goes to a phone

// ---------- right away, or in the digest ----------
export const IMMEDIATE = new Set(['assigned', 'accountable', 'decision', 'commitment', 'mention', 'blocked_by_you', 'blocked']);
const BLOCKER = new Set(['blocked_by_you', 'blocked']);
export const isCommander = (p) => !!p && p.role === 'מפקד';

// A blocker puts an external commitment at risk when its project owes something outside the team within a workday.
export function blockerIsUrgent(task, commitments, today) {
  if (!task?.project_id) return false;
  return commitments.some((c) => c.project_id === task.project_id && c.status === 'open' && !c.archived && c.direction === 'we_owe'
    && c.due && workdaysUntil(today, c.due) <= 1);
}

// What happens to one in-app notification on the phone. ctx: { person, actor, settings, local, task, decision, urgent }.
export function pushPlan(n, ctx) {
  if (!IMMEDIATE.has(n.kind)) return { send: false, why: 'digest' };
  if (!ctx.actor || ctx.actor.is_agent) return { send: false, why: 'not_person' };
  if (isCommander(ctx.person) && !(n.kind === 'decision' && ctx.decision?.kind === 'gate')) return { send: false, why: 'commander' };
  if (ctx.task?.private && ctx.task.owner_id !== n.person_id && ctx.task.created_by !== n.person_id) return { send: false, why: 'private' };
  if (isQuiet(ctx.settings, ctx.local) && !(BLOCKER.has(n.kind) && ctx.urgent)) return { send: false, why: 'quiet' };
  return { send: true, urgency: BLOCKER.has(n.kind) || ctx.decision?.kind === 'gate' ? 'high' : 'normal' };
}

// The phone message for one notification. It opens the item in the app (#/n/<id>).
export function messageFor(n, ctx) {
  const who = ctx.actor?.name || 'מישהו';
  const flagged = ctx.task?.flagged || ctx.decision?.flagged || ctx.commitment?.flagged;
  const task = flagged ? HIDDEN : ctx.task?.title || n.body || '';
  const item = flagged ? HIDDEN : n.body || '';
  const out = (title, body) => ({ title: clip(title, 60), body: clip(body, 180), url: `/#/n/${n.id}`, tag: n.id });
  switch (n.kind) {
    case 'assigned': return out(`מטלה חדשה ${fromWhom(who)}`, task);
    case 'accountable': return out('משימת Claude באחריותך', task);
    case 'decision': return out(ctx.decision?.kind === 'gate' ? 'פתיחה או עצירה של פרויקט' : 'החלטה מחכה לך', flagged ? HIDDEN : ctx.decision?.title || item);
    case 'commitment': return out('התחייבות באחריותך', flagged ? HIDDEN : ctx.commitment?.title || item);
    case 'mention': return out(`אזכור ${fromWhom(who)}`, flagged ? HIDDEN : [ctx.task?.title, n.body].filter(Boolean).join(': '));
    case 'blocked_by_you': return out(`${who} מחכה לך`, flagged ? HIDDEN : [ctx.task?.title, n.body !== ctx.task?.title ? n.body : ''].filter(Boolean).join(': '));
    case 'blocked': return out(`חסם ב${ctx.project?.name || 'פרויקט'}`, flagged ? HIDDEN : [ctx.task?.title, n.body !== ctx.task?.title ? n.body : ''].filter(Boolean).join(': '));
    default: return out('משימות CTO', item);
  }
}

// ---------- the daily digest ----------
// The top of "מה מחכה לי" (waitingFor in app/model.js: keep the two in step), each with why it is there, and then what
// happened meanwhile that did not ring the phone (comments, answers, reviews, held notifications).
export function digestFor(pid, data, l) {
  const today = l.date;
  const { people, tasks, decisions, commitments, notifications = [] } = data;
  const name = (id) => people.find((p) => p.id === id)?.name || 'מישהו';
  const commander = people.find((p) => p.is_team && isCommander(p)) || people.find((p) => p.is_command);
  const deputy = people.find((p) => p.is_command && p.is_team && p.id !== commander?.id);
  const live = (x) => !x.archived && !x.flagged;
  const mine = tasks.filter((t) => live(t) && t.status !== 'done' && (!t.private || t.owner_id === pid || t.created_by === pid));
  const items = [];
  decisions.filter((d) => live(d) && d.status === 'open').forEach((d) => {
    const escalated = d.kind === 'gate' && workdaysSince(localDate(d.created_at), today) >= 3;
    if (d.assignee_id !== pid && !(escalated && deputy?.id === pid && d.assignee_id === commander?.id)) return;
    items.push({ ref: d.id, at: d.created_at, due: d.due, type: 'החלטה', text: d.title, why: d.due ? `עד ${dueLabel(today, d.due)}` : `מחכה ${waited(d.created_at, today)}` });
  });
  mine.filter((t) => t.status === 'review' && (t.accountable_id || t.created_by) === pid && t.owner_id !== pid)
    .forEach((t) => items.push({ ref: t.id, at: t.updated_at || t.created_at, due: t.due, type: 'בדיקה', text: t.title, why: `מחכה ${waited(t.updated_at || t.created_at, today)}` }));
  mine.filter((t) => t.kind !== 'claude' && t.htype && t.htype !== 'general' && t.owner_id === pid && t.status !== 'review')
    .forEach((t) => items.push({ ref: t.id, at: t.created_at, due: t.due, type: 'מטלה', text: t.title, why: t.due ? `עד ${dueLabel(today, t.due)}` : 'פתוחה' }));
  mine.filter((t) => (t.status === 'blocked' || t.status === 'waiting') && t.blocked_by_person === pid && t.owner_id !== pid)
    .forEach((t) => items.push({ ref: t.id, at: t.updated_at || t.created_at, due: t.due, type: 'חסם', text: t.title, why: `${name(t.owner_id)} מחכה לך` }));
  commitments.filter((c) => live(c) && c.status === 'open' && c.owner_id === pid && c.due && workdaysUntil(today, c.due) <= 5).forEach((c) => {
    const cp = counterpartOf(c);
    const when = diffDays(today, c.due) < 0 ? 'באיחור' : dueLabel(today, c.due);
    items.push({ ref: c.id, at: c.created_at, due: c.due, type: 'התחייבות', text: c.title, why: c.direction === 'they_owe' ? `מחכים ${fromWhom(cp)}, ${when}` : `המסירה ${toWhom(cp)} ${when}` });
  });
  const rank = (x) => (x.due && x.due < today ? 0 : x.due === today ? 1 : 2);
  items.sort((a, b) => rank(a) - rank(b) || new Date(a.at) - new Date(b.at));

  // What happened meanwhile: unread notifications that did not go to the phone, about items not already listed.
  const listed = new Set(items.map((x) => x.ref));
  const extra = [];
  notifications.filter((n) => n.person_id === pid && !n.read_at && !n.pushed_at).forEach((n) => {
    const ref = n.task_id || n.decision_id || n.commitment_id;
    if (listed.has(ref)) return;
    const t = tasks.find((x) => x.id === n.task_id);
    const d = decisions.find((x) => x.id === n.decision_id);
    if ((t && (t.flagged || t.archived)) || (d && (d.flagged || d.archived))) return;
    const who = name(n.actor_id);
    const line = n.kind === 'comment' ? `תגובה ${fromWhom(who)} על ${t?.title || ''}`
      : n.kind === 'decided' ? `הוחלט: ${d?.title || ''} ← ${n.body || ''}`
        : n.kind === 'unblocked' ? `החסם שוחרר: ${t?.title || n.body || ''}`
          : n.kind === 'mention' ? `אזכור ${fromWhom(who)} ב${t?.title || ''}`
            : n.kind === 'assigned' ? `מטלה חדשה ${fromWhom(who)}: ${t?.title || n.body || ''}`
              : n.kind === 'decision' ? `החלטה מחכה לך: ${d?.title || n.body || ''}`
                : n.body ? n.body : '';
    if (line) { listed.add(ref); extra.push(line); }
  });

  const lines = [...items.map((x) => `${x.type}: ${clip(x.text, 44)} · ${x.why}`), ...extra.map((x) => clip(x, 70))];
  if (!lines.length) return null;
  const shown = lines.slice(0, 5);
  if (lines.length > 5) shown.push(`ועוד ${lines.length - 5} ב"מה מחכה לי"`);
  const title = items.length > 1 ? `${items.length} דברים מחכים לך היום` : items.length === 1 ? 'דבר אחד מחכה לך היום' : 'מה קרה מאז אתמול';
  return { title, body: shown.join('\n'), url: '/#/home', tag: 'digest', count: items.length, extra: extra.length };
}

// ---------- commitment reminders: 5 workdays and 1 workday before the due date, to the owner ----------
export function remindersDue(commitments, sent, l) {
  const out = [];
  commitments.filter((c) => !c.archived && c.status === 'open' && c.owner_id && c.due && c.due >= l.date).forEach((c) => {
    const n = workdaysUntil(l.date, c.due);
    const has = (step) => sent.some((r) => r.commitment_id === c.id && r.step === step && r.due === c.due);
    if (n <= 1) { if (!has('1')) out.push({ c, step: '1' }); } else if (n <= 5 && !has('5')) out.push({ c, step: '5' });
  });
  return out;
}
export function reminderText(c, l) {
  const cp = counterpartOf(c);
  const when = dueLabel(l.date, c.due);
  return c.direction === 'they_owe' ? `${c.title}: מחכים ${fromWhom(cp)}, ${when}` : `${c.title}: המסירה ${toWhom(cp)} ${when}`;
}
