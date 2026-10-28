// The state of the manual version and every action on it. For now the data lives in this browser (localStorage), seeded
// from data.js, so the team can try the whole flow before the database is set up. Each action goes through `commit`,
// which is the one place a live backend will hook in later.
import { useEffect, useState } from 'preact/hooks';
import * as seed from './data.js';
import * as card from './card.js';
import { haptic } from '../app/motion.js';

const KEY = 'm.state.v2';
const VERSION = 3; // the shape of what is saved under KEY; migrate() brings an older one up to it
const ME_KEY = 'm.me';
const clone = (x) => JSON.parse(JSON.stringify(x));
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } },
};
const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const fresh = () => ({ v: VERSION, people: clone(seed.people), projects: clone(seed.projects), tasks: clone(seed.tasks), outputs: clone(seed.outputs), meetings: clone(seed.meetings) });

// A state saved before the order and the asks (v2) gets them on load: command for whoever has it in the sample, places
// for the live team projects (the sample's order first, the rest after it as they were saved), and the commander's
// tasks to a project's own manager become accepted asks. Every place counts as seen, so nothing nags anyone.
export function migrate(saved) {
  if ((saved.v || 2) >= VERSION) return saved;
  const at = new Date().toISOString();
  const by = seed.people.find((x) => x.role === 'commander')?.id || null;
  const people = (saved.people || []).map((x) => (seed.people.find((y) => y.id === x.id)?.command ? { ...x, command: true } : x));
  const seedRank = (id) => seed.projects.find((x) => x.id === id)?.rank ?? Infinity;
  const live = (saved.projects || []).filter(card.inOrder).sort((a, b) => seedRank(a.id) - seedRank(b.id) || 0); // a stable sort
  const projects = (saved.projects || []).map((p) => {
    const rank = live.includes(p) ? live.indexOf(p) + 1 : null;
    return { ...p, rank, rankSeen: rank, ...(rank ? { rankAt: at, rankBy: by } : {}) };
  });
  const managerOf = (pid) => projects.find((x) => x.id === pid)?.manager;
  const tasks = (saved.tasks || []).map((t) => (t.fromCommander && !t.ask && t.project && managerOf(t.project) === t.owner ? { ...t, ask: true, ack: { state: 'ok', at } } : t));
  return { ...saved, v: VERSION, people, projects, tasks };
}

const saved = LS.get(KEY);
let state = {
  ...(saved && saved.projects ? migrate(saved) : fresh()),
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
  LS.set(KEY, { v: VERSION, people, projects, tasks, outputs: outputs.map(({ audio, ...o }) => o), meetings });
}
export function resetSample() { LS.del(KEY); set({ ...fresh(), sheet: null }); toast('הנתונים חזרו לדוגמה'); }
// The commander starts from the picture of the whole team; everyone else from their own day.
export function switchTo(id) { LS.set(ME_KEY, id); set({ me: id, sheet: null }); location.hash = isCommander(id) ? '#/overview' : '#/today'; }

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
// Only the commander sets the order and sends asks. Command (the commander and the deputy) sees the whole picture,
// restricted projects included, and the commander's queue.
export const isCommander = (id = state.me) => person(id).role === 'commander';
export const isCommand = (id = state.me) => isCommander(id) || !!person(id).command;
export const commander = () => state.people.find((p) => p.role === 'commander') || NOBODY;
export const team = () => state.people.filter((p) => p.role !== 'external');
export const project = (id) => state.projects.find((p) => p.id === id);

