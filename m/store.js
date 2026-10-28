// The state of the manual version and every action on it. For now the data lives in this browser (localStorage), seeded
// from data.js, so the team can try the whole flow before the database is set up. Each action goes through `commit`,
// which is the one place a live backend will hook in later.
import { useEffect, useState } from 'preact/hooks';
import * as seed from './data.js';
import * as card from './card.js';
import { haptic } from '../app/motion.js';

const KEY = 'm.state.v2';
const ME_KEY = 'm.me';
const clone = (x) => JSON.parse(JSON.stringify(x));
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } },
};
const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const fresh = () => ({ people: clone(seed.people), projects: clone(seed.projects), tasks: clone(seed.tasks), outputs: clone(seed.outputs), meetings: clone(seed.meetings) });

const saved = LS.get(KEY);
let state = {
  ...(saved && saved.projects ? saved : fresh()),
  me: LS.get(ME_KEY) || 'yahali',
  sheet: null,
  toasts: [],
  recording: null,
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
// Every change to the team's data passes here.
function commit(patch) {
  set(patch);
  const { people, projects, tasks, outputs, meetings } = state;
  // A recording's blob URL lives only in this tab, so it is never written to storage.
  LS.set(KEY, { people, projects, tasks, outputs: outputs.map(({ audio, ...o }) => o), meetings });
}
export function resetSample() { LS.del(KEY); set({ ...fresh(), sheet: null }); toast('הנתונים חזרו לדוגמה'); }
export function switchTo(id) { LS.set(ME_KEY, id); set({ me: id, sheet: null }); location.hash = '#/today'; }

// ---------- toasts and sheets ----------
export function toast(text, opts = {}) {
  const id = uid('t');
  set((s) => ({ toasts: [...s.toasts, { id, text, action: opts.action }] }));
  setTimeout(() => dismissToast(id), opts.ms || 4200);
}
export const dismissToast = (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
export const openSheet = (kind, props = {}) => set({ sheet: { kind, ...props } });
// A sheet opened from inside a task (back) returns to the task however it closes: a choice, X, Escape, the backdrop or a flick.
export const closeSheet = () => {
  const sh = state.sheet;
  set({ sheet: null });
  if (sh?.back && sh.task) setTimeout(() => openSheet('task', { id: sh.task }), 60);
};

// ---------- people and permissions ----------
const NOBODY = { id: null, name: 'לא שובץ', role: 'member', color: '#8e8e93' };
export const person = (id) => state.people.find((p) => p.id === id) || NOBODY;
export const me = () => person(state.me);
export const isCommander = (id = state.me) => person(id).role === 'commander';
export const team = () => state.people.filter((p) => p.role !== 'external');
export const project = (id) => state.projects.find((p) => p.id === id);

// Personal projects are the owner's alone, even from the commander. Outside partners see only their projects.
export function canSee(p, who = state.me) {
  if (!p) return false;
  if (p.personal) return p.personal === who;
  if (person(who).role === 'external') return p.manager === who || p.partners.includes(who);
  return true;
}
// A stopped or finished project takes no new people or work.
export const isOpen = (p) => !!p && p.phase !== 'stopped' && p.phase !== 'done';
export const canManage = (p, who = state.me) => !!p && (p.personal ? p.personal === who : p.manager === who || isCommander(who));
export const visibleProjects = () => state.projects.filter((p) => canSee(p));
export const teamProjects = () => visibleProjects().filter((p) => !p.personal);
export const personalProjects = () => visibleProjects().filter((p) => p.personal);
export const myProjects = () => teamProjects().filter((p) => p.manager === state.me || p.partners.includes(state.me));
export const managedProjects = () => teamProjects().filter((p) => p.manager === state.me);
export function canSeeTask(t, who = state.me) {
  if (t.personal) return t.owner === who;
  if (!t.project) return t.owner === who || t.by === who || isCommander(who);
  return canSee(project(t.project), who);
}
export const canEditTask = (t, who = state.me) => t.owner === who || t.by === who || canManage(project(t.project), who);
export const myTasks = () => state.tasks.filter((t) => t.owner === state.me && canSeeTask(t));
export const projectTasks = (id) => state.tasks.filter((t) => t.project === id && canSeeTask(t));
export const projectOutputs = (id) => state.outputs.filter((o) => o.project === id);
export const visibleOutputs = () => state.outputs.filter((o) => canSee(project(o.project)));
// What reaches the commander, across every team project.
export const commanderQueue = () => teamProjects().flatMap((p) => card.needsCommander(p, state.tasks).map((x) => ({ ...x, project: p.id })));
export const updatesDue = () => managedProjects().filter((p) => p.phase !== 'stopped' && p.phase !== 'done' && card.updateDue(p));

// ---------- tasks ----------
export const STATUS = {
  todo: { label: 'לא התחיל', color: 'var(--s-todo)' },
  doing: { label: 'בעבודה', color: 'var(--s-progress)' },
  stuck: { label: 'תקוע', color: 'var(--bad)', ink: 'light' },
  done: { label: 'בוצע', color: 'var(--s-done)' },
};
export const STATUS_ORDER = ['todo', 'doing', 'stuck', 'done'];
export const PRIORITY = {
  critical: { label: 'קריטי', color: 'var(--bad)', ink: 'light' },
  high: { label: 'גבוהה', color: 'var(--s-progress)' },
  medium: { label: 'בינונית', color: 'var(--accent)', ink: 'light' },
  low: { label: 'נמוכה', color: 'var(--s-todo)' },
};
export const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low'];

export function addTask(t) {
  const task = { id: uid('t'), status: 'todo', by: state.me, owner: state.me, project: null, stage: null, due: null, createdAt: new Date().toISOString(), ...t };
  const p = project(task.project);
  if (p && !task.stage) task.stage = card.currentStage(p)?.id || null;
  if (p?.personal) task.personal = true;
  if (isCommander() && task.owner !== state.me) task.fromCommander = true;
  commit((s) => ({ tasks: [task, ...s.tasks] }));
  if (task.owner !== state.me) toast(`המשימה עברה ל${person(task.owner).name}`);
  return task;
}
export function updateTask(id, patch) {
  commit((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch, doneAt: patch.status === 'done' ? new Date().toISOString() : patch.status ? null : t.doneAt } : t)) }));
}
export function setStatus(id, status) {
  const before = state.tasks.find((t) => t.id === id);
  updateTask(id, { status, focus: status === 'done' ? false : before?.focus });
  if (status === 'done') {
    haptic('success');
    const p = project(before?.project);
    toast('בוצע', { action: { label: 'ביטול', run: () => updateTask(id, { status: before.status, focus: before.focus }) } });
    if (p && card.stageReady(project(p.id), state.tasks) && canManage(p)) {
      setTimeout(() => toast(`כל המשימות של שלב ${card.currentStage(p).name} בוצעו. לסגור את השלב?`, { ms: 8000, action: { label: 'לסגירה', run: () => openSheet('gate', { id: p.id }) } }), 500);
    }
  }
}
export function deleteTask(id) {
  const t = state.tasks.find((x) => x.id === id);
  commit((s) => ({ tasks: s.tasks.filter((x) => x.id !== id) }));
  toast('המשימה נמחקה', { action: { label: 'ביטול', run: () => commit((s) => ({ tasks: [t, ...s.tasks] })) } });
}
export function toggleFocus(id) {
  const t = state.tasks.find((x) => x.id === id);
  const n = myTasks().filter((x) => x.focus && x.status !== 'done').length;
  if (!t.focus && n >= 3) { toast('אפשר שלוש משימות בפוקוס. קודם לסיים או להוציא אחת'); return; }
  updateTask(id, { focus: !t.focus });
}

