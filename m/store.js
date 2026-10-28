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
// tasks to a project's own manager become accepted asks. Every place counts as seen, so nothing nags anyone. Nobody set
// this first order, so it carries no name or time (rankBy, rankAt) until the commander moves a project.
export function migrate(saved) {
  if ((saved.v || 2) >= VERSION) return saved;
  const at = new Date().toISOString();
  const people = (saved.people || []).map((x) => (seed.people.find((y) => y.id === x.id)?.command ? { ...x, command: true } : x));
  const seedRank = (id) => seed.projects.find((x) => x.id === id)?.rank ?? Infinity;
  const live = (saved.projects || []).filter(card.inOrder).sort((a, b) => seedRank(a.id) - seedRank(b.id) || 0); // a stable sort
  const projects = (saved.projects || []).map((p) => {
    const rank = live.includes(p) ? live.indexOf(p) + 1 : null;
    return { ...p, rank, rankSeen: rank };
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
// The commander starts from the picture of the whole team; everyone else from their own day. Either starts at the top,
// also when the screen stays the same (no hashchange then). The last person's sheet, menu and toasts go with them, so
// nothing they could undo or open runs as the next person.
export function switchTo(id) { LS.set(ME_KEY, id); set({ me: id, sheet: null, menu: null, toasts: [] }); location.hash = isCommander(id) ? '#/overview' : '#/today'; window.scrollTo(0, 0); }

// ---------- toasts and sheets ----------
// Returns the toast's id, so an action can take back its own toast (dismissToast).
export function toast(text, opts = {}) {
  const id = uid('t');
  set((s) => ({ toasts: [...s.toasts, { id, text, action: opts.action }] }));
  setTimeout(() => dismissToast(id), opts.ms || 4200);
  return id;
}
export const dismissToast = (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
export const openSheet = (kind, props = {}) => set({ sheet: { kind, ...props } });
// One sheet handing over to the next closes, and the next opens a moment later. `reopening` holds the gap, so a toast
// docked at the top while a sheet is open (m.css) stays there instead of dropping toward the tab bar and back.
export function handOver(kind, props = {}) {
  set({ sheet: null, reopening: true });
  setTimeout(() => set({ sheet: { kind, ...props }, reopening: false }), 60);
}
// A sheet opened from inside a task returns to it however it closes: a choice, X, Escape, the backdrop or a flick.
// `back` returns to the task the sheet is about (the partner sheet from a task's owner menu); `backTo` to the task it
// was opened from (a task, or the partner sheet, from the table that breaks an ask down returns to the ask).
export const closeSheet = () => {
  const sh = state.sheet;
  const to = sh?.backTo || (sh?.back && sh.task);
  if (to) handOver('task', { id: to });
  else set({ sheet: null });
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
const managedProjects = () => teamProjects().filter((p) => p.manager === state.me);
// Outside partners never see asks, and a locked project shows nobody its tasks. A person keeps their own task in sight
// only while they still see its project: someone in the team outside a locked one reads it (canEditTask keeps them
// from changing it), and an outside partner taken out of a project loses it with the project.
export function canSeeTask(t, who = state.me) {
  if (t.personal) return t.owner === who;
  if (!t.project) return t.owner === who || t.by === who || isCommander(who);
  if (t.ask && person(who).role === 'external') return false;
  const p = project(t.project);
  if (t.owner === who && canSee(p, who)) return true;
  return canSeeDetail(p, who);
}
// A task is edited by its owner, whoever created it (the commander's own asks too) and whoever runs its project, and
// only by someone who sees the project past its one line. The commander edits nothing else in a project he doesn't
// run: what he adds there becomes an ask (addTask).
export const canEditTask = (t, who = state.me) => {
  const p = project(t.project);
  return (!t.project || canSeeDetail(p, who)) && (t.owner === who || t.by === who || leads(p, who));
};
export const myTasks = () => state.tasks.filter((t) => t.owner === state.me && canSeeTask(t));
export const projectTasks = (id) => state.tasks.filter((t) => t.project === id && canSeeTask(t));
export const projectOutputs = (id) => (canSeeDetail(project(id)) ? state.outputs.filter((o) => o.project === id) : []);
export const visibleOutputs = () => state.outputs.filter((o) => canSeeDetail(project(o.project)));
// What reaches the commander, across every team project: by kind (card.KIND_ORDER), then by the project's place.
export const commanderQueue = () => teamProjects()
  .flatMap((p) => card.needsCommander(p, state.tasks).map((x) => ({ ...x, project: p.id })))
  .sort((a, b) => card.KIND_ORDER.indexOf(a.kind) - card.KIND_ORDER.indexOf(b.kind) || card.byRank(project(a.project), project(b.project)));
export const updatesDue = () => managedProjects().filter((p) => p.phase !== 'stopped' && p.phase !== 'done' && card.updateDue(p));
// The open projects I run whose current stage has all its tasks done, so the stage can close (card.stageReady).
export const stagesReady = () => managedProjects().filter((p) => isOpen(p) && card.stageReady(p, state.tasks));

// ---------- the order and the asks, as the screens read them ----------
// Every live team project in the order: placed ones by place, then unplaced, then held (card.byRank).
export const orderedProjects = () => teamProjects().filter(isOpen).sort(card.byRank);
// Only the placed ones, 1…N, so N is rankedProjects().length.
export const rankedProjects = () => teamProjects().filter((p) => card.inOrder(p) && p.rank != null).sort(card.byRank);
// Who set the order last and when, for the line under its title: { by, at }, or null before anyone moved a project
// (the sample's first order, or one a saved state got on load, has no name on it).
export function orderStamp() {
  const p = state.projects.filter((x) => x.rankAt).sort((a, b) => String(b.rankAt).localeCompare(String(a.rankAt)))[0];
  return p ? { by: p.rankBy, at: p.rankAt } : null;
}
// The projects I run whose place changed since I last acknowledged it (ackRank).
export const movedProjects = () => managedProjects().filter((p) => card.inOrder(p) && p.rank != null && p.rank !== p.rankSeen);
// A project's open asks, as far as I may see them.
export const projectAsks = (pid) => state.tasks.filter((t) => t.ask && t.project === pid && t.status !== 'done' && canSeeTask(t));
// The asks under a project's line in the order: the open ones, then for three days one that was done, so the commander
// sees it reach "בוצעה" before it goes.
export const lineAsks = (pid, now = Date.now()) => state.tasks
  .filter((t) => t.ask && t.project === pid && canSeeTask(t) && (t.status !== 'done' || (!!t.doneAt && now - new Date(t.doneAt).getTime() < 3 * card.DAY)))
  .sort((a, b) => (a.status === 'done') - (b.status === 'done'));
// The open asks in the open projects I run. Its manager answers an ask, closes it and breaks it down, whoever an old
// state says owns it, and never their own ask (the commander's asks become his tasks in a project he takes over).
const myAsks = () => state.tasks.filter((t) => t.ask && t.status !== 'done' && t.by !== state.me && leads(project(t.project)) && isOpen(project(t.project)) && canSeeTask(t));
// Asks that still wait for my answer (קיבלתי or צריך לדבר). One whose tasks are all done only waits to be closed
// (asksReady), so each ask has one row: an ask that reaches a new manager unanswered with its work done included.
export const asksWaiting = () => myAsks().filter((t) => !t.ack && card.askState(t, state.tasks).state !== 'ready');
// Asks whose tasks are all done (card.askState 'ready'): each waits for me to close it.
export const asksReady = () => myAsks().filter((t) => card.askState(t, state.tasks).state === 'ready');
// The tasks an ask was broken into.
export const askTasks = (id) => state.tasks.filter((t) => t.parent === id && canSeeTask(t));
// What waits for me in Today's מחכה לך, one per row: each ask to answer or to close, one row for every project of mine
// that moved in the order, each stage ready to close and each weekly update due. Today's "מחכים לך" and the היום badge
// both count this; the commander's queue is counted on מצב.
export const waitingCount = () => asksWaiting().length + asksReady().length + (movedProjects().length ? 1 : 0) + stagesReady().length + updatesDue().length;
// How many open tasks a person has in focus, their own stars and the pins together, in every project and in personal
// work: what the cap of three counts.
export const focusCount = (owner) => state.tasks.filter((t) => t.owner === owner && t.focus && t.status !== 'done').length;

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
// Every change to a task passes here, so these hold whichever screen made it:
// - an ask stays with its project's manager: its owner changes only with the manager (updateProject);
// - a task that moves to another project leaves the ask it served, so an ask counts only its own project's tasks;
// - the commander never reaches past a manager: a task he gives someone else in a team project he doesn't run, by
//   moving it there or by a new owner, goes to that project's manager as an ask (as addTask does);
// - a task that moves to a project its owner can't see goes to that project's manager, so it never drops out of sight.
export function updateTask(id, patch) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  const change = { ...patch };
  if (t.ask) delete change.owner;
  const moved = change.project !== undefined && (change.project || null) !== (t.project || null);
  if (moved) change.parent = null;
  const p = project(change.project !== undefined ? change.project : t.project);
  const owner = change.owner !== undefined ? change.owner : t.owner;
  let say = null;
  if (p && !p.personal && !t.ask && (moved || owner !== t.owner)) {
    if (isCommander() && !leads(p) && owner !== state.me) {
      if (!isOpen(p)) { toast(CLOSED); return; }
      Object.assign(change, { owner: p.manager, by: state.me, ask: true, ack: null, priority: 'high', fromCommander: true, parent: null });
      say = `הבקשה נשלחה ל${person(p.manager).name}`;
    } else if (moved && owner && !canSeeDetail(p, owner)) {
      change.owner = p.manager;
      say = `המשימה עברה ${p.manager === state.me ? 'אליך' : `ל${person(p.manager).name}`}, כי ${person(owner).name} לא בפרויקט`;
    }
  }
  commit((s) => ({ tasks: s.tasks.map((x) => {
    if (x.id !== id) return x;
    const next = { ...x, ...change, doneAt: change.status === 'done' ? new Date().toISOString() : change.status ? null : x.doneAt };
    // A new owner starts with the task out of focus: the star or pin was about someone else's day.
    if (next.owner !== x.owner) { next.focus = false; next.focusBy = null; }
    return next;
  }) }));
  if (change.ask && !t.ask) haptic('success');
  if (say) toast(say);
}
export function setStatus(id, status) {
  const before = state.tasks.find((t) => t.id === id);
  const done = status === 'done';
  updateTask(id, { status, focus: done ? false : before?.focus, focusBy: done ? null : before?.focusBy ?? null });
  if (done) {
    haptic('success');
    const p = project(before?.project);
    toast('בוצע', { action: { label: 'ביטול', run: () => updateTask(id, { status: before.status, focus: before.focus, focusBy: before.focusBy ?? null }) } });
    // A moment later, and only to the same person: a switch of person in between drops the offer.
    const who = state.me;
    const later = (f) => setTimeout(() => { if (state.me === who) f(); }, 500);
    if (p && card.stageReady(project(p.id), state.tasks) && canManage(p)) {
      later(() => toast(`כל המשימות של שלב ${card.currentStage(p).name} בוצעו. לסגור את השלב?`, { ms: 8000, action: { label: 'לסגירה', run: () => openSheet('gate', { id: p.id }) } }));
    }
    // The last open task under an ask: whoever can close the ask is asked to now; its manager also keeps a row in
    // Today's מחכה לך until it is closed (asksReady).
    const ask = before?.parent && before.status !== 'done' ? state.tasks.find((x) => x.id === before.parent && x.ask) : null;
    if (ask && ask.status !== 'done' && canEditTask(ask) && state.tasks.every((x) => x.parent !== ask.id || x.status === 'done')) {
      later(() => toast('כל המשימות של הבקשה בוצעו. לסגור אותה?', { ms: 8000, action: { label: 'לסגירה', run: () => setStatus(ask.id, 'done') } }));
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
  if (focusCount(t.owner) >= 3) { toast(mine ? 'אפשר שלוש משימות בפוקוס. קודם לסיים או להוציא אחת' : `בפוקוס של ${who.name} כבר שלוש משימות`); return; }
  updateTask(id, { focus: true, focusBy: mine ? null : state.me });
  if (!mine) toast(`המשימה נוספה לפוקוס של ${who.name}`);
}

// ---------- the order of the projects ----------
// Only the commander sets it: a pick moves one project and renumbers the rest, and the toast can take it all back.
// Only the latest move keeps its toast, so a ביטול never takes back a later move (or puts back an earlier one).
let rankToast = null;
export function setRank(pid, n) {
  if (!isCommander()) return;
  const ranks = card.placeProject(state.projects, pid, n);
  if (state.projects.every((p) => (p.rank ?? null) === ranks[p.id])) return;
  const before = state.projects.map(({ id, rank = null, rankSeen = null, rankAt = null, rankBy = null }) => ({ id, rank, rankSeen, rankAt, rankBy }));
  const at = new Date().toISOString();
  commit((s) => ({ projects: s.projects.map((p) => ((p.rank ?? null) === ranks[p.id] ? p
    : { ...p, rank: ranks[p.id], rankAt: at, rankBy: s.me, ...(p.manager === s.me ? { rankSeen: ranks[p.id] } : {}) })) }));
  haptic('success');
  if (rankToast) dismissToast(rankToast);
  rankToast = toast('הסדר עודכן', { action: { label: 'ביטול', run: () => commit((s) => ({ projects: s.projects.map((p) => ({ ...p, ...before.find((x) => x.id === p.id) })) })) } });
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
// A stopped or finished project takes no asks.
const CLOSED = 'הפרויקט נעצר או הסתיים, אז אי אפשר לשלוח אליו בקשות';
export function sendAsk({ project: pid, title, why = null, due = null, stage = null }) {
  const p = project(pid);
  if (!p || p.personal || !isCommander() || !title) return null;
  if (!isOpen(p)) { toast(CLOSED); return null; }
  const task = insertTask({ title, project: p.id, stage, due: due || null, why: why || null, ask: true, ack: null, owner: p.manager, priority: 'high' });
  haptic('success');
  toast(`הבקשה נשלחה ל${person(p.manager).name}`);
  return task;
}
// The manager's answer: 'ok' (קיבלתי) or 'talk' (צריך לדבר), which puts the ask in the commander's queue. Only while
// the project is open, and either answer can be taken back from its toast.
export function ackAsk(id, answer) {
  const t = state.tasks.find((x) => x.id === id);
  const p = project(t?.project);
  if (!t?.ask || t.status === 'done' || !leads(p) || !isOpen(p)) return;
  const before = t.ack || null;
  updateTask(id, { ack: { state: answer, at: new Date().toISOString() } });
  const undo = { label: 'ביטול', run: () => updateTask(id, { ack: before }) };
  if (answer === 'ok') { haptic('success'); toast('הבקשה התקבלה', { action: undo }); } else toast(`נשלח ל${commander().name}: צריך לדבר על הבקשה`, { action: undo });
}
// "דיברנו": the commander and the manager talked, so the ask is accepted again, and the talk goes in the project's log.
export function talked(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t?.ask || !isCommander()) return;
  updateTask(id, { ack: { state: 'ok', at: new Date().toISOString() } });
  // Tagged with the ask, so the log hides it from outside partners, who never see asks.
  if (project(t.project)) addLog(t.project, { kind: 'decision', text: `דיברנו על הבקשה: ${t.title}`, ask: t.id, reversible: true });
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
// A project that leaves the order (held, stopped, finished) gives up its place and the rest close up, remembering
// whether it had one (rankWas): back from a hold, one that had a place goes to the end, and one that never had a place
// stays unplaced until the commander places it. (One held before rankWas existed has no record and goes to the end.)
// A new manager takes over the project's open asks, unanswered again; the commander's own asks become his tasks.
// Whoever this change takes out of the project's detail (a partner taken out, an outside one above all, or an old
// manager of a locked project) hands their open tasks there to its manager, so none is left with someone who can no
// longer see it or work on it (canEditTask).
export function updateProject(id, patch) {
  const handed = [];
  commit((s) => {
    const was = s.projects.find((p) => p.id === id);
    if (!was) return {};
    const now = { ...was, ...(typeof patch === 'function' ? patch(was) : patch) };
    const left = card.inOrder(was) && !card.inOrder(now);
    const back = !card.inOrder(was) && card.inOrder(now);
    const placeBack = back && now.rankWas !== null;
    if (left) now.rankWas = was.rank ?? null;
    if (back) delete now.rankWas;
    let projects = s.projects.map((p) => (p.id === id ? now : p));
    if (left || back) projects = withRanks(projects, card.placeProject(projects, placeBack ? id : null, Infinity));
    const newManager = now.manager !== was.manager;
    const tasks = !newManager && now.partners === was.partners ? s.tasks : s.tasks.map((t) => {
      if (t.project !== id || t.status === 'done') return t;
      if (t.ask) return newManager ? { ...t, owner: now.manager, ack: null, focus: false, focusBy: null, ...(t.by === now.manager ? { ask: false, fromCommander: false } : {}) } : t;
      if (!t.owner || t.owner === now.manager || !canSeeDetail(was, t.owner) || canSeeDetail(now, t.owner)) return t;
      handed.push(t.owner);
      return { ...t, owner: now.manager, focus: false, focusBy: null };
    });
    return { projects, tasks };
  });
  if (handed.length) {
    const p = project(id);
    const to = p.manager === state.me ? 'אליך' : `ל${person(p.manager).name}`;
    const one = new Set(handed).size === 1 ? person(handed[0]).name : null;
    toast(!one ? `המשימות הפתוחות של מי שיצא מהפרויקט עברו ${to}`
      : handed.length === 1 ? `המשימה הפתוחה של ${one} בפרויקט עברה ${to}` : `המשימות הפתוחות של ${one} בפרויקט עברו ${to}`);
  }
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