// Personal projects are the owner's alone, even from the commander. Outside partners see only their projects.
export function canSee(p, who = state.me) {
  if (!p) return false;
  if (p.personal) return p.personal === who;
  if (person(who).role === 'external') return p.manager === who || p.partners.includes(who);
  return true;
}
// Past the one line (name, manager, stage, health, place): tasks, asks, outputs and the project's page. Every place
// that shows a project's detail asks here.
export function canSeeDetail(p, who = state.me) {
  if (!canSee(p, who)) return false;
  // The lock on a restricted (שמור/סודי) project for team members outside it. Yahali still has this decision open;
  // deleting this one line turns the lock off.
  if (p.classification === 'restricted' && !(isCommand(who) || p.manager === who || p.partners.includes(who))) return false;
  return true;
}
// Whoever runs a project: its manager, or a personal project's owner.
export const leads = (p, who = state.me) => !!p && (p.personal ? p.personal === who : p.manager === who);
// A stopped or finished project takes no new people or work.
export const isOpen = (p) => !!p && p.phase !== 'stopped' && p.phase !== 'done';
// Gates, the ID card and the project's people: its manager, and the commander everywhere.
export const canManage = (p, who = state.me) => !!p && (p.personal ? p.personal === who : p.manager === who || isCommander(who));
export const visibleProjects = () => state.projects.filter((p) => canSee(p));
export const teamProjects = () => visibleProjects().filter((p) => !p.personal);
export const personalProjects = () => visibleProjects().filter((p) => p.personal);
export const myProjects = () => teamProjects().filter((p) => p.manager === state.me || p.partners.includes(state.me));
export const managedProjects = () => teamProjects().filter((p) => p.manager === state.me);
// Outside partners never see asks; a locked project shows nobody its tasks.
export function canSeeTask(t, who = state.me) {
  if (t.personal) return t.owner === who;
  if (!t.project) return t.owner === who || t.by === who || isCommander(who);
  if (t.ask && person(who).role === 'external') return false;
  return canSeeDetail(project(t.project), who);
}
// A task is edited by its owner, whoever created it (the commander's own asks too) and whoever runs its project. The
// commander edits nothing else in a project he doesn't run: what he adds there becomes an ask (addTask).
export const canEditTask = (t, who = state.me) => t.owner === who || t.by === who || leads(project(t.project), who);
export const myTasks = () => state.tasks.filter((t) => t.owner === state.me && canSeeTask(t));
export const projectTasks = (id) => state.tasks.filter((t) => t.project === id && canSeeTask(t));
export const projectOutputs = (id) => (canSeeDetail(project(id)) ? state.outputs.filter((o) => o.project === id) : []);
export const visibleOutputs = () => state.outputs.filter((o) => canSeeDetail(project(o.project)));
// What reaches the commander, across every team project: by kind (card.KIND_ORDER), then by the project's place.
export const commanderQueue = () => teamProjects()
  .flatMap((p) => card.needsCommander(p, state.tasks).map((x) => ({ ...x, project: p.id })))
  .sort((a, b) => card.KIND_ORDER.indexOf(a.kind) - card.KIND_ORDER.indexOf(b.kind) || card.byRank(project(a.project), project(b.project)));
export const updatesDue = () => managedProjects().filter((p) => p.phase !== 'stopped' && p.phase !== 'done' && card.updateDue(p));

// ---------- the order and the asks, as the screens read them ----------
// Every live team project in the order: placed ones by place, then unplaced, then held (card.byRank).
export const orderedProjects = () => teamProjects().filter(isOpen).sort(card.byRank);
// Only the placed ones, 1…N, so N is rankedProjects().length.
export const rankedProjects = () => teamProjects().filter((p) => card.inOrder(p) && p.rank != null).sort(card.byRank);
// Who set the order last and when, for the line under its title: { by, at }, or null before anyone set it.
export function orderStamp() {
  const p = state.projects.filter((x) => x.rankAt).sort((a, b) => String(b.rankAt).localeCompare(String(a.rankAt)))[0];
  return p ? { by: p.rankBy, at: p.rankAt } : null;
}
// The projects I run whose place changed since I last acknowledged it (ackRank).
export const movedProjects = () => managedProjects().filter((p) => card.inOrder(p) && p.rank != null && p.rank !== p.rankSeen);
// A project's open asks, as far as I may see them.
export const projectAsks = (pid) => state.tasks.filter((t) => t.ask && t.project === pid && t.status !== 'done' && canSeeTask(t));
// Asks to me that still wait for my answer (קיבלתי or צריך לדבר).
export const asksWaiting = () => state.tasks.filter((t) => t.ask && t.owner === state.me && !t.ack && t.status !== 'done' && canSeeTask(t));
// The tasks an ask was broken into.
export const askTasks = (id) => state.tasks.filter((t) => t.parent === id && canSeeTask(t));

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

