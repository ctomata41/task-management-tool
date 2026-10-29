// The state of the manual version and every action on it. For now the data lives in this browser (localStorage), seeded
// from data.js, so the team can try the whole flow before the database is set up. Each action goes through `commit`,
// which is the one place a live backend will hook in later.
import { useEffect, useState } from 'preact/hooks';
import * as card from './card.js';
import { migrate, freshState } from './migrate.js';
import { haptic } from '../app/motion.js';

const KEY = 'm.state.v2';
const VERSION = 4; // the shape of what is saved under KEY; migrate() (m/migrate.js) brings an older one up to it
const ME_KEY = 'm.me';
// The team's edits to the project types: their own key, never inside KEY. A tab still running an older build saves
// only what it knows under KEY, so it can never drop them, and it never touches this key.
const LIB_KEY = 'm.lib';
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } },
};
const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
// The sample, through the same last migration step as a saved state (m/migrate.js).
const fresh = () => freshState();
// m.lib as saved, or the empty library when it is missing or not the right shape. A broken type inside it is the
// library's to clean (card.library), so it never breaks the app; a log line without its text or a real time is left out.
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const isLogLine = (x) => isObj(x) && typeof x.text === 'string' && !Number.isNaN(Date.parse(x.at));
function readLib() {
  const x = LS.get(LIB_KEY);
  return isObj(x) && isObj(x.types) ? { v: 1, types: x.types, log: Array.isArray(x.log) ? x.log.filter(isLogLine).slice(-20) : [] } : card.EMPTY_LIB;
}

