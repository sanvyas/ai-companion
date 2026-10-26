/* Saathi service worker: web push and a small offline shell.
   Never caches API traffic (it is cross-origin) and never stores anything personal. */
const SHELL = 'saathi-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

// App shell: network first so updates arrive, cache as the offline fallback (Today, Breathe, safety plan open offline).
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && (req.mode === 'navigate' || /\.(js|css|svg|woff2?)$/.test(new URL(req.url).pathname))) (await caches.open(SHELL)).put(req, res.clone());
      return res;
    } catch {
      const hit = await caches.match(req) || (req.mode === 'navigate' ? await caches.match('/') : undefined);
      if (hit) return hit;
      throw new Error('offline');
    }
  })());
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { /* generic fallback below */ }
  e.waitUntil(self.registration.showNotification(d.title || 'Saathi', {
    body: d.body || 'A quiet moment for you?',
    tag: d.tag || 'saathi',
    data: { route: d.route || 'today', kind: d.tag || '' },
    actions: Array.isArray(d.actions) ? d.actions.slice(0, 3) : [],
    requireInteraction: !!d.timeSensitive,
    icon: '/icon.svg',
    badge: '/icon.svg',
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const { route, kind } = e.notification.data || {};
  const action = e.action || '';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { c.postMessage({ type: 'open', route, kind, action }); return c.focus(); }
    }
    return self.clients.openWindow(`/?open=${encodeURIComponent(route || 'today')}&kind=${encodeURIComponent(kind || '')}&action=${encodeURIComponent(action)}`);
  })());
});
