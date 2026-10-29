// Phone notifications on this device (Web Push): turn on, test, "my digest now", turn off. The sending side is
// supabase/functions/push; what rings right away, what waits for the digest and the quiet hours are decided there.
// On an iPhone this works only in the app added to the home screen (iOS 16.4 and up).
import { api, isMock } from './api.js';
import { API_BASE, SUPABASE_ANON_KEY } from './config.js';

const FN = API_BASE + '/functions/v1/push';
const LS_KEY = 'cto.push'; // { person, endpoint }: the subscription this device made, to renew it when the browser rotates it

const LS = {
  get() { try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { return null; } },
  set(v) { try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
  del() { try { localStorage.removeItem(LS_KEY); } catch (e) { /* storage blocked */ } },
};

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// 'ok', or why notifications cannot work here: 'ios_home' (open the app from the home screen), 'unsupported', 'denied'.
export function pushSupport() {
  if (isMock) return 'ok';
  const can = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!can) return isIOS() && !standalone() ? 'ios_home' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}

// A short name for this device, shown in the list of my devices.
export function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (isIOS()) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  const os = /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'מחשב';
  return browser ? `${os} · ${browser}` : os;
}

const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(msg)), ms))]);
async function registration() {
  if (!(await navigator.serviceWorker.getRegistration())) await navigator.serviceWorker.register('/sw.js');
  return withTimeout(navigator.serviceWorker.ready, 10000, 'רכיב הרקע של האפליקציה לא עלה. כדאי לרענן ולנסות שוב.');
}
// This device's subscription, without registering anything (for signing out).
async function current() {
  if (isMock) return mock.sub;
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg?.pushManager ? reg.pushManager.getSubscription() : null;
}

async function call(body) {
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY };
  if (body) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(FN, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw new Error('אין חיבור לשרת. כדאי לבדוק את החיבור לאינטרנט.');
  }
  if (!res.ok) throw new Error('שירות ההתראות לא זמין כרגע');
  return res.json();
}

let key = null;
// The server's public key (VAPID). Fetched before the tap, so the tap goes straight to the permission question.
export async function publicKey() {
  if (isMock) return 'mock';
  if (!key) key = (await call()).publicKey;
  if (!key) throw new Error('שירות ההתראות לא זמין כרגע');
  return key;
}
function bytes(b64u) {
  const s = atob(b64u.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64u.length + 3) % 4));
  return Uint8Array.from(s, (ch) => ch.charCodeAt(0));
}
const sameKey = (sub, k) => {
  const a = sub.options?.applicationServerKey;
  if (!a) return true;
  const x = new Uint8Array(a);
  const y = bytes(k);
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

async function register(person, sub) {
  const j = sub.toJSON();
  await api.rpc('push_subscribe', { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, device: deviceLabel() });
  LS.set({ person, endpoint: j.endpoint });
  return j.endpoint;
}

// Where this device stands for this person: { phase, endpoint, devices }. phase: what pushSupport says, or
// 'not_ready' (the server side is not set up yet), 'off', 'on'.
export async function pushState() {
  const support = pushSupport();
  if (support !== 'ok') return { phase: support, devices: [] };
  let devices;
  try {
    await publicKey();
    devices = (await api.rpc('push_devices')) || [];
  } catch (e) {
    return { phase: 'not_ready', devices: [] };
  }
  const sub = isMock ? mock.sub : await (await registration()).pushManager.getSubscription();
  const endpoint = sub?.endpoint || null;
  const on = !!endpoint && devices.some((d) => d.endpoint === endpoint);
  return { phase: on ? 'on' : 'off', endpoint: on ? endpoint : null, devices };
}

// Turning notifications on. Call it straight from the tap: the permission question has to come from one (iPhone).
export async function pushOn(person) {
  if (isMock) {
    mock.sub = mock.sub || { endpoint: 'https://push.example/mock-' + Math.random().toString(36).slice(2), toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'mock', auth: 'mock' } }; } };
    return register(person, mock.sub);
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'ההתראות נחסמו במכשיר הזה' : 'לא התקבל אישור להתראות');
  const k = await publicKey();
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, k)) { await sub.unsubscribe(); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(k) });
  return register(person, sub);
}

// Turning them off on this device: the browser forgets the subscription and the server stops sending to it.
export async function pushOff() {
  const sub = await current().catch(() => null);
  LS.del();
  if (!sub) return;
  const { endpoint } = sub;
  if (isMock) mock.sub = null;
  else await sub.unsubscribe().catch(() => {});
  await api.rpc('push_unsubscribe', { endpoint }).catch(() => {});
}

// Another device of mine that should stop getting notifications (an old phone).
export const pushRemove = (endpoint) => api.rpc('push_unsubscribe', { endpoint });

// A test message, and "my digest now", to this device. { ok, empty?, count? }
export async function pushTest(endpoint) { return isMock ? { ok: true } : call({ action: 'test', endpoint }); }
export async function pushDigest(endpoint) { return isMock ? { ok: true, count: 3 } : call({ action: 'digest_me', endpoint }); }

// Who turned notifications on on this device, if anyone did.
export const pushPerson = () => LS.get()?.person || null;

// When the app opens: if this device was turned on for this person and the browser has since replaced its subscription,
// tell the server about the new one. Quiet: nothing here asks the person anything.
export async function syncPush(person) {
  const saved = LS.get();
  if (isMock || !saved || saved.person !== person || pushSupport() !== 'ok' || Notification.permission !== 'granted') return;
  try {
    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(await publicKey()) });
    if (sub.endpoint !== saved.endpoint) await register(person, sub);
  } catch (e) { /* the settings screen shows the state and offers to turn it on again */ }
}

// A notification read in the app leaves the phone's notification center too. No tags: all of them.
export async function clearShown(tags) {
  if (isMock || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg?.getNotifications) return;
    (await reg.getNotifications()).filter((n) => !tags || tags.includes(n.tag)).forEach((n) => n.close());
  } catch (e) { /* not critical */ }
}

const mock = { sub: null };
