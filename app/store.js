// Global app state: one store, loaded from the API and refreshed by polling. Mutations are optimistic.
// Every write passes the בלמ״ס guard first (guard.js): text that matches the team's sensitive-word list is not saved
// unless the person says it is a false alarm, and then it is saved marked for command to check.
import { useEffect, useState } from 'preact/hooks';
import { api, setCreds, isMock } from './api.js';
import { toSignIn } from './session.js';
import { POLL_MS } from './config.js';
import { sensitiveHits, textsIn } from './guard.js';
import { gateOptions, optionsOf } from './model.js';
import { pushOff, pushPerson, clearShown, syncPush } from './push.js';

const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } },
};
const AUTH_KEY = 'cto.auth';
const CLASSIC = '/?classic'; // where the site's sign-in comes back to for this app

let state = {
  phase: 'boot', // boot | setup | login | pick | declare | ready | error
  error: null,
  auth: LS.get(AUTH_KEY), // { code, me }
  people: [], projects: [], tasks: [], checklist: [], activity: [], notifications: [],
  decisions: [], commitments: [], ideas: [], meetings: [], settings: null,
  rules: [], ruleRuns: [], reminders: [], // the fixed rules (digest, commitment reminders), their run log, and the reminders sent
  comments: {}, // task_id -> comments
  openTaskId: null,
  menu: null, // { rect, items, onPick, selected }
  toasts: [],
  modal: null, // 'settings' | 'new' | 'newproject' | 'notifications' | 'search' | 'decision' | 'decisionView' | 'commitment' | 'report' | 'more'
  modalData: null,
  guardAsk: null, // { hits, resolve } while the sensitive-word question is open
  since: null, // ISO time of the previous visit, when it was long enough ago for "מאז שהיית כאן"
  lastSync: null,
  prefs: LS.get('cto.prefs') || {},
};
const subs = new Set();
export const getState = () => state;
export function set(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  subs.forEach((f) => f());
}
export function useStore() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    subs.add(f);
    return () => subs.delete(f);
  }, []);
  return state;
}
export function setPref(k, v) { const prefs = { ...state.prefs, [k]: v }; LS.set('cto.prefs', prefs); set({ prefs }); }

// ---------- derived ----------
export const me = () => state.people.find((p) => p.id === state.auth?.me) || null;
export const person = (id) => state.people.find((p) => p.id === id) || null;
export const project = (id) => state.projects.find((p) => p.id === id) || null;
export const team = () => state.people.filter((p) => p.is_team);
export const isCommand = (s = state) => !!s.people.find((p) => p.id === s.auth?.me)?.is_command;
const commander = () => state.people.find((p) => p.is_team && p.role === 'מפקד') || state.people.find((p) => p.is_command) || null;
// Private tasks are seen only by their owner and creator; tasks marked as possibly classified only by command.
export function visibleTasks(s = state) {
  const my = s.auth?.me;
  const cmd = isCommand(s);
  return s.tasks.filter((t) => (!t.private || t.owner_id === my || t.created_by === my) && (!t.flagged || cmd));
}

// ---------- toasts ----------
let toastId = 0;
export function toast(text, opts = {}) {
  const id = ++toastId;
  set((s) => ({ toasts: [...s.toasts, { id, text, kind: opts.kind || 'info', action: opts.action }] }));
  setTimeout(() => dismissToast(id), opts.ms || 4500);
}
export function dismissToast(id) { set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })); }
function fail(e) { toast(e.message || 'משהו השתבש', { kind: 'error', ms: 6000 }); }

