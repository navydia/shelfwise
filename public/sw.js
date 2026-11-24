// Shelfwise service worker: caches the app shell and saves recent read responses
// so the list and prices still show with weak or no signal. Writes are never queued.
const VERSION = 'v1';
const SHELL_CACHE = `shelfwise-shell-${VERSION}`;
const DATA_CACHE = `shelfwise-data-${VERSION}`;
const SHELL = [
  '/', '/app.js', '/api.js', '/app.css', '/manifest.webmanifest', '/icon-180.png',
  '/views/review.js', '/views/list.js', '/views/receipt.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL_CACHE, DATA_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function fromCacheMarked(request, cacheName) {
  const cached = await caches.match(request, { cacheName });
  if (!cached) return null;
  const headers = new Headers(cached.headers);
  headers.set('x-shelfwise-cache', '1');
  return new Response(await cached.blob(), { status: cached.status, statusText: cached.statusText, headers });
}

async function networkFirst(request, cacheName, markStale) {
  try {
    const res = await fetch(request);
    if (res.ok) (await caches.open(cacheName)).put(request, res.clone());
    return res;
  } catch (err) {
    const cached = markStale ? await fromCacheMarked(request, cacheName) : await caches.match(request, { cacheName });
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request, { cacheName });
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) (await caches.open(cacheName)).put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, DATA_CACHE, true));
  } else if (url.pathname.startsWith('/photos/')) {
    event.respondWith(cacheFirst(request, DATA_CACHE));
  } else {
    event.respondWith(networkFirst(request, SHELL_CACHE, false));
  }
});
