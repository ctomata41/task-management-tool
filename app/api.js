// Thin client for Supabase's REST API (PostgREST), plus an in-memory mock used for local testing (?mock).
import { API_BASE, SUPABASE_ANON_KEY } from './config.js';

let creds = { code: null, actor: null };
export function setCreds(c) { creds = { ...creds, ...c }; }

function qs(params = {}) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function req(method, path, { body, prefer } = {}) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };
  if (creds.code) headers['x-team-code'] = creds.code;
  if (creds.actor) headers['x-actor'] = creds.actor;
  if (prefer) headers.Prefer = prefer;
  let res;
  try {
    res = await fetch(API_BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    const err = new Error('אין חיבור לשרת. כדאי לבדוק את החיבור לאינטרנט.');
    err.offline = true;
    throw err;
  }
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = j.message || j.error || msg; } catch (e) { /* not json */ }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

function first(rows) {
  if (!rows || !rows[0]) throw new Error('אין הרשאה לשמור. ייתכן שקוד הצוות השתנה.');
  return rows[0];
}

const rest = {
  list: (table, params) => req('GET', `/rest/v1/${table}?${qs({ select: '*', ...params })}`),
  insert: async (table, row) => first(await req('POST', `/rest/v1/${table}`, { body: row, prefer: 'return=representation' })),
  update: async (table, id, patch) =>
    first(await req('PATCH', `/rest/v1/${table}?id=eq.${id}`, { body: patch, prefer: 'return=representation' })),
  updateWhere: (table, params, patch) => req('PATCH', `/rest/v1/${table}?${qs(params)}`, { body: patch, prefer: 'return=minimal' }),
  updateSettings: async (teamId, patch) =>
    first(await req('PATCH', `/rest/v1/team_settings?team_id=eq.${teamId}`, { body: patch, prefer: 'return=representation' })),
  remove: (table, id) => req('DELETE', `/rest/v1/${table}?id=eq.${id}`),
  rpc: (fn, args = {}) => req('POST', `/rest/v1/rpc/${fn}`, { body: args }),
};