// ---------- auth ----------
export async function init() {
  try {
    const a = state.auth;
    // Signed in with Google (on /account/): the session says who this is; signing in again goes back there.
    if (a?.session) {
      setCreds({ session: a.session, code: null, actor: a.me || null });
      if (!a.me) return toSignIn(CLASSIC);
      await loadAll();
      if (!me()) return toSignIn(CLASSIC);
      return enter();
    }
    if (a?.code) {
      setCreds({ code: a.code, actor: a.me || null });
      const ok = await api.rpc('check_team_code', { code: a.code });
      if (!ok) { LS.del(AUTH_KEY); set({ auth: null }); setCreds({ code: null, actor: null }); return goAuth(); }
      if (!a.me) { await loadPeople(); return set({ phase: 'pick' }); }
      await loadAll();
      if (!me()) { await loadPeople(); return set({ phase: 'pick' }); }
      return enter();
    }
    await goAuth();
  } catch (e) {
    set({ phase: 'error', error: e.message });
  }
}
async function goAuth() {
  // Once the commander closes the team code, signing in is only with Google.
  if (!isMock && !(await api.rpc('auth_code_open').catch(() => true))) return toSignIn(CLASSIC);
  const isSet = await api.rpc('team_code_is_set');
  set({ phase: isSet ? 'login' : 'setup' });
}
// After sign-in: a short "בלמ״ס בלבד" declaration the first time, then the app.
function enter() {
  if (!me()?.declared_at) { set({ phase: 'declare' }); return; }
  set({ phase: 'ready' });
  checkSince();
  startPolling();
  syncPush(state.auth?.me);
}
export async function declare() {
  const m = me();
  if (!m) return;
  try {
    const saved = await write(() => api.update('people', m.id, { declared_at: nowIso() }));
    set((s) => ({ people: s.people.map((p) => (p.id === m.id ? saved : p)) }));
    enter();
  } catch (e) { fail(e); }
}
export async function submitCode(code, isSetup) {
  code = code.trim();
  if (isSetup) {
    if (code.length < 6) throw new Error('קוד הצוות צריך להיות באורך 6 תווים לפחות');
    const ok = await api.rpc('setup_team_code', { code });
    if (!ok) { set({ phase: 'login' }); throw new Error('קוד צוות כבר הוגדר. יש להזין את הקוד שהצוות קבע.'); }
  } else {
    const ok = await api.rpc('check_team_code', { code });
    if (!ok) throw new Error('הקוד לא נכון. אפשר לנסות שוב.');
  }
  const auth = { code };
  LS.set(AUTH_KEY, auth);
  setCreds({ code });
  set({ auth });
  await loadPeople();
  set({ phase: 'pick' });
}
export async function pickMe(id) {
  // Phone notifications follow the person, not the device: someone else on this device turns them off here.
  if (pushPerson() && pushPerson() !== id) await pushOff();
  const auth = { ...state.auth, me: id };
  LS.set(AUTH_KEY, auth);
  setCreds({ actor: id });
  set({ auth, phase: 'boot' });
  await loadAll();
  enter();
}
export function switchUser() { set({ phase: 'pick', modal: null, openTaskId: null, since: null }); }
export async function logout() {
  await pushOff();
  const google = !!state.auth?.session;
  if (google) await api.rpc('auth_signout').catch(() => {});
  LS.del(AUTH_KEY);
  setCreds({ code: null, actor: null, session: null });
  if (google) return toSignIn(CLASSIC);
  stopPolling();
  set({ auth: null, phase: 'boot', modal: null, openTaskId: null, tasks: [], projects: [], notifications: [], decisions: [], commitments: [], ideas: [], since: null });
  goAuth().catch((e) => set({ phase: 'error', error: e.message }));
}
export async function changeCode(oldCode, newCode) {
  if (newCode.trim().length < 6) throw new Error('קוד הצוות צריך להיות באורך 6 תווים לפחות');
  const ok = await api.rpc('change_team_code', { old_code: oldCode.trim(), new_code: newCode.trim() });
  if (!ok) throw new Error('הקוד הנוכחי לא נכון');
  const auth = { ...state.auth, code: newCode.trim() };
  LS.set(AUTH_KEY, auth);
  setCreds({ code: auth.code });
  set({ auth });
}

