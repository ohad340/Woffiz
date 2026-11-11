// Woffiz service worker: offline recovery (Phase 4, slice 1) and owner-activated updates (slice 2).
// See docs/DECISIONS.md P4-1 and P4-2.
// sw-version: 4.2.0
// Changing the sw-version line above is how a deployment publishes a new worker (README, "Installation and updates").
//
// Network first for page navigations; nothing else is touched. The ONLY cached response is the public, static
// /offline.html precached at install. No page, API response or user data is ever written to the cache, so a
// signed-in account's content can never be served from here. Successful responses, including 404 and 5xx,
// are returned unchanged: the fallback appears only when the network request itself fails.
//
// Updates (P4-2): on a first install (no active worker) this worker activates at once. A new version that finds an
// active worker WAITS until the owner taps "לעדכן עכשיו", which posts { type: 'SKIP_WAITING' }; the page then
// reloads once. Any other message is ignored.
//
// Rollback: publish a sw.js that calls self.skipWaiting() itself (a rollback never waits for a tap), deletes the
// woffiz-* caches and calls self.registration.unregister().

const CACHE = 'woffiz-offline-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' }))),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('woffiz-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  // API calls, RSC payloads, assets and every non-GET request go straight to the network as before.
  if (request.mode !== 'navigate' || request.method !== 'GET') return

  event.respondWith(
    fetch(request).catch(async () => {
      // fetch() rejects only when the network is unavailable; HTTP error statuses resolve and pass through above.
      const fallback = await caches.match(OFFLINE_URL, { cacheName: CACHE })
      return fallback ?? Response.error()
    }),
  )
})

self.addEventListener('message', (event) => {
  // Only the owner's "update now" tap (UpdatePrompt) activates a waiting worker; everything else is ignored.
  if (event.origin !== self.location.origin) return
  if (!event.data || typeof event.data !== 'object' || event.data.type !== 'SKIP_WAITING') return
  event.waitUntil(self.skipWaiting())
})