// ---------- projects and the ID card ----------
const PCOLORS = ['#ff9500', '#5856d6', '#34c759', '#30b0c7', '#ff2d55', '#af52de', '#0071e3'];
export function addProject({ name, classification, template, what, manager, partners = [], personal = false }) {
  const p = {
    id: uid('p'), name, color: PCOLORS[state.projects.length % PCOLORS.length], classification: personal ? 'open' : classification, template,
    what, forWhom: '', success: '', stopRule: '', manager: personal ? state.me : manager, partners: personal ? [] : partners,
    stages: card.stagesFromTemplate(template), hill: 'up', confidence: 'on', confNote: '', lastUpdate: new Date().toISOString(), tolDays: 14, log: [],
    trl: TEMPLATE_TRL(template) ? 1 : undefined, personal: personal ? state.me : undefined, createdBy: state.me,
  };
  commit((s) => ({ projects: [...s.projects, p] }));
  haptic('success');
  return p;
}
const TEMPLATE_TRL = (id) => card.TEMPLATES.find((t) => t.id === id)?.trl;
export function updateProject(id, patch) {
  commit((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...(typeof patch === 'function' ? patch(p) : patch) } : p)) }));
}
export function setField(pid, sid, i, patch) {
  updateProject(pid, (p) => ({ stages: p.stages.map((s) => (s.id === sid ? { ...s, fields: s.fields.map((f, k) => (k === i ? { ...f, ...patch } : f)) } : s)) }));
}
export function setStage(pid, sid, patch) {
  updateProject(pid, (p) => ({ stages: p.stages.map((s) => (s.id === sid ? { ...s, ...patch } : s)) }));
}
export function addStage(pid, key, name) {
  updateProject(pid, (p) => {
    const s = card.makeStage(key, name);
    if (!p.stages.some((x) => x.state === 'active' || x.state === 'pending') && !p.stages.some((x) => x.state === 'todo')) s.state = 'active';
    return { stages: [...p.stages, s] };
  });
}
export function moveStage(pid, sid, dir) {
  updateProject(pid, (p) => {
    const st = [...p.stages];
    const i = st.findIndex((s) => s.id === sid);
    const j = i + dir;
    if (j < 0 || j >= st.length) return {};
    [st[i], st[j]] = [st[j], st[i]];
    return { stages: st };
  });
}
export function skipStage(pid, sid) {
  updateProject(pid, (p) => {
    const st = p.stages.map((s) => ({ ...s }));
    const i = st.findIndex((s) => s.id === sid);
    const wasActive = st[i].state === 'active';
    st[i].state = 'skipped';
    if (wasActive) { const n = st.findIndex((s, k) => k > i && s.state === 'todo'); if (n >= 0) st[n].state = 'active'; }
    return { stages: st, log: [{ id: uid('l'), kind: 'decision', text: `דילגנו על שלב ${st[i].name}`, who: state.me, at: new Date().toISOString(), reversible: true }, ...(p.log || [])] };
  });
}
export function removeStage(pid, sid) {
  updateProject(pid, (p) => ({ stages: p.stages.filter((s) => s.id !== sid) }));
}
export function closeStage(pid, opts) {
  const p = project(pid);
  const cur = card.currentStage(p);
  const next = card.closeStage(p, { ...opts, by: state.me, byCommander: isCommander() });
  updateProject(pid, next);
  haptic('success');
  if (opts.choice === 'next' && cur?.gate === 'commander' && !isCommander()) toast(`שלב ${cur.name} מחכה לאישור של ${person(state.people.find((x) => x.role === 'commander')?.id).name}`);
  else if (opts.choice === 'next') toast(cur ? `שלב ${cur.name} נסגר` : 'נשמר');
  else toast(card.GATE_CHOICES[opts.choice].label.replace('לעצור את הפרויקט', 'הפרויקט נעצר'));
}
export function approveGate(pid, note = '') {
  closeStage(pid, { choice: 'next', note: note || 'אושר' });
}
export function returnGate(pid, note) {
  updateProject(pid, card.returnStage(project(pid), { by: state.me, note }));
  toast('השלב חזר למנהל הפרויקט עם ההכוונה שלך');
}
export function weeklyUpdate(pid, u) {
  updateProject(pid, card.weeklyUpdate(project(pid), u));
  haptic('success');
  toast('העדכון נשמר. תודה');
}
export function resolveSenior(pid, note) {
  const p = project(pid);
  updateProject(pid, { needsSenior: null, log: [{ id: uid('l'), kind: 'decision', text: `${person(state.me).name}: ${note || 'טופל'} (${p.needsSenior?.what || ''})`, who: state.me, at: new Date().toISOString(), reversible: true }, ...(p.log || [])] });
  toast('נרשם בהחלטות הפרויקט');
}
export function addLog(pid, entry) {
  updateProject(pid, (p) => ({ log: [{ id: uid('l'), who: state.me, at: new Date().toISOString(), ...entry }, ...(p.log || [])] }));
}
export function setPeople(pid, { manager, partners }) {
  updateProject(pid, (p) => ({ ...(manager ? { manager } : {}), ...(partners ? { partners } : {}) }));
}
export function addPerson({ name, title, org, account }) {
  const p = { id: uid('u'), name, title, org, role: 'external', account: !!account, color: '#8e8e93' };
  commit((s) => ({ people: [...s.people, p] }));
  return p;
}

