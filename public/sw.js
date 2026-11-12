// Woffiz service worker: offline recovery (Phase 4, slice 1), owner-activated updates (slice 2) and a cache of
// public build assets (slice 3). See docs/DECISIONS.md P4-1, P4-2 and P4-3.
//
// VERSION. SW_VERSION below is the one place to bump: changing this file publishes a new worker (README,
// "Installation and updates"), and the shell cache is named after the version.
//
// OFFLINE FALLBACK (P4-1, unchanged). Page navigations are network first. The public, static /offline.html is
// precached at install into woffiz-offline-v1 and is served only when the network request itself fails. Successful
// responses, including 404 and 5xx, are returned unchanged.
//
// SHELL CACHE (P4-3). The ONLY other thing ever cached is a positive allowlist of public build assets, identical for
// every visitor: everything under /_next/static/ (code, styles and the bundled fonts) and the four app icons. They
// go to woffiz-shell-<SW_VERSION>:
//   - /_next/static/* is cache first: the files are content-hashed, so a cached entry is never stale.
//   - the icons are stale-while-revalidate: their names are not hashed.
// Never cached, so never served from here: page HTML, API responses, RSC payloads, /_next/image, /_next/data,
// /art/*, the manifest, /sw.js, /offline.html (offline cache only), signed media URLs and every cross-origin URL.
// Anything that fails the allowlist returns from the fetch handler WITHOUT respondWith, so the browser handles it
// exactly as it would without a worker. No page, API response or user data is ever written to a cache, so a
// signed-in account's content can never be served from here.
//
// Updates (P4-2): on a first install (no active worker) this worker activates at once. A new version that finds an
// active worker WAITS until the owner taps "לעדכן עכשיו", which posts { type: 'SKIP_WAITING' }; the page then
// reloads once. Any other message is ignored. On activation every other woffiz-* cache is deleted.
//
// Rollback: publish a sw.js that calls self.skipWaiting() itself (a rollback never waits for a tap), deletes the
// woffiz-* caches (offline and shell) and calls self.registration.unregister().

const SW_VERSION = '4.3.0'

const OFFLINE_CACHE = 'woffiz-offline-v1'
const OFFLINE_URL = '/offline.html'
const SHELL_CACHE = 'woffiz-shell-' + SW_VERSION

// Entry cap of the shell cache, oldest first (a deployment without a version bump adds new hashed files under the
// same cache name). Measured on the 4.3 production build: 67 files under .next/static (1,229,393 bytes) plus the 4
// icons (365,841 bytes). Two full builds are 2 x (67 + 4) = 142 entries, so the cap is 160 (rule: 160 while
// 2 x (N + 4) <= 160, else 2 x (N + 4) rounded up to the next ten). At the cap the cache is about 3.2 MB of raw files.
const SHELL_CACHE_MAX_ENTRIES = 160

const ICON_PATHS = new Set(['/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-180.png'])

/**
 * The allowlist. Synchronous and pure: GET, same origin, not a navigation, no Range or RSC request, and either a
 * /_next/static/ path (any query: the platform may append a deployment id) or exactly one of the four icon URLs
 * with no query string at all.
 */
function isShellRequest(request) {
  if (request.method !== 'GET' || request.mode === 'navigate') return false
  let url
  try {
    url = new URL(request.url)
  } catch {
    return false
  }
  if (url.origin !== self.location.origin) return false
  if (request.headers.has('range') || request.headers.has('rsc') || url.searchParams.has('_rsc')) return false
  if (url.pathname.startsWith('/_next/static/')) return true
  return ICON_PATHS.has(url.pathname) && request.url === url.origin + url.pathname
}

/** Only a complete, public, same-origin 200 is stored: never partial, opaque, redirected, error or private responses. */
function isStorable(response) {
  if (!response.ok || response.status !== 200 || response.type !== 'basic' || response.redirected) return false
  const control = (response.headers.get('cache-control') || '').toLowerCase()
  return !control.includes('no-store') && !control.includes('private')
}

/** The cache key is the request URL, so request headers never decide a hit. */
async function lookup(request) {
  try {
    return await caches.match(request.url, { cacheName: SHELL_CACHE })
  } catch {
    return undefined
  }
}

/** Stores a response and trims the cache. A failed write (quota, TypeError) is ignored: the page keeps its response. */
async function store(request, response) {
  try {
    const cache = await caches.open(SHELL_CACHE)
    await cache.put(request.url, response)
    // put() replaces a matching entry by appending, so keys() is oldest first and a refreshed icon is not the first to go.
    const keys = await cache.keys()
    for (let i = 0; i < keys.length - SHELL_CACHE_MAX_ENTRIES; i++) await cache.delete(keys[i])
  } catch {
    // Not cached; the response already went to the page.
  }
}

/** /_next/static/*: a cached entry is never stale, so a hit makes no network request. */
async function cacheFirst(event, request) {
  const hit = await lookup(request)
  if (hit) return hit
  // A rejected fetch stays rejected: there is no synthetic response for an uncached asset.
  const response = await fetch(request)
  if (isStorable(response)) event.waitUntil(store(request, response.clone()))
  return response
}

/** Icons: the cached copy at once, refreshed in the background. */
async function staleWhileRevalidate(event, request) {
  const hit = await lookup(request)
  if (hit) {
    event.waitUntil(
      fetch(request)
        .then((response) => (isStorable(response) ? store(request, response) : undefined))
        .catch(() => {}),
    )
    return hit
  }
  const response = await fetch(request)
  if (isStorable(response)) event.waitUntil(store(request, response.clone()))
  return response
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' }))),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith('woffiz-') && key !== OFFLINE_CACHE && key !== SHELL_CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.mode === 'navigate' && request.method === 'GET') {
    event.respondWith(
      fetch(request).catch(async () => {
        // fetch() rejects only when the network is unavailable; HTTP error statuses resolve and pass through above.
        const fallback = await caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE })
        return fallback ?? Response.error()
      }),
    )
    return
  }

  // Everything off the allowlist (API calls, RSC payloads, media, artwork, non-GET requests) goes straight to the
  // network as before: no respondWith.
  if (!isShellRequest(request)) return

  const { pathname } = new URL(request.url)
  event.respondWith(pathname.startsWith('/_next/static/') ? cacheFirst(event, request) : staleWhileRevalidate(event, request))
})

self.addEventListener('message', (event) => {
  // Only the owner's "update now" tap (UpdatePrompt) activates a waiting worker; everything else is ignored.
  if (event.origin !== self.location.origin) return
  if (!event.data || typeof event.data !== 'object' || event.data.type !== 'SKIP_WAITING') return
  event.waitUntil(self.skipWaiting())
})
