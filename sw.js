// Offline shell: the app's own files come from the network first and fall back to the cache.
// API calls (/sb/...) and cross-origin requests are never cached, so data is always live. The control center (/next/)
// works offline only once it has been opened: the app's page would send it straight back there.
// Also shows phone notifications (Web Push from supabase/functions/push) and opens the app where a tap leads.
const CACHE = 'cto-tasks-v5';
const SHELL = [
  '/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon.svg',
  '/app/styles.css', '/app/main.js', '/app/config.js', '/app/api.js', '/app/util.js', '/app/store.js', '/app/ui.js',
  '/app/model.js', '/app/guard.js', '/app/activity.js', '/app/export.js', '/app/newitem.js', '/app/push.js',
  '/app/task-drawer.js', '/app/quickadd.js', '/app/motion.js', '/app/theme.js', '/app/lib/preact.js', '/app/lib/hooks.js', '/app/lib/htm.js',
  '/app/views/auth.js', '/app/views/home.js', '/app/views/command.js', '/app/views/decisions.js', '/app/views/commitments.js',
  '/app/views/overview.js', '/app/views/mine.js', '/app/views/team.js', '/app/views/projects.js', '/app/views/blockers.js',
  '/app/views/daily.js', '/app/views/weekly.js', '/app/views/report.js', '/app/views/settings.js', '/app/views/notify.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/sb/')) return;
  e.respondWith(fetch(req)
    .then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })
    .catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' && !url.pathname.startsWith('/next') && !url.pathname.startsWith('/m/') ? caches.match('/index.html') : Response.error()))));
});

// Every push is shown: browsers drop a subscription whose pushes show nothing.
self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (err) { m = { body: e.data ? e.data.text() : '' }; }
  const opts = { body: m.body || '', icon: '/icons/icon-192.png', dir: 'rtl', lang: 'he', data: { url: m.url || '/#/home' } };
  if (m.tag) Object.assign(opts, { tag: m.tag, renotify: true }); // the new digest replaces yesterday's
  e.waitUntil(self.registration.showNotification(m.title || 'משימות CTO', opts));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/#/home', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
    if (!win) return self.clients.openWindow(url);
    win.postMessage({ type: 'open', url });
    return win.focus();
  }));
});

// The browser replaced the subscription: take a new one with the same key. The app tells the server next time it opens.
self.addEventListener('pushsubscriptionchange', (e) => {
  const options = e.oldSubscription?.options;
  if (options?.applicationServerKey) e.waitUntil(self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: options.applicationServerKey }));
});
