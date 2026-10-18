// Live mode: the control center on the team's real data. It signs in the way the app does (the team code and the
// person picked there, kept in this browser under cto.auth), loads projects, decisions, human steps, Claude's runs and
// outputs, and polls. Every action on screen is written back here. Claude's side of the same data is the connector
// (supabase/functions/mcp): what Claude reports shows up on the next refresh, and what people do here is what Claude
// reads back.
import { api, setCreds, isMock } from '../app/api.js';
import { sensitiveHits, textsIn } from '../app/guard.js';
import { set, getState, setRemote, toast, person, project } from './store.js';

const AUTH_KEY = 'cto.auth';
const SEEN_KEY = 'next.seen'; // when this person last looked, so new outputs show as new
const POLL_MS = 15000;
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
};
const PALETTE = ['#3B5BDB', '#0C8599', '#D9480F', '#2B8A3E', '#AE3EC9', '#E67700', '#C2255C'];
const PCOLORS = ['#5856d6', '#ff2d55', '#ff9500', '#30b0c7', '#34c759', '#af52de', '#0071e3'];
const STAGE = { proposed: 'מוצע', active: 'פעיל', stopped: 'נעצר' };
const RUN_STATE = { running: 'run', waiting: 'wait', review: 'review', done: 'done', queued: 'queued', stopped: 'stopped' };
const HTYPE = { payment: 'pay', general: 'other' };
const CTA = { connect: 'חיברתי', auth: 'אישרתי', file: 'העליתי', pay: 'שילמתי', meeting: 'נקבע', other: 'בוצע' };
const DAY = 864e5;

let auth = null;
let me = null;
let words = [];
let pending = 0;
let timer = null;
let seenAt = 0;
let seenIds = new Set();

// The app's own sign-in, on the same origin. ?demo always shows the sample data.
export function liveAuth() {
  if (typeof location === 'undefined' || new URLSearchParams(location.search).has('demo') || isMock) return null;
  const a = LS.get(AUTH_KEY);
  return a?.code && a?.me ? a : null;
}

export async function startLive() {
  auth = liveAuth();
  if (!auth) return false;
  setCreds({ code: auth.code, actor: auth.me });
  const seen = LS.get(SEEN_KEY) || {};
  seenAt = seen.at || Date.now() - 3 * DAY;
  seenIds = new Set(seen.ids || []);
  try {
    const ok = await load();
    if (!ok) return false;
  } catch (e) {
    console.warn('live mode off:', e.message);
    return false;
  }
  setRemote(writes);
  const tick = () => { if (document.visibilityState === 'visible' && !pending) load().catch(() => {}); };
  timer = setInterval(tick, POLL_MS);
  window.addEventListener('focus', tick);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') LS.set(SEEN_KEY, { at: Date.now(), ids: [] });
  });
  return true;
}
export const stopLive = () => clearInterval(timer);

// A table that is not there yet (the connector's migration not run) reads as empty instead of failing the page.
const maybe = (p) => p.catch((e) => { if (e.status === 404 || e.status === 400) return null; throw e; });

