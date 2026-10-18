// The state of the control center. Two modes:
// - demo: in memory, seeded from data.js. A small loop stands in for Claude reporting, so sessions move on their own.
// - live: the team's real data (live.js loads it and polls). Every action updates the screen at once and then calls
//   the matching write in live.js through `remote`; a failed write shows a toast and the next refresh puts things back.
import { useEffect, useState } from 'preact/hooks';
import * as seed from './data.js';
import { haptic } from '../app/motion.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
let state = {
  mode: 'demo',
  me: 'yahali',
  people: seed.people,
  projects: seed.projects,
  agents: clone(seed.agents),
  outputs: clone(seed.outputs),
  decisions: clone(seed.decisions).map((d) => ({ ...d, choice: null })),
  humanTasks: clone(seed.humanTasks).map((t) => ({ ...t, done: false })),
  planSteps: clone(seed.planSteps || []),
  meetingAsks: clone(seed.meetingAsks).map((m) => ({ ...m, booked: null })),
  events: clone(seed.events),
  feed: clone(seed.feed),
  interviews: clone(seed.interviews),
  answers: {}, // project -> { questionId: optionId | text }
  toasts: [],
  sheet: null, // { kind, ...props }
  gcal: true,
  weekly: seed.weekly,
  connector: { ready: false, enabled: false },
  presence: [
    { id: 'yahali', state: 'online', seen: seed.ago(2 * 60e3), working: 2 },
    { id: 'yonatan', state: 'online', seen: seed.ago(9 * 60e3), working: 1 },
    { id: 'yarden', state: 'offline', seen: seed.ago(5 * 3600e3), working: 0 },
    { id: 'yoash', state: 'none', seen: null, working: 0 },
  ],
};
const subs = new Set();
export const getState = () => state;
export function set(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  subs.forEach((f) => f(state));
}
export function useStore() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); subs.add(f); return () => subs.delete(f); }, []);
  return state;
}

// ---------- lookups ----------
const NOBODY = { id: null, name: 'לא שובץ', role: '', color: '#8e8e93' };
const NOWHERE = { id: null, name: 'בלי פרויקט', color: '#8e8e93', lead: null, partners: [], milestones: [], goal: '' };
export const person = (id) => state.people.find((p) => p.id === id) || NOBODY;
export const project = (id) => state.projects.find((p) => p.id === id) || (id ? undefined : NOWHERE);
export const agent = (id) => state.agents.find((a) => a.id === id);
export const isMine = (p, me = state.me) => p.lead === me || p.partners.includes(me);
export const myProjects = () => state.projects.filter((p) => isMine(p));
const mineIds = () => new Set(myProjects().map((p) => p.id));
export const myDecisions = () => state.decisions.filter((d) => !d.choice && d.owner === state.me);
export const myHumanTasks = () => state.humanTasks.filter((t) => !t.done && t.owner === state.me);
export const myMeetingAsks = () => state.meetingAsks.filter((m) => !m.booked && m.owner === state.me);
export const myOutputs = () => { const s = mineIds(); return state.outputs.filter((o) => s.has(o.project)); };
export const myAgents = () => { const s = mineIds(); return state.agents.filter((a) => s.has(a.project)); };
export const projectAgents = (id) => state.agents.filter((a) => a.project === id);

// Progress is never typed in: it is the share of milestones done, plus how far the running Claude sessions got.
export function projectProgress(p) {
  const ms = p.milestones;
  const done = ms.filter((m) => m.done).length;
  const ags = projectAgents(p.id).filter((a) => !['done', 'stopped'].includes(a.state));
  const live = ags.length ? ags.reduce((s, a) => s + a.progress, 0) / ags.length : 0;
  if (!ms.length) return live;
  return Math.min(1, (done + live * 0.6) / ms.length);
}

