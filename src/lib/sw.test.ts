import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

// Runs the REAL public/sw.js in an isolated node:vm context with stubbed worker globals (an in-memory CacheStorage that
// follows the specified put/keys order, a stubbed fetch). public/sw.js has no export, hook or test-only code.
const SOURCE = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8')
const ORIGIN = 'https://woffiz.test'
const SW_VERSION = /const SW_VERSION = '([^']+)'/.exec(SOURCE)![1]!
const CAP = Number(/const SHELL_CACHE_MAX_ENTRIES = (\d+)/.exec(SOURCE)![1])
const SHELL = `woffiz-shell-${SW_VERSION}`
const OFFLINE = 'woffiz-offline-v1'
const OFFLINE_URL = `${ORIGIN}/offline.html`
const ICONS = ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-180.png']

const absolute = (request: string | { url: string }) => (typeof request === 'string' ? new URL(request, ORIGIN).href : request.url)

class FakeCache {
  entries: { url: string; response: Response }[] = []
  failPut = false
  async put(request: string | { url: string }, response: Response) {
    if (this.failPut) throw new TypeError('put failed')
    const url = absolute(request)
    // The specification's batch put: a matching entry is removed and the new pair is appended at the end.
    this.entries = this.entries.filter((entry) => entry.url !== url)
    this.entries.push({ url, response })
  }
  async match(request: string | { url: string }) {
    return this.entries.find((entry) => entry.url === absolute(request))?.response.clone()
  }
  async keys() {
    return this.entries.map((entry) => new Request(entry.url)) // insertion order, oldest first
  }
  async delete(request: string | { url: string }) {
    const before = this.entries.length
    this.entries = this.entries.filter((entry) => entry.url !== absolute(request))
    return this.entries.length < before
  }
  async add(request: { url: string }) {
    await this.put(request, new Response('added'))
  }
  urls = () => this.entries.map((entry) => entry.url)
}

class FakeCaches {
  stores = new Map<string, FakeCache>()
  async open(name: string) {
    let cache = this.stores.get(name)
    if (!cache) {
      cache = new FakeCache()
      this.stores.set(name, cache)
    }
    return cache
  }
  async keys() {
    return [...this.stores.keys()]
  }
  async delete(name: string) {
    return this.stores.delete(name)
  }
  async match(request: string | { url: string }, options?: { cacheName?: string }) {
    if (options?.cacheName) return this.stores.get(options.cacheName)?.match(request)
    for (const cache of this.stores.values()) {
      const found = await cache.match(request)
      if (found) return found
    }
    return undefined
  }
}

type Overrides = { status?: number; type?: ResponseType; redirected?: boolean; ok?: boolean; headers?: Record<string, string> }

/** A response with the given status, type and redirect flag (Node reports `default` and cannot construct opaque ones). */
function res(body: string, { status = 200, type = 'basic', redirected = false, ok, headers }: Overrides = {}) {
  const response = new Response(body, { status: status === 0 ? 200 : status, headers })
  Object.defineProperty(response, 'type', { value: type })
  Object.defineProperty(response, 'redirected', { value: redirected })
  if (status === 0) Object.defineProperty(response, 'status', { value: 0 })
  if (ok !== undefined) Object.defineProperty(response, 'ok', { value: ok })
  return response
}

type FakeRequest = { url: string; method: string; mode: string; headers: Headers }
function req(path: string, { method = 'GET', mode = 'no-cors', headers = {} }: { method?: string; mode?: string; headers?: Record<string, string> } = {}): FakeRequest {
  return { url: path.startsWith('http') ? path : `${ORIGIN}${path}`, method, mode, headers: new Headers(headers) }
}

function loadWorker(networkFetch: (request: FakeRequest) => Promise<Response> = async () => res('network')) {
  const handlers: Record<string, (event: unknown) => unknown> = {}
  const caches = new FakeCaches()
  const fetchStub = vi.fn(networkFetch)
  const self = {
    location: new URL(`${ORIGIN}/`),
    addEventListener: (type: string, handler: (event: unknown) => unknown) => {
      handlers[type] = handler
    },
    skipWaiting: vi.fn(() => Promise.resolve()),
    clients: { claim: vi.fn(() => Promise.resolve()) },
  }
  // In a worker `new Request('/offline.html')` resolves against the worker's own URL; Node needs it made absolute.
  class WorkerRequest extends Request {
    constructor(input: string | Request, init?: RequestInit) {
      super(typeof input === 'string' ? new URL(input, ORIGIN).href : input, init)
    }
  }
  runInNewContext(SOURCE, { self, caches, fetch: fetchStub, Request: WorkerRequest, Response, URL, Headers })
  return { handlers, caches, fetch: fetchStub, self }
}
type Worker = ReturnType<typeof loadWorker>

