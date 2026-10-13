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
  remove: (table, id) => req('DELETE', `/rest/v1/${table}?id=eq.${id}`),
  rpc: (fn, args = {}) => req('POST', `/rest/v1/rpc/${fn}`, { body: args }),
};

// ---------- mock backend (local testing only) ----------
function makeMock() {
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
  const now = () => new Date().toISOString();
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const P = (name, role, is_team, sort) => ({ id: uid(), name, role, is_team, sort, archived: false, created_at: now() });
  const people = [P('יואש', 'מפקד', true, 1), P('יונתן', 'חייל', true, 2), P('יהלי', 'חייל', true, 3), P('ירדן', 'יועצת', true, 4), P('Claude', 'סוכן AI', false, 50)];
  const [yoash, yonatan, yahli, yarden, claude] = people;
  const proj = { id: uid(), name: 'כלי ניהול משימות לצוות', icon: 'tasks', color: '#2F6FED', grp: 'תשתיות צוות', phase: 0, health: 'on_track', health_note: 'בלוח הזמנים', owner_id: yahli.id, status_today: '', goals: '', archived: false, start_date: day(0), target_date: day(9), description: 'פיילוט של צוות CTO', created_at: now(), updated_at: now() };
  const proj2 = { ...proj, id: uid(), name: 'דוח רבעוני לדרג הבכיר', health: 'at_risk', health_note: 'מחכים לנתונים מירדן', owner_id: yonatan.id, target_date: day(5), description: '' };
  const T = (title, owner, status, due, priority = 'medium', extra = {}) => ({
    id: uid(), project_id: proj.id, title, owner_id: owner.id, status, due, priority, phase: null, blocked_by_person: null,
    blocked_reason: null, focus: false, notes: null, created_by: yahli.id, created_at: now(), updated_at: now(), done_at: status === 'done' ? now() : null,
    archived: false, private: false, sort: null, ...extra,
  });
  const tasks = [
    T('תוכנית עבודה וגאנט', claude, 'done', day(0), 'high'),
    T('בניית MVP למחשב', claude, 'in_progress', day(0), 'high', { focus: true }),
    T('בדיקה ראשונה של ה-MVP והערות', yahli, 'todo', day(1), 'high'),
    T('הצגה ליונתן וקבלת פידבק', yahli, 'todo', day(1), 'high'),
    T('זימון פגישת התנעה ליום חמישי', yahli, 'waiting', day(1), 'medium', { blocked_by_person: yoash.id, blocked_reason: 'מחכה לאישור מועד מיואש' }),
    T('איסוף פרויקטים ומשימות מכל חבר צוות', yahli, 'in_progress', day(-1), 'high'),
    T('פגישת התנעה', yoash, 'todo', day(2), 'high'),
    T('נתוני שימוש לרבעון', yarden, 'blocked', day(-2), 'high', { project_id: proj2.id, blocked_by_person: yonatan.id, blocked_reason: 'אין גישה למערכת הדוחות' }),
    T('טיוטת דוח', yonatan, 'todo', day(4), 'medium', { project_id: proj2.id }),
    T('תעדוף רעיונות לפיצ\'רים', yonatan, 'todo', day(9), 'low'),
  ];
  const db = { people, projects: [proj, proj2], tasks, checklist: [], comments: [], activity: [], notifications: [] };
  let codeHash = '';
  const log = (task, kind, payload) => db.activity.unshift({ id: db.activity.length + 1, task_id: task.id, project_id: task.project_id, actor_id: creds.actor, kind, payload: { title: task.title, ...payload }, at: now() });
  const match = (row, params) => Object.entries(params).every(([k, v]) => {
    if (['select', 'order', 'limit'].includes(k)) return true;
    if (v === 'is.false') return row[k] === false;
    if (v === 'is.true') return row[k] === true;
    if (v === 'is.null') return row[k] == null;
    if (v.startsWith('eq.')) return String(row[k]) === v.slice(3);
    return true;
  });
  const delay = (x) => new Promise((r) => setTimeout(() => r(JSON.parse(JSON.stringify(x))), 60));
  return {
    list(table, params = {}) {
      let rows = db[table].filter((r) => match(r, params));
      if (params.order) {
        const [col, dir] = params.order.split('.');
        rows = [...rows].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1));
      }
      if (params.limit) rows = rows.slice(0, params.limit);
      return delay(rows);
    },
    insert(table, row) {
      const r = { id: uid(), created_at: now(), ...row };
      if (table === 'tasks') Object.assign(r, { status: 'todo', priority: 'medium', focus: false, archived: false, private: false, updated_at: now(), ...row });
      if (table === 'projects') Object.assign(r, { health: 'on_track', archived: false, updated_at: now(), ...row });
      if (table === 'checklist') Object.assign(r, { done: false, sort: Date.now(), ...row });
      db[table].push(r);
      if (table === 'tasks') log(r, 'created', {});
      if (table === 'comments') {
        const t = db.tasks.find((x) => x.id === r.task_id);
        if (t) {
          log(t, 'comment', { body: r.body });
          const note = (pid, kind) => db.notifications.push({ id: uid(), person_id: pid, task_id: t.id, actor_id: r.author_id, kind, body: r.body, read_at: null, created_at: now() });
          if (t.owner_id && t.owner_id !== r.author_id) note(t.owner_id, 'comment');
          db.people.filter((p) => p.id !== r.author_id && p.id !== t.owner_id && r.body.includes('@' + p.name)).forEach((p) => note(p.id, 'mention'));
        }
      }
      return delay(r);
    },
    update(table, id, patch) {
      const r = db[table].find((x) => x.id === id);
      if (!r) return Promise.reject(new Error('not found'));
      const before = { ...r };
      Object.assign(r, patch, table === 'tasks' || table === 'projects' ? { updated_at: now() } : {});
      if (table === 'tasks' && patch.status && patch.status !== before.status) {
        r.done_at = patch.status === 'done' ? now() : null;
        log(r, 'status', { from: before.status, to: patch.status });
      }
      return delay(r);
    },
    updateWhere(table, params, patch) { db[table].filter((r) => match(r, params)).forEach((r) => Object.assign(r, patch)); return delay(null); },
    remove(table, id) { db[table] = db[table].filter((x) => x.id !== id); return delay(null); },
    rpc(fn, args = {}) {
      if (fn === 'team_code_is_set') return delay(!!codeHash);
      if (fn === 'setup_team_code') { if (codeHash) return delay(false); codeHash = args.code; return delay(true); }
      if (fn === 'check_team_code') return delay(!!codeHash && args.code === codeHash);
      if (fn === 'change_team_code') { if (args.old_code !== codeHash) return delay(false); codeHash = args.new_code; return delay(true); }
      return Promise.reject(new Error('unknown rpc ' + fn));
    },
  };
}

export const isMock = typeof location !== 'undefined' && new URLSearchParams(location.search).has('mock');
export const api = isMock ? makeMock() : rest;
