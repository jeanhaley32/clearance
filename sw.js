const CACHE = 'clearance-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/engine.js',
  '/render.js',
  '/diary.js',
  '/app.js',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
];

self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c) {
    return Promise.all(ASSETS.map(function(url) {
      return c.add(url).catch(function(err) { console.warn('SW cache failed:', url, err); });
    }));
  }).then(function() { self.skipWaiting(); }));
});

self.addEventListener('activate', function(e) {
  e.waitUntil(caches.keys().then(function(keys) {
    return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
  }).then(function() { return self.clients.claim(); }));
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(resp) {
        if (resp && resp.status === 200 && (e.request.url.startsWith(self.location.origin) || e.request.url.includes('cdnjs.cloudflare.com'))) {
          const copy = resp.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, copy); });
        }
        return resp;
      }).catch(function() {
        return caches.match('/index.html');
      });
    })
  );
});