function insertTask(t) {
  const task = { id: uid('t'), status: 'todo', by: state.me, owner: state.me, project: null, stage: null, due: null, createdAt: new Date().toISOString(), ...t };
  const p = project(task.project);
  if (p && !task.stage) task.stage = card.currentStage(p)?.id || null;
  if (p?.personal) task.personal = true;
  if (isCommander() && task.owner !== state.me) task.fromCommander = true;
  // Breaking an ask down answers it: work under it means it was accepted.
  const up = task.parent ? state.tasks.find((x) => x.id === task.parent && x.ask && !x.ack) : null;
  commit((s) => ({ tasks: [task, ...s.tasks.map((x) => (up && x.id === up.id ? { ...x, ack: { state: 'ok', at: task.createdAt } } : x))] }));
  return task;
}
export function addTask(t) {
  const p = project(t.project);
  // The commander never reaches past a manager: a task he adds in a project someone else runs is an ask to its manager.
  if (isCommander() && p && !p.personal && !leads(p) && !t.ask) return sendAsk({ project: p.id, title: t.title, why: t.why, due: t.due, stage: t.stage });
  const task = insertTask(t);
  if (task.owner !== state.me) toast(`המשימה עברה ל${person(task.owner).name}`);
  return task;
}
export function updateTask(id, patch) {
  commit((s) => ({ tasks: s.tasks.map((t) => {
    if (t.id !== id) return t;
    const next = { ...t, ...patch, doneAt: patch.status === 'done' ? new Date().toISOString() : patch.status ? null : t.doneAt };
    // A new owner starts with the task out of focus: the star or pin was about someone else's day.
    if (patch.owner !== undefined && patch.owner !== t.owner) { next.focus = false; next.focusBy = null; }
    return next;
  }) }));
}
export function setStatus(id, status) {
  const before = state.tasks.find((t) => t.id === id);
  const done = status === 'done';
  updateTask(id, { status, focus: done ? false : before?.focus, focusBy: done ? null : before?.focusBy ?? null });
  if (done) {
    haptic('success');
    const p = project(before?.project);
    toast('בוצע', { action: { label: 'ביטול', run: () => updateTask(id, { status: before.status, focus: before.focus, focusBy: before.focusBy ?? null }) } });
    if (p && card.stageReady(project(p.id), state.tasks) && canManage(p)) {
      setTimeout(() => toast(`כל המשימות של שלב ${card.currentStage(p).name} בוצעו. לסגור את השלב?`, { ms: 8000, action: { label: 'לסגירה', run: () => openSheet('gate', { id: p.id }) } }), 500);
    }
    // The last open task under an ask: whoever can close the ask is asked to.
    const ask = before?.parent && before.status !== 'done' ? state.tasks.find((x) => x.id === before.parent && x.ask) : null;
    if (ask && ask.status !== 'done' && canEditTask(ask) && state.tasks.every((x) => x.parent !== ask.id || x.status === 'done')) {
      setTimeout(() => toast('כל המשימות של הבקשה בוצעו. לסגור אותה?', { ms: 8000, action: { label: 'לסגירה', run: () => setStatus(ask.id, 'done') } }), 500);
    }
  }
}
// Deleting an ask frees the tasks under it; the undo puts both back.
export function deleteTask(id) {
  const t = state.tasks.find((x) => x.id === id);
  const under = state.tasks.filter((x) => x.parent === id).map((x) => x.id);
  commit((s) => ({ tasks: s.tasks.filter((x) => x.id !== id).map((x) => (under.includes(x.id) ? { ...x, parent: null } : x)) }));
  toast(t?.ask ? 'הבקשה נמחקה' : 'המשימה נמחקה', { action: { label: 'ביטול', run: () => commit((s) => ({ tasks: [t, ...s.tasks.map((x) => (under.includes(x.id) ? { ...x, parent: id } : x))] })) } });
}
// The focus of the day: up to three open tasks per person, their own stars and their managers' pins together, so a pin
// never pushes out a star. A manager pins only in a project they run, never for someone without an account or on a
// personal task, and takes back only their own pins. The owner can take out anything, and nobody is told.
export function toggleFocus(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t || t.status === 'done') return;
  const mine = t.owner === state.me;
  const who = person(t.owner);
  if (t.focus) {
    if (mine || t.focusBy === state.me) updateTask(id, { focus: false, focusBy: null });
    return;
  }
  if (!mine && (!who.id || who.account === false || t.personal || !leads(project(t.project)))) return;
  const n = state.tasks.filter((x) => x.owner === t.owner && x.focus && x.status !== 'done').length;
  if (n >= 3) { toast(mine ? 'אפשר שלוש משימות בפוקוס. קודם לסיים או להוציא אחת' : `בפוקוס של ${who.name} כבר שלוש משימות`); return; }
  updateTask(id, { focus: true, focusBy: mine ? null : state.me });
  if (!mine) toast(`המשימה נוספה לפוקוס של ${who.name}`);
}