// The project's state, worked out from what is happening, with the reason in one line.
export function projectHealth(p) {
  const waits = projectAgents(p.id).filter((a) => a.state === 'wait');
  const open = state.decisions.filter((d) => d.project === p.id && !d.choice);
  const late = open.filter((d) => new Date(d.due) < new Date());
  const stuckHuman = state.humanTasks.filter((t) => t.project === p.id && !t.done);
  const oldest = Math.max(0, ...stuckHuman.map((t) => Date.now() - new Date(t.created).getTime()), ...waits.map((a) => Date.now() - new Date(a.started).getTime()));
  if (late.length || oldest > 24 * 3600e3) {
    const why = waits.length ? `Claude מחכה ל${waitingOn(waits[0])} כבר ${hoursLabel(oldest)}` : `${late.length} החלטות עברו את המועד`;
    return { id: 'risk', label: 'בסיכון', why };
  }
  if (waits.length || open.length) return { id: 'wait', label: 'מחכה לאנשים', why: `${open.length} החלטות ו-${stuckHuman.length} מטלות פתוחות` };
  return { id: 'on', label: 'במסלול', why: 'כל הסוכנים עובדים, ואין מה שמחכה לאדם' };
}
export function waitingOn(a) {
  const t = state.humanTasks.find((h) => h.blocks === a.id && !h.done);
  const d = state.decisions.find((x) => x.agent === a.id && !x.choice);
  const who = (t || d) && person((t || d).owner);
  return who?.id ? who.name : 'אדם';
}
export function hoursLabel(ms) {
  const h = Math.round(ms / 3600e3);
  if (h < 1) return 'פחות משעה';
  if (h < 24) return h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
  const d = Math.round(h / 24);
  return d === 1 ? 'יום' : d === 2 ? 'יומיים' : `${d} ימים`;
}

// The bottlenecks: whatever stopped the most work for the longest, across the person's projects.
export function bottlenecks() {
  const s = mineIds();
  const rows = [];
  state.humanTasks.filter((t) => !t.done && s.has(t.project)).forEach((t) => {
    rows.push({ id: t.id, kind: 'task', project: t.project, owner: t.owner, title: t.title, since: t.created, stops: t.blocks ? 1 : 0 });
  });
  state.decisions.filter((d) => !d.choice && s.has(d.project)).forEach((d) => {
    rows.push({ id: d.id, kind: 'decision', project: d.project, owner: d.owner, title: d.q, since: d.created, stops: d.agent ? 1 : 0 });
  });
  const score = (r) => (Date.now() - new Date(r.since).getTime()) * (1 + r.stops);
  return rows.sort((a, b) => score(b) - score(a));
}

