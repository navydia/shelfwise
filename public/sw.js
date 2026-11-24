// Shelfwise service worker: caches the app shell and saves recent read responses
// so the list and prices still show with weak or no signal. Writes are never queued.
const VERSION = 'v8';
const SHELL_CACHE = `shelfwise-shell-${VERSION}`;
const DATA_CACHE = `shelfwise-data-${VERSION}`;
const SHELL = [
  '/', '/app.js', '/api.js', '/app.css', '/tokens.css', '/manifest.webmanifest', '/icon-180.png', '/icon-512.png',
  '/views/pantry.js', '/views/list.js', '/views/receipt.js',
  '/ui/wordmark.js', '/ui/icons.js', '/ui/sheet.js', '/ui/tabbar.js', '/ui/store-picker.js',
  '/views/store-sheet.js', '/views/staple-sheet.js', '/views/filter-sheet.js', '/ui/trip-cards.js', '/views/settings.js', '/views/finish-sheet.js', '/views/budget-sheet.js',
  '/lib/budget-tag.js', '/lib/list-groups.js', '/lib/money.js', '/lib/pantry-view.js', '/lib/trip.js',
  '/fonts/figtree-800.woff2', '/fonts/bricolage-700.woff2', '/fonts/bricolage-800.woff2', '/fonts/plex-mono-400.woff2',
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

const API_TIMEOUT_MS = 4000;
const STALLED_TIMEOUT_MS = 400; // after one stall, don't make every following request wait again
const STALL_MEMORY_MS = 60000;
let stalledUntil = 0;

// Network first, but on a stalled connection fall back to the saved copy after a few
// seconds instead of leaving the screen hanging. The request keeps going and refreshes the cache.
async function networkFirst(request, cacheName, markStale, timeoutMs = 0) {
  const network = fetch(request).then(async (res) => {
    if (res.ok) (await caches.open(cacheName)).put(request, res.clone());
    return res;
  });
  const saved = () => (markStale ? fromCacheMarked(request, cacheName) : caches.match(request, { cacheName }));
  try {
    if (!timeoutMs) return await network;
    const wait = Date.now() < stalledUntil ? STALLED_TIMEOUT_MS : timeoutMs;
    const res = await Promise.race([network, new Promise((resolve) => setTimeout(() => resolve(null), wait))]);
    if (res) { stalledUntil = 0; return res; }
    stalledUntil = Date.now() + STALL_MEMORY_MS;
  } catch (err) {
    const cached = await saved();
    if (cached) return cached;
    throw err;
  }
  const cached = await saved();
  if (cached) { network.catch(() => {}); return cached; }
  return network;
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
    event.respondWith(networkFirst(request, DATA_CACHE, true, API_TIMEOUT_MS));
  } else if (url.pathname.startsWith('/photos/')) {
    event.respondWith(cacheFirst(request, DATA_CACHE));
  } else {
    event.respondWith(networkFirst(request, SHELL_CACHE, false));
  }
});
