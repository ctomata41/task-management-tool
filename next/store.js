// The prototype's state: in memory, seeded from data.js. A small "live" loop stands in for Claude reporting through the
// connector: running sessions move forward on their own, and a finished one drops its output into "היום".
import { useEffect, useState } from 'preact/hooks';
import * as seed from './data.js';
import { haptic } from '../app/motion.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
let state = {
  me: 'yahali',
  people: seed.people,
  projects: seed.projects,
  agents: clone(seed.agents),
  outputs: clone(seed.outputs),
  decisions: clone(seed.decisions).map((d) => ({ ...d, choice: null })),
  humanTasks: clone(seed.humanTasks).map((t) => ({ ...t, done: false })),
  meetingAsks: clone(seed.meetingAsks).map((m) => ({ ...m, booked: null })),
  events: clone(seed.events),
  feed: clone(seed.feed),
  interviews: clone(seed.interviews),
  answers: {}, // project -> { questionId: optionId | text }
  toasts: [],
  sheet: null, // { kind, ...props }
  gcal: true,
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
export const person = (id) => state.people.find((p) => p.id === id);
export const project = (id) => state.projects.find((p) => p.id === id);
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
  const ags = projectAgents(p.id).filter((a) => a.state !== 'done');
  const live = ags.length ? ags.reduce((s, a) => s + a.progress, 0) / ags.length : 0;
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
  const who = person((t || d)?.owner);
  return who ? who.name : 'אדם';
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
export function decide(id, optionId) {
  const d = state.decisions.find((x) => x.id === id);
  const opt = d.options.find((o) => o.id === optionId) || { label: optionId };
  set((s) => ({
    decisions: s.decisions.map((x) => (x.id === id ? { ...x, choice: opt.label, decidedAt: new Date().toISOString() } : x)),
    agents: s.agents.map((a) => (a.id === d.agent && a.state === 'wait' && !s.humanTasks.some((t) => t.blocks === a.id && !t.done) ? { ...a, state: 'run', step: `ממשיך: ${opt.label}` } : a)),
  }));
  log(d.project, `הוחלט: ${d.q} ${opt.label}`, 'decision');
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
  haptic('success');
  toast('אושר. Claude סגר את המשימה');
}
export const seeOutput = (id) => set((s) => ({ outputs: s.outputs.map((x) => (x.id === id ? { ...x, fresh: false } : x)) }));

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

// Launching Claude from the platform: a new session appears and starts reporting at once.
export function launch({ tool, projectId, brief, title }) {
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

export function stopAgent(id) {
  set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, state: 'wait', step: 'נעצר ביד אדם' } : a)) }));
  toast('הסוכן נעצר');
}
export function resumeAgent(id) {
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
