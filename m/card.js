// The project's ID card: the stage library and templates, and every rule that turns what people did into the status
// the commander sees. Pure functions with no DOM or store, so the same rules run in the browser and in the tests.
//
// The card has four parts (the spec's main chapter): a core of five fields, the stage path, the weekly state (hill,
// confidence, "needs a senior") and a log of decisions and assumptions. Status is never typed in: it is worked out here.

export const DAY = 864e5;

// One question to leave each stage, and the few fields the stage fills on the card. `gate: 'commander'` means closing
// the stage waits for the commander; everything else the project manager closes alone.
export const STAGES = {
  scope: { name: 'תיחום', exit: 'אפשר להסביר במשפט אחד מה בפנים ומה בחוץ?', fields: ['גבולות'], gate: 'manager' },
  research: { name: 'מחקר', exit: 'יודעים מה קיים היום ומה המגבלות שלו?', fields: ['פתרונות קיימים', 'מקורות'], gate: 'manager' },
  need: { name: 'צורך ומיקודו', exit: 'הדורש מסכים שזה הצורך שלו?', fields: ['הצורך במשפט', 'הדורש'], gate: 'manager' },
  req: { name: 'דמ"צ', exit: 'המסמך כתוב ומוסכם עם הדורש?', fields: ['קישור למסמך'], gate: 'manager' },
  spec: { name: 'אפיון', exit: 'מי שיבנה יכול להתחיל בלי שאלות פתוחות מהותיות?', fields: ['מסמך אפיון', 'מדדי הצלחה'], gate: 'manager' },
  resources: { name: 'משאבים', exit: 'יש תקציב, אנשים וזמן מאושרים?', fields: ['תקציב', 'אנשים', 'לוח זמנים'], gate: 'commander' },
  mvp: { name: 'MVP', exit: 'הגרסה הקטנה עובדת ועונה על הצורך המרכזי?', fields: ['מה נלמד'], gate: 'manager' },
  pilot: { name: 'פיילוט', exit: 'משתמשים אמיתיים השתמשו, ומדד ההצלחה נמדד?', fields: ['איפה ועם מי', 'מדד', 'תוצאה'], gate: 'commander' },
  production: { name: 'פרודקשן', exit: 'המערכת יציבה ויש מי שמתחזק אותה?', fields: ['בעל תחזוקה'], gate: 'commander' },
  adoption: { name: 'הנבטה', exit: 'המשתמשים עובדים עם זה בלי הצוות?', fields: ['מדד אימוץ'], gate: 'manager' },
  findings: { name: 'מסקנות', exit: 'המסקנות כתובות והועברו למי שצריך אותן?', fields: ['למי הועבר'], gate: 'manager' },
  plan: { name: 'תוכנית', exit: 'יש תוכנית עבודה שמי שמבצע מכיר?', fields: ['קישור לתוכנית'], gate: 'manager' },
};

export const TEMPLATES = [
  { id: 'rnd', name: 'מו"פ טכנולוגי', hint: 'מתחום ועד הנבטה, עם רמת מוכנות טכנולוגית', stages: ['scope', 'research', 'need', 'req', 'spec', 'resources', 'mvp', 'pilot', 'production', 'adoption'], trl: true },
  { id: 'tool', name: 'כלי או מערכת', hint: 'בלי מחקר מעמיק', stages: ['scope', 'need', 'spec', 'resources', 'mvp', 'pilot', 'adoption'] },
  { id: 'study', name: 'מחקר בלבד', hint: 'תיחום, מחקר ומסקנות', stages: ['scope', 'research', 'findings'] },
  { id: 'process', name: 'תהליך ארגוני', hint: 'צורך, תוכנית, פיילוט והנבטה', stages: ['need', 'plan', 'pilot', 'adoption'] },
  { id: 'blank', name: 'ריקה', hint: 'בונים את השלבים לבד', stages: [] },
];

export const HILL = {
  up: { label: 'עוד מבררים איך', short: 'מבררים' },
  top: { label: 'יודעים מה לעשות', short: 'יודעים' },
  down: { label: 'מסיימים', short: 'מסיימים' },
};
export const CONFIDENCE = {
  on: { label: 'במסלול', color: 'var(--h-on)' },
  risk: { label: 'בסיכון', color: 'var(--h-risk)' },
  stuck: { label: 'תקוע', color: 'var(--h-off)' },
};
export const GATE_CHOICES = {
  next: { label: 'להמשיך לשלב הבא', icon: 'check' },
  back: { label: 'לחזור לשלב קודם', icon: 'undo' },
  hold: { label: 'להשהות', icon: 'pause' },
  stop: { label: 'לעצור את הפרויקט', icon: 'octagon' },
};
export const CLASSIFICATION = {
  open: { label: 'בלמ"ס', hint: 'כל החומרים לא מסווגים ונשמרים כאן' },
  restricted: { label: 'שמור / סודי', hint: 'כאן רק הניהול. החומרים נשארים ברשת המסווגת' },
};

