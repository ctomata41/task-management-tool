// Google Calendar in the manual version: each person's own calendar beside their tasks in "יומן". It goes through the
// platform's `gcal` function (site path /gcal/*), so a browser signed in to the team (cto.auth) connects once with
// Google and both versions see the same calendar (the device token is shared under next.gcal). Without a team sign-in
// in this browser the card says what connecting needs; nothing here makes up events.
import { useState, useEffect } from 'preact/hooks';
import { api, setCreds, isMock } from '../app/api.js';
import { authHeaders } from '../app/session.js';
import { html, Icon, openMenu, parseDay, isoDay } from './ui.js';
import { toast } from './store.js';

const AUTH_KEY = 'cto.auth';
const DEVICE_KEY = 'next.gcal';
const LATER_KEY = 'm.gcal.later';
const ERR = {
  setup: 'חיבור יומן גוגל עוד לא הוגדר לצוות.', expired: 'החיבור לקח יותר מדי זמן. אפשר לנסות שוב.', denied: 'החיבור ליומן בוטל.',
  scope: 'בלי אישור לגשת ליומן, אי אפשר להציג אותו. אפשר לחבר שוב ולסמן את ההרשאה.', failed: 'לא הצלחתי לחבר את היומן. אפשר לנסות שוב.',
};
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
};
const auth = () => { const a = isMock ? null : LS.get(AUTH_KEY); return a?.me && (a.session || a.code) ? a : null; };
const device = (a) => (LS.get(DEVICE_KEY) || {})[a.me] || '';
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// Every failure comes back in words a person can act on, with the HTTP status kept for the caller.
async function call(route, body = {}) {
  const a = auth();
  let res;
  try {
    res = await fetch('/gcal/' + route, {
      method: 'POST', body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...authHeaders(a), 'x-gcal-device': device(a) },
    });
  } catch (e) {
    throw new Error('אין חיבור לשרת. כדאי לבדוק את החיבור לאינטרנט.');
  }
  let out = null;
  try { out = await res.json(); } catch (e) { /* not JSON */ }
  if (!res.ok || !out) {
    const err = new Error(out?.error || 'החיבור ליומן גוגל לא זמין כרגע.');
    err.status = res.status;
    throw err;
  }
  return out;
}

// Back from Google: the address ends in #gcal=<device> or #gcal_error=<why>. Runs once, before the first render.
export function takeReturn() {
  const m = /^#gcal(_error)?=([\w-]+)/.exec(location.hash);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search + '#/calendar');
  if (m[1]) { toast(ERR[m[2]] || ERR.failed, { ms: 6000 }); return; }
  const a = LS.get(AUTH_KEY);
  if (a?.me) LS.set(DEVICE_KEY, { ...(LS.get(DEVICE_KEY) || {}), [a.me]: m[2] });
  toast('יומן Google מחובר. האירועים שלך מופיעים עכשיו בשבוע שלך', { ms: 6000 });
}

// One event becomes one entry for each day it covers between a (the first day's midnight) and b (the midnight after
// the last), so leave or a trip that began before the week still shows. An all-day event fills each day; a timed one
// shows its start time on its first day, "עד" and its end time on a last day it leaves before midnight, and fills the
// days between (allDay), a day it fills up to midnight included.
function spread(e, a, b) {
  const all = !!e.all_day;
  const start = all ? parseDay(String(e.start).slice(0, 10)) : new Date(e.start);
  let end = all ? parseDay(String(e.end).slice(0, 10)) : new Date(e.end);
  if (!(end > start)) end = new Date(start.getTime() + 1); // no length: still on the day it starts
  const out = [];
  const d = new Date(Math.max(start.getTime(), a.getTime()));
  d.setHours(0, 0, 0, 0);
  for (; d < end && d < b; d.setDate(d.getDate() + 1)) {
    const day = isoDay(d);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const first = !all && start >= d;
    let time = '';
    if (first) time = hhmm(start);
    else if (!all && end < next) time = `עד ${hhmm(end)}`;
    out.push({ id: `${e.id}-${day}`, day, time, allDay: !first, title: e.title, link: e.link });
  }
  return out;
}

async function load(from, to) {
  const a = parseDay(from);
  const b = parseDay(to);
  b.setDate(b.getDate() + 1); // through the end of the last day
  try {
    const r = await call('events', { from: a.toISOString(), to: b.toISOString() });
    if (!r.configured) return { state: 'setup' };
    if (r.connected) return { state: 'on', email: r.email, events: (r.events || []).flatMap((e) => spread(e, a, b)) };
    if (r.error) return { state: 'error', error: r.error };
    return { state: r.linked_elsewhere ? 'elsewhere' : 'connect' };
  } catch (e) {
    // A team code that changed, or someone no longer on the team: signing in again helps, trying again doesn't.
    return { state: 'error', error: e.message, signin: e.status === 401 || e.status === 403 };
  }
}

// Weeks already read stay here, so moving back and forth doesn't ask Google again; reconnecting clears them.
const cache = new Map();
const subs = new Set();
const notify = () => subs.forEach((f) => f());
const reload = () => { cache.clear(); notify(); };