// ---------- actions ----------
// In live mode live.js sets this to its writes. Each one gets what changed; a failure rolls back on the next refresh.
let remote = null;
export function setRemote(r) { remote = r; }
function push(name, ...args) {
  if (!remote?.[name]) return;
  Promise.resolve(remote[name](...args)).catch((e) => { toast(e.message || 'לא נשמר. אפשר לנסות שוב.', { ms: 6000 }); remote.refresh?.(); });
}
let toastN = 0;
export function toast(text, opts = {}) {
  const t = { id: ++toastN, text, ...opts };
  set((s) => ({ toasts: [...s.toasts, t] }));
  setTimeout(() => dismissToast(t.id), opts.ms || 4200);
}
export const dismissToast = (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
export const openSheet = (kind, props = {}) => set({ sheet: { kind, ...props } });
export const closeSheet = () => set({ sheet: null });
const log = (project, text, kind) => set((s) => ({ feed: [{ id: 'f' + Date.now(), project, at: new Date().toISOString(), text, kind }, ...s.feed] }));

// A decision made: the Claude that waited on it carries on right away.
// optionId 'text' is a free-text answer: an open question, or an answer that is none of the options.
export function decide(id, optionId, text) {
  const d = state.decisions.find((x) => x.id === id);
  const opt = optionId === 'text' ? { id: 'text', label: text.trim() } : d.options.find((o) => o.id === optionId) || { label: optionId };
  set((s) => ({
    decisions: s.decisions.map((x) => (x.id === id ? { ...x, choice: opt.label, decidedAt: new Date().toISOString() } : x)),
    agents: s.agents.map((a) => (a.id === d.agent && a.state === 'wait' && !s.humanTasks.some((t) => t.blocks === a.id && !t.done) ? { ...a, state: 'run', step: `ממשיך: ${opt.label}` } : a)),
  }));
  log(d.project, `הוחלט: ${d.q} ${opt.label}`, 'decision');
  push('decide', d, opt);
  if (state.mode === 'demo' && !d.options.length && d.agent) setTimeout(() => demoPlanFill({ ...d, choice: opt.label }), 1200);
  haptic('success');
  toast(d.agent ? `נרשם ביומן ההחלטות. Claude ממשיך: ${opt.label}` : 'נרשם ביומן ההחלטות');
}

export function completeHuman(id) {
  const t = state.humanTasks.find((x) => x.id === id);
  set((s) => ({
    humanTasks: s.humanTasks.map((x) => (x.id === id ? { ...x, done: true } : x)),
    agents: s.agents.map((a) => (a.id === t.blocks && a.state === 'wait' && !s.decisions.some((d) => d.agent === a.id && !d.choice) ? { ...a, state: 'run', step: 'ממשיך מאיפה שנעצר' } : a)),
  }));
  log(t.project, `${person(t.owner).name}: ${t.title}`, 'progress');
  push('completeHuman', t);
  haptic('success');
  toast(t.blocks ? 'בוצע. Claude חזר לעבוד' : 'בוצע');
}

export function bookMeeting(id, slot) {
  const m = state.meetingAsks.find((x) => x.id === id);
  set((s) => ({
    meetingAsks: s.meetingAsks.map((x) => (x.id === id ? { ...x, booked: slot } : x)),
    events: [...s.events, { id: 'e' + Date.now(), title: m.title, project: m.project, start: slot, mins: m.mins, with: m.with, src: 'here', summary: true, fresh: true }],
  }));
  log(m.project, `נקבעה פגישה: ${m.title}`, 'meeting');
  haptic('success');
  toast('נקבע ביומן Google, וההזמנה נשלחה');
}

export function addEvent(ev) {
  set((s) => ({ events: [...s.events, { id: 'e' + Date.now(), src: 'here', summary: true, fresh: true, with: [], mins: 30, ...ev }] }));
}

export function approveOutput(id) {
  const o = state.outputs.find((x) => x.id === id);
  set((s) => ({
    outputs: s.outputs.map((x) => (x.id === id ? { ...x, review: false, approved: true, fresh: false } : x)),
    agents: s.agents.map((a) => (a.id === o.agent && a.state === 'review' ? { ...a, state: 'done', step: 'אושר' } : a)),
  }));
  push('approveOutput', o);
  haptic('success');
  toast(state.mode === 'live' ? 'אושר' : 'אושר. Claude סגר את המשימה');
}

// Sending an output back: the feedback is what Claude reads next time it checks in.
export function requestChanges(id, feedback) {
  const o = state.outputs.find((x) => x.id === id);
  set((s) => ({ outputs: s.outputs.map((x) => (x.id === id ? { ...x, review: false, changes: true, feedback, fresh: false } : x)) }));
  push('requestChanges', o, feedback);
  toast('נשלח ל-Claude. ההערות יגיעו אליו בבדיקה הבאה');
}
export function seeOutput(id) {
  set((s) => ({ outputs: s.outputs.map((x) => (x.id === id ? { ...x, fresh: false } : x)) }));
  push('seeOutput', id);
}

export function answerInterview(pid, qid, value) {
  const iv = state.interviews[pid];
  const q = iv.questions.find((x) => x.id === qid);
  const opt = q.options.find((o) => o.id === value);
  const label = opt ? opt.label : value;
  set((s) => ({
    answers: { ...s.answers, [pid]: { ...(s.answers[pid] || {}), [qid]: label } },
    interviews: {
      ...s.interviews,
      [pid]: {
        ...iv,
        tree: iv.tree.map((b) => (b.title === q.branch ? { ...b, decided: [...b.decided, label], open: b.open.filter((x) => x !== q.resolves) } : b)),
      },
    },
  }));
  log(pid, `ראיון: ${q.q} ${label}`, 'decision');
  haptic('success');
}

// Launching Claude from the platform. Demo: a session appears and starts reporting at once. Live: a run waits as
// "queued" and live.js opens Claude with a prompt that carries its run_id; the session picks it up through the connector.
export function launch({ tool, projectId, brief, title }) {
  if (state.mode === 'live') { push('launch', { tool, projectId, brief, title }); return null; }
  const id = 'a' + Date.now();
  const kinds = { video: 'video', doc: 'doc', deck: 'deck', app: 'app', data: 'chart', meeting: 'doc', research: 'research', routine: 'doc' };
  set((s) => ({
    agents: [{ id, project: projectId, owner: s.me, title, state: 'run', progress: 0.04, step: 'קורא את התדריך והקשר הפרויקט', started: new Date().toISOString(), kind: tool.id, brief, fast: true,
      yields: { kind: kinds[tool.id] || 'doc', title, summary: 'נוצר מהפלטפורמה, עם התדריך של הפרויקט' } }, ...s.agents],
  }));
  log(projectId, `הופעל Claude: ${title}`, 'progress');
  haptic('success');
  toast('Claude התחיל לעבוד. ההתקדמות תופיע כאן לבד');
  return id;
}

// A new project. With a plan, Claude is started on it at once to build the work plan with the person: it asks through
// the platform, then writes the plan (set_plan), and the steps reach the people they are for.
const PCOL = ['#5856d6', '#ff2d55', '#ff9500', '#30b0c7', '#34c759', '#af52de', '#0071e3'];
export const PLAN_TOOL = { id: 'plan', label: 'תוכנית עבודה' };
export function planBrief(p) {
  return [
    `לבנות איתי תוכנית עבודה לפרויקט "${p.name}"${p.goal ? `, שהמטרה שלו: ${p.goal}` : ''}.`,
    'קודם לשאול אותי מה צריך כדי לתכנן: מה התוצאה, עד מתי, מי שותף, מה כבר קיים ומה חוסם. כל שאלה דרך ask_decision (אפשר גם שאלה פתוחה, בלי אפשרויות), כדי שאוכל לענות בפלטפורמה. אחרי שאלה לעצור ולבקש שאכתוב "עניתי", ואז לקרוא ל-get_updates.',
    'אחר כך לכתוב את התוכנית עם set_plan: סיכום קצר, שלבים עם תאריכים, וצעדים עם אחראי (Claude או אדם בשם) ותאריך. צעדים שרק אדם יכול לעשות יגיעו אליו לבד.',
    'כשמשהו משתנה בהמשך, לעדכן את התוכנית שוב עם set_plan.',
  ].join('\n');
}
// Milestones on screen run from the end of the one before; people edit them as a title and an end date.
export function toScreenMs(list, start) {
  let prev = start;
  return list.filter((m) => m.title.trim()).map((m) => {
    const end = m.due ? new Date(`${m.due}T18:00`).toISOString() : m.end || prev;
    const ms = { id: m.id, title: m.title.trim(), start: prev, end, done: !!m.done };
    prev = end;
    return ms;
  });
}
export function createProject({ name, goal, partners = [], personal = false, claudeUrl = '', milestones: plain = [] }, { plan = false } = {}) {
  const live = state.mode === 'live';
  const id = live ? crypto.randomUUID() : 'p' + Date.now();
  const start = new Date().toISOString();
  const p = {
    id, name: name.trim(), goal: goal.trim(), emoji: '◆', color: PCOL[state.projects.length % PCOL.length], lead: state.me,
    partners: personal ? [] : partners, stage: 'מוצע', start, end: new Date(Date.now() + 30 * 864e5).toISOString(), milestones: toScreenMs(plain, start),
    personal, claudeUrl: claudeUrl.trim(), plan: '', planAt: null,
  };
  if (p.milestones.length) p.end = p.milestones.at(-1).end;
  set((s) => ({ projects: [...s.projects, p] }));
  const run = plan ? { id: live ? crypto.randomUUID() : 'a' + Date.now(), tool: PLAN_TOOL, title: `תוכנית עבודה: ${p.name}`, brief: planBrief(p) } : null;
  if (live) push('createProject', p, run);
  else {
    log(id, `פרויקט חדש: ${p.name}`, 'progress');
    if (run) demoPlan(p, run);
    else toast('הפרויקט נוסף');
  }
  haptic('success');
  return id;
}
// The demo's Claude asks one open question, then writes a plan once it is answered.
function demoPlan(p, run) {
  set((s) => ({
    agents: [{ id: run.id, project: p.id, owner: s.me, title: run.title, state: 'wait', progress: 0.1, step: 'שואל אותך כדי לתכנן', started: new Date().toISOString(), kind: 'doc', brief: run.brief }, ...s.agents],
    decisions: [{ id: 'd' + Date.now(), project: p.id, owner: s.me, agent: run.id, q: 'עד מתי הפרויקט צריך להיות מוכן, ומה חייב להיות בו?', options: [], source: 'claude', created: new Date().toISOString(), choice: null }, ...s.decisions],
  }));
  toast('Claude התחיל. השאלה שלו מחכה לך כאן');
}
const phaseAt = (pid, i) => project(pid)?.milestones[i]?.title;
function demoPlanFill(d) {
  const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const at = (n) => new Date(Date.now() + n * 864e5).toISOString();
  const pid = d.project;
  set((s) => ({
    projects: s.projects.map((p) => (p.id === pid ? { ...p, plan: `תוכנית לפי מה שענית: ${d.choice}`, planAt: new Date().toISOString(), end: at(21),
      milestones: p.milestones.length ? p.milestones : [{ id: 'm1', title: 'מיפוי', start: p.start, end: at(5) }, { id: 'm2', title: 'בנייה', start: at(5), end: at(14) }, { id: 'm3', title: 'הגשה', start: at(14), end: at(21) }] } : p)),
    planSteps: [
      { id: 's' + Date.now(), project: pid, title: 'לאסוף את מה שכבר קיים ולסכם', due: day(3), phase: phaseAt(pid, 0) || 'מיפוי' },
      { id: 's' + (Date.now() + 1), project: pid, title: 'לבנות טיוטה ראשונה', due: day(10), phase: phaseAt(pid, 1) || 'בנייה' },
      ...s.planSteps,
    ],
    humanTasks: [{ id: 'h' + Date.now(), project: pid, type: 'meeting', owner: s.me, title: 'לקבוע פגישת התנעה עם השותפים', created: new Date().toISOString(), cta: 'נקבע', due: day(2), phase: phaseAt(pid, 0) || 'מיפוי', done: false }, ...s.humanTasks],
    agents: s.agents.map((a) => (a.id === d.agent ? { ...a, state: 'run', progress: 0.3, step: 'התוכנית נכתבה. ממשיך לשלב הראשון' } : a)),
  }));
  log(pid, 'Claude כתב את תוכנית העבודה', 'progress');
}
// The milestones change as the work does: renamed, moved, added, removed, or marked done.
export function setMilestones(id, plain, { quiet } = {}) {
  const p = project(id);
  const ms = toScreenMs(plain, p.start);
  set((s) => ({ projects: s.projects.map((x) => (x.id === id ? { ...x, milestones: ms, end: ms.at(-1)?.end || x.end } : x)) }));
  push('setMilestones', project(id), ms);
  if (!quiet) toast('אבני הדרך עודכנו');
}
export function toggleMilestone(id, msId) {
  const p = project(id);
  const m = p.milestones.find((x) => x.id === msId);
  const plain = p.milestones.map((x) => ({ ...x, due: x.end.slice(0, 10), done: x.id === msId ? !x.done : x.done }));
  setMilestones(id, plain, { quiet: true });
  if (!m.done) { haptic('success'); log(id, `הושלם שלב: ${m.title}`, 'progress'); toast(`השלב "${m.title}" הושלם`); }
}
export function setPersonal(id, personal) {
  const p = project(id);
  set((s) => ({ projects: s.projects.map((x) => (x.id === id ? { ...x, personal } : x)) }));
  push('setPersonal', p, personal);
  toast(personal ? 'עכשיו הפרויקט גלוי רק לך' : 'הפרויקט גלוי לכל הצוות');
}
export function setClaudeUrl(id, url) {
  const p = project(id);
  set((s) => ({ projects: s.projects.map((x) => (x.id === id ? { ...x, claudeUrl: url } : x)) }));
  push('setClaudeUrl', p, url);
  toast(url ? 'הקישור לפרויקט ב-Claude נשמר' : 'הקישור הוסר');
}

export function stopAgent(id) {
  if (state.mode === 'live') {
    set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, stopRequested: true, step: 'ביקשת לעצור. Claude יעצור בעדכון הבא' } : a)) }));
    push('stopAgent', id);
    toast('Claude יעצור בעדכון הבא שלו');
    return;
  }
  set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, state: 'wait', step: 'נעצר ביד אדם' } : a)) }));
  toast('הסוכן נעצר');
}
export function resumeAgent(id) {
  if (state.mode === 'live') {
    set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, state: 'queued', stopRequested: false, step: 'מחכה שסשן של Claude ימשיך' } : a)) }));
    push('resumeAgent', id);
    return;
  }
  set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, state: 'run', step: 'ממשיך' } : a)) }));
}