const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// A fresh stage from the library, or a custom one by name.
export function makeStage(key, name) {
  const lib = STAGES[key];
  return {
    id: uid('s'),
    key: lib ? key : 'custom',
    name: lib ? lib.name : name,
    exit: lib ? lib.exit : '',
    gate: lib ? lib.gate : 'manager',
    fields: (lib ? lib.fields : []).map((label) => ({ label, value: '' })),
    state: 'todo', // todo | active | pending (waiting for the commander) | done | skipped
    target: null,
    evidence: [],
    closedAt: null,
  };
}

export function stagesFromTemplate(id) {
  const t = TEMPLATES.find((x) => x.id === id) || TEMPLATES[0];
  const list = t.stages.map((k) => makeStage(k));
  if (list[0]) list[0].state = 'active';
  return list;
}

// ---------- working days (Sunday to Thursday) ----------
const isWorkday = (d) => d.getDay() <= 4;
export function addWorkdays(from, n) {
  const d = new Date(from);
  let left = n;
  while (left > 0) { d.setDate(d.getDate() + 1); if (isWorkday(d)) left--; }
  return d;
}
export function workdaysBetween(a, b) {
  let n = 0;
  const d = new Date(a); d.setHours(0, 0, 0, 0);
  const end = new Date(b); end.setHours(0, 0, 0, 0);
  while (d < end) { d.setDate(d.getDate() + 1); if (isWorkday(d)) n++; }
  return n;
}

// ---------- the stage path ----------
export const currentStage = (p) => p.stages.find((s) => s.state === 'active' || s.state === 'pending') || null;
export const doneStages = (p) => p.stages.filter((s) => s.state === 'done' || s.state === 'skipped').length;

// Close the current stage with one of the four gate choices. A stage whose gate belongs to the commander waits as
// 'pending' until the commander approves, unless the commander is the one closing it.
export function closeStage(p, { choice, evidence = [], note = '', by, byCommander = false, backTo = null, now = Date.now() }) {
  const stages = p.stages.map((s) => ({ ...s }));
  const i = stages.findIndex((s) => s.state === 'active' || s.state === 'pending');
  const log = [...(p.log || [])];
  const stamp = new Date(now).toISOString();
  const cur = i >= 0 ? stages[i] : null;
  const entry = (text) => log.unshift({ id: uid('l'), kind: 'decision', text, who: by, at: stamp, gate: true, reversible: choice !== 'stop' });
  if (choice === 'stop') {
    entry(`הפרויקט נעצר${cur ? ` בשלב ${cur.name}` : ''}${note ? `: ${note}` : ''}`);
    return { ...p, stages, log, phase: 'stopped' };
  }
  if (choice === 'hold') {
    entry(`הפרויקט הושהה${cur ? ` בשלב ${cur.name}` : ''}${note ? `: ${note}` : ''}`);
    return { ...p, stages, log, phase: 'hold' };
  }
  if (!cur) return { ...p, phase: 'active' };
  if (choice === 'back') {
    const j = backTo ? stages.findIndex((s) => s.id === backTo) : Math.max(0, i - 1);
    for (let k = j; k <= i; k++) stages[k] = { ...stages[k], state: k === j ? 'active' : 'todo', closedAt: k === j ? null : stages[k].closedAt };
    entry(`חזרה לשלב ${stages[j].name}${note ? `: ${note}` : ''}`);
    return { ...p, stages, log, phase: 'active' };
  }
  // next
  stages[i].evidence = [...stages[i].evidence, ...evidence];
  if (cur.gate === 'commander' && !byCommander) {
    stages[i].state = 'pending';
    stages[i].askedAt = stamp;
    entry(`ביקשנו אישור לסגור את שלב ${cur.name}${note ? `: ${note}` : ''}`);
    return { ...p, stages, log };
  }
  stages[i].state = 'done';
  stages[i].closedAt = stamp;
  const nxt = stages.findIndex((s, k) => k > i && s.state === 'todo');
  if (nxt >= 0) stages[nxt].state = 'active';
  entry(`שלב ${cur.name} נסגר${note ? `: ${note}` : ''}`);
  return { ...p, stages, log, phase: nxt >= 0 ? 'active' : 'done' };
}

