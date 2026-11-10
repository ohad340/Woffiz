// Woffiz service worker: offline recovery only (Phase 4, slice 1). See docs/DECISIONS.md.
//
// Network first for page navigations; nothing else is touched. The ONLY cached response is the public, static
// /offline.html precached at install. No page, API response or user data is ever written to the cache, so a
// signed-in account's content can never be served from here. Successful responses, including 404 and 5xx,
// are returned unchanged: the fallback appears only when the network request itself fails.
//
// Rollback: publish a sw.js that calls self.registration.unregister() and deletes the woffiz-* caches.

const CACHE = 'woffiz-offline-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
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