// ---------- loading ----------
async function loadPeople() {
  const people = await api.list('people', { archived: 'is.false', order: 'sort.asc' });
  set({ people });
}
let pending = 0;
export async function loadAll() {
  const my = state.auth?.me;
  const [people, projects, tasks, checklist, activity, notifications, decisions, commitments, ideas, meetings, settings, rules, ruleRuns, reminders] = await Promise.all([
    api.list('people', { archived: 'is.false', order: 'sort.asc' }),
    api.list('projects', { archived: 'is.false', order: 'created_at.asc' }),
    api.list('tasks', { archived: 'is.false' }),
    api.list('checklist', { order: 'sort.asc' }),
    api.list('activity', { order: 'at.desc', limit: 200 }),
    my ? api.list('notifications', { person_id: 'eq.' + my, order: 'created_at.desc', limit: 60 }) : Promise.resolve([]),
    api.list('decisions', { archived: 'is.false', order: 'created_at.asc' }),
    api.list('commitments', { archived: 'is.false', order: 'created_at.asc' }),
    api.list('ideas', { archived: 'is.false', order: 'created_at.desc' }),
    api.list('meetings', { order: 'week_start.desc', limit: 12 }),
    api.list('team_settings', { limit: 1 }),
    // Newer tables: until the database has them, the app works without them.
    api.list('rules', { order: 'sort.asc' }).catch(() => []),
    api.list('rule_runs', { order: 'ran_at.desc', limit: 40 }).catch(() => []),
    api.list('reminders', { order: 'sent_at.desc', limit: 200 }).catch(() => []),
  ]);
  if (pending > 0) return; // a write is in flight; the next poll will catch up
  set({
    people, projects, tasks, checklist, activity, notifications, decisions, commitments, ideas, meetings,
    settings: settings[0] || null, rules, ruleRuns, reminders, lastSync: new Date().toISOString(),
  });
}
let timer = null;
function startPolling() {
  stopPolling();
  timer = setInterval(() => { if (!document.hidden) { refresh(); markSeen(); } }, POLL_MS);
}
function stopPolling() { if (timer) clearInterval(timer); timer = null; }
export function refresh() {
  if (state.phase !== 'ready') return;
  loadAll().catch(() => { /* keep showing the last data; next poll retries */ });
}
if (typeof window !== 'undefined') {
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { markSeen(); return; }
    if (state.phase === 'ready') checkSince();
    refresh();
  });
}
async function write(fn) {
  pending++;
  try { return await fn(); } finally { pending--; }
}
const nowIso = () => new Date().toISOString();
const tmpId = () => 'tmp-' + Math.random().toString(36).slice(2);
function patchList(key, id, patch) { set((s) => ({ [key]: s[key].map((x) => (x.id === id ? { ...x, ...patch } : x)) })); }
function refreshActivitySoon() {
  setTimeout(() => {
    api.list('activity', { order: 'at.desc', limit: 200 }).then((activity) => set({ activity })).catch(() => {});
  }, 400);
}

// ---------- "מאז שהיית כאן": after 12 hours away, a summary of what changed ----------
const seenKey = () => 'cto.seen.' + state.auth?.me;
function markSeen() { if (state.auth?.me && state.phase === 'ready') LS.set(seenKey(), nowIso()); }
function checkSince() {
  const prev = LS.get(seenKey());
  if (prev && Date.now() - Date.parse(prev) > 12 * 3600000 && !state.since) set({ since: prev });
  markSeen();
}
export const dismissSince = () => set({ since: null });
export function loadActivitySince(iso) { return api.list('activity', { at: 'gte.' + iso, order: 'at.desc', limit: 500 }); }

// ---------- the בלמ״ס guard ----------
const TEXT_KEYS = ['title', 'notes', 'blocked_reason', 'body', 'name', 'description', 'health_note', 'brief', 'stakeholders', 'risks',
  'context', 'reason', 'unblocks', 'rationale', 'chosen_label', 'counterpart', 'contact', 'priorities', 'options', 'milestones',
  'links', 'evidence', 'done_def', 'grp'];
const FLAGGABLE = new Set(['tasks', 'projects', 'decisions', 'commitments', 'ideas', 'comments']);
async function guardWrite(payload) {
  const hashes = state.settings?.word_hashes;
  if (!hashes || !hashes.length) return { ok: true };
  const text = textsIn(TEXT_KEYS.map((k) => payload[k])).join('\n');
  const hits = await sensitiveHits(text, hashes);
  if (!hits) return { ok: true };
  const choice = await new Promise((resolve) => set({ guardAsk: { hits, resolve } }));
  set({ guardAsk: null });
  return choice === 'save' ? { ok: true, flag: true } : { ok: false };
}
export function answerGuard(choice) { const g = state.guardAsk; if (g) g.resolve(choice); }