// The commander turns a gate down: the stage goes back to work with a direction.
export function returnStage(p, { by, note = '', now = Date.now() }) {
  const stages = p.stages.map((s) => (s.state === 'pending' ? { ...s, state: 'active', askedAt: null } : s));
  const log = [{ id: uid('l'), kind: 'decision', text: `השלב הוחזר לעבודה${note ? `: ${note}` : ''}`, who: by, at: new Date(now).toISOString(), gate: true, reversible: true }, ...(p.log || [])];
  return { ...p, stages, log };
}

// ---------- the weekly update ----------
export function weeklyUpdate(p, { hill, confidence, note = '', senior = null, now = Date.now() }) {
  const at = new Date(now).toISOString();
  const was = p.confidence;
  return {
    ...p,
    hill,
    confidence,
    confNote: confidence === 'on' ? '' : note,
    stuckSince: confidence === 'stuck' ? (was === 'stuck' && p.stuckSince ? p.stuckSince : at) : null,
    needsSenior: senior && senior.what ? { ...senior, at } : null,
    lastUpdate: at,
    updates: [{ at, hill, confidence, note }, ...(p.updates || [])].slice(0, 26),
  };
}
export const updateDue = (p, now = Date.now()) => !p.lastUpdate || now - new Date(p.lastUpdate).getTime() >= 6 * DAY;

// ---------- what reaches the commander ----------
// Only four things, each with the reason in words. Everything else stays with the project manager.
export function needsCommander(p, tasks = [], now = Date.now()) {
  if (p.personal || p.phase === 'stopped' || p.phase === 'done') return [];
  const out = [];
  if (p.needsSenior) out.push({ kind: 'senior', why: 'המנהל ביקש', text: p.needsSenior.what, by: p.needsSenior.by });
  for (const s of p.stages) if (s.state === 'pending') out.push({ kind: 'gate', why: 'שער שמחכה לאישור שלך', text: `לסגור את שלב ${s.name}`, stage: s.id });
  const cur = currentStage(p);
  const late = cur && cur.target ? daysBetween(cur.target, now) : 0;
  if (late > (p.tolDays ?? 14)) {
    out.push({ kind: 'late', why: 'חרג מהסבולת', text: `שלב ${cur.name} באיחור של ${late} ימים`, by: cur.target });
  } else if (p.confidence === 'stuck' && p.stuckSince && now - new Date(p.stuckSince).getTime() >= 13 * DAY) {
    out.push({ kind: 'late', why: 'תקוע שבועיים', text: p.confNote || 'הפרויקט מסומן תקוע כבר שבועיים' });
  }
  for (const t of tasks) {
    if (t.project !== p.id || !t.external || t.status === 'done' || !t.due) continue;
    // Late from the day after the due day, as on the task's own date.
    if (daysBetween(now, t.due) < 0) out.push({ kind: 'commit', why: 'התחייבות חיצונית באיחור', text: `${t.title} (ל${t.external})`, task: t.id, by: t.due });
    else if (t.status !== 'doing' && workdaysBetween(now, dayStart(t.due)) < 3) out.push({ kind: 'commit', why: 'התחייבות חיצונית בסכנה', text: `${t.title} (ל${t.external})`, task: t.id, by: t.due });
  }
  return out;
}

// The fixed status line for the overview: where the project is, how it feels, and whether anyone looked lately.
export function status(p, now = Date.now()) {
  const cur = currentStage(p);
  const n = p.stages.length;
  const idx = cur ? p.stages.indexOf(cur) + 1 : n;
  const stale = !p.personal && p.phase !== 'stopped' && p.phase !== 'done' && (!p.lastUpdate || now - new Date(p.lastUpdate).getTime() > 9 * DAY);
  let health = p.confidence || 'on';
  if (p.phase === 'hold') health = 'hold';
  if (p.phase === 'stopped') health = 'stopped';
  if (p.phase === 'done') health = 'done';
  const where = p.phase === 'done' ? 'הושלם' : p.phase === 'stopped' ? 'נעצר' : cur ? cur.name : n ? 'כל השלבים נסגרו' : 'בלי שלבים';
  return { where, idx, n, health, stale, pending: cur?.state === 'pending' };
}

export const HEALTH = {
  on: { label: 'במסלול', color: 'var(--h-on)' },
  risk: { label: 'בסיכון', color: 'var(--h-risk)' },
  stuck: { label: 'תקוע', color: 'var(--h-off)' },
  hold: { label: 'מושהה', color: 'var(--s-todo)' },
  stopped: { label: 'נעצר', color: 'var(--s-todo)' },
  done: { label: 'הושלם', color: 'var(--s-done)' },
};

