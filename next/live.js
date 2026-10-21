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

// Sign-in here, the same as the app's: check the team code, then pick who is using this device. Both are kept in
// cto.auth, so signing in here also signs in the app and the other way round.
export function savedCode() {
  const a = LS.get(AUTH_KEY);
  return a?.code || null;
}
export async function checkCode(code) {
  code = code.trim();
  setCreds({ code: null, actor: null });
  const ok = await api.rpc('check_team_code', { code });
  if (!ok) throw new Error('הקוד לא נכון. אפשר לנסות שוב.');
  LS.set(AUTH_KEY, { code });
  return code;
}
export async function teamPeople(code) {
  setCreds({ code, actor: null });
  const people = await api.list('people', { archived: 'is.false', order: 'sort.asc' });
  return people.filter((p) => p.is_team);
}
export function pickPerson(code, id) {
  LS.set(AUTH_KEY, { code, me: id });
}
export function forgetPerson() {
  const a = LS.get(AUTH_KEY);
  if (a?.code) LS.set(AUTH_KEY, { code: a.code });
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
  set({ events: [], gcal: false, gcalInfo: { live: true, loading: true }, teamBusy: [] });
  gcal.load().catch(() => {});
  let ticks = 0;
  const tick = () => {
    if (document.visibilityState !== 'visible' || pending) return;
    load().catch(() => {});
    if (++ticks % 8 === 0) gcal.load().catch(() => {}); // Google every two minutes
  };
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
  const [people, projects, decisions, tasks, runs, outputs, activity, settings, presence, meetings] = await Promise.all([
    api.list('people', { archived: 'is.false', order: 'sort.asc' }),
    api.list('projects', { archived: 'is.false', order: 'created_at.asc' }),
    api.list('decisions', { archived: 'is.false', status: 'in.(open,decided)', order: 'created_at.desc', limit: 400 }),
    api.list('tasks', { archived: 'is.false', kind: 'in.(human,claude)', or: `(status.neq.done,done_at.gte.${since})`, order: 'created_at.desc', limit: 500 }),
    maybe(api.list('runs', { archived: 'is.false', order: 'updated_at.desc', limit: 200 })),
    maybe(api.list('outputs', { archived: 'is.false', order: 'created_at.desc', limit: 300 })),
    api.list('activity', { order: 'at.desc', limit: 150 }),
    maybe(api.list('team_settings', { select: 'team_id,word_hashes,connector_enabled' })).then((r) => r || maybe(api.list('team_settings', { select: 'team_id,word_hashes' }))),
    maybe(api.rpc('connector_presence')),
    maybe(api.list('meeting_records', { archived: 'is.false', select: 'id,project_id,title,started_at,ended_at,status,summary,output_id,created_by', order: 'started_at.desc', limit: 100 })),
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
    const milestones = (p.milestones || []).map((m, k) => {
      const ms = { id: m.id || `i${k}`, title: m.title, start: prev, end: m.due || end, done: !!m.done };
      if (m.due) prev = m.due;
      return ms;
    });
    return {
      id: p.id, name: p.name, emoji: p.icon || '◆', color: p.color || PCOLORS[i % PCOLORS.length],
      lead: p.owner_id, partners: p.partner_ids || [],
      goal: p.classified ? 'הפרטים ברשת המסווגת' : (p.description || ''),
      stage: STAGE[p.stage] || p.stage || '', start, end, milestones, classified: p.classified,
      personal: !!p.personal, claudeUrl: p.claude_project_url || '', plan: p.plan_summary || '', planAt: p.plan_updated_at,
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
  const seeable = tasks.filter((t) => (!t.flagged || cmd) && inProject(t) && (!t.private || t.owner_id === me.id || t.created_by === me.id));
  // The plan's own steps for Claude (set_plan writes them as kind "claude"); the people's steps are the human tasks.
  const planSteps = seeable.filter((t) => t.kind === 'claude').map((t) => ({
    id: t.id, project: t.project_id, title: t.title, due: t.due, done: t.status === 'done', review: t.status === 'review',
    phase: phaseOf(t.notes), created: t.created_at,
  }));
  const steps = seeable.filter((t) => t.kind !== 'claude').map((t) => {
    const type = HTYPE[t.htype] || t.htype || 'other';
    return {
      id: t.id, project: t.project_id, type, owner: t.owner_id, title: t.title, blocks: t.run_id, created: t.created_at,
      cta: CTA[type] || 'בוצע', note: t.notes ? t.notes.replace(/^שלב: .*$/m, '').trim().slice(0, 120) : '', done: t.status === 'done', doneAt: t.done_at, due: t.due,
      phase: phaseOf(t.notes),
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
    mode: 'live', me: me.id, people: ppl, projects: prj, decisions: decs, humanTasks: steps, planSteps, agents, outputs: outs, feed,
    meetings: (meetings || []).filter((m) => !m.project_id || prj.some((p) => p.id === m.project_id)).map((m) => ({
      id: m.id, project: m.project_id, title: m.title, start: m.started_at, end: m.ended_at, status: m.status, summary: m.summary, output: m.output_id, by: m.created_by,
    })),
    meetingAsks: [], interviews: {}, weekly: weeklyFrom(outs, decs, steps),
    presence: presenceFrom(humans, presence, runs || []),
    connector: { ready: runs !== null, enabled: settings?.[0]?.connector_enabled ?? false, teamId: settings?.[0]?.team_id },
  });
  return true;
}

// Milestones as the database keeps them (the same shape set_plan writes): a title, an end date, done.
const plainMs = (list = []) => list.map((m) => ({ id: m.id, title: m.title, due: (m.due || m.end || '').slice(0, 10) || undefined, done: !!m.done }));
const phaseOf = (notes) => (notes || '').match(/^שלב: (.+)$/m)?.[1] || '';

// Who has Claude connected. "Online" means their Claude reached the platform in the last 15 minutes: the connector
// has no open line to a session, so the last call is the best signal there is.
const ONLINE_MS = 15 * 60e3;
function presenceFrom(humans, rows, runs) {
  return humans.filter((h) => h.is_team).map((h) => {
    const r = (rows || []).find((x) => x.person_id === h.id);
    const seen = [r?.last_used_at, ...runs.filter((x) => x.person_id === h.id).map((x) => x.last_seen_at)].filter(Boolean).sort().at(-1) || null;
    const state = seen && Date.now() - new Date(seen).getTime() < ONLINE_MS ? 'online' : r?.has_key || seen ? 'offline' : 'none';
    return { id: h.id, state, seen, working: runs.filter((x) => x.person_id === h.id && x.state === 'running').length };
  });
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
// Writes for one meeting go out in order: the row exists before its transcript, and its output before the summary.
let meetingQ = Promise.resolve();
const writes = {
  refresh: () => load().catch(() => {}),
  // A free-text answer (an open question, or "another answer") is kept as the chosen label; Claude reads it as is.
  decide: (d, opt) => write(async () => {
    if (opt.id === 'text') await guard({ answer: opt.label });
    await api.update('decisions', d.id, { status: 'decided', chosen_key: opt.id, chosen_label: opt.label.slice(0, 1000), decided_by: me.id, decided_at: now() });
    await resumeRun(d.agent, `ממשיך: ${opt.label.slice(0, 80)}`);
  }),
  // A new project, and when asked, the Claude session that builds its plan. Claude opens first, while the tap still
  // counts as the person's; the project is written before the run that points at it.
  createProject: (p, plan) => {
    const go = plan ? openClaude({ id: plan.id, title: plan.title, brief: plan.brief, project: p, tool: plan.tool }) : null;
    return write(async () => {
      await guard({ name: p.name, goal: p.goal });
      await api.insert('projects', {
        id: p.id, name: p.name, description: p.goal || null, owner_id: me.id, partner_ids: p.personal ? [] : p.partners,
        personal: p.personal, claude_project_url: p.claudeUrl || null, stage: 'proposed', start_date: now().slice(0, 10),
        milestones: plainMs(p.milestones), target_date: plainMs(p.milestones).at(-1)?.due || null,
        ...(getState().connector?.teamId ? { team_id: getState().connector.teamId } : {}),
      });
      if (plan) await api.insert('runs', { id: plan.id, project_id: p.id, person_id: me.id, title: plan.title, brief: plan.brief, state: 'queued', step: 'מחכה שסשן של Claude יאסוף', source: 'app', created_by: me.id });
      await load();
      if (go) toast(go, { ms: 7000 });
    });
  },
  setMilestones: (p, list) => write(async () => {
    await guard({ titles: list.map((m) => m.title) });
    const ms = plainMs(list);
    await api.update('projects', p.id, { milestones: ms, ...(ms.length && ms.at(-1).due ? { target_date: ms.at(-1).due } : {}) });
  }),
  setPersonal: (p, personal) => write(() => api.update('projects', p.id, { personal })),
  setClaudeUrl: (p, url) => write(() => api.update('projects', p.id, { claude_project_url: url || null })),
  // A step for a person, said to Jarvis or taken from a meeting summary. It reaches them in "מה מחכה לי".
  addStep: (t) => write(async () => {
    await guard({ title: t.title });
    await api.insert('tasks', { id: t.id, project_id: t.project, title: t.title, kind: 'human', htype: 'other', owner_id: t.owner, due: t.due || null, status: 'todo', created_by: me.id });
  }),
  // A meeting: written when the recording starts (so nothing is lost), with the transcript and the summary as they come.
  // The first save also adds the output that links to the meeting's page.
  saveMeeting: (m, patch) => (meetingQ = meetingQ.catch(() => {}).then(() => write(async () => {
    await guard({ title: m.title, transcript: patch.transcript, summary: patch.summary });
    const row = { project_id: m.project || null, title: m.title, ...(patch.transcript !== undefined ? { transcript: patch.transcript } : {}),
      ...(patch.summary !== undefined ? { summary: patch.summary } : {}), ...(patch.status ? { status: patch.status } : {}), ...(patch.end ? { ended_at: patch.end } : {}) };
    if (patch.create) {
      await api.insert('meeting_records', { id: m.id, started_at: m.start, created_by: me.id, ...row });
      return;
    }
    await api.update('meeting_records', m.id, row);
    if (patch.status === 'saved' && !m.output) {
      const out = crypto.randomUUID();
      await api.insert('outputs', { id: out, project_id: m.project || null, kind: 'doc', title: `תמלול וסיכום: ${m.title}`, summary: 'תמלול הפגישה. הסיכום נכתב עכשיו.', url: `/next/#/meeting/${m.id}`, status: 'info', created_by: me.id });
      await api.update('meeting_records', m.id, { output_id: out });
      return;
    }
    if (patch.summary) {
      const oid = m.output || (await api.list('meeting_records', { id: `eq.${m.id}`, select: 'output_id' }))[0]?.output_id;
      if (oid) await api.update('outputs', oid, { summary: (patch.summary.tldr || '').slice(0, 600) });
    }
  }))),
  completeHuman: (t) => write(async () => {
    await api.update('tasks', t.id, { status: 'done', done_at: now() });
    await resumeRun(t.blocks, 'ממשיך מאיפה שנעצר');
  }),
  // Approving the last output a run waits on closes the run: a person closes it, never Claude.
  approveOutput: (o) => write(async () => {
    await api.update('outputs', o.id, { status: 'approved', reviewed_by: me.id, reviewed_at: now() });
    if (!o.agent) return;
    const [r] = await api.list('runs', { id: `eq.${o.agent}`, select: 'id,state' });
    const left = await api.list('outputs', { run_id: `eq.${o.agent}`, status: 'eq.review', archived: 'is.false', select: 'id' });
    if (r?.state === 'review' && !left.length) await api.update('runs', r.id, { state: 'done', step: 'אושר' });
  }),
  requestChanges: (o, feedback) => write(async () => {
    await guard({ feedback });
    await api.update('outputs', o.id, { status: 'changes', feedback, reviewed_by: me.id, reviewed_at: now() });
    // The run goes back to work, so the session that made it sees the feedback as soon as it checks in.
    if (o.agent) await api.update('runs', o.agent, { state: 'running', step: 'מתקן לפי ההערות' }).catch(() => {});
  }),
  stopAgent: (id) => write(() => api.update('runs', id, { stop_requested: true })),
  resumeAgent: (id) => write(() => api.update('runs', id, { stop_requested: false, state: 'queued', step: 'מחכה שסשן של Claude ימשיך' })),
  // Brings Claude back to a run: a new chat that picks up the same run id, reads the answers and goes on.
  continueRun: (a) => {
    const p = project(a.project);
    const text = continuePrompt(a, p);
    const proj = p?.claudeUrl;
    if (proj) { navigator.clipboard?.writeText(text).catch(() => {}); window.open(proj, '_blank', 'noopener'); }
    else window.open(`https://claude.ai/new?q=${encodeURIComponent(text)}`, '_blank', 'noopener');
    toast(proj ? 'נפתח הפרויקט ב-Claude, וההנחיה הועתקה. פותחים שיחה חדשה ומדביקים' : 'נפתח Claude עם ההנחיה להמשיך. ההתקדמות תופיע כאן לבד', { ms: 7000 });
  },
  seeOutput: (id) => { seenIds.add(id); LS.set(SEEN_KEY, { at: seenAt, ids: [...seenIds].slice(-200) }); },
  // Launching: the run waits as "queued", and Claude opens with a prompt that names it. The window opens first, while
  // the tap still counts as the person's, so the browser does not block it.
  launch: ({ tool, projectId, brief, title }) => {
    const id = crypto.randomUUID();
    const go = openClaude({ id, title, brief, project: project(projectId), tool });
    return write(async () => {
      await guard({ title, brief });
      await api.insert('runs', { id, project_id: projectId, person_id: me.id, title, brief, state: 'queued', step: 'מחכה שסשן של Claude יאסוף', source: 'app', created_by: me.id });
      await load();
      toast(go || 'נשמר. כשהחיבור ל-Claude יופעל, הסשן הבא שלך יאסוף את זה', { ms: 7000 });
    });
  },
};

// A run that waited on people goes back to "running" once the last thing it asked for is answered, so the screens stop
// showing it as stuck. Claude reads the answer on its next check-in.
async function resumeRun(runId, step) {
  if (!runId) return;
  const [r] = await api.list('runs', { id: `eq.${runId}`, select: 'id,state' });
  if (r?.state !== 'waiting') return;
  const [decs, steps] = await Promise.all([
    api.list('decisions', { run_id: `eq.${runId}`, status: 'eq.open', archived: 'is.false', select: 'id' }),
    api.list('tasks', { run_id: `eq.${runId}`, kind: 'eq.human', status: 'neq.done', archived: 'is.false', select: 'id' }),
  ]);
  if (!decs.length && !steps.length) await api.update('runs', runId, { state: 'running', step });
}

// Opens Claude with the brief. A project linked to a Claude Project opens there, with the brief copied to paste into a
// new chat (claude.ai takes a prompt in the address only for a plain new chat). Returns what to tell the person, or
// null when the connector is not on yet.
function openClaude(args) {
  if (!getState().connector?.enabled) return null;
  const text = launchPrompt(args);
  const proj = args.project?.claudeUrl;
  if (proj) {
    navigator.clipboard?.writeText(text).catch(() => {});
    window.open(proj, '_blank', 'noopener');
    return 'נפתח הפרויקט ב-Claude, והתדריך הועתק. פותחים שם שיחה חדשה ומדביקים. ההתקדמות תופיע כאן לבד';
  }
  window.open(`https://claude.ai/new?q=${encodeURIComponent(text)}`, '_blank', 'noopener');
  return 'נפתח Claude עם התדריך. ההתקדמות תופיע כאן לבד';
}

export function continuePrompt(a, p) {
  return [
    `להמשיך משימה מפלטפורמת הצוות: ${a.title}`,
    `פרויקט: ${p?.name || ''}`,
    '',
    `לקרוא ל-start_run במחבר "פלטפורמת הצוות" עם run_id=${a.id}, ואז ל-get_updates כדי לקרוא את התשובות וההחלטות שנשמרו.`,
    a.brief ? `התדריך המקורי:\n${a.brief}` : null,
    '',
    /^תוכנית עבודה/.test(a.title) ? 'לכתוב או לעדכן את התוכנית עם set_plan לפי התשובות, עכשיו, בלי לחכות.' : 'להמשיך את העבודה לפי התשובות, ולדווח עם report_progress.',
    'אם חסר עוד משהו, לשאול דרך ask_decision ולהמשיך במה שלא תלוי בזה.',
  ].filter((x) => x !== null).join('\n');
}

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

// Voice, through the `voice` function (site path /voice/*): Jarvis's signed address, a Scribe token, a summary.
export async function voiceCall(route, body = {}) {
  let res;
  try {
    res = await fetch('/voice/' + route, {
      method: 'POST', body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', 'x-team-code': auth.code, 'x-actor': auth.me },
    });
  } catch (e) { throw new Error(`לא הצלחתי להגיע לשרת הקולי (${e?.message || e}).`); }
  let out = null;
  try { out = await res.json(); } catch (e) { /* not JSON */ }
  if (!res.ok) throw new Error(out?.error || `החיבור הקולי לא זמין כרגע (${res.status}).`);
  return out;
}
// A meeting's full transcript, read only when its page opens.
export const meetingText = async (id) => (await api.list('meeting_records', { id: `eq.${id}`, select: 'transcript' }))[0]?.transcript || '';
export const checkText = (value) => guard(value);

// Google Calendar, through the `gcal` function (site path /gcal/*). The browser that finished the Google sign-in keeps a
// device token (next.gcal, per person); without it the platform shows only the team's busy times.
const GCAL_KEY = 'next.gcal';
const GCAL_ERR = {
  setup: 'חיבור יומן גוגל עוד לא הוגדר לצוות.', expired: 'החיבור לקח יותר מדי זמן. אפשר לנסות שוב.', denied: 'החיבור ליומן בוטל.',
  scope: 'בלי אישור לגשת ליומן, הפלטפורמה לא יכולה להציג אותו. אפשר לחבר שוב ולסמן את ההרשאה.', failed: 'לא הצלחתי לחבר את היומן. אפשר לנסות שוב.',
};
function gcalDevice() { return (LS.get(GCAL_KEY) || {})[auth?.me] || ''; }
async function gcalCall(route, body = {}) {
  const res = await fetch('/gcal/' + route, {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', 'x-team-code': auth.code, 'x-actor': auth.me, 'x-gcal-device': gcalDevice() },
  });
  let out = null;
  try { out = await res.json(); } catch (e) { /* not JSON */ }
  if (!res.ok) throw new Error(out?.error || 'החיבור ליומן גוגל לא זמין כרגע.');
  return out;
}
const weekStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d; };
export const gcal = {
  // Back from Google: the address ends in #gcal=<device> or #gcal_error=<why>.
  takeReturn() {
    const m = /^#gcal(_error)?=([\w-]+)/.exec(location.hash);
    if (!m) return null;
    history.replaceState(null, '', location.pathname + location.search + '#/calendar');
    if (m[1]) return { error: GCAL_ERR[m[2]] || GCAL_ERR.failed };
    const a = LS.get(AUTH_KEY);
    if (a?.me) LS.set(GCAL_KEY, { ...(LS.get(GCAL_KEY) || {}), [a.me]: m[2] });
    return { ok: true };
  },
  async load() {
    const from = weekStart();
    const to = new Date(from.getTime() + 14 * DAY);
    let r;
    try { r = await gcalCall('events', { from: from.toISOString(), to: to.toISOString() }); } catch (e) {
      set({ gcalInfo: { live: true, unavailable: true, error: e.message } });
      return;
    }
    set({
      gcal: !!r.connected,
      gcalInfo: { live: true, configured: r.configured, connected: r.connected, elsewhere: r.linked_elsewhere, email: r.email, error: r.error },
      events: (r.events || []).filter((e) => !e.all_day).map((e) => ({
        id: e.id, title: e.title, start: e.start, mins: e.mins, project: e.project_id, with: [], src: e.here ? 'here' : 'g', link: e.link, meet: e.meet,
      })),
      teamBusy: (r.team || []).map((t) => ({ person: t.person_id, busy: (t.busy || []).map((b) => ({ start: b.start, mins: Math.round((Date.parse(b.end) - Date.parse(b.start)) / 6e4) })) })),
    });
  },
  async connect() {
    const state = await api.rpc('gcal_state_create', { p_return: location.pathname });
    location.href = '/gcal/start?state=' + encodeURIComponent(state);
  },
  async create(ev) {
    await guard({ title: ev.title, notes: ev.notes });
    const r = await gcalCall('create', ev);
    await gcal.load();
    return r;
  },
  async disconnect() {
    await gcalCall('disconnect');
    const all = LS.get(GCAL_KEY) || {};
    delete all[auth.me];
    LS.set(GCAL_KEY, all);
    await gcal.load();
  },
};