// Generic optimistic writes for the tables of the new model.
async function insertRow(table, key, row, base = {}, { guard = true } = {}) {
  const g = guard ? await guardWrite(row) : { ok: true };
  if (!g.ok) return null;
  if (g.flag) row = { ...row, flagged: true };
  const tmp = tmpId();
  set((s) => ({ [key]: [...s[key], { ...base, ...row, id: tmp, created_at: nowIso(), updated_at: nowIso(), archived: false, _pending: true }] }));
  try {
    const saved = await write(() => api.insert(table, row));
    set((s) => ({ [key]: s[key].map((x) => (x.id === tmp ? saved : x)) }));
    refreshActivitySoon();
    if (g.flag) toast('נשמר וסומן לבדיקה של הפיקוד');
    return saved;
  } catch (e) {
    set((s) => ({ [key]: s[key].filter((x) => x.id !== tmp) }));
    fail(e);
    return null;
  }
}
async function updateRow(table, key, id, patch, { guard = true } = {}) {
  const prev = state[key].find((x) => x.id === id);
  if (!prev || String(id).startsWith('tmp-')) return null;
  if (guard) {
    const g = await guardWrite(patch);
    if (!g.ok) return null;
    if (g.flag && FLAGGABLE.has(table)) { patch = { ...patch, flagged: true }; toast('נשמר וסומן לבדיקה של הפיקוד'); }
  }
  patchList(key, id, { ...patch, updated_at: nowIso() });
  try {
    const saved = await write(() => api.update(table, id, patch));
    patchList(key, id, saved);
    refreshActivitySoon();
    return saved;
  } catch (e) {
    patchList(key, id, prev);
    fail(e);
    return null;
  }
}
async function archiveRow(table, key, id, label) {
  const prev = state[key].find((x) => x.id === id);
  if (!prev) return;
  set((s) => ({ [key]: s[key].filter((x) => x.id !== id) }));
  try {
    await write(() => api.update(table, id, { archived: true }));
    toast(label, { action: { label: 'ביטול', run: () => restoreRow(table, key, prev) } });
  } catch (e) {
    set((s) => ({ [key]: [...s[key], prev] }));
    fail(e);
  }
}
async function restoreRow(table, key, prev) {
  set((s) => ({ [key]: [...s[key], prev] }));
  try { await write(() => api.update(table, prev.id, { archived: false })); } catch (e) { fail(e); }
}