async function connect() {
  const a = auth();
  setCreds({ code: a.code || null, actor: a.me, session: a.session || null });
  try {
    const state = await api.rpc('gcal_state_create', { p_return: location.pathname });
    location.href = '/gcal/start?state=' + encodeURIComponent(state);
  } catch (e) {
    toast(e.message || 'לא הצלחתי להתחיל את החיבור', { ms: 6000 });
  }
}
async function disconnect() {
  try {
    await call('disconnect');
    const all = LS.get(DEVICE_KEY) || {};
    delete all[auth().me];
    LS.set(DEVICE_KEY, all);
    toast('היומן נותק. אף אחד כאן כבר לא ניגש אליו');
  } catch (e) {
    toast(e.message, { ms: 6000 });
  }
  reload();
}

// The calendar for the days from..to (YYYY-MM-DD, both included): {state, events, email, error, signin, later}.
// state: signin (no team sign-in here), loading, connect, elsewhere, setup, error, on. An error with signin set is
// one only signing in to the team again can fix.
export function useGcal(from, to) {
  const key = `${from}|${to}`;
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); subs.add(f); return () => subs.delete(f); }, []);
  const a = auth();
  const hit = cache.get(key);
  useEffect(() => {
    if (!a || cache.has(key)) return;
    cache.set(key, { state: 'loading' });
    load(from, to).then((r) => { cache.set(key, r); notify(); });
  }, [key, !!a, hit]);
  const later = !!LS.get(LATER_KEY);
  const setLater = (v) => { LS.set(LATER_KEY, v ? 1 : 0); notify(); };
  return { events: [], ...(a ? hit || { state: 'loading' } : { state: 'signin' }), later, setLater };
}

const TEXT = {
  signin: 'האירועים מיומן הגוגל שלך יכולים להופיע כאן ליד המשימות. כדי לחבר, נכנסים פעם אחת עם Google, והיומן מתחבר באותה כניסה.',
  connect: 'מחברים את יומן הגוגל שלך פעם אחת, והאירועים שלך מופיעים כאן ליד המשימות. רק את/ה רואה אותם.',
  elsewhere: 'היומן שלך מחובר ממכשיר אחר. כדי לראות אותו גם כאן, מחברים שוב במכשיר הזה.',
  setup: 'חיבור יומן גוגל עוד לא הוגדר לצוות.',
};

// The card above the week until the calendar is connected. "אחר כך" folds it into the chip in the week's header, and
// the chip brings it back; focus goes along to the one that takes the other's place.
const fold = (gc, later, to) => { gc.setLater(later); requestAnimationFrame(() => document.querySelector(to)?.focus()); };
export function GcalCard({ gc }) {
  if (gc.state === 'on' || gc.state === 'loading' || gc.later) return null;
  const text = gc.state === 'error' ? gc.error : TEXT[gc.state];
  // The site's sign-in page: signing in with Google there connects the calendar too, and comes back here.
  const signin = gc.state === 'signin' || gc.signin ? '/account/?return=' + encodeURIComponent(location.pathname) : '';
  return html`<div class="gc-card" role="group" aria-label="יומן גוגל">
    <span class="gc-ic" aria-hidden="true"><${Icon} name="calendar" size=${20} /></span>
    <div class="gc-text"><strong>יומן גוגל אישי</strong><span>${text}</span></div>
    <div class="gc-acts">
      ${signin ? html`<a class="btn btn-primary sm" href=${signin}>כניסה לצוות</a>` : null}
      ${gc.state === 'connect' || gc.state === 'elsewhere' ? html`<button type="button" class="btn btn-primary sm" onClick=${connect}>חיבור יומן Google</button>` : null}
      ${gc.state === 'error' && !gc.signin ? html`<button type="button" class="btn sm" onClick=${reload}>לנסות שוב</button>` : null}
      <button type="button" class="btn sm ghost" onClick=${() => fold(gc, true, '.gc-chip')}>אחר כך</button>
    </div>
  </div>`;
}

// The capsule in the week's header: connected (with a menu to refresh or disconnect), or a way back to the card.
export function GcalChip({ gc }) {
  if (gc.state === 'loading') return html`<span class="gc-chip is-wait" role="status"><span class="gc-dot"></span>בודק את יומן גוגל…</span>`;
  if (gc.state === 'on') {
    const menu = (e) => openMenu(e, [{ id: 'reload', label: 'לרענן מגוגל', icon: 'undo' }, { id: 'off', label: 'לנתק את היומן', icon: 'x', danger: true }], {
      onPick: (id) => (id === 'off' ? disconnect() : reload()),
    });
    return html`<button type="button" class="gc-chip is-on" onClick=${menu} title=${gc.email || ''}><span class="gc-dot"></span>יומן Google<${Icon} name="chevronDown" size=${14} /></button>`;
  }
  if (!gc.later) return null;
  return html`<button type="button" class="gc-chip" onClick=${() => fold(gc, false, '.gc-card .gc-acts :is(a, button)')}><${Icon} name="calendar" size=${14} />חיבור יומן Google</button>`;
}