/** Drives the worker's fetch handler like the browser does. `response` is set only if respondWith was called. */
function dispatch(worker: Worker, request: FakeRequest) {
  const state = { handled: false, response: undefined as Promise<Response> | undefined, waits: [] as Promise<unknown>[] }
  worker.handlers.fetch!({
    request,
    respondWith: (value: Response | Promise<Response>) => {
      state.handled = true
      state.response = Promise.resolve(value)
    },
    waitUntil: (value: Promise<unknown>) => {
      state.waits.push(Promise.resolve(value))
    },
  })
  return state
}

/** Waits for the page's response and then for everything handed to waitUntil (the cache writes). */
async function settle(state: ReturnType<typeof dispatch>) {
  if (state.response) await Promise.allSettled([state.response])
  await Promise.allSettled(state.waits)
}

async function fetchThrough(worker: Worker, request: FakeRequest) {
  const state = dispatch(worker, request)
  const response = await state.response
  await settle(state)
  return response
}

const shell = (worker: Worker) => worker.caches.stores.get(SHELL)
const shellUrls = (worker: Worker) => shell(worker)?.urls() ?? []
const seed = async (worker: Worker, name: string, path: string, body = 'seeded') => (await worker.caches.open(name)).put(path, res(body))

describe('public/sw.js', () => {
  it('is one file with a single skipWaiting (the owner-activated message) and the 4.3 version', () => {
    expect(SW_VERSION).toBe('4.3.0')
    expect(CAP).toBe(160)
    const code = SOURCE.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n') // the header comment mentions the rollback worker
    expect(code.match(/skipWaiting\(/g)).toHaveLength(1)
    expect(SOURCE).not.toMatch(/sw-version:/)
  })

  describe('S2: the allowlist', () => {
    it.each([
      ['a chunk', '/_next/static/chunks/0aelqbvpc32x8.js', 'no-cors'],
      ['a stylesheet', '/_next/static/chunks/2j-_54ngrhk46.css', 'no-cors'],
      ['a font requested by CSS (CORS mode)', '/_next/static/media/heebo-latin-400.woff2', 'cors'],
      ['the deployed `immutable` layout', '/_next/static/immutable/chunks/0aelqbvpc32x8.js', 'no-cors'],
      ['a deployment query string', '/_next/static/chunks/0aelqbvpc32x8.js?dpl=dpl_123', 'no-cors'],
      ...ICONS.map((path) => [`the icon ${path}`, path, 'no-cors']),
    ])('handles %s', async (_name, path, mode) => {
      const worker = loadWorker()
      const state = dispatch(worker, req(path!, { mode }))
      expect(state.handled).toBe(true)
      await settle(state)
    })

    it.each([
      ['the home page fetched by a script', '/home', {}],
      ['the root', '/', {}],
      ['an RSC request by query', '/map?_rsc=abc12', {}],
      ['an RSC request by header', '/_next/static/chunks/a.js', { headers: { RSC: '1' } }],
      ['an RSC request by header (lower case)', '/_next/static/chunks/a.js', { headers: { rsc: '1' } }],
      ['a Range request', '/_next/static/media/font.woff2', { headers: { Range: 'bytes=0-99' } }],
      ['a POST to a static path', '/_next/static/chunks/a.js', { method: 'POST' }],
      ['the session API', '/api/auth/get-session', {}],
      ['the attempts API', '/api/attempts', {}],
      ['the mastery API', '/api/mastery', {}],
      ['media playback', '/api/media/playback', {}],
      ['the local media route', '/api/media/local?token=abc', {}],
      ['captions', '/api/media/versions/7c0c1c4e/captions', {}],
      ['the image optimizer', '/_next/image?url=%2Fart%2Fa.webp&w=640&q=75', {}],
      ['Next.js data', '/_next/data/build/home.json', {}],
      ['artwork (owner decision)', '/art/map-painted.webp', {}],
      ['the manifest', '/manifest.webmanifest', {}],
      ['the worker itself', '/sw.js', {}],
      ['the offline page', '/offline.html', {}],
      ['another icon path', '/icons/other.png', {}],
      ['an icon with a query string', '/icons/icon-192.png?v=2', {}],
      ['an icon with an empty query string', '/icons/icon-192.png?', {}],
      ['a path that only looks like static', '/not/_next/static/a.js', {}],
      ['a cross-origin signed storage URL', 'https://abc.supabase.co/storage/v1/object/sign/media/clip.mp4?token=x', {}],
      ['a cross-origin copy of a static path', 'https://cdn.example/_next/static/chunks/a.js', {}],
    ] as [string, string, { method?: string; headers?: Record<string, string> }][])('does not handle %s', async (_name, path, options) => {
      const worker = loadWorker()
      const state = dispatch(worker, req(path, options))
      expect(state.handled).toBe(false) // the browser handles it exactly as without a worker
      expect(state.waits).toHaveLength(0)
      expect(worker.fetch).not.toHaveBeenCalled()
      expect(worker.caches.stores.size).toBe(0)
    })
  })

  describe('S3: only complete public 200 responses are stored', () => {
    const url = '/_next/static/chunks/a.js'

    it.each([
      ['a 200 basic response', res('ok'), true],
      ['a 200 with immutable caching', res('ok', { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } }), true],
      ['a 206', res('part', { status: 206 }), false],
      ['a 404', res('missing', { status: 404 }), false],
      ['a 500', res('boom', { status: 500 }), false],
      ['an opaque response', res('', { status: 0, type: 'opaque', ok: false }), false],
      ['a redirected response', res('ok', { redirected: true }), false],
      ['a cors-typed response', res('ok', { type: 'cors' }), false],
      ['Cache-Control: no-store', res('ok', { headers: { 'Cache-Control': 'no-store' } }), false],
      ['Cache-Control: No-Store (any case)', res('ok', { headers: { 'Cache-Control': 'max-age=0, No-Store' } }), false],
      ['Cache-Control: private', res('ok', { headers: { 'Cache-Control': 'private, max-age=60' } }), false],
    ])('%s', async (_name, network, stored) => {
      const worker = loadWorker(async () => network)
      const response = await fetchThrough(worker, req(url))
      expect(response).toBe(network) // the page always gets the network response
      expect(shellUrls(worker)).toEqual(stored ? [`${ORIGIN}${url}`] : [])
    })
  })

  describe('S4: strategies', () => {
    it('serves a cached static asset without any network request', async () => {
      const worker = loadWorker()
      await seed(worker, SHELL, '/_next/static/chunks/a.js', 'from cache')
      const state = dispatch(worker, req('/_next/static/chunks/a.js'))
      expect(await (await state.response)!.text()).toBe('from cache')
      await settle(state)
      expect(worker.fetch).not.toHaveBeenCalled()
      expect(state.waits).toHaveLength(0)
    })

    it('on a miss fetches once, stores a copy and returns the network response', async () => {
      const worker = loadWorker(async () => res('fresh'))
      const state = dispatch(worker, req('/_next/static/chunks/a.js'))
      const response = (await state.response)!
      await settle(state)
      expect(worker.fetch).toHaveBeenCalledTimes(1)
      expect(await response.text()).toBe('fresh')
      expect(shellUrls(worker)).toEqual([`${ORIGIN}/_next/static/chunks/a.js`])
      expect(await (await shell(worker)!.match(`${ORIGIN}/_next/static/chunks/a.js`))!.text()).toBe('fresh')
    })

    it('a miss with no network stays a failure: no synthetic response, nothing stored', async () => {
      const worker = loadWorker(async () => {
        throw new TypeError('Failed to fetch')
      })
      const state = dispatch(worker, req('/_next/static/chunks/a.js'))
      await expect(state.response).rejects.toThrow('Failed to fetch')
      await settle(state)
      expect(shellUrls(worker)).toEqual([])
    })

    it('an icon is returned from the cache first, then refreshed in the background', async () => {
      const worker = loadWorker(async () => res('new icon'))
      await seed(worker, SHELL, ICONS[0]!, 'old icon')
      const state = dispatch(worker, req(ICONS[0]!))
      expect(await (await state.response)!.text()).toBe('old icon')
      await settle(state)
      expect(worker.fetch).toHaveBeenCalledTimes(1)
      expect(await (await shell(worker)!.match(`${ORIGIN}${ICONS[0]}`))!.text()).toBe('new icon')
    })

    it('a failed icon refresh keeps the cached copy and never throws', async () => {
      const worker = loadWorker(async () => {
        throw new TypeError('offline')
      })
      await seed(worker, SHELL, ICONS[1]!, 'old icon')
      const state = dispatch(worker, req(ICONS[1]!))
      expect(await (await state.response)!.text()).toBe('old icon')
      await expect(settle(state)).resolves.toBeUndefined()
      expect(await (await shell(worker)!.match(`${ORIGIN}${ICONS[1]}`))!.text()).toBe('old icon')
    })

    it('an uncached icon is fetched, stored and returned', async () => {
      const worker = loadWorker(async () => res('icon'))
      const response = await fetchThrough(worker, req(ICONS[2]!))
      expect(await response!.text()).toBe('icon')
      expect(shellUrls(worker)).toEqual([`${ORIGIN}${ICONS[2]}`])
    })

    it('a refresh that is not storable (404) leaves the cached icon alone', async () => {
      const worker = loadWorker(async () => res('gone', { status: 404 }))
      await seed(worker, SHELL, ICONS[3]!, 'old icon')
      await fetchThrough(worker, req(ICONS[3]!))
      expect(await (await shell(worker)!.match(`${ORIGIN}${ICONS[3]}`))!.text()).toBe('old icon')
    })

    it('a rejecting cache.put still returns the network response', async () => {
      const network = res('fresh')
      const worker = loadWorker(async () => network)
      ;(await worker.caches.open(SHELL)).failPut = true
      const state = dispatch(worker, req('/_next/static/chunks/a.js'))
      expect(await state.response).toBe(network)
      await expect(settle(state)).resolves.toBeUndefined()
      expect(shellUrls(worker)).toEqual([])
    })
  })

  describe('S5 and S7: the versioned cache and its cap', () => {
    it('names the shell cache after the worker version and writes nowhere else', async () => {
      const worker = loadWorker()
      await fetchThrough(worker, req('/_next/static/chunks/a.js'))
      await fetchThrough(worker, req(ICONS[0]!))
      expect(SHELL).toBe(`woffiz-shell-${SW_VERSION}`)
      expect(await worker.caches.keys()).toEqual([SHELL])
    })

    it('trims the oldest entries so the cache holds exactly the cap, and leaves the offline cache alone', async () => {
      const worker = loadWorker()
      await seed(worker, OFFLINE, '/offline.html', 'offline page')
      for (let i = 0; i < CAP + 10; i++) await fetchThrough(worker, req(`/_next/static/chunks/c${i}.js`))
      const urls = shellUrls(worker)
      expect(urls).toHaveLength(CAP)
      expect(urls[0]).toBe(`${ORIGIN}/_next/static/chunks/c10.js`)
      expect(urls.at(-1)).toBe(`${ORIGIN}/_next/static/chunks/c${CAP + 9}.js`)
      expect(urls).not.toContain(`${ORIGIN}/_next/static/chunks/c9.js`)
      expect(worker.caches.stores.get(OFFLINE)!.urls()).toEqual([OFFLINE_URL])
    })

    it('a refreshed icon moves to the newest position and is not the first to go', async () => {
      const worker = loadWorker()
      await fetchThrough(worker, req(ICONS[0]!)) // the oldest entry
      for (let i = 0; i < CAP - 1; i++) await fetchThrough(worker, req(`/_next/static/chunks/c${i}.js`))
      expect(shellUrls(worker)).toHaveLength(CAP)
      await fetchThrough(worker, req(ICONS[0]!)) // cached copy served, refresh puts it at the end
      for (let i = 0; i < 3; i++) await fetchThrough(worker, req(`/_next/static/chunks/new${i}.js`))
      const urls = shellUrls(worker)
      expect(urls).toHaveLength(CAP)
      expect(urls).toContain(`${ORIGIN}${ICONS[0]}`)
      for (let i = 0; i < 3; i++) expect(urls).not.toContain(`${ORIGIN}/_next/static/chunks/c${i}.js`)
      expect(urls).toContain(`${ORIGIN}/_next/static/chunks/c3.js`)
    })
  })

  describe('S6: purge on activate', () => {
    it('keeps exactly the offline cache and the current shell cache, deletes other woffiz-* caches, leaves other names alone', async () => {
      const worker = loadWorker()
      for (const name of [OFFLINE, SHELL, 'woffiz-shell-4.2.0', 'woffiz-shell-0.0.0', 'woffiz-offline-v0', 'woffiz-', 'unrelated-cache', 'workbox-precache']) {
        await seed(worker, name, '/x')
      }
      const waits: Promise<unknown>[] = []
      worker.handlers.activate!({ waitUntil: (value: Promise<unknown>) => waits.push(Promise.resolve(value)) })
      await Promise.all(waits)
      expect((await worker.caches.keys()).sort()).toEqual([OFFLINE, SHELL, 'unrelated-cache', 'workbox-precache'].sort())
      expect(worker.self.clients.claim).toHaveBeenCalledTimes(1)
    })
  })

  describe('S8: unchanged behavior', () => {
    it('install precaches only /offline.html into the offline cache and never calls skipWaiting', async () => {
      const worker = loadWorker()
      const waits: Promise<unknown>[] = []
      worker.handlers.install!({ waitUntil: (value: Promise<unknown>) => waits.push(Promise.resolve(value)) })
      await Promise.all(waits)
      expect(await worker.caches.keys()).toEqual([OFFLINE])
      expect(worker.caches.stores.get(OFFLINE)!.urls()).toEqual([OFFLINE_URL])
      expect(worker.self.skipWaiting).not.toHaveBeenCalled()
    })

    it.each([
      ['another origin', { origin: 'https://evil.example', data: { type: 'SKIP_WAITING' } }],
      ['another type', { origin: ORIGIN, data: { type: 'CLAIM' } }],
      ['a string', { origin: ORIGIN, data: 'SKIP_WAITING' }],
      ['null', { origin: ORIGIN, data: null }],
      ['no data', { origin: ORIGIN }],
    ])('the message handler ignores %s', (_name, event) => {
      const worker = loadWorker()
      const waitUntil = vi.fn()
      worker.handlers.message!({ ...event, waitUntil })
      expect(worker.self.skipWaiting).not.toHaveBeenCalled()
      expect(waitUntil).not.toHaveBeenCalled()
    })

    it('the message handler calls skipWaiting once for a same-origin SKIP_WAITING', () => {
      const worker = loadWorker()
      const waitUntil = vi.fn()
      worker.handlers.message!({ origin: ORIGIN, data: { type: 'SKIP_WAITING' }, waitUntil })
      expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1)
      expect(waitUntil).toHaveBeenCalledTimes(1)
    })

    it('a navigation whose fetch rejects gets the cached offline page', async () => {
      const worker = loadWorker(async () => {
        throw new TypeError('Failed to fetch')
      })
      await seed(worker, OFFLINE, '/offline.html', 'offline page')
      const response = await fetchThrough(worker, req('/home', { mode: 'navigate' }))
      expect(await response!.text()).toBe('offline page')
    })

    it('a failed navigation without a cached offline page is a network error', async () => {
      const worker = loadWorker(async () => {
        throw new TypeError('Failed to fetch')
      })
      const response = await fetchThrough(worker, req('/home', { mode: 'navigate' }))
      expect(response!.type).toBe('error')
    })

    it('a navigation that gets HTTP 500 passes the 500 through, and no page is ever stored', async () => {
      const failing = res('server error', { status: 500 })
      const worker = loadWorker(async () => failing)
      await seed(worker, OFFLINE, '/offline.html', 'offline page')
      expect(await fetchThrough(worker, req('/home', { mode: 'navigate' }))).toBe(failing)
      const ok = loadWorker(async () => res('<html>private</html>'))
      await fetchThrough(ok, req('/home', { mode: 'navigate' }))
      expect(ok.caches.stores.size).toBe(0)
    })

    it('a non-GET navigation (a form post) is left to the browser', () => {
      const worker = loadWorker()
      expect(dispatch(worker, req('/home', { mode: 'navigate', method: 'POST' })).handled).toBe(false)
    })
  })
})
