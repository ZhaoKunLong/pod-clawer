const CACHE_NAME = 'cctv-player-v1';
const BASE = '/pod-clawer';

// Core shell assets — cache on install, serve from cache first
const SHELL_ASSETS = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/episode.html`,
  `${BASE}/manifest.json`,
  `${BASE}/icons/icon-192.png`,
  `${BASE}/icons/icon-512.png`,
  `${BASE}/src/web/styles.css`,
  `${BASE}/src/web/app.js`,
  `${BASE}/src/web/episode.js`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests under /pod-clawer/
  if (!url.pathname.startsWith(BASE)) return;

  // data/**/*.json — network first, fall back to cache
  if (url.pathname.startsWith(`${BASE}/data/`)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Shell assets — cache first, fall back to network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
