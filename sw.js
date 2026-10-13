// Offline shell: the app's own files come from the network first and fall back to the cache.
// API calls (/sb/...) and cross-origin requests are never cached, so data is always live.
const CACHE = 'cto-tasks-v1';
const SHELL = [
  '/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon.svg',
  '/app/styles.css', '/app/main.js', '/app/config.js', '/app/api.js', '/app/util.js', '/app/store.js', '/app/ui.js',
  '/app/task-drawer.js', '/app/quickadd.js', '/app/lib/preact.js', '/app/lib/hooks.js', '/app/lib/htm.js',
  '/app/views/auth.js', '/app/views/overview.js', '/app/views/mine.js', '/app/views/team.js', '/app/views/projects.js', '/app/views/blockers.js', '/app/views/daily.js', '/app/views/report.js',
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
    .catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('/index.html') : Response.error()))));
});