// ---------- the stages in time, for the Gantt ----------
// How long a stage usually takes, to place a stage nobody has given a date yet.
export const STAGE_DAYS = { scope: 14, research: 21, need: 14, req: 14, spec: 21, resources: 14, mvp: 42, pilot: 42, production: 28, adoption: 56, findings: 14, plan: 14 };
// A date-only string ("2026-10-30") is that day here, not midnight in London. The year is set on its own, so a
// half-typed year stays the year it is (new Date(26, 9, 30) would be 1926).
export function localDay(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  if (!m) return new Date(v);
  const d = new Date(2000, 0, 1);
  d.setFullYear(+m[1], +m[2] - 1, +m[3]);
  return d;
}
export const dayStart = (v) => { const d = localDay(v); d.setHours(0, 0, 0, 0); return d.getTime(); };
// Whole calendar days from a to b. A clock change makes one day 23 or 25 hours long, so the count is rounded.
export const daysBetween = (a, b) => Math.round((dayStart(b) - dayStart(a)) / DAY);
// A date someone could mean: a whole date with a year from 2000 to 2100. While a year is typed, a date field passes
// through "0002-11-06" and "0202-11-06", and a fifth digit gives "20266-11-06"; none of them is a target.
export const plausibleDay = (v) => { const m = /^(\d{4,})-\d{2}-\d{2}/.exec(String(v ?? '')); return !!m && +m[1] >= 2000 && +m[1] <= 2100; };

// Where each stage sits in time. A closed stage ends when it closed and an open one at its target; a stage with no
// date yet is estimated from its usual length (est), and an open stage past its target is late. Each stage starts
// where the one before it ended, and nothing after an open stage starts before tomorrow. The path starts at the first
// stage with a real date (a close, or the open stage); the stages before it have no date and take no time. A target
// that isn't a plausible day counts as none. Days move with the calendar (setDate), so a clock change never shifts a date.
export const addDays = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
export function schedule(p, now = Date.now()) {
  const today = dayStart(now);
  const tomorrow = addDays(today, 1);
  const len = (s) => STAGE_DAYS[s.key] || 14;
  const open = (s) => s.state === 'active' || s.state === 'pending';
  const target = (s) => (plausibleDay(s.target) ? dayStart(s.target) : null);
  if (!p.stages.length) return [];
  const k = p.stages.findIndex((s) => (s.state === 'done' && s.closedAt) || open(s));
  const first = p.stages[k];
  let cursor;
  if (p.startedAt) cursor = dayStart(p.startedAt);
  else if (!first) cursor = today;
  else if (first.state === 'done') cursor = addDays(dayStart(first.closedAt), -len(first));
  else cursor = Math.min(target(first) !== null ? addDays(target(first), -len(first)) : today, addDays(today, -7));
  return p.stages.map((s, i) => {
    const start = cursor;
    const t = target(s);
    let end;
    let est = false;
    if (i < k || s.state === 'skipped') end = start;
    else if (s.state === 'done') end = s.closedAt ? Math.max(start, dayStart(s.closedAt)) : addDays(start, len(s));
    else if (t !== null) end = Math.max(addDays(start, 1), t);
    else {
      est = true;
      end = addDays(start, len(s));
      if (open(s) && end <= today) end = tomorrow;
    }
    cursor = open(s) ? Math.max(end, tomorrow) : end;
    return { id: s.id, start, end, est, late: open(s) && t !== null && t < today };
  });
}

// When every task of the current stage is done, the card asks the stage's exit question.
export function stageReady(p, tasks) {
  const cur = currentStage(p);
  if (!cur || cur.state !== 'active') return false;
  const mine = tasks.filter((t) => t.project === p.id && t.stage === cur.id);
  return mine.length > 0 && mine.every((t) => t.status === 'done');
}

// How full the card is, so an empty field reads as "not yet" rather than "missing". Fields marked unknown or kept on
// the classified network count as answered.
export function cardFill(p) {
  const core = [p.what, p.forWhom, p.success].map((v) => !!(v && v.trim()));
  const reached = p.stages.filter((s) => s.state !== 'todo');
  const fields = reached.flatMap((s) => s.fields.map((f) => !!(f.value && f.value.trim()) || !!f.unknown || !!f.classified));
  const all = [...core, ...fields];
  return { done: all.filter(Boolean).length, of: all.length };
}