async function load() {
  const since = new Date(Date.now() - 42 * DAY).toISOString();
  const [people, projects, decisions, tasks, runs, outputs, activity, settings] = await Promise.all([
    api.list('people', { archived: 'is.false', order: 'sort.asc' }),
    api.list('projects', { archived: 'is.false', order: 'created_at.asc' }),
    api.list('decisions', { archived: 'is.false', status: 'in.(open,decided)', order: 'created_at.desc', limit: 400 }),
    api.list('tasks', { archived: 'is.false', kind: 'eq.human', or: `(status.neq.done,done_at.gte.${since})`, order: 'created_at.desc', limit: 500 }),
    maybe(api.list('runs', { archived: 'is.false', order: 'updated_at.desc', limit: 200 })),
    maybe(api.list('outputs', { archived: 'is.false', order: 'created_at.desc', limit: 300 })),
    api.list('activity', { order: 'at.desc', limit: 150 }),
    maybe(api.list('team_settings', { select: 'team_id,word_hashes,connector_enabled' })).then((r) => r || maybe(api.list('team_settings', { select: 'team_id,word_hashes' }))),
  ]);
  if (!people.length || !people.some((p) => p.id === auth.me)) return false; // a wrong or changed team code reads as no rows
  me = people.find((p) => p.id === auth.me);
  const humans = people.filter((p) => !p.is_agent);
  const agentIds = new Set(people.filter((p) => p.is_agent).map((p) => p.id));
  const cmd = !!me.is_command;
  words = settings?.[0]?.word_hashes || [];

  const ppl = humans.map((p, i) => ({ id: p.id, name: p.name, role: p.role || '', color: PALETTE[i % PALETTE.length], isTeam: p.is_team }));
  const prj = projects.filter((p) => !p.flagged || cmd).map((p, i) => {
    const start = p.start_date || p.created_at;
    const dues = (p.milestones || []).map((m) => m.due).filter(Boolean).sort();
    const end = p.target_date || dues.at(-1) || new Date(new Date(start).getTime() + 30 * DAY).toISOString();
    let prev = start;
    const milestones = (p.milestones || []).map((m) => {
      const ms = { id: m.id, title: m.title, start: prev, end: m.due || end, done: !!m.done };
      if (m.due) prev = m.due;
      return ms;
    });
    return {
      id: p.id, name: p.name, emoji: p.icon || '◆', color: p.color || PCOLORS[i % PCOLORS.length],
      lead: p.owner_id, partners: p.partner_ids || [],
      goal: p.classified ? 'הפרטים ברשת המסווגת' : (p.description || ''),
      stage: STAGE[p.stage] || p.stage || '', start, end, milestones, classified: p.classified,
    };
  });
  const pids = new Set(prj.map((p) => p.id));
  const inProject = (x) => !x.project_id || pids.has(x.project_id);

  const decs = decisions.filter((d) => (!d.flagged || cmd) && inProject(d)).map((d) => {
    const opts = (d.options || []).map((o, i) => ({ id: o.key || String(i), label: o.label, why: o.note || '' }));
    const rec = (d.options || []).find((o) => o.recommended)?.key || opts[0]?.id;
    return {
      id: d.id, project: d.project_id, owner: d.assignee_id, due: d.due, created: d.created_at, q: d.title,
      unblocks: d.unblocks || '', agent: d.run_id, options: opts, rec, context: d.context, reason: d.reason,
      choice: d.status === 'decided' ? (d.chosen_label || 'הוחלט') : null, decidedAt: d.decided_at, source: d.source,
    };
  });
  const steps = tasks.filter((t) => (!t.flagged || cmd) && inProject(t) && (!t.private || t.owner_id === me.id || t.created_by === me.id)).map((t) => {
    const type = HTYPE[t.htype] || t.htype || 'other';
    return {
      id: t.id, project: t.project_id, type, owner: t.owner_id, title: t.title, blocks: t.run_id, created: t.created_at,
      cta: CTA[type] || 'בוצע', note: t.notes ? t.notes.slice(0, 120) : '', done: t.status === 'done', doneAt: t.done_at, due: t.due,
    };
  });
  const agents = (runs || []).filter(inProject).map((r) => ({
    id: r.id, project: r.project_id, owner: r.person_id, title: r.title, state: RUN_STATE[r.state] || 'run',
    progress: r.progress || 0, step: r.stop_requested && !['stopped', 'done'].includes(r.state) ? 'ביקשת לעצור. Claude יעצור בעדכון הבא' : (r.step || ''),
    started: r.created_at, updated: r.updated_at, lastSeen: r.last_seen_at, brief: r.brief, url: r.session_url, summary: r.summary,
    stopRequested: r.stop_requested, source: r.source,
  }));
  const outs = (outputs || []).filter(inProject).map((o) => ({
    id: o.id, project: o.project_id, agent: o.run_id, kind: o.kind, title: o.title, summary: o.summary || '', at: o.created_at,
    url: o.url || '#', review: o.status === 'review', approved: o.status === 'approved', changes: o.status === 'changes',
    feedback: o.feedback, fresh: new Date(o.created_at).getTime() > seenAt && !seenIds.has(o.id) && o.created_by === me.id,
  }));
  const feed = activity.filter(inProject).map((a) => feedLine(a, agentIds, humans)).filter(Boolean);

  set({
    mode: 'live', me: me.id, people: ppl, projects: prj, decisions: decs, humanTasks: steps, agents, outputs: outs, feed,
    meetingAsks: [], events: [], gcal: false, interviews: {}, weekly: weeklyFrom(outs, decs, steps),
    connector: { ready: runs !== null, enabled: settings?.[0]?.connector_enabled ?? false, teamId: settings?.[0]?.team_id },
  });
  return true;
}