// ---------- tasks: a Claude task (kind 'claude', owner = the agent, accountable = a person) or a human assignment ----------
const agentId = () => state.people.find((p) => p.is_agent || p.name === 'Claude')?.id || null;
export async function createTask(fields) {
  const title = (fields.title || '').trim();
  if (!title) return null;
  const my = state.auth?.me || null;
  let row = {
    title, status: 'todo', priority: 'medium', focus: false, private: false, kind: 'human', htype: 'general',
    owner_id: my, created_by: my, project_id: null, due: null,
    ...fields,
  };
  // Giving a task to Claude ("@Claude") makes it a Claude task, done for the person who opened it.
  const toAgent = row.owner_id && state.people.some((p) => p.id === row.owner_id && p.is_agent);
  if (row.kind === 'claude' || toAgent) row = { ...row, kind: 'claude', owner_id: toAgent ? row.owner_id : fields.owner_id || agentId(), accountable_id: fields.accountable_id || my, htype: 'general' };
  row.title = title;
  const g = await guardWrite(row);
  if (!g.ok) return null;
  if (g.flag) row.flagged = true;
  const tmp = tmpId();
  set((s) => ({ tasks: [...s.tasks, { ...row, id: tmp, created_at: nowIso(), updated_at: nowIso(), archived: false, _pending: true }] }));
  try {
    const saved = await write(() => api.insert('tasks', row));
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === tmp ? saved : t)) }));
    refreshActivitySoon();
    if (g.flag) toast('נשמר וסומן לבדיקה של הפיקוד');
    return saved;
  } catch (e) {
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== tmp) }));
    fail(e);
    return null;
  }
}
export async function updateTask(id, patch, opts = {}) {
  const prev = state.tasks.find((t) => t.id === id);
  if (!prev || String(id).startsWith('tmp-')) return;
  if (opts.guard !== false) {
    const g = await guardWrite(patch);
    if (!g.ok) return;
    if (g.flag) { patch = { ...patch, flagged: true }; toast('נשמר וסומן לבדיקה של הפיקוד'); }
  }
  const local = { ...patch, updated_at: nowIso() };
  if (patch.status && patch.status !== prev.status) local.done_at = patch.status === 'done' ? nowIso() : null;
  if (patch.status && !['blocked', 'waiting'].includes(patch.status) && (prev.blocked_by_person || prev.blocked_reason)) {
    patch = { ...patch, blocked_by_person: null, blocked_reason: null };
    Object.assign(local, { blocked_by_person: null, blocked_reason: null });
  }
  if (patch.kind === 'claude' && prev.kind !== 'claude') {
    // Handing a task to Claude: Claude does it, the person who had it stays accountable.
    const add = { owner_id: agentId(), accountable_id: prev.owner_id && prev.owner_id !== agentId() ? prev.owner_id : state.auth?.me, htype: 'general' };
    patch = { ...patch, ...add };
    Object.assign(local, add);
  }
  if (patch.kind === 'human' && prev.kind === 'claude') {
    const add = { owner_id: prev.accountable_id || state.auth?.me, accountable_id: null };
    patch = { ...patch, ...add };
    Object.assign(local, add);
  }
  patchList('tasks', id, local);
  try {
    const saved = await write(() => api.update('tasks', id, patch));
    patchList('tasks', id, saved);
    if (patch.status || patch.owner_id || patch.due !== undefined || patch.accountable_id) refreshActivitySoon();
  } catch (e) {
    patchList('tasks', id, prev);
    fail(e);
  }
}
export async function archiveTask(id) {
  const prev = state.tasks.find((t) => t.id === id);
  if (!prev) return;
  set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id), openTaskId: s.openTaskId === id ? null : s.openTaskId }));
  try {
    await write(() => api.update('tasks', id, { archived: true }));
    toast(prev.kind === 'claude' ? 'המשימה נמחקה' : 'המטלה נמחקה', { action: { label: 'ביטול', run: () => restoreTask(prev) } });
  } catch (e) {
    set((s) => ({ tasks: [...s.tasks, prev] }));
    fail(e);
  }
}
async function restoreTask(prev) {
  set((s) => ({ tasks: [...s.tasks, prev] }));
  try { await write(() => api.update('tasks', prev.id, { archived: false })); } catch (e) { fail(e); }
}
// A person approves Claude's work (closing needs a person), or sends it back with a note.
export async function approveTask(t) { await updateTask(t.id, { status: 'done' }); toast('אושר ונסגר'); }
export async function returnTask(t, note) {
  await updateTask(t.id, { status: 'in_progress' });
  if (note && note.trim()) await addComment(t.id, 'הוחזר לתיקון: ' + note.trim());
}
export const openTask = (id) => set({ openTaskId: id, menu: null, modal: null });
export const closeTask = () => set({ openTaskId: null });

// ---------- checklist ----------
export async function addChecklistItem(taskId, title) {
  title = title.trim();
  if (!title) return;
  const g = await guardWrite({ title });
  if (!g.ok) return;
  try {
    const row = await write(() => api.insert('checklist', { task_id: taskId, title, sort: Date.now() }));
    set((s) => ({ checklist: [...s.checklist, row] }));
    if (g.flag) await updateTask(taskId, { flagged: true }, { guard: false });
  } catch (e) { fail(e); }
}
export async function toggleChecklistItem(item) {
  set((s) => ({ checklist: s.checklist.map((c) => (c.id === item.id ? { ...c, done: !c.done } : c)) }));
  try { await write(() => api.update('checklist', item.id, { done: !item.done })); } catch (e) {
    set((s) => ({ checklist: s.checklist.map((c) => (c.id === item.id ? item : c)) }));
    fail(e);
  }
}
export async function removeChecklistItem(item) {
  set((s) => ({ checklist: s.checklist.filter((c) => c.id !== item.id) }));
  try { await write(() => api.remove('checklist', item.id)); } catch (e) {
    set((s) => ({ checklist: [...s.checklist, item] }));
    fail(e);
  }
}

