const CACHE = 'stolarnia-pro-v6';
const ASSETS = [
  'index.html',
  'rogowa.html',
  'polki.html',
  'lamele.html',
  'giecie.html',
  'antaro.html',
  'sevroll.html',
  'merivo.html',
  'nesting/index.html',
  'nesting/styles.css',
  'manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(cache => cache.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(cached => cached || caches.match('index.html')))
  );
});