function feedLine(a, agentIds, humans) {
  const p = a.payload || {};
  const t = p.title || '';
  if (!t) return null;
  const who = agentIds.has(a.actor_id) ? 'Claude' : humans.find((h) => h.id === a.actor_id)?.name || '';
  const by = (s) => (who && who !== 'Claude' ? `${who}: ${s}` : s);
  const line = {
    run_queued: ['הופעל Claude: ' + t, 'progress'], run_running: ['Claude עובד על ' + t, 'progress'],
    run_waiting: ['Claude מחכה לאדם: ' + t, 'stuck'], run_review: ['מוכן לבדיקה: ' + t, 'review'],
    run_done: ['Claude סיים: ' + t, 'output'], run_stopped: ['נעצר: ' + t, 'stuck'], run_stop_requested: [by('ביקש לעצור את ' + t), 'stuck'],
    output_new: ['Claude העלה: ' + t, 'output'], output_approved: [by('אישר את ' + t), 'review'], output_changes: [by('ביקש שינויים ב' + t), 'review'],
    decision_new: [(who === 'Claude' ? 'Claude פתח החלטה: ' : by('החלטה חדשה: ')) + t, 'decision'],
    decision_decided: [by(`הוחלט: ${t} ${p.chosen || ''}`), 'decision'],
    created: [(who === 'Claude' ? 'Claude ביקש: ' : by('מטלה חדשה: ')) + t, 'progress'],
    status: p.to === 'done' ? [by('בוצע: ' + t), 'progress'] : null,
  }[a.kind];
  return line ? { id: a.id, project: a.project_id, at: a.at, text: line[0], kind: line[1] } : null;
}

// The numbers behind "תובנות", for the last six weeks, from what actually happened.
function weeklyFrom(outs, decs, steps) {
  const sun = new Date(); sun.setHours(0, 0, 0, 0); sun.setDate(sun.getDate() - sun.getDay());
  const weeks = [5, 4, 3, 2, 1, 0].map((k) => [sun.getTime() - k * 7 * DAY, sun.getTime() - (k - 1) * 7 * DAY]);
  const inW = (iso, [a, b]) => { const t = new Date(iso).getTime(); return t >= a && t < b; };
  const hours = (a, b) => Math.max(0, (new Date(b) - new Date(a)) / 3600e3);
  return {
    labels: weeks.map((w, i) => (i === 5 ? 'השבוע' : `${new Date(w[0]).getDate()}/${new Date(w[0]).getMonth() + 1}`)),
    outputs: weeks.map((w) => outs.filter((o) => inW(o.at, w)).length),
    waitHours: weeks.map((w) => Math.round(steps.filter((t) => t.blocks && t.done && t.doneAt && inW(t.doneAt, w)).reduce((n, t) => n + hours(t.created, t.doneAt), 0))),
    decisionHours: weeks.map((w) => {
      const ds = decs.filter((d) => d.choice && d.decidedAt && inW(d.decidedAt, w));
      return ds.length ? Math.round(ds.reduce((n, d) => n + hours(d.created, d.decidedAt), 0) / ds.length) : 0;
    }),
  };
}