// ---------- comments ----------
export async function loadComments(taskId) {
  try {
    const rows = await api.list('comments', { task_id: 'eq.' + taskId, order: 'created_at.asc' });
    set((s) => ({ comments: { ...s.comments, [taskId]: rows } }));
  } catch (e) { /* comments are optional on first paint */ }
}
export async function addComment(taskId, body) {
  body = body.trim();
  if (!body) return false;
  const g = await guardWrite({ body });
  if (!g.ok) return false;
  try {
    const row = await write(() => api.insert('comments', { task_id: taskId, author_id: state.auth?.me, body, ...(g.flag ? { flagged: true } : {}) }));
    set((s) => ({ comments: { ...s.comments, [taskId]: [...(s.comments[taskId] || []), row] } }));
    refreshActivitySoon();
    return true;
  } catch (e) { fail(e); return false; }
}

// ---------- projects ----------
// Opening or stopping a project is the commander's call (spec, round 3). A project someone else opens starts as proposed,
// with a gate decision waiting for the commander; the database moves the project when that decision is answered.
export async function createProject(fields) {
  const name = (fields.name || '').trim();
  if (!name) return null;
  const my = state.auth?.me || null;
  const cmd = commander();
  const ask = !!cmd && cmd.id !== my;
  const p = await insertRow('projects', 'projects', { ...fields, name, owner_id: fields.owner_id || my, stage: ask ? 'proposed' : 'active' },
    { health: 'on_track', partner_ids: [], milestones: [], links: [] });
  if (p && ask) {
    await createDecision({
      project_id: p.id, kind: 'gate', title: `לפתוח את הפרויקט "${p.name}"?`, context: p.description || null, assignee_id: cmd.id,
      options: gateOptions('open'), flagged: !!p.flagged,
    }, { guard: false });
    toast(`הפרויקט נפתח כמוצע. ${cmd.name} יקבל החלטה על פתיחה.`);
  }
  return p;
}
export const updateProject = (id, patch) => updateRow('projects', 'projects', id, patch);
export async function archiveProject(id) {
  await updateRow('projects', 'projects', id, { archived: true }, { guard: false });
  set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
  toast('הפרויקט הועבר לארכיון');
}
// Command opens or stops a project in one tap. A gate decision that is already waiting is answered, so the log shows it.
export async function setProjectStage(p, what) {
  const d = state.decisions.find((x) => x.project_id === p.id && x.kind === 'gate' && x.status === 'open');
  const opt = d && optionsOf(d).find((o) => o.effect === what);
  if (opt) return decide(d, { key: opt.key, label: opt.label });
  return updateRow('projects', 'projects', p.id, { stage: what === 'open' ? 'active' : 'stopped' }, { guard: false });
}
// Anyone else asks the commander to stop a project.
export function requestStop(p) {
  const cmd = commander();
  return createDecision({
    project_id: p.id, kind: 'gate', title: `לעצור את הפרויקט "${p.name}"?`, assignee_id: cmd?.id || null,
    options: gateOptions('stop'), flagged: !!p.flagged,
  }, { guard: false });
}