// ---------- outputs ----------
export function addOutput(o) {
  const out = { id: uid('o'), by: state.me, at: new Date().toISOString(), level: 'draft', feedback: [], ...o };
  const p = project(out.project);
  if (p && !out.stage) out.stage = card.currentStage(p)?.id || null;
  commit((s) => ({ outputs: [out, ...s.outputs] }));
  return out;
}
export function updateOutput(id, patch) { commit((s) => ({ outputs: s.outputs.map((o) => (o.id === id ? { ...o, ...patch } : o)) })); }
export function addFeedback(id, text) {
  commit((s) => ({ outputs: s.outputs.map((o) => (o.id === id ? { ...o, feedback: [...o.feedback, { id: uid('f'), who: state.me, text, at: new Date().toISOString() }] } : o)) }));
}

// ---------- meetings ----------
export function saveMeeting(m) {
  const { audio, ...rest } = m;
  const meeting = { id: uid('m'), by: state.me, at: new Date().toISOString(), ...rest };
  const out = addOutput({ project: m.project, title: `סיכום: ${m.title}`, kind: 'meeting', meeting: meeting.id, level: 'draft', audio, hasAudio: !!audio });
  meeting.output = out.id;
  commit((s) => ({ meetings: [meeting, ...s.meetings] }));
  return meeting;
}