// Classified information never enters the platform: the same check the app runs before every write.
async function guard(value) {
  if (await sensitiveHits(textsIn(value).join('\n'), words)) {
    throw new Error('נמצאה מילה מרשימת המילים הרגישות של הצוות, אז זה לא נשמר. כדאי לנסח מחדש.');
  }
}
const now = () => new Date().toISOString();
async function write(fn) {
  pending++;
  try { return await fn(); } finally { pending--; }
}

// What people do on screen, written back. Claude reads all of it through the connector.
const writes = {
  refresh: () => load().catch(() => {}),
  decide: (d, opt) => write(() => api.update('decisions', d.id, {
    status: 'decided', chosen_key: opt.id, chosen_label: opt.label, decided_by: me.id, decided_at: now(),
  })),
  completeHuman: (t) => write(() => api.update('tasks', t.id, { status: 'done', done_at: now() })),
  approveOutput: (o) => write(() => api.update('outputs', o.id, { status: 'approved', reviewed_by: me.id, reviewed_at: now() })),
  requestChanges: (o, feedback) => write(async () => {
    await guard({ feedback });
    await api.update('outputs', o.id, { status: 'changes', feedback, reviewed_by: me.id, reviewed_at: now() });
    // The run goes back to work, so the session that made it sees the feedback as soon as it checks in.
    if (o.agent) await api.update('runs', o.agent, { state: 'running', step: 'מתקן לפי ההערות' }).catch(() => {});
  }),
  stopAgent: (id) => write(() => api.update('runs', id, { stop_requested: true })),
  resumeAgent: (id) => write(() => api.update('runs', id, { stop_requested: false, state: 'queued', step: 'מחכה שסשן של Claude ימשיך' })),
  seeOutput: (id) => { seenIds.add(id); LS.set(SEEN_KEY, { at: seenAt, ids: [...seenIds].slice(-200) }); },
  // Launching: the run waits as "queued", and Claude opens with a prompt that names it. The window opens first, while
  // the tap still counts as the person's, so the browser does not block it.
  launch: ({ tool, projectId, brief, title }) => {
    const id = crypto.randomUUID();
    const p = project(projectId);
    const url = `https://claude.ai/new?q=${encodeURIComponent(launchPrompt({ id, title, brief, project: p, tool }))}`;
    if (getState().connector?.enabled) window.open(url, '_blank', 'noopener');
    return write(async () => {
      await guard({ title, brief });
      await api.insert('runs', { id, project_id: projectId, person_id: me.id, title, brief, state: 'queued', step: 'מחכה שסשן של Claude יאסוף', source: 'app', created_by: me.id });
      await load();
      toast(getState().connector?.enabled ? 'נפתח Claude עם התדריך. ההתקדמות תופיע כאן לבד' : 'נשמר. כשהחיבור ל-Claude יופעל, הסשן הבא שלך יאסוף את זה', { ms: 6000 });
    });
  },
};

export function launchPrompt({ id, title, brief, project: p, tool }) {
  return [
    `משימה מפלטפורמת הצוות: ${title}`,
    `פרויקט: ${p?.name || ''}`,
    tool ? `סוג: ${tool.label}` : null,
    '',
    brief,
    '',
    `לפני שמתחילים: לקרוא ל-start_run במחבר "פלטפורמת הצוות" עם run_id=${id}, ולקבל את הקשר הפרויקט.`,
    'לדווח התקדמות באבני דרך עם report_progress, להעלות כל תוצר עם publish_output וקישור, ולבקש החלטה עם ask_decision במקום לשאול כאן.',
  ].filter((x) => x !== null).join('\n');
}

// ---------- personal connector keys ----------
// The function itself, so the address works without a deploy of the site and is never behind a preview login.
export const connectorUrl = (key) => `https://dtsxlaxonvldcdziozgp.supabase.co/functions/v1/mcp/${key}`;
export const keys = {
  list: () => api.rpc('connector_keys_mine'),
  create: (label) => api.rpc('connector_key_create', { p_label: label }),
  revoke: (id) => api.rpc('connector_key_revoke', { p_id: id }),
};
export const meName = () => person(getState().me).name;