// ---------- decisions ----------
export function createDecision(fields, opts) {
  const title = (fields.title || '').trim();
  if (!title) return null;
  return insertRow('decisions', 'decisions', { kind: 'direction', options: [], status: 'open', created_by: state.auth?.me || null, ...fields, title }, {}, opts);
}
export const updateDecision = (id, patch) => updateRow('decisions', 'decisions', id, patch);
export const openDecision = (id) => set({ modal: 'decisionView', modalData: { id }, menu: null, openTaskId: null });
// Choosing: by an option's key, or in words ("אפשרות אחרת"). Who decided and when is recorded by the database too.
export async function decide(d, { key = null, label, rationale = '' }) {
  const saved = await updateRow('decisions', 'decisions', d.id, {
    status: 'decided', chosen_key: key, chosen_label: label, rationale: rationale.trim() || null,
    decided_by: state.auth?.me || null, decided_at: nowIso(),
  });
  if (!saved) return saved;
  // A gate decision opens or stops its project in the database; show it right away.
  const effect = d.kind === 'gate' && d.project_id ? optionsOf(d).find((o) => o.key === key)?.effect : null;
  const prev = effect ? { id: d.project_id, stage: state.projects.find((p) => p.id === d.project_id)?.stage } : null;
  if (effect) patchList('projects', d.project_id, { stage: effect === 'open' ? 'active' : 'stopped' });
  toast(`הוחלט: ${label}`, { action: { label: 'ביטול', run: () => reopenDecision(saved, prev) } });
  return saved;
}
// Undoing a gate decision right after it was made also puts its project back where it was.
export async function reopenDecision(d, prev) {
  const saved = await updateRow('decisions', 'decisions', d.id, { status: 'open', chosen_key: null, chosen_label: null, rationale: null, decided_by: null, decided_at: null }, { guard: false });
  if (saved && prev && prev.stage) await updateRow('projects', 'projects', prev.id, { stage: prev.stage }, { guard: false });
  return saved;
}
export const cancelDecision = (d) => updateRow('decisions', 'decisions', d.id, { status: 'cancelled' }, { guard: false });
export const archiveDecision = (id) => archiveRow('decisions', 'decisions', id, 'ההחלטה נמחקה');

// ---------- external commitments ----------
export function createCommitment(fields) {
  const title = (fields.title || '').trim();
  if (!title) return null;
  return insertRow('commitments', 'commitments', { direction: 'we_owe', status: 'open', owner_id: state.auth?.me || null, created_by: state.auth?.me || null, ...fields, title });
}
export const updateCommitment = (id, patch) => updateRow('commitments', 'commitments', id, patch);
export const archiveCommitment = (id) => archiveRow('commitments', 'commitments', id, 'ההתחייבות נמחקה');
// "בזמן": the answer to a commitment reminder, from the owner or anyone on the team who takes it.
export async function answerReminder(c) {
  const at = nowIso();
  const prev = state.reminders;
  set((s) => ({ reminders: s.reminders.map((r) => (r.commitment_id === c.id && !r.answered_at ? { ...r, answered_at: at, answered_by: s.auth?.me } : r)) }));
  try {
    await write(() => api.rpc('reminder_answer', { commitment: c.id }));
    toast('נרשם: בזמן');
    refreshActivitySoon();
  } catch (e) {
    set({ reminders: prev });
    fail(e);
  }
}

// ---------- ideas ----------
export function createIdea(fields) {
  const title = (fields.title || '').trim();
  if (!title) return null;
  return insertRow('ideas', 'ideas', { status: 'new', created_by: state.auth?.me || null, ...fields, title });
}
export const updateIdea = (id, patch) => updateRow('ideas', 'ideas', id, patch);
export const archiveIdea = (id) => archiveRow('ideas', 'ideas', id, 'הרעיון נמחק');

// ---------- the weekly meeting: one row per week ----------
export async function saveMeeting(weekStart, patch) {
  const g = await guardWrite(patch);
  if (!g.ok) return null;
  const cur = state.meetings.find((m) => m.week_start === weekStart);
  try {
    let saved;
    if (cur && !String(cur.id).startsWith('tmp-')) saved = await write(() => api.update('meetings', cur.id, patch));
    else saved = await write(() => api.insert('meetings', { week_start: weekStart, created_by: state.auth?.me || null, ...patch }));
    set((s) => ({ meetings: [saved, ...s.meetings.filter((m) => m.week_start !== weekStart)] }));
    return saved;
  } catch (e) {
    fail(e);
    refresh();
    return null;
  }
}

