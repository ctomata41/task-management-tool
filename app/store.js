// Global app state: one store, loaded from the API and refreshed by polling. Mutations are optimistic.
import { useEffect, useState } from 'preact/hooks';
import { api, setCreds } from './api.js';
import { POLL_MS } from './config.js';

const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } },
};
const AUTH_KEY = 'cto.auth';

let state = {
  phase: 'boot', // boot | setup | login | pick | ready | error
  error: null,
  auth: LS.get(AUTH_KEY), // { code, me }
  people: [], projects: [], tasks: [], checklist: [], activity: [], notifications: [],
  comments: {}, // task_id -> comments
  openTaskId: null,
  menu: null, // { rect, items, onPick, selected }
  toasts: [],
  modal: null, // 'settings' | 'quickadd' | 'newproject' | 'notifications' | 'search'
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
export function visibleTasks(s = state) {
  const my = s.auth?.me;
  return s.tasks.filter((t) => !t.private || t.owner_id === my || t.created_by === my);
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
    if (a?.code) {
      setCreds({ code: a.code, actor: a.me || null });
      const ok = await api.rpc('check_team_code', { code: a.code });
      if (!ok) { LS.del(AUTH_KEY); set({ auth: null }); setCreds({ code: null, actor: null }); return goAuth(); }
      if (!a.me) { await loadPeople(); return set({ phase: 'pick' }); }
      await loadAll();
      if (!me()) { await loadPeople(); return set({ phase: 'pick' }); }
      set({ phase: 'ready' });
      startPolling();
      return;
    }
    await goAuth();
  } catch (e) {
    set({ phase: 'error', error: e.message });
  }
}
async function goAuth() {
  const isSet = await api.rpc('team_code_is_set');
  set({ phase: isSet ? 'login' : 'setup' });
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
  const auth = { ...state.auth, me: id };
  LS.set(AUTH_KEY, auth);
  setCreds({ actor: id });
  set({ auth, phase: 'boot' });
  await loadAll();
  set({ phase: 'ready' });
  startPolling();
}
export function switchUser() { set({ phase: 'pick', modal: null, openTaskId: null }); }
export function logout() {
  LS.del(AUTH_KEY);
  setCreds({ code: null, actor: null });
  stopPolling();
  set({ auth: null, phase: 'boot', modal: null, openTaskId: null, tasks: [], projects: [], notifications: [] });
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
  const [people, projects, tasks, checklist, activity, notifications] = await Promise.all([
    api.list('people', { archived: 'is.false', order: 'sort.asc' }),
    api.list('projects', { archived: 'is.false', order: 'created_at.asc' }),
    api.list('tasks', { archived: 'is.false' }),
    api.list('checklist', { order: 'sort.asc' }),
    api.list('activity', { order: 'at.desc', limit: 200 }),
    my ? api.list('notifications', { person_id: 'eq.' + my, order: 'created_at.desc', limit: 60 }) : Promise.resolve([]),
  ]);
  if (pending > 0) return; // a write is in flight; the next poll will catch up
  set({ people, projects, tasks, checklist, activity, notifications, lastSync: new Date().toISOString() });
}
let timer = null;
function startPolling() {
  stopPolling();
  timer = setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
}
function stopPolling() { if (timer) clearInterval(timer); timer = null; }
export function refresh() {
  if (state.phase !== 'ready') return;
  loadAll().catch(() => { /* keep showing the last data; next poll retries */ });
}
if (typeof window !== 'undefined') {
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}
async function write(fn) {
  pending++;
  try { return await fn(); } finally { pending--; }
}
const nowIso = () => new Date().toISOString();
function patchTaskLocal(id, patch) { set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })); }
function refreshActivitySoon() {
  setTimeout(() => {
    api.list('activity', { order: 'at.desc', limit: 200 }).then((activity) => set({ activity })).catch(() => {});
  }, 400);
}