// ---------- the live loop ----------
const STEPS = {
  video: ['כותב תסריט', 'בונה סצנות', 'מרנדר', 'מוסיף כתוביות', 'בודק את הסרטון'],
  code: ['קורא את הקוד', 'כותב רכיבים', 'מריץ בדיקות', 'מעלה תצוגה מקדימה'],
  app: ['קורא את התדריך', 'כותב רכיבים', 'מריץ בדיקות', 'מעלה תצוגה מקדימה'],
  research: ['מחפש מקורות', 'מאמת עובדות', 'משווה ממצאים', 'כותב סיכום'],
  doc: ['קורא את ההקשר', 'כותב טיוטה', 'מהדק ניסוח', 'בודק מול האפיון'],
  deck: ['בונה מבנה', 'כותב שקפים', 'מעצב', 'בודק'],
  data: ['קורא את הקובץ', 'מנקה נתונים', 'מחשב', 'בונה גרפים'],
  meeting: ['קורא את התמליל', 'מוצא החלטות', 'פותח מטלות'],
  routine: ['מגדיר תזמון', 'בודק הרשאות', 'מריץ פעם ראשונה'],
};
function tick() {
  if (state.mode !== 'demo') return;
  const done = [];
  set((s) => ({
    agents: s.agents.map((a) => {
      if (a.state !== 'run') return a;
      const inc = a.fast ? 0.09 : a.id === 'a2' ? 0.025 : 0.006;
      const p = Math.min(1, a.progress + inc * (0.6 + Math.random() * 0.8));
      if (p >= 1) { done.push(a); return { ...a, progress: 1, state: 'review', step: 'מוכן לבדיקה' }; }
      const steps = STEPS[a.kind] || STEPS.doc;
      const step = a.fast || a.id === 'a2' ? steps[Math.min(steps.length - 1, Math.floor(p * steps.length))] : a.step;
      return { ...a, progress: p, step };
    }),
  }));
  done.forEach((a) => {
    const y = a.yields || { kind: 'doc', title: a.title, summary: '' };
    set((s) => ({ outputs: [{ id: 'o' + Date.now() + a.id, project: a.project, agent: a.id, kind: y.kind, title: y.title, summary: y.summary, at: new Date().toISOString(), url: '#', fresh: true, review: true, duration: y.kind === 'video' ? '2:58' : undefined }, ...s.outputs] }));
    log(a.project, `Claude סיים: ${y.title}`, 'output');
    haptic('success');
    toast(`Claude סיים: ${y.title}`, { action: { label: 'פתיחה', run: () => { location.hash = '#/today'; } }, ms: 6000 });
  });
}
if (typeof window !== 'undefined') setInterval(tick, 2500);