// ---------- team settings: the context file for Claude and the sensitive-word list ----------
export async function saveSettings(patch, { guard = true } = {}) {
  if (guard) { const g = await guardWrite(patch); if (!g.ok) return null; }
  const prev = state.settings;
  if (!prev) return null;
  set({ settings: { ...prev, ...patch } });
  try {
    const saved = await write(() => api.updateSettings(prev.team_id, { ...patch, updated_by: state.auth?.me || null }));
    set({ settings: saved });
    return saved;
  } catch (e) {
    set({ settings: prev });
    fail(e);
    return null;
  }
}

// ---------- the fixed rules: a person approves or pauses; the database logs it ----------
export async function setRule(key, status) {
  const prev = state.rules;
  set((s) => ({ rules: s.rules.map((r) => (r.key === key ? { ...r, status, ...(status === 'active' ? { approved_by: s.auth?.me, approved_at: nowIso() } : {}) } : r)) }));
  try {
    await write(() => api.rpc('rule_set', { rule_key: key, to_status: status }));
    const rule = prev.find((r) => r.key === key);
    toast(status === 'active' ? `הכלל "${rule?.title || ''}" אושר ויתחיל לרוץ` : `הכלל "${rule?.title || ''}" הושהה`);
    refreshActivitySoon();
  } catch (e) {
    set({ rules: prev });
    fail(e);
  }
}

// ---------- possibly classified: anyone marks, command clears or removes ----------
const TABLE_OF = { task: ['tasks', 'tasks'], decision: ['decisions', 'decisions'], commitment: ['commitments', 'commitments'], idea: ['ideas', 'ideas'], project: ['projects', 'projects'] };
export async function flagItem(kind, id) {
  if (kind === 'comment') {
    try { await write(() => api.update('comments', id, { flagged: true })); } catch (e) { fail(e); return; }
    set((s) => ({ comments: Object.fromEntries(Object.entries(s.comments).map(([k, v]) => [k, v.map((c) => (c.id === id ? { ...c, flagged: true } : c))])) }));
  } else {
    const [table, key] = TABLE_OF[kind];
    await updateRow(table, key, id, { flagged: true }, { guard: false });
  }
  if (kind === 'task' && state.openTaskId === id && !isCommand()) closeTask();
  toast('סומן כחשוד והוסתר עד שהפיקוד יבדוק. תודה.');
}
export async function clearFlag(kind, id) {
  if (kind === 'comment') {
    try { await write(() => api.update('comments', id, { flagged: false })); } catch (e) { fail(e); return; }
  } else {
    const [table, key] = TABLE_OF[kind];
    await updateRow(table, key, id, { flagged: false }, { guard: false });
  }
  toast('הסימון הוסר');
  refresh();
}
export async function redactItem(kind, id) {
  try {
    await write(() => api.rpc('redact_item', { item_kind: kind, item_id: id }));
    toast('התוכן הוסר מהכלי');
    await loadAll();
  } catch (e) { fail(e); }
}
export async function loadFlaggedComments() {
  try { return await api.list('comments', { flagged: 'is.true', order: 'created_at.desc' }); } catch (e) { return []; }
}

// ---------- notifications ----------
export async function markRead(n) {
  clearShown([n.id]);
  if (n.read_at) return;
  set((s) => ({ notifications: s.notifications.map((x) => (x.id === n.id ? { ...x, read_at: nowIso() } : x)) }));
  try { await write(() => api.update('notifications', n.id, { read_at: nowIso() })); } catch (e) { /* not critical */ }
}
export async function markAllRead() {
  const my = state.auth?.me;
  clearShown();
  set((s) => ({ notifications: s.notifications.map((x) => (x.read_at ? x : { ...x, read_at: nowIso() })) }));
  try { await write(() => api.updateWhere('notifications', { person_id: 'eq.' + my, read_at: 'is.null' }, { read_at: nowIso() })); } catch (e) { fail(e); }
}

// ---------- menus & modals ----------
export function openMenu(anchor, items, onPick, selected) {
  const r = anchor.getBoundingClientRect();
  set({ menu: { rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width }, items, onPick, selected } });
}
export const closeMenu = () => set({ menu: null });
export const openModal = (modal, data) => set({ modal, modalData: data || null, menu: null });
export const closeModal = () => set({ modal: null, modalData: null });
