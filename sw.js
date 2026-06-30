/* Service Worker — オフライン対応（キャッシュ優先＋バックグラウンド更新） */
const CACHE_NAME = 'drone-tools-v10';
const ASSETS = [
  './',
  './theme.css',
  './index.html',
  './aircraft.html',
  './flight-plan.html',
  './calculator.html',
  './checklist.html',
  './flight-log.html',
  './data.html',
  './userguide.html',
  './storage-keys.js',
  './flight-calc.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// stale-while-revalidate: キャッシュを即返しつつ裏で更新
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(res => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