// ---------- the order of the projects ----------
// Only the commander sets it: a pick moves one project and renumbers the rest, and the toast can take it all back.
export function setRank(pid, n) {
  if (!isCommander()) return;
  const ranks = card.placeProject(state.projects, pid, n);
  if (state.projects.every((p) => (p.rank ?? null) === ranks[p.id])) return;
  const before = state.projects.map(({ id, rank = null, rankSeen = null, rankAt = null, rankBy = null }) => ({ id, rank, rankSeen, rankAt, rankBy }));
  const at = new Date().toISOString();
  commit((s) => ({ projects: s.projects.map((p) => ((p.rank ?? null) === ranks[p.id] ? p
    : { ...p, rank: ranks[p.id], rankAt: at, rankBy: s.me, ...(p.manager === s.me ? { rankSeen: ranks[p.id] } : {}) })) }));
  haptic('success');
  toast('הסדר עודכן', { action: { label: 'ביטול', run: () => commit((s) => ({ projects: s.projects.map((p) => ({ ...p, ...before.find((x) => x.id === p.id) })) })) } });
}
// "הבנתי": the manager has seen the project's new place. With no id, every project of mine that moved.
export function ackRank(pid) {
  const ids = pid ? [pid] : movedProjects().map((p) => p.id);
  commit((s) => ({ projects: s.projects.map((p) => (ids.includes(p.id) ? { ...p, rankSeen: p.rank ?? null } : p)) }));
}
const withRanks = (projects, ranks) => projects.map((p) => ((p.rank ?? null) === ranks[p.id] ? p : { ...p, rank: ranks[p.id] }));

// ---------- asks ----------
// The commander asks a project's manager for something, always the manager, with a high priority. The manager
// accepts it or asks to talk (ackAsk), then breaks it into tasks for the project's people (addTask with parent).
export function sendAsk({ project: pid, title, why = null, due = null, stage = null }) {
  const p = project(pid);
  if (!p || p.personal || !isCommander() || !title) return null;
  const task = insertTask({ title, project: p.id, stage, due: due || null, why: why || null, ask: true, ack: null, owner: p.manager, priority: 'high' });
  haptic('success');
  toast(`הבקשה נשלחה ל${person(p.manager).name}`);
  return task;
}
// The manager's answer: 'ok' (קיבלתי) or 'talk' (צריך לדבר), which puts the ask in the commander's queue.
export function ackAsk(id, answer) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t?.ask || !leads(project(t.project))) return;
  updateTask(id, { ack: { state: answer, at: new Date().toISOString() } });
  if (answer === 'ok') { haptic('success'); toast('הבקשה התקבלה'); } else toast(`נשלח ל${commander().name}: צריך לדבר על הבקשה`);
}
// "דיברנו": the commander and the manager talked, so the ask is accepted again, and the talk goes in the project's log.
export function talked(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t?.ask || !isCommander()) return;
  updateTask(id, { ack: { state: 'ok', at: new Date().toISOString() } });
  if (project(t.project)) addLog(t.project, { kind: 'decision', text: `דיברנו על הבקשה: ${t.title}`, reversible: true });
  toast('נרשם בהחלטות הפרויקט');
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
// A project that leaves the order (held, stopped, finished) gives up its place and the rest close up; one back from a
// hold goes to the end. A new manager takes over the project's open asks, unanswered again.
export function updateProject(id, patch) {
  commit((s) => {
    const was = s.projects.find((p) => p.id === id);
    if (!was) return {};
    const now = { ...was, ...(typeof patch === 'function' ? patch(was) : patch) };
    let projects = s.projects.map((p) => (p.id === id ? now : p));
    if (card.inOrder(was) !== card.inOrder(now)) projects = withRanks(projects, card.placeProject(projects, card.inOrder(now) ? id : null, Infinity));
    const tasks = now.manager === was.manager ? s.tasks
      : s.tasks.map((t) => (t.ask && t.project === id && t.status !== 'done' ? { ...t, owner: now.manager, ack: null, focus: false, focusBy: null } : t));
    return { projects, tasks };
  });
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