// ---------- tasks ----------
export async function createTask(fields) {
  const title = (fields.title || '').trim();
  if (!title) return null;
  const tmp = 'tmp-' + Math.random().toString(36).slice(2);
  const row = {
    title, status: 'todo', priority: 'medium', focus: false, private: false,
    owner_id: state.auth?.me || null, created_by: state.auth?.me || null, project_id: null, due: null,
    ...fields,
  };
  row.title = title;
  set((s) => ({ tasks: [...s.tasks, { ...row, id: tmp, created_at: nowIso(), updated_at: nowIso(), archived: false, _pending: true }] }));
  try {
    const saved = await write(() => api.insert('tasks', row));
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === tmp ? saved : t)) }));
    refreshActivitySoon();
    return saved;
  } catch (e) {
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== tmp) }));
    fail(e);
    return null;
  }
}
export async function updateTask(id, patch) {
  const prev = state.tasks.find((t) => t.id === id);
  if (!prev || String(id).startsWith('tmp-')) return;
  const local = { ...patch, updated_at: nowIso() };
  if (patch.status && patch.status !== prev.status) local.done_at = patch.status === 'done' ? nowIso() : null;
  if (patch.status && !['blocked', 'waiting'].includes(patch.status) && (prev.blocked_by_person || prev.blocked_reason)) {
    patch = { ...patch, blocked_by_person: null, blocked_reason: null };
    Object.assign(local, { blocked_by_person: null, blocked_reason: null });
  }
  patchTaskLocal(id, local);
  try {
    const saved = await write(() => api.update('tasks', id, patch));
    patchTaskLocal(id, saved);
    if (patch.status || patch.owner_id || patch.due !== undefined) refreshActivitySoon();
  } catch (e) {
    patchTaskLocal(id, prev);
    fail(e);
  }
}
export async function archiveTask(id) {
  const prev = state.tasks.find((t) => t.id === id);
  if (!prev) return;
  set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id), openTaskId: s.openTaskId === id ? null : s.openTaskId }));
  try {
    await write(() => api.update('tasks', id, { archived: true }));
    toast('המשימה נמחקה', { action: { label: 'ביטול', run: () => restoreTask(prev) } });
  } catch (e) {
    set((s) => ({ tasks: [...s.tasks, prev] }));
    fail(e);
  }
}
async function restoreTask(prev) {
  set((s) => ({ tasks: [...s.tasks, prev] }));
  try { await write(() => api.update('tasks', prev.id, { archived: false })); } catch (e) { fail(e); }
}
export const openTask = (id) => set({ openTaskId: id, menu: null });
export const closeTask = () => set({ openTaskId: null });

// ---------- checklist ----------
export async function addChecklistItem(taskId, title) {
  title = title.trim();
  if (!title) return;
  try {
    const row = await write(() => api.insert('checklist', { task_id: taskId, title, sort: Date.now() }));
    set((s) => ({ checklist: [...s.checklist, row] }));
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
  if (!body) return;
  try {
    const row = await write(() => api.insert('comments', { task_id: taskId, author_id: state.auth?.me, body }));
    set((s) => ({ comments: { ...s.comments, [taskId]: [...(s.comments[taskId] || []), row] } }));
    refreshActivitySoon();
  } catch (e) { fail(e); }
}

// ---------- projects ----------
export async function createProject(fields) {
  const name = (fields.name || '').trim();
  if (!name) return null;
  try {
    const row = await write(() => api.insert('projects', { ...fields, name, owner_id: fields.owner_id || state.auth?.me }));
    set((s) => ({ projects: [...s.projects, row] }));
    return row;
  } catch (e) { fail(e); return null; }
}
export async function updateProject(id, patch) {
  const prev = state.projects.find((p) => p.id === id);
  set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  try {
    const saved = await write(() => api.update('projects', id, patch));
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? saved : p)) }));
  } catch (e) {
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? prev : p)) }));
    fail(e);
  }
}
export async function archiveProject(id) {
  await updateProject(id, { archived: true });
  set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
  toast('הפרויקט הועבר לארכיון');
}

// ---------- notifications ----------
export async function markRead(n) {
  if (n.read_at) return;
  set((s) => ({ notifications: s.notifications.map((x) => (x.id === n.id ? { ...x, read_at: nowIso() } : x)) }));
  try { await write(() => api.update('notifications', n.id, { read_at: nowIso() })); } catch (e) { /* not critical */ }
}
export async function markAllRead() {
  const my = state.auth?.me;
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
