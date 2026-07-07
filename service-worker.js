/* Caches the app's own files so it works with no signal — nothing
   about your ledger data goes through here, that stays in memory
   and in whatever file you Export/Import or Link (see script.js).

   Fetch strategy is NETWORK-FIRST: whenever you have a connection,
   this always asks GitHub Pages for the latest version of each file
   and updates the cache with whatever comes back. The cached copy is
   only ever used as a fallback when there's truly no connection. That
   way, future updates just show up next time you open the app with
   signal — no manual "clear site data" step needed. */
const CACHE_NAME = 'guild-ledger-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if(event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request).then((response) => {
      // Network succeeded — use it, and refresh the offline copy for next time.
      if(response && response.status === 200 && response.type === 'basic'){
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => {
      // Network failed (actually offline) — fall back to whatever's cached.
      return caches.match(event.request);
    })
  );
});