// Every row of a table, a page at a time (the API returns at most 1000 rows per request).
export async function listAll(table, order = 'created_at.asc') {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const rows = await api.list(table, { order, limit: 1000, offset });
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

// ---------- mock backend (local testing only) ----------
function makeMock() {
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
  const now = () => new Date().toISOString();
  const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const teamId = uid();
  const P = (name, role, is_team, sort, extra = {}) => ({ id: uid(), team_id: teamId, name, role, is_team, sort, archived: false, created_at: now(), is_command: false, is_agent: false, declared_at: null, ...extra });
  const people = [
    P('יואש', 'מפקד', true, 1, { is_command: true }), P('יונתן', 'חייל', true, 2, { is_command: true }), P('יהלי', 'חייל', true, 3),
    P('ירדן', 'יועצת', true, 4), P('Claude', 'סוכן AI', false, 50, { is_agent: true }),
  ];
  const [yoash, yonatan, yahli, yarden, claude] = people;
  const proj = {
    id: uid(), team_id: teamId, name: 'כלי ניהול משימות לצוות', icon: 'tasks', color: '#2F6FED', grp: 'תשתיות צוות', phase: 0, health: 'on_track',
    health_note: 'בלוח הזמנים', owner_id: yahli.id, partner_ids: [yonatan.id], status_today: '', goals: '', archived: false, start_date: day(-1), target_date: day(8),
    description: 'פלטפורמה אחת שבה הצוות רואה מה מחכה להחלטה, מה Claude עושה ומה הבטחנו החוצה.', brief: 'אפליקציית ווב סטטית מעל Supabase. עברית מימין לשמאל, טלפון קודם.',
    milestones: [{ id: 'm1', title: 'דמו ליונתן', due: day(0), done: false }, { id: 'm2', title: 'התנעה עם כל הצוות', due: day(1), done: false }, { id: 'm3', title: 'רטרו והחלטה על המשך', due: day(8), done: false }],
    links: [{ label: 'האפליקציה', url: 'https://cto-tasks.vercel.app' }], stakeholders: 'יונתן מאשר, יואש בעלים', risks: 'הצוות חוזר לוואטסאפ אם הכלי מעמיס',
    classified: false, flagged: false, stage: 'active', created_at: ago(30), updated_at: now(),
  };
  const proj2 = {
    ...proj, id: uid(), name: 'דוח רבעוני לדרג הבכיר', color: '#0C8599', health: 'at_risk', health_note: 'מחכים לנתונים מהמו״פ', owner_id: yonatan.id,
    partner_ids: [yarden.id], target_date: day(5), description: 'דוח של עמוד אחד על מה שהצוות מסר ברבעון.', brief: '', milestones: [], links: [], stakeholders: 'הדרג הבכיר', risks: '',
  };
  const proj3 = {
    ...proj, id: uid(), name: 'הקלטה קולית לפלטפורמה', color: '#AE3EC9', health: 'on_track', health_note: '', owner_id: yahli.id, partner_ids: [],
    stage: 'proposed', start_date: null, target_date: null, description: 'הקלטה קצרה מהטלפון שהופכת להחלטות ולמטלות, עם תקרה של 50 דולר בחודש.',
    brief: '', milestones: [], links: [], stakeholders: '', risks: '', created_at: ago(6),
  };
  const T = (title, owner, status, due, priority = 'medium', extra = {}) => ({
    id: uid(), team_id: teamId, project_id: proj.id, title, owner_id: owner.id, status, due, priority, phase: null, blocked_by_person: null,
    blocked_reason: null, focus: false, notes: null, created_by: yahli.id, created_at: ago(20), updated_at: ago(2), done_at: status === 'done' ? ago(3) : null,
    archived: false, private: false, sort: null, kind: owner.is_agent ? 'claude' : 'human', htype: 'general', accountable_id: owner.is_agent ? yahli.id : null,
    done_def: null, evidence: null, decision_id: null, flagged: false, ...extra,
  });
  const tasks = [
    T('תוכנית עבודה וגאנט', claude, 'done', day(-1), 'high'),
    T('בניית המודל החדש: החלטות, משימות ומטלות', claude, 'in_progress', day(0), 'high', { done_def: 'עובד במחשב ובטלפון, בלי שגיאות' }),
    T('מסך "מה מחכה לי"', claude, 'review', day(0), 'high', { done_def: 'כל ההחלטות והמטלות שלי בתור אחד', evidence: 'https://cto-tasks.vercel.app/#/home' }),
    T('בדיקה ראשונה של ה-MVP והערות', yahli, 'todo', day(0), 'high', { focus: true }),
    T('לקבוע פגישה עם ממונה ביטחון המידע', yahli, 'todo', day(1), 'high', { htype: 'meeting', notes: 'אישור לחבר את Claude ואת הקול' }),
    T('להתחבר ל-ElevenLabs עם חשבון הצוות', yahli, 'todo', day(3), 'medium', { htype: 'auth' }),
    T('זימון פגישת התנעה ליום חמישי', yahli, 'waiting', day(1), 'medium', { blocked_by_person: yoash.id, blocked_reason: 'מחכה לאישור מועד מיואש' }),
    T('פגישת התנעה', yoash, 'todo', day(1), 'high'),
    T('נתוני שימוש לרבעון', yarden, 'blocked', day(-2), 'high', { project_id: proj2.id, blocked_by_person: yonatan.id, blocked_reason: 'אין גישה למערכת הדוחות', updated_at: ago(60) }),
    T('טיוטת דוח', claude, 'todo', day(4), 'medium', { project_id: proj2.id, accountable_id: yonatan.id, done_def: 'עמוד אחד, מהנתונים בלבד' }),
    T('תעדוף רעיונות לפיצ\'רים', yonatan, 'todo', day(8), 'low'),
  ];
  const D = (title, extra) => ({
    id: uid(), team_id: teamId, project_id: proj.id, title, context: null, kind: 'direction', options: [], reason: null, unblocks: null, due: null,
    assignee_id: yahli.id, status: 'open', chosen_key: null, chosen_label: null, rationale: null, decided_by: null, decided_at: null, source: 'app',
    created_by: yahli.id, created_at: ago(5), updated_at: ago(5), archived: false, flagged: false, ...extra,
  });
  const decisions = [
    D('להמשיך עם הפלטפורמה אחרי הפיילוט?', {
      kind: 'gate', assignee_id: yoash.id, due: day(15), created_at: ago(76),
      options: [{ key: 'a', label: 'להמשיך', note: 'עוברים לשלב ב׳: המחבר ל-Claude', recommended: true }, { key: 'b', label: 'לשפר ולהריץ שוב', note: 'עוד שבועיים פיילוט' }, { key: 'c', label: 'לעצור' }],
      reason: 'כלל ההחלטה מהאפיון: 70% מהיעדים כולל כל יעדי החובה', unblocks: 'שלב ב׳ ותוכנית האחסון',
    }),
    D('איך ה-Claude של כל אחד יתחבר לפלטפורמה?', {
      options: [{ key: 'a', label: 'מחבר MCP אישי לכל אחד', note: 'בלי עלות, בהרשאות של כל אחד', recommended: true }, { key: 'b', label: 'חשבון API משותף', note: 'עולה כסף, מפתח אחד לכולם' }],
      reason: 'עובד על המנויים הקיימים ולא דורש תקציב', unblocks: 'המחבר ל-Claude', created_at: ago(20),
    }),
    D('לאשר את האפיון ולהתחיל את שלב א׳?', { kind: 'approval', assignee_id: yonatan.id, created_by: yahli.id, created_at: ago(8) }),
    D('לפתוח את הפרויקט "הקלטה קולית לפלטפורמה"?', {
      kind: 'gate', project_id: proj3.id, assignee_id: yoash.id, created_at: ago(6), context: proj3.description,
      options: [{ key: 'open', label: 'לפתוח', effect: 'open', recommended: true }, { key: 'later', label: 'לא עכשיו' }, { key: 'no', label: 'לא לפתוח', effect: 'stop' }],
    }),
    D('מה קודם בשבוע הבא: המחבר ל-Claude או הדוח הרבעוני?', { kind: 'priority', project_id: null, assignee_id: null, created_at: ago(30) }),
    D('לשלם על האחסון כבר בפיילוט?', {
      status: 'decided', chosen_key: 'a', chosen_label: 'חינם בפיילוט', rationale: 'מחליטים ברטרו אם ממשיכים', decided_by: yahli.id, decided_at: ago(4),
      options: [{ key: 'a', label: 'חינם בפיילוט', recommended: true }, { key: 'b', label: 'לשלם כבר עכשיו' }],
    }),
  ];
  const C = (title, extra) => ({
    id: uid(), team_id: teamId, project_id: proj.id, direction: 'we_owe', title, counterpart: null, contact: null, owner_id: yahli.id, due: null,
    status: 'open', done_at: null, notes: null, created_by: yahli.id, created_at: ago(10), updated_at: ago(10), archived: false, flagged: false, ...extra,
  });
  const commitments = [
    C('מצגת התנעה וחוזה עבודה', { counterpart: 'הצוות ויונתן', due: day(1) }),
    C('נתוני שימוש לרבעון', { direction: 'they_owe', counterpart: 'מחלקת המו״פ', owner_id: yarden.id, project_id: proj2.id, due: day(-1), created_at: ago(70) }),
    C('הצגת הדוח לדרג הבכיר', { counterpart: 'הדרג הבכיר', owner_id: yonatan.id, project_id: proj2.id, due: day(6), created_at: ago(60), updated_at: ago(60) }),
  ];
  // Reminders the rule sent: one this morning about tomorrow's delivery, one yesterday that nobody answered.
  const reminders = [
    { id: uid(), team_id: teamId, commitment_id: commitments[0].id, person_id: yahli.id, step: '1', due: commitments[0].due, sent_at: ago(2), answered_at: null, answered_by: null },
    { id: uid(), team_id: teamId, commitment_id: commitments[2].id, person_id: yonatan.id, step: '5', due: commitments[2].due, sent_at: ago(26), answered_at: null, answered_by: null },
  ];
  const ruleRuns = [
    { id: 2, team_id: teamId, rule: 'commitment_reminders', run_date: day(0), ran_at: ago(2), summary: 'תזכורת אחת', details: [{ title: commitments[0].title, owner: 'יהלי', step: '1' }] },
    { id: 1, team_id: teamId, rule: 'commitment_reminders', run_date: day(-1), ran_at: ago(26), summary: 'תזכורת אחת', details: [{ title: commitments[2].title, owner: 'יונתן', step: '5' }] },
  ];
  const rules = [
    { team_id: teamId, key: 'digest', title: 'תקציר יומי', sort: 1, status: 'proposed', approved_by: null, approved_at: null, updated_by: null, updated_at: ago(20),
      body: 'בכל יום עבודה, בשעת התקציר של הצוות, מי שהפעיל התראות מקבל לטלפון התראה אחת: עד חמישה דברים שמחכים לו, כל אחד עם הסיבה, ואחריהם מה שקרה מאז התקציר הקודם ולא שלח התראה (תגובות, החלטות שהתקבלו, חסמים ששוחררו). המפקד לא מקבל תקציר יומי.' },
    { team_id: teamId, key: 'commitment_reminders', title: 'תזכורות להתחייבויות', sort: 2, status: 'active', approved_by: yonatan.id, approved_at: ago(28), updated_by: yonatan.id, updated_at: ago(28),
      body: 'חמישה ימי עבודה ויום עבודה אחד לפני המועד של התחייבות פתוחה, הבעלים שלה מקבל תזכורת בהתראות ובתקציר. תזכורת שלא נענתה תוך יום עבודה (ההתחייבות לא עודכנה ולא סומנה "בזמן") מעלה את ההתחייבות לתצוגת הצוות והפיקוד, עם "עלה כי התזכורת לא נענתה".' },
  ];
  const ideas = [
    { id: uid(), team_id: teamId, title: 'סיכום פגישה אוטומטי מתוך הקלטה', notes: null, status: 'new', project_id: null, created_by: yonatan.id, created_at: ago(30), updated_at: ago(30), archived: false, flagged: false },
    { id: uid(), team_id: teamId, title: 'לוח מינוף לדרג הבכיר', notes: 'שלב ד׳', status: 'new', project_id: null, created_by: yahli.id, created_at: ago(12), updated_at: ago(12), archived: false, flagged: false },
  ];
  const db = {
    people, projects: [proj, proj2, proj3], tasks, checklist: [], comments: [], activity: [], decisions, commitments, ideas, meetings: [],
    notifications: [{ id: uid(), person_id: yahli.id, actor_id: null, kind: 'reminder', body: `${commitments[0].title}: המסירה אל הצוות ויונתן מחר`, task_id: null, decision_id: null, commitment_id: commitments[0].id, read_at: null, created_at: ago(2) }],
    teams: [{ id: teamId, name: 'צוות CTO', created_at: now() }],
    team_settings: [{ team_id: teamId, context: '', word_hashes: [], updated_by: null, updated_at: now(), quiet_from: '19:00:00', quiet_to: '08:00:00', quiet_days: [5, 6], digest_at: '08:00:00' }],
    rules, rule_runs: ruleRuns, reminders, push_subscriptions: [],
  };
  let codeHash = '';
  let seq = 0;
  const isAgent = (id) => !!db.people.find((p) => p.id === id && p.is_agent);
  const note = (pid, kind, ref, body) => {
    if (!pid || pid === creds.actor || isAgent(pid)) return;
    db.notifications.push({ id: uid(), person_id: pid, actor_id: creds.actor, kind, body, read_at: null, created_at: now(), task_id: null, decision_id: null, commitment_id: null, ...ref });
  };
  const log = (ref, kind, payload) => db.activity.unshift({ id: ++seq, task_id: null, project_id: null, decision_id: null, commitment_id: null, actor_id: creds.actor, kind, payload, at: now(), ...ref });
  // Like the database: a decided gate decision opens or stops its project.
  const applyGate = (d) => {
    if (d.kind !== 'gate' || !d.project_id || d.status !== 'decided') return;
    const effect = (d.options || []).find((o) => o.key === d.chosen_key)?.effect;
    const pr = db.projects.find((x) => x.id === d.project_id);
    const to = effect === 'open' ? 'active' : effect === 'stop' ? 'stopped' : null;
    if (!pr || !to || pr.stage === to) return;
    log({ project_id: pr.id }, 'project_stage', { title: pr.name, from: pr.stage, to });
    pr.stage = to;
  };
  const cmp = (a, op, b) => {
    if (a == null) return false;
    const x = String(a); const y = b;
    return op === 'gt' ? x > y : op === 'gte' ? x >= y : op === 'lt' ? x < y : op === 'lte' ? x <= y : true;
  };
  const match = (row, params) => Object.entries(params).every(([k, v]) => {
    if (['select', 'order', 'limit', 'offset'].includes(k)) return true;
    if (v === 'is.false') return row[k] === false;
    if (v === 'is.true') return row[k] === true;
    if (v === 'is.null') return row[k] == null;
    if (v.startsWith('eq.')) return String(row[k]) === v.slice(3);
    const m = /^(gt|gte|lt|lte)\.(.*)$/.exec(v);
    if (m) return cmp(row[k], m[1], m[2]);
    return true;
  });
  const delay = (x) => new Promise((r) => setTimeout(() => r(JSON.parse(JSON.stringify(x))), 60));
  const DEFAULTS = {
    tasks: () => ({ status: 'todo', priority: 'medium', focus: false, archived: false, private: false, kind: 'human', htype: 'general', flagged: false, updated_at: now(), team_id: teamId }),
    projects: () => ({ health: 'on_track', stage: 'active', archived: false, partner_ids: [], milestones: [], links: [], classified: false, flagged: false, updated_at: now(), team_id: teamId }),
    checklist: () => ({ done: false, sort: Date.now() }),
    comments: () => ({ flagged: false }),
    decisions: () => ({ kind: 'direction', options: [], status: 'open', source: 'app', archived: false, flagged: false, updated_at: now(), team_id: teamId }),
    commitments: () => ({ direction: 'we_owe', status: 'open', archived: false, flagged: false, updated_at: now(), team_id: teamId }),
    ideas: () => ({ status: 'new', archived: false, flagged: false, updated_at: now(), team_id: teamId }),
    meetings: () => ({ updated_at: now(), team_id: teamId }),
  };
  return {
    list(table, params = {}) {
      let rows = db[table].filter((r) => match(r, params));
      if (params.order) {
        const [col, dir] = params.order.split('.');
        rows = [...rows].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1));
      }
      if (params.offset) rows = rows.slice(+params.offset);
      if (params.limit) rows = rows.slice(0, +params.limit);
      return delay(rows);
    },
    insert(table, row) {
      if (table === 'meetings' && db.meetings.some((m) => m.week_start === row.week_start)) return Promise.reject(new Error('duplicate key value'));
      const r = { id: uid(), created_at: now(), ...(DEFAULTS[table] ? DEFAULTS[table]() : {}), ...row };
      db[table].push(r);
      if (table === 'tasks') {
        log({ task_id: r.id, project_id: r.project_id }, 'created', { title: r.title, kind: r.kind });
        note(r.owner_id, 'assigned', { task_id: r.id }, r.title);
        if (r.kind === 'claude' && r.accountable_id !== r.owner_id) note(r.accountable_id, 'accountable', { task_id: r.id }, r.title);
      }
      if (table === 'comments') {
        const t = db.tasks.find((x) => x.id === r.task_id);
        if (t) {
          const target = isAgent(t.owner_id) ? t.accountable_id : t.owner_id;
          log({ task_id: t.id, project_id: t.project_id }, 'comment', { title: t.title, body: r.body });
          if (target !== r.author_id) note(target, 'comment', { task_id: t.id }, r.body);
          db.people.filter((p) => p.id !== r.author_id && p.id !== target && !p.is_agent && r.body.includes('@' + p.name)).forEach((p) => note(p.id, 'mention', { task_id: t.id }, r.body));
        }
      }
      if (table === 'decisions') {
        if (r.status === 'decided') Object.assign(r, { decided_at: r.decided_at || now(), decided_by: r.decided_by || creds.actor });
        log({ decision_id: r.id, project_id: r.project_id }, 'decision_new', { title: r.title });
        applyGate(r);
        if (r.status === 'open') note(r.assignee_id, 'decision', { decision_id: r.id }, r.title);
      }
      if (table === 'commitments') {
        log({ commitment_id: r.id, project_id: r.project_id }, 'commitment_new', { title: r.title, direction: r.direction, counterpart: r.counterpart });
        note(r.owner_id, 'commitment', { commitment_id: r.id }, r.title);
      }
      if (table === 'projects') log({ project_id: r.id }, 'project_new', { title: r.name, stage: r.stage });
      if (table === 'ideas') log({}, 'idea_new', { title: r.title, idea_id: r.id });
      return delay(r);
    },
    update(table, id, patch) {
      const r = db[table].find((x) => x.id === id);
      if (!r) return Promise.reject(new Error('not found'));
      const before = { ...r };
      Object.assign(r, patch, DEFAULTS[table] && table !== 'checklist' && table !== 'comments' ? { updated_at: now() } : {});
      if (table === 'tasks') {
        if (patch.status && patch.status !== before.status) {
          r.done_at = patch.status === 'done' ? now() : null;
          log({ task_id: r.id, project_id: r.project_id }, 'status', { from: before.status, to: patch.status, title: r.title, kind: r.kind });
          if (patch.status === 'review') note(r.accountable_id || r.created_by, 'review', { task_id: r.id }, r.title);
          if (before.status === 'blocked') note(r.owner_id, 'unblocked', { task_id: r.id }, r.title);
        }
        if (patch.owner_id && patch.owner_id !== before.owner_id) {
          log({ task_id: r.id, project_id: r.project_id }, 'assigned', { to: r.owner_id, title: r.title });
          note(r.owner_id, 'assigned', { task_id: r.id }, r.title);
        }
        if (patch.blocked_by_person && patch.blocked_by_person !== before.blocked_by_person && ['blocked', 'waiting'].includes(r.status)) note(r.blocked_by_person, 'blocked_by_you', { task_id: r.id }, r.blocked_reason || r.title);
        if (patch.due !== undefined && patch.due !== before.due) log({ task_id: r.id, project_id: r.project_id }, 'due', { from: before.due, to: r.due, title: r.title });
      }
      if (table === 'decisions' && patch.status && patch.status !== before.status) {
        if (r.status === 'decided') { r.decided_at = now(); r.decided_by = r.decided_by || creds.actor; }
        if (r.status === 'open') { r.decided_at = null; r.decided_by = null; }
        log({ decision_id: r.id, project_id: r.project_id }, 'decision_' + r.status, { title: r.title, chosen: r.chosen_label, rationale: r.rationale });
        if (r.status === 'decided') {
          const lead = db.projects.find((p) => p.id === r.project_id)?.owner_id;
          [...new Set([r.created_by, lead])].forEach((pid) => note(pid, 'decided', { decision_id: r.id }, r.chosen_label || r.title));
          applyGate(r);
        }
      }
      if (table === 'decisions' && patch.assignee_id && patch.assignee_id !== before.assignee_id && r.status === 'open') note(r.assignee_id, 'decision', { decision_id: r.id }, r.title);
      if (table === 'commitments') {
        if (patch.status && patch.status !== before.status) {
          r.done_at = r.status === 'done' ? now() : null;
          log({ commitment_id: r.id, project_id: r.project_id }, 'commitment_' + r.status, { title: r.title, direction: r.direction, counterpart: r.counterpart });
        }
        if (patch.owner_id && patch.owner_id !== before.owner_id) note(r.owner_id, 'commitment', { commitment_id: r.id }, r.title);
      }
      if (table === 'projects' && patch.health && patch.health !== before.health) log({ project_id: r.id }, 'project_health', { title: r.name, from: before.health, to: r.health, note: r.health_note });
      if (table === 'projects' && patch.stage && patch.stage !== before.stage) log({ project_id: r.id }, 'project_stage', { title: r.name, from: before.stage, to: r.stage });
      return delay(r);
    },
    updateWhere(table, params, patch) { db[table].filter((r) => match(r, params)).forEach((r) => Object.assign(r, patch)); return delay(null); },
    updateSettings(teamId2, patch) {
      const r = db.team_settings.find((x) => x.team_id === teamId2);
      Object.assign(r, patch, { updated_at: now() });
      return delay(r);
    },
    remove(table, id) { db[table] = db[table].filter((x) => x.id !== id); return delay(null); },
    rpc(fn, args = {}) {
      if (fn === 'team_code_is_set') return delay(!!codeHash);
      if (fn === 'setup_team_code') { if (codeHash) return delay(false); codeHash = args.code; return delay(true); }
      if (fn === 'check_team_code') return delay(!!codeHash && args.code === codeHash);
      if (fn === 'change_team_code') { if (args.old_code !== codeHash) return delay(false); codeHash = args.new_code; return delay(true); }
      if (fn === 'redact_item') {
        if (!db.people.find((p) => p.id === creds.actor)?.is_command) return Promise.reject(new Error('רק הפיקוד מסיר תוכן'));
        const table = { task: 'tasks', decision: 'decisions', commitment: 'commitments', idea: 'ideas', project: 'projects', comment: 'comments' }[args.item_kind];
        const r = db[table].find((x) => x.id === args.item_id);
        const gone = '[הוסר: חשד למידע מסווג]';
        if (r) Object.assign(r, table === 'comments' ? { body: gone, flagged: false } : { [table === 'projects' ? 'name' : 'title']: gone, flagged: false, archived: true, notes: null, context: null });
        db.activity.forEach((a) => { if ([a.task_id, a.decision_id, a.commitment_id, a.payload?.idea_id].includes(args.item_id)) a.payload = { title: gone }; });
        return delay(true);
      }
      const actor = db.people.find((p) => p.id === creds.actor);
      const teamPerson = !!actor && actor.is_team && !actor.is_agent && !actor.archived;
      if (fn === 'push_subscribe') {
        if (!actor || actor.is_agent) return Promise.reject(new Error('צריך לבחור מי משתמש במכשיר'));
        db.push_subscriptions = db.push_subscriptions.filter((x) => x.endpoint !== args.endpoint);
        db.push_subscriptions.push({ endpoint: args.endpoint, person_id: actor.id, device: args.device || null, created_at: now(), last_ok_at: null, last_status: null });
        return delay(true);
      }
      if (fn === 'push_unsubscribe') {
        const had = db.push_subscriptions.some((x) => x.endpoint === args.endpoint);
        db.push_subscriptions = db.push_subscriptions.filter((x) => x.endpoint !== args.endpoint);
        return delay(had);
      }
      if (fn === 'push_devices') return delay(db.push_subscriptions.filter((x) => x.person_id === creds.actor));
      if (fn === 'rule_set') {
        if (!teamPerson) return Promise.reject(new Error('רק אדם מהצוות מאשר או משהה כלל'));
        const r = db.rules.find((x) => x.key === args.rule_key);
        if (!r) return Promise.reject(new Error('הכלל לא נמצא'));
        Object.assign(r, { status: args.to_status, updated_by: actor.id, updated_at: now() }, args.to_status === 'active' ? { approved_by: actor.id, approved_at: now() } : {});
        log({}, 'rule_' + args.to_status, { title: r.title });
        return delay(true);
      }
      if (fn === 'reminder_answer') {
        if (!teamPerson) return Promise.reject(new Error('רק אדם מהצוות עונה על תזכורת'));
        const open = db.reminders.filter((x) => x.commitment_id === args.commitment && !x.answered_at);
        open.forEach((x) => Object.assign(x, { answered_at: now(), answered_by: actor.id }));
        const c = db.commitments.find((x) => x.id === args.commitment);
        if (open.length && c) log({ commitment_id: c.id, project_id: c.project_id }, 'commitment_on_track', { title: c.title, direction: c.direction, counterpart: c.counterpart });
        return delay(open.length > 0);
      }
      return Promise.reject(new Error('unknown rpc ' + fn));
    },
  };
}

export const isMock = typeof location !== 'undefined' && new URLSearchParams(location.search).has('mock');
export const api = isMock ? makeMock() : rest;