const saved = LS.get(KEY);
let state = {
  ...(saved && saved.projects ? migrate(saved) : fresh()),
  lib: readLib(),
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
// Back to the sample. The team's types (m.lib) stay: they are the team's method, not sample data.
export function resetSample() { LS.del(KEY); set({ ...fresh(), sheet: null }); toast('הנתונים חזרו לדוגמה'); }
// The commander starts from the picture of the whole team; everyone else from their own day. Either starts at the top,
// also when the screen stays the same (no hashchange then). The last person's sheet, menu and toasts go with them, so
// nothing they could undo or open runs as the next person.
export function switchTo(id) { LS.set(ME_KEY, id); set({ me: id, sheet: null, menu: null, toasts: [] }); location.hash = isCommander(id) ? '#/overview' : '#/today'; window.scrollTo(0, 0); }

// ---------- toasts and sheets ----------
// Returns the toast's id, so an action can take back its own toast (dismissToast). One that offers an action (ביטול,
// לסגירה) stays long enough for a keyboard to reach it, and none goes while the pointer or focus is on it (ui.Toast
// holds it). `back` is where focus returns when the toast goes with focus in it: an element, a function that finds one,
// or else whatever had focus when the toast came.
const toastTimers = new Map();
export function toast(text, opts = {}) {
  const id = uid('t');
  const ms = opts.ms || (opts.action ? 8000 : 4200);
  const back = opts.back || (typeof document === 'undefined' ? null : document.activeElement);
  set((s) => ({ toasts: [...s.toasts, { id, text, action: opts.action, ms, back }] }));
  holdToast(id, false);
  return id;
}
// Stops a toast's clock (hold), or starts it again from the full time.
export function holdToast(id, hold) {
  clearTimeout(toastTimers.get(id));
  const t = state.toasts.find((x) => x.id === id);
  if (!hold && t) toastTimers.set(id, setTimeout(() => dismissToast(id), t.ms));
}
export const dismissToast = (id) => { clearTimeout(toastTimers.get(id)); toastTimers.delete(id); set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })); };
export const openSheet = (kind, props = {}) => set({ sheet: { kind, ...props } });
// One sheet handing over to the next closes, and the next opens a moment later. `reopening` holds the gap, so a toast
// docked at the top while a sheet is open (m.css) stays there instead of dropping toward the tab bar and back.
export function handOver(kind, props = {}) {
  set({ sheet: null, reopening: true });
  setTimeout(() => set({ sheet: { kind, ...props }, reopening: false }), 60);
}
// A sheet opened from inside a task returns to it however it closes: a choice, X, Escape, the backdrop or a flick.
// `back` returns to the task the sheet is about (the partner sheet from a task's owner menu); `backTo` to the task it
// was opened from (a task, or the partner sheet, from the table that breaks an ask down returns to the ask). `from` is
// the task the sheet was about, so the ask puts focus back on its row (TaskBody).
export const closeSheet = () => {
  const sh = state.sheet;
  const to = sh?.backTo || (sh?.back && sh.task);
  if (to) handOver('task', { id: to, from: sh.kind === 'task' ? sh.id : sh.task });
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

// Who sees what is one rule (card.sees): personal projects are the owner's alone, even from the commander; outside
// partners see only their projects, and none that is all on the classified network; in a שמור / סודי project, team
// members outside it see its one line. canSee: the project appears at all (at least its one line).
export const canSee = (p, who = state.me) => card.sees(p, person(who)) !== 'none';
// Past the one line (name, manager, stage, health, place, type, domain): tasks, asks, outputs and the project's page.
// Every place that shows a project's detail asks here.
export const canSeeDetail = (p, who = state.me) => card.sees(p, person(who)) === 'all';
// Whoever runs a project: its manager, or a personal project's owner.
export const leads = (p, who = state.me) => !!p && (p.personal ? p.personal === who : p.manager === who);
// Who is in a project: its manager and its partners. Only they own its tasks and change them (canEditTask), and only
// they add to it (addTask).
export function inProject(p, who = state.me) {
  return !!p && (p.manager === who || p.partners.includes(who));
}
// A stopped or finished project takes no new people or work.
export const isOpen = (p) => !!p && p.phase !== 'stopped' && p.phase !== 'done';
// Gates, the ID card and the project's people: its manager, and the commander everywhere.
export const canManage = (p, who = state.me) => !!p && (p.personal ? p.personal === who : p.manager === who || isCommander(who));
// Who decides a project's commander gates: the commander, and in a personal project its owner, since the commander never
// sees one (card.sees). Without that, a gate there could never be approved, lowered, skipped or removed.
export const actsAsCommander = (p, who = state.me) => isCommander(who) || (!!p?.personal && p.personal === who);
// Outputs go into a project its people see in detail: whoever is in it, or manages it.
export const canAddOutput = (p, who = state.me) => canSeeDetail(p, who) && (inProject(p, who) || canManage(p, who));

// ---------- the project types ----------
// The library the team works with: the code's types with the team's edits (m.lib) on top (card.library).
export const lib = () => card.library(state.lib);
export const typeOf = (p) => card.typeOf(lib(), p);
// Changing types for the whole team: the commander, or someone the commander gave the permission to. /m/ only reads
// it; the sign-in thread grants it.
export const canEditTypes = (who = state.me) => isCommander(who) || !!person(who).perms?.includes('types');
// A rule's reason may name the commander as {commander}.
export const sayFill = (text) => String(text ?? '').split('{commander}').join(commander().name);
// The last lines of the types' log, the newest first.
export const typeLog = (n = 20) => [...(state.lib.log || [])].reverse().slice(0, n);
// Names in a sentence: "א, ב וג"; past four, the first three "ועוד {n}".
export function joinNames(ids) {
  const names = ids.map((id) => person(id).name);
  if (names.length > 4) return `${names.slice(0, 3).join(', ')} ועוד ${names.length - 3}`;
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} ו${names[names.length - 1]}`;
}
// What moving a project to place `to` does to people (card.levelEffects): { lose, handed, outsiders, regain }.
export const placeEffects = (pid, to) => card.levelEffects(project(pid), to, { people: state.people, tasks: state.tasks });
// Whether I may move a project to place `to`, and why not, in words (card.placeRule).
export function placeCheck(pid, to) {
  const p = project(pid);
  const r = card.placeRule(p, to, { type: typeOf(p), byCommander: isCommander(), manages: canManage(p) });
  return { ok: r.ok, why: sayFill(r.why) };
}
export const visibleProjects = () => state.projects.filter((p) => canSee(p));
// The projects a meeting can be recorded in: open ones I'm in and see in detail.
export const meetingProjects = () => visibleProjects().filter((p) => isOpen(p) && inProject(p) && canSeeDetail(p));
export const teamProjects = () => visibleProjects().filter((p) => !p.personal);
export const personalProjects = () => visibleProjects().filter((p) => p.personal);
export const myProjects = () => teamProjects().filter((p) => p.manager === state.me || p.partners.includes(state.me));
const managedProjects = () => teamProjects().filter((p) => p.manager === state.me);
// Outside partners never see asks, and a project's tasks are part of its detail: a locked project shows them to nobody
// outside it, not even a task they own (one taken out of it, or one done there before they left, and anything written
// on it since). Everyone else sees them past the one line (canSeeDetail).
export function canSeeTask(t, who = state.me) {
  if (t.personal) return t.owner === who;
  if (!t.project) return t.owner === who || t.by === who || isCommander(who);
  if (t.ask && person(who).role === 'external') return false;
  return canSeeDetail(project(t.project), who);
}
// A task in a project is edited by whoever runs the project, by the commander when it is his own ask, and by the people
// in the project: their own tasks, and the ones they created (an outside partner only their own). Nobody else changes
// it, not someone out of the project and never past its lock; what the commander adds in a project he doesn't run
// becomes an ask (addTask). A task without a project is its owner's and its creator's.
export const canEditTask = (t, who = state.me) => {
  if (!t.project) return t.owner === who || t.by === who;
  const p = project(t.project);
  return canSeeDetail(p, who) && (leads(p, who) || (!!t.ask && t.by === who)
    || (inProject(p, who) && (t.owner === who || (t.by === who && person(who).role !== 'external'))));
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
// The tasks an ask was broken into, in the order they were written (the store keeps the newest first, so ties too).
export const askTasks = (id) => state.tasks.filter((t) => t.parent === id && canSeeTask(t)).reverse()
  .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
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
// Whoever takes a task because its owner isn't in its project: the project's manager.
const handedTo = (p, owner) => `המשימה עברה ${p.manager === state.me ? 'אליך' : `ל${person(p.manager).name}`}, כי ${person(owner).name} לא בפרויקט`;
// Every new task passes here, whichever add line made it: a stopped or finished project takes no new work, only someone
// in a project adds to it, and its tasks go to people in it (anyone else's goes to its manager); an outside partner adds
// only their own.
export function addTask(t) {
  const p = project(t.project);
  let say = null;
  if (p && !p.personal) {
    // The commander never reaches past a manager: a task he adds in a project someone else runs is an ask to its manager.
    if (isCommander() && !leads(p) && !t.ask) return sendAsk({ project: p.id, title: t.title, why: t.why, due: t.due, stage: t.stage });
    if (!isOpen(p)) { toast('הפרויקט נעצר או הסתיים, אז אי אפשר להוסיף לו משימות'); return null; }
    if (!inProject(p)) { toast('רק מי שבפרויקט מוסיף לו משימות'); return null; }
    if (person(state.me).role === 'external') t = { ...t, owner: state.me }; // an outside partner adds only their own
    else if (t.owner && !inProject(p, t.owner)) { say = handedTo(p, t.owner); t = { ...t, owner: p.manager }; }
  }
  const task = insertTask(t);
  if (say || task.owner !== state.me) toast(say || `המשימה עברה ל${person(task.owner).name}`);
  return task;
}
// Every change to a task passes here, so these hold whichever screen made it:
// - an ask stays with its project's manager: its owner changes only with the manager (updateProject);
// - a task that moves to another project leaves the ask it served, so an ask counts only its own project's tasks;
// - the commander never reaches past a manager: a task he moves into a team project he doesn't run, or gives someone
//   else there, goes to that project's manager as an ask (as addTask does), and the toast's ביטול takes it back as it
//   was;
// - a task in a team project belongs to someone in it: one that moves to a project its owner isn't in, or comes back
//   to work (a done task reopened) after its owner left the project, goes to that project's manager, so it never drops
//   out of sight or stays with someone who can't work on it.
export function updateTask(id, patch) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  const change = { ...patch };
  if (t.ask) delete change.owner;
  const moved = change.project !== undefined && (change.project || null) !== (t.project || null);
  if (moved) change.parent = null;
  const reopened = t.status === 'done' && !!change.status && change.status !== 'done';
  const p = project(change.project !== undefined ? change.project : t.project);
  const owner = change.owner !== undefined ? change.owner : t.owner;
  let say = null;
  let undo = null;
  if (p && !p.personal && !t.ask && (moved || owner !== t.owner || reopened)) {
    if (isCommander() && !leads(p) && (moved || (owner !== t.owner && owner !== state.me))) {
      if (!isOpen(p)) { toast(CLOSED); return; }
      Object.assign(change, { owner: p.manager, by: state.me, ask: true, ack: null, priority: 'high', fromCommander: true, parent: null });
      say = `הבקשה נשלחה ל${person(p.manager).name}`;
      undo = { label: 'ביטול', run: () => commit((s) => ({ tasks: s.tasks.map((x) => (x.id === id ? t : x)) })) };
    } else if (owner && !inProject(p, owner)) {
      change.owner = p.manager;
      say = handedTo(p, owner);
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
  if (say) toast(say, undo ? { action: undo } : {});
}
export function setStatus(id, status) {
  const before = state.tasks.find((t) => t.id === id);
  const done = status === 'done';
  updateTask(id, { status, focus: done ? false : before?.focus, focusBy: done ? null : before?.focusBy ?? null });
  if (done) {
    haptic('success');
    const p = project(before?.project);
    // Its ביטול hands focus back to the task's own check, on the row it brings back (not one behind a dialog), or else
    // to where focus was when it came (the status in the task's sheet).
    const was = typeof document === 'undefined' ? null : document.activeElement;
    const back = () => [...document.querySelectorAll(`.tt-task[data-task="${id}"] .tcheck`)].find((x) => !x.closest('[inert]')) || was;
    toast('בוצע', { back, action: { label: 'ביטול', run: () => updateTask(id, { status: before.status, focus: before.focus, focusBy: before.focusBy ?? null }) } });
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
// `cap` is the place capsule the move was picked from: focus goes back to it from the toast.
let rankToast = null;
export function setRank(pid, n, cap = null) {
  if (!isCommander()) return;
  const ranks = card.placeProject(state.projects, pid, n);
  if (state.projects.every((p) => (p.rank ?? null) === ranks[p.id])) return;
  const before = state.projects.map(({ id, rank = null, rankSeen = null, rankAt = null, rankBy = null }) => ({ id, rank, rankSeen, rankAt, rankBy }));
  const at = new Date().toISOString();
  commit((s) => ({ projects: s.projects.map((p) => ((p.rank ?? null) === ranks[p.id] ? p
    : { ...p, rank: ranks[p.id], rankAt: at, rankBy: s.me, ...(p.manager === s.me ? { rankSeen: ranks[p.id] } : {}) })) }));
  haptic('success');
  if (rankToast) dismissToast(rankToast);
  rankToast = toast('הסדר עודכן', { back: cap, action: { label: 'ביטול', run: () => commit((s) => ({ projects: s.projects.map((p) => ({ ...p, ...before.find((x) => x.id === p.id) })) })) } });
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

// ---------- projects ----------
const PCOLORS = ['#ff9500', '#5856d6', '#34c759', '#30b0c7', '#ff2d55', '#af52de', '#0071e3'];
// A בדה"ת's building block (design §6.6), the same for opening one and for setParent: an open team project of the
// block type that I see, or null.
const asBlock = (id) => {
  const b = id ? project(id) : null;
  return b && !b.personal && b.template === 'block' && isOpen(b) && canSee(b) ? b : null;
};
// A new project from a type (card.newProjectParts): its path, facts and readiness, where its materials live, its domain,
// and for the Claude type its link out. A בדה"ת opened from a building block (asBlock; any other parent, or a parent
// on another type, is dropped) never sits lower than the block. A personal project is always בלמ"ס and in no domain. Outside partners never open
// one; a place the type does not allow changes nothing (null).
export function addProject({ name, template, place, domain, link, parent, trl, minPlace, what = '', manager, partners = [], personal = false }) {
  if (person(state.me).role === 'external' || !String(name ?? '').trim()) return null;
  const from = personal || template !== 'bdt' ? null : asBlock(parent);
  const min = from ? (card.PLACES[minPlace] ? card.stricterPlace(minPlace, card.placeOf(from)) : card.placeOf(from)) : minPlace;
  const parts = personal
    ? card.newProjectParts(lib(), template || 'blank', { place: 'here', domain: null })
    : card.newProjectParts(lib(), template, { place, domain, link, parent: from?.id, trl, minPlace: min, origin: typeof location === 'undefined' ? undefined : location.origin });
  if (!parts) { toast('הסוג הזה לא מאפשר לשמור כאן את החומרים. צריך לבחור מקום אחר.'); return null; }
  const p = {
    id: uid('p'), name, color: PCOLORS[state.projects.length % PCOLORS.length], ...parts,
    what: what || '', forWhom: '', success: '', stopRule: '', manager: personal ? state.me : manager || state.me, partners: personal ? [] : partners,
    hill: 'up', confidence: 'on', confNote: '', lastUpdate: new Date().toISOString(), tolDays: 14, log: [],
    personal: personal ? state.me : undefined, createdBy: state.me,
  };
  commit((s) => ({ projects: [...s.projects, p] }));
  haptic('success');
  return p;
}
// A project that leaves the order (held, stopped, finished) gives up its place and the rest close up, remembering
// whether it had one (rankWas): back from a hold, one that had a place goes to the end, and one that never had a place
// stays unplaced until the commander places it. (One held before rankWas existed has no record and goes to the end.)
// A new manager takes over the project's open asks, unanswered again; the commander's own asks become his tasks. The
// old manager's pins come out with them: a pin is the call of whoever runs the project.
// Whoever this change takes out of the project (a partner taken out, the commander handing over a project he ran) or
// out of its detail (a project moved to a closed place, or to one that is all on the classified network, which outside
// partners don't see) hands their open tasks there to its manager, so none is left with someone who can no longer see
// it or work on it (canEditTask). The commander's own become his asks to the manager, unanswered, as anything he adds in
// a project he doesn't run does. Returns who handed tasks over; `quiet` leaves the toast to the caller (setPlace).
export function updateProject(id, patch, { quiet = false } = {}) {
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
    // A move between the two closed places keeps the level but changes what outside partners see, so it counts too.
    const access = newManager || now.partners !== was.partners || card.placeOf(now) !== card.placeOf(was) || now.classification !== was.classification;
    const tasks = !access ? s.tasks : s.tasks.map((t) => {
      if (t.project !== id || t.status === 'done') return t;
      if (t.ask) return newManager ? { ...t, owner: now.manager, ack: null, focus: false, focusBy: null, ...(t.by === now.manager ? { ask: false, fromCommander: false } : {}) } : t;
      const o = t.owner;
      if (o && ((inProject(was, o) && !inProject(now, o)) || (canSeeDetail(was, o) && !canSeeDetail(now, o)))) {
        handed.push(o);
        const asks = isCommander(o) && t.by === o ? { ask: true, ack: null, fromCommander: true, parent: null } : {};
        return { ...t, owner: now.manager, focus: false, focusBy: null, ...asks };
      }
      return newManager && t.focus && t.focusBy === was.manager ? { ...t, focus: false, focusBy: null } : t;
    });
    return { projects, tasks };
  });
  const who = [...new Set(handed)];
  if (who.length && !quiet) {
    const p = project(id);
    const to = p.manager === state.me ? 'אליך' : `ל${person(p.manager).name}`;
    const one = who.length === 1 ? person(who[0]).name : null;
    toast(!one ? `המשימות הפתוחות של מי שיצא מהפרויקט עברו ${to}`
      : handed.length === 1 ? `המשימה הפתוחה של ${one} בפרויקט עברה ${to}` : `המשימות הפתוחות של ${one} בפרויקט עברו ${to}`);
  }
  return { handed: who };
}

// ---------- the ID card ----------
// Two kinds of edits (design §7). A text edit (a name, a question, a value, a mark) saves on blur, for whoever manages
// the project (canManage), and needs no undo: the text is still in the field. A structural edit (a gate, a field, a
// stage, a fact, readiness, the type) goes through editCard, while the project is open, and its toast's ביטול takes it
// back as long as nothing it touched changed since. Only the latest such toast is live, for the card and the types
// alike, so a ביטול never reaches past a later change (the order's own toast, setRank, works the same way).
let undoToast = null;
function showUndo(text, run) {
  if (undoToast) dismissToast(undoToast);
  undoToast = toast(text, { action: { label: 'ביטול', run } });
}
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const logEntry = (text) => ({ id: uid('l'), kind: 'decision', text, who: state.me, at: new Date().toISOString(), reversible: true });
const withLog = (p, text) => [logEntry(text), ...(p.log || [])];
const canEditCard = (p) => canManage(p) && isOpen(p);
// `fn` gets the project and returns the patch, or nothing to refuse. `tasks`: the ids of tasks that go to "בלי שלב"
// with it; the undo brings back each one still there, in this project. `still(now)`: whether the undo may still go
// in, for a change whose undo depends on more than the keys it touched. With no `say`, or `undo: false`, there is no
// toast.
function editCard(pid, fn, say, { undo = true, tasks = null, still = null } = {}) {
  const before = project(pid);
  if (!canEditCard(before)) return false;
  const patch = fn(before);
  if (!patch) return false;
  const keys = Object.keys(patch);
  updateProject(pid, patch, { quiet: true });
  const moved = tasks ? state.tasks.filter((t) => tasks.includes(t.id)).map(({ id, stage }) => ({ id, stage })) : [];
  if (moved.length) commit((s) => ({ tasks: s.tasks.map((t) => (tasks.includes(t.id) ? { ...t, stage: null } : t)) }));
  const after = project(pid);
  if (say && undo) {
    showUndo(say, () => {
      const now = project(pid);
      if (!canEditCard(now) || keys.some((k) => now[k] !== after[k]) || (still && !still(now))) { toast('אי אפשר לבטל: הכרטיס השתנה מאז'); return; }
      updateProject(pid, pick(before, keys), { quiet: true });
      if (moved.length) commit((s) => ({ tasks: s.tasks.map((t) => { const m = moved.find((x) => x.id === t.id); return m && t.project === pid && t.stage === null ? { ...t, stage: m.stage } : t; }) }));
    });
  }
  return true;
}
const stageOf = (pid, sid) => project(pid)?.stages.find((s) => s.id === sid) || null;
const trlOk = (n) => n === null || (Number.isInteger(n) && n >= 1 && n <= 9);

// The stages (design §6.3). A stage's state and gate change only through their own rules (closeStage, skipStage,
// setGate), never through setStage.
export function setStage(pid, sid, patch) {
  if (!canManage(project(pid)) || !stageOf(pid, sid) || !isObj(patch)) return false;
  const { id, key, state: st, gate, ...ok } = patch;
  updateProject(pid, (p) => ({ stages: p.stages.map((s) => (s.id === sid ? { ...s, ...ok } : s)) }));
  return true;
}
export const renameStage = (pid, sid, name) => !!String(name ?? '').trim() && setStage(pid, sid, { name: String(name).trim() });
export const setExit = (pid, sid, text) => setStage(pid, sid, { exit: String(text ?? '').trim() });
// A stage field, by its id (fields are added and removed, so an index would drift). It is marked 'ברשת המסווגת' only in
// a שמור / סודי project.
export function setField(pid, sid, fid, patch) {
  const p = project(pid);
  const f = stageOf(pid, sid)?.fields.find((x) => x.id === fid);
  if (!canManage(p) || !f || !isObj(patch) || (patch.classified === true && !card.isRestricted(p))) return false;
  const { id, ...ok } = patch;
  updateProject(pid, (x) => ({ stages: x.stages.map((s) => (s.id === sid ? { ...s, fields: s.fields.map((y) => (y.id === fid ? { ...y, ...ok } : y)) } : s)) }));
  return true;
}
export const renameField = (pid, sid, fid, label) => !!String(label ?? '').trim() && setField(pid, sid, fid, { label: String(label).trim() });
export function setGate(pid, sid, gate) {
  const s = stageOf(pid, sid);
  if (!s || s.gate === gate || !card.canSetGate(s, gate, actsAsCommander(project(pid)))) return false;
  const text = gate === 'commander' ? `מעכשיו '${s.name}' נסגר באישור המפקד` : `מעכשיו '${s.name}' נסגר בפרויקט`;
  return editCard(pid, (p) => ({ stages: p.stages.map((x) => (x.id === sid ? { ...x, gate } : x)), log: withLog(p, text) }), text);
}
// A field added in a project that is all on the classified network starts marked.
export function addField(pid, sid, label) {
  const name = String(label ?? '').trim();
  if (!name || !stageOf(pid, sid)) return false;
  return editCard(pid, (p) => {
    const f = { id: `${sid}f${uid('')}`, label: name, value: '', ...(card.placeOf(p) === 'there' ? { classified: true } : {}) };
    return { stages: p.stages.map((s) => (s.id === sid ? { ...s, fields: [...s.fields, f] } : s)) };
  }, `השדה '${name}' נוסף`);
}
export function removeField(pid, sid, fid) {
  const f = stageOf(pid, sid)?.fields.find((x) => x.id === fid);
  if (!f) return false;
  return editCard(pid, (p) => ({ stages: p.stages.map((s) => (s.id === sid ? { ...s, fields: s.fields.filter((x) => x.id !== fid) } : s)) }), `השדה '${f.label}' הוסר`);
}
// From the library by key (the project type's own stages first, card.stageLibrary), from a stage definition, or a
// stage of the team's own by name. Always at the end, its fields marked by the project's place. In a personal project
// a stage closes in the project: the commander never sees it to approve a gate.
export function addStage(pid, keyOrDef, name) {
  const p = project(pid);
  if (!p) return false;
  const def = isObj(keyOrDef) ? keyOrDef : keyOrDef ? card.stageLibrary(lib(), typeOf(p)).find((d) => d.key === keyOrDef) || null : null;
  const own = String(name ?? '').trim();
  if (!def && !own) return false;
  return editCard(pid, (x) => {
    const made = card.makeStage(def, own, { restricted: card.isRestricted(x), there: card.placeOf(x) === 'there' });
    const stage = x.personal ? { ...made, gate: 'manager' } : made;
    const stages = card.stagesAfter(x, 'add', { stage });
    return stages && { stages };
  }, null, { undo: false });
}
export function moveStage(pid, sid, dir) {
  return editCard(pid, (p) => { const stages = card.stagesAfter(p, dir < 0 ? 'up' : 'down', { sid }); return stages && { stages }; }, null, { undo: false });
}
export function skipStage(pid, sid) {
  const s = stageOf(pid, sid);
  if (!s) return false;
  return editCard(pid, (p) => {
    const stages = card.stagesAfter(p, 'skip', { sid, byCommander: actsAsCommander(p) });
    return stages && { stages, log: withLog(p, `דילגנו על שלב ${s.name}`) };
  }, `דילגנו על '${s.name}'`);
}
export function unskipStage(pid, sid) {
  const s = stageOf(pid, sid);
  if (!s) return false;
  return editCard(pid, (p) => { const stages = card.stagesAfter(p, 'unskip', { sid }); return stages && { stages }; }, `השלב '${s.name}' חזר למסלול`);
}
// Its tasks go to "בלי שלב", and the undo brings back the stage and them.
export function removeStage(pid, sid) {
  const s = stageOf(pid, sid);
  if (!s) return false;
  const ids = state.tasks.filter((t) => t.project === pid && t.stage === sid).map((t) => t.id);
  const moved = !ids.length ? '' : ids.length === 1 ? " · משימה אחת עברה ל'בלי שלב'" : ` · ${ids.length} משימות עברו ל'בלי שלב'`;
  return editCard(pid, (p) => {
    const stages = card.stagesAfter(p, 'remove', { sid, byCommander: actsAsCommander(p) });
    return stages && { stages, log: withLog(p, `השלב '${s.name}' הוסר מהמסלול`) };
  }, `השלב '${s.name}' הוסר${moved}`, { tasks: ids });
}
export function closeStage(pid, opts) {
  const p = project(pid);
  const cur = card.currentStage(p);
  const next = card.closeStage(p, { ...opts, by: state.me, byCommander: actsAsCommander(p) });
  updateProject(pid, next);
  haptic('success');
  if (opts.choice === 'next' && cur?.gate === 'commander' && !actsAsCommander(p)) toast(`שלב ${cur.name} מחכה לאישור של ${person(state.people.find((x) => x.role === 'commander')?.id).name}`);
  else if (opts.choice === 'next') toast(cur ? `שלב ${cur.name} נסגר` : 'נשמר');
  // What happened, not the choice's command: "להשהות" reads as an order.
  else toast({ hold: 'הפרויקט הושהה', stop: 'הפרויקט נעצר', back: `חזרנו לשלב ${card.currentStage(project(pid))?.name || 'הקודם'}` }[opts.choice]);
}
export function approveGate(pid, note = '') {
  closeStage(pid, { choice: 'next', note: note || 'אושר' });
}
export function returnGate(pid, note) {
  updateProject(pid, card.returnStage(project(pid), { by: state.me, note }));
  toast('השלב חזר למנהל הפרויקט עם ההכוונה שלך');
}

// The core (design §6.2): marks on forWhom, success and stopRule ('unknown', or in a שמור / סודי project
// 'classified'; `what` is never marked), the facts, and readiness.
const MARKABLE = ['forWhom', 'success', 'stopRule'];
export function setMark(pid, key, mark) {
  const p = project(pid);
  const m = mark || null;
  if (!canManage(p) || !MARKABLE.includes(key) || ![null, 'unknown', 'classified'].includes(m) || (m === 'classified' && !card.isRestricted(p))) return false;
  const marks = { ...(p.marks || {}) };
  if (m) marks[key] = m; else delete marks[key];
  updateProject(pid, { marks });
  return true;
}
const factOf = (p, fid) => (p?.facts || []).find((f) => f.id === fid) || null;
// A fact's value (a choice fact keeps an option id, or ''), or its marks.
export function setFact(pid, fid, patch) {
  const p = project(pid);
  const f = factOf(p, fid);
  if (!canManage(p) || !f || !isObj(patch) || (patch.classified === true && !card.isRestricted(p))) return false;
  if ('value' in patch && f.kind === 'choice' && patch.value && !(f.options || []).some((o) => o.id === patch.value)) return false;
  const ok = Object.fromEntries(Object.entries(patch).filter(([k]) => k === 'value' || k === 'unknown' || k === 'classified'));
  updateProject(pid, (x) => ({ facts: x.facts.map((y) => (y.id === fid ? { ...y, ...ok } : y)) }));
  return true;
}
export function renameFact(pid, fid, label) {
  const p = project(pid);
  const name = String(label ?? '').trim();
  if (!canManage(p) || !name || !factOf(p, fid)) return false;
  updateProject(pid, (x) => ({ facts: x.facts.map((y) => (y.id === fid ? { ...y, label: name } : y)) }));
  return true;
}
// A fact added by hand: a text fact with no key. In a project that is all on the classified network it starts marked.
export function addFact(pid, label) {
  const name = String(label ?? '').trim();
  if (!name) return false;
  return editCard(pid, (p) => ({ facts: [...(p.facts || []), { id: uid('f'), label: name, hint: '', kind: 'text', value: '', ...(card.placeOf(p) === 'there' ? { classified: true } : {}) }] }), `השדה '${name}' נוסף`);
}
export function removeFact(pid, fid) {
  const f = factOf(project(pid), fid);
  if (!f) return false;
  return editCard(pid, (p) => ({ facts: p.facts.filter((x) => x.id !== fid) }), `השדה '${f.label}' הוסר`);
}
// Readiness: 1 to 9, or null for "עוד לא ידוע". A project with no readiness rows (trl undefined) gets them with addTrl.
export function setTrl(pid, n) {
  const p = project(pid);
  if (!canManage(p) || p.trl === undefined || !trlOk(n)) return false;
  updateProject(pid, { trl: n });
  return true;
}
export function setTrlTarget(pid, n) {
  const p = project(pid);
  if (!canManage(p) || p.trl === undefined || !trlOk(n)) return false;
  updateProject(pid, { trlTarget: n });
  return true;
}
export function addTrl(pid) {
  const p = project(pid);
  if (!p || p.trl !== undefined) return false;
  return editCard(pid, () => ({ trl: null, trlTarget: typeOf(p)?.trlTarget ?? null }), 'המוכנות נוספה');
}
export function removeTrl(pid) {
  const p = project(pid);
  if (!p || p.trl === undefined) return false;
  return editCard(pid, () => ({ trl: undefined, trlTarget: undefined }), 'המוכנות הוסרה');
}
// A team project's place in the pyramid (card.DOMAINS), or null for "בלי רובד".
export function setDomain(pid, d) {
  const p = project(pid);
  const to = d ?? null;
  if (!canEditCard(p) || p.personal || !(to === null || card.DOMAINS.some((x) => x.id === to)) || (p.domain ?? null) === to) return false;
  updateProject(pid, { domain: to });
  return true;
}
// Where the materials live (design §4.3), always after the confirm sheet: placeRule again, then place and level
// together, so the hand-over of tasks runs. Lowering to בלמ"ס is the commander's, with a reason. It never rewrites
// marks, and has no undo: it changes who sees what. A project it makes שמור / סודי drops its link out, which setLink
// would never give it there: the work with Claude stays בלמ"ס (design §9).
export function setPlace(pid, to, { reason = '' } = {}) {
  const p = project(pid);
  if (!p || !card.PLACES[to] || card.placeOf(p) === to || !placeCheck(pid, to).ok) return false;
  const lower = card.isRestricted(p) && card.PLACES[to].level === 'open';
  const why = String(reason ?? '').trim();
  if (lower && !why) return false;
  const label = card.PLACES[to].label;
  const text = lower ? `הפרויקט עבר לבלמ"ס: ${why}` : `הפרויקט עבר ל'${label}'`;
  const closed = card.isRestricted({ place: to });
  const { handed } = updateProject(pid, (x) => ({ place: to, classification: card.PLACES[to].level, log: withLog(x, text),
    ...(closed && x.link ? { link: null } : {}) }), { quiet: true });
  const m = project(pid).manager;
  const tasks = handed.length ? ` · המשימות הפתוחות של ${joinNames(handed)} עברו ${m === state.me ? 'אליך' : `ל${person(m).name}`}` : '';
  toast(lower ? 'הפרויקט עבר לבלמ"ס' : `הפרויקט עבר ל'${label}'${tasks}`);
  return true;
}
// Another type keeps the stages (card.retypeParts): it brings its facts, and a domain or readiness rows the project
// lacks. A hidden type is not offered. The undo brings the old type back only while it allows the project's place: a
// move since then (setPlace, which the type change does not touch) may have put the project where the old type can't be.
export function setType(pid, typeId) {
  const p = project(pid);
  const t = card.typeById(lib(), typeId);
  if (!p || !t || t.hidden || p.template === typeId) return false;
  const still = (now) => { const old = card.typeById(lib(), p.template); return !old || card.placesFor(old).includes(card.placeOf(now)); };
  return editCard(pid, (x) => card.retypeParts(lib(), x, typeId), 'הסוג עודכן. השלבים נשארו כמו שהם.', { still });
}
// The Claude type's link out (card.nextLink): only to /next/, and never from a שמור / סודי project. '' removes it.
export function setLink(pid, v) {
  const p = project(pid);
  if (!canManage(p)) return false;
  const s = String(v ?? '').trim();
  if (!s) { updateProject(pid, { link: null }); return true; }
  const link = card.isRestricted(p) ? null : card.nextLink(s, typeof location === 'undefined' ? undefined : location.origin);
  if (!link) return false;
  updateProject(pid, { link });
  return true;
}
// A בדה"ת's building block (asBlock), or null for "בלי אבן בניין".
export function setParent(pid, id) {
  const p = project(pid);
  if (!canEditCard(p) || p.personal) return false;
  const b = asBlock(id);
  // Only a בדה"ת takes a building block (design §2.6). One kept from before a type change can still be dropped.
  if (id && (!b || b.id === pid || p.template !== 'bdt')) return false;
  updateProject(pid, { parent: b ? b.id : null });
  return true;
}
// "לעדכן כאן ל-TRL {n}": the block takes the readiness a linked בדה"ת that ended brought back (card.handBack).
export function takeChildTrl(pid, childId) {
  const b = project(pid);
  const c = project(childId);
  const hb = b && c && c.parent === pid && canSeeDetail(c) ? card.handBack(b, [c])[0] : null;
  if (!hb?.take) return false;
  const n = hb.trl;
  return editCard(pid, (x) => ({ trl: n, log: withLog(x, `המוכנות עודכנה ל-TRL ${n} לפי הבדה"ת ${c.name}`) }), `המוכנות עודכנה ל-TRL ${n}`);
}
// "לפתוח בדה"ת מקושר": the opening sheet, with the בדה"ת type, the block's place as its floor, and its readiness. Not
// while the team has hidden the בדה"ת type from opening a project (design §2.3): the card offers no button then.
export function openLinkedBdt(pid) {
  const b = project(pid);
  if (!canEditCard(b) || b.personal || card.typeById(lib(), 'bdt')?.hidden) return false;
  openSheet('newproject', { preset: card.linkedBdtPreset(lib(), b) });
  return true;
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

// ---------- the project types: the team's edits ----------
// Every change goes through editLib (design §2.7, §7): m.lib is read again from storage, so another tab's edits stay;
// the change is applied to that copy; one line goes into the types' log (the last 20); it is written, and state.lib
// follows. Its toast's ביטול puts back what was there, as long as nothing changed since, here or in another tab, and no
// project was opened from a type it would take away. A team type is never deleted, only hidden.
const CODE_TYPES = [...card.CTO_TYPES, ...card.TEMPLATES];
const codeType = (id) => CODE_TYPES.find((t) => t.id === id) || null;
const sameJSON = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Whether a change to the library may go in: every type it changes is checked as one patch against what it was
// (card.checkTypePatch), so only editable keys change, a place stays one the type allows, and a commander gate is
// lowered, or a stage that has one removed, only by the commander. What is stored is held to the same rule, so m.lib
// never keeps a value that reading it would drop: a code type's override holds only editable keys, and a team type
// those and its own `team`, `places` and `link`. A team type is hidden, never deleted, and a new one (newType,
// duplicateType) has nothing to compare with.
const TEAM_KEYS = [...card.EDITABLE_KEYS, 'team', 'places', 'link'];
function libRule(was, next) {
  const before = card.library(was);
  const after = card.library(next);
  for (const id of new Set([...Object.keys(was.types), ...Object.keys(next.types)])) {
    const raw = next.types[id];
    if (sameJSON(was.types[id], raw)) continue;
    const a = card.typeById(before, id);
    const b = card.typeById(after, id);
    if (a && !b) return false;
    if (raw !== undefined && (!isObj(raw) || !b)) return false;
    if (raw && Object.keys(raw).some((k) => !(codeType(id) ? card.EDITABLE_KEYS : TEAM_KEYS).includes(k))) return false;
    if (raw?.place != null && !card.placesFor(codeType(id) || b).includes(raw.place)) return false;
    if (!a) continue;
    const patch = Object.fromEntries(Object.keys({ ...a, ...b }).filter((k) => !sameJSON(a[k], b[k])).map((k) => [k, b[k]]));
    if (!card.checkTypePatch(codeType(id), a, patch, isCommander()).ok) return false;
  }
  return true;
}
export function editLib(fn, say, { undo = true, log = say } = {}) {
  if (!canEditTypes()) return null;
  const was = LS.get(LIB_KEY) ? readLib() : state.lib; // storage blocked: this tab's own copy
  const next = fn(was);
  if (!isObj(next) || !isObj(next.types) || !libRule(was, next)) return null;
  const line = String(log ?? '').trim();
  const out = { v: 1, types: next.types, log: line ? [...was.log, { id: uid('l'), at: new Date().toISOString(), who: state.me, text: line }].slice(-20) : was.log };
  LS.set(LIB_KEY, out);
  set({ lib: out });
  if (say && undo) {
    showUndo(say, () => {
      const saved = LS.get(LIB_KEY);
      const opened = Object.keys(out.types).some((id) => !codeType(id) && !(id in was.types) && state.projects.some((p) => p.template === id));
      if (state.lib !== out || (saved && !sameJSON(saved, out)) || opened) { toast('אי אפשר לבטל: הסוגים השתנו מאז'); return; }
      LS.set(LIB_KEY, was);
      set({ lib: was });
    });
  }
  return out;
}
// Whether a change to type `id` may go in, and why not, in words (card.checkTypePatch): only editable keys, a place
// the type allows, and lowering a commander gate or removing a stage that has one only by the commander.
export function typeCheck(id, patch) {
  const cur = card.typeById(lib(), id);
  if (!cur || !canEditTypes()) return { ok: false, why: '' };
  const r = card.checkTypePatch(codeType(id), cur, patch, isCommander());
  return { ok: r.ok, why: sayFill(r.why) };
}
// Whether a code type carries the team's edits ("לחזור לברירת המחדל").
export const hasOverride = (id) => !!codeType(id) && isObj(state.lib.types?.[id]);
// A code type's override keeps only what differs from the code; an edited path is stored whole, as resolved stage
// definitions (card.typeStages). An empty override goes away.
const blankOf = (k) => (k === 'trl' || k === 'hidden' ? false : null);
function trimOverride(code, entry) {
  const out = {};
  for (const k of card.EDITABLE_KEYS) {
    if (!(k in entry)) continue;
    if (k === 'stages') { const mine = card.typeStages({ stages: entry.stages }); if (!sameJSON(mine, card.typeStages(code))) out.stages = mine; continue; }
    if (!sameJSON(entry[k] ?? blankOf(k), code[k] ?? blankOf(k))) out[k] = entry[k];
  }
  return out;
}
// A change to one type. `say` is a structural edit's toast (with ביטול) and its log line; a text edit (a name, a hint,
// a question, a label) passes none and gets only the log line "הסוג '{name}' עודכן".
export function setTypeDef(id, patch, say) {
  const cur = card.typeById(lib(), id);
  if (!cur || !isObj(patch) || !typeCheck(id, patch).ok || ('name' in patch && !String(patch.name ?? '').trim())) return false;
  const code = codeType(id);
  const fix = { ...patch, ...('stages' in patch ? { stages: card.typeStages({ stages: patch.stages }) } : {}), ...('name' in patch ? { name: String(patch.name).trim() } : {}) };
  return !!editLib((L) => {
    const own = isObj(L.types[id]) ? L.types[id] : null;
    if (!code && !own) return null;
    const types = { ...L.types };
    if (!code) types[id] = { ...own, ...fix };
    else { const o = trimOverride(code, { ...(own || {}), ...fix }); if (Object.keys(o).length) types[id] = o; else delete types[id]; }
    return { ...L, types };
  }, say, { undo: !!say, log: say || `הסוג '${fix.name || cur.name}' עודכן` });
}
// A team type: no stages, every place allowed. Returns its id.
export function newType(name) {
  const n = String(name ?? '').trim();
  if (!n) return null;
  const id = uid('ty');
  const t = { team: true, name: n, hint: '', places: [...card.PLACE_ORDER], place: null, domain: null, stages: [], facts: [] };
  return editLib((L) => ({ ...L, types: { ...L.types, [id]: t } }), 'נוצר סוג חדש') ? id : null;
}
// "{name} (עותק)": a team type with the same DNA. It keeps the places and the link, so a copy of a safe type stays safe.
export function duplicateType(id) {
  const t = card.typeById(lib(), id);
  if (!t) return null;
  const nid = uid('ty');
  const copy = JSON.parse(JSON.stringify({
    team: true, name: `${t.name} (עותק)`, hint: t.hint || '', domain: t.domain ?? null, place: t.place ?? null, why: t.why || '',
    ...(t.trl ? { trl: true, trlTarget: t.trlTarget ?? null } : {}),
    stages: card.typeStages(t), facts: t.facts || [], hints: t.hints || {}, places: [...card.placesFor(t)], ...(t.link === 'next' ? { link: 'next' } : {}),
  }));
  return editLib((L) => ({ ...L, types: { ...L.types, [nid]: copy } }), 'נוצר סוג חדש') ? nid : null;
}
export function hideType(id, hidden) {
  const t = card.typeById(lib(), id);
  if (!t || !!t.hidden === !!hidden) return false;
  return setTypeDef(id, { hidden: !!hidden }, hidden ? 'הסוג הוסתר. פרויקטים שכבר נפתחו ממנו לא השתנו' : 'הסוג חזר לפתיחת פרויקט');
}
// A code type back to the code: its override goes. It counts as a change to the path, so a gate the team added is
// lowered only by the commander.
export function resetType(id) {
  const code = codeType(id);
  if (!code || !hasOverride(id) || !typeCheck(id, { stages: code.stages }).ok) return false;
  return !!editLib((L) => {
    if (!(id in L.types)) return null;
    const types = { ...L.types };
    delete types[id];
    return { ...L, types };
  }, 'הסוג חזר לברירת המחדל');
}
// How many open team projects were opened from this type (they don't change with it).
export const openProjectsOfType = (id) => state.projects.filter((p) => !p.personal && isOpen(p) && p.template === id).length;

// ---------- outputs ----------
// An output goes into a project its people see in detail (canAddOutput). In a project that is all on the classified
// network, only a pointer: a name and where the material is, never the content.
export function addOutput(o) {
  const p = project(o.project);
  if (p && (!canAddOutput(p) || (card.placeOf(p) === 'there' && o.kind !== 'pointer'))) return null;
  const out = { id: uid('o'), by: state.me, at: new Date().toISOString(), level: 'draft', feedback: [], ...o };
  if (p && !out.stage) out.stage = card.currentStage(p)?.id || null;
  commit((s) => ({ outputs: [out, ...s.outputs] }));
  return out;
}
export function updateOutput(id, patch) { commit((s) => ({ outputs: s.outputs.map((o) => (o.id === id ? { ...o, ...patch } : o)) })); }
export function addFeedback(id, text) {
  commit((s) => ({ outputs: s.outputs.map((o) => (o.id === id ? { ...o, feedback: [...o.feedback, { id: uid('f'), who: state.me, text, at: new Date().toISOString() }] } : o)) }));
}

// ---------- meetings ----------
// A meeting is recorded only in a project I'm in, see in detail, and that is בלמ"ס: a recording keeps whatever was said.
export function saveMeeting(m) {
  const p = project(m.project);
  if (p && !(inProject(p) && canSeeDetail(p) && !card.isRestricted(p))) return null;
  const { audio, ...rest } = m;
  const meeting = { id: uid('m'), by: state.me, at: new Date().toISOString(), ...rest };
  const out = addOutput({ project: m.project, title: `סיכום: ${m.title}`, kind: 'meeting', meeting: meeting.id, level: 'draft', audio, hasAudio: !!audio });
  if (!out) return null;
  meeting.output = out.id;
  commit((s) => ({ meetings: [meeting, ...s.meetings] }));
  return meeting;
}
