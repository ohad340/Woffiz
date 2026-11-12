import type { Page } from '@playwright/test'
import { ANSWERS, currentLevelId, expect, expectHealthyPage, test } from './fixtures'

// Offline recovery (Phase 4, slice 1): public/sw.js serves the static public/offline.html only when a page
// navigation fails for lack of network. Runs against the local production build (scripts/test-e2e.mjs).

const OFFLINE_TITLE = 'אין חיבור לאינטרנט'

/**
 * Waits until public/sw.js is active and controls this page. The page that first registers the worker is not
 * always claimed in Chromium, so it is reloaded once, as the owner's next navigation in a real session would be.
 */
async function controlledByServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 10_000 }).toBe(true)
}

const offlineHeading = (page: Page) => page.getByRole('heading', { level: 1, name: OFFLINE_TITLE })
const retryButton = (page: Page) => page.getByRole('button', { name: 'ניסיון חוזר' })

/** Clicks Retry and waits for the page to really reload (a marker set on window must be gone). */
async function retryAndReload(page: Page) {
  await page.evaluate(() => {
    ;(window as unknown as { __beforeRetry?: boolean }).__beforeRetry = true
  })
  await Promise.all([page.waitForEvent('load'), retryButton(page).click()])
  expect(await page.evaluate(() => (window as unknown as { __beforeRetry?: boolean }).__beforeRetry)).toBeUndefined()
}

test('the service worker and the offline page are served with the expected headers', async ({ request }) => {
  const sw = await request.get('/sw.js')
  expect(sw.status()).toBe(200)
  expect(sw.headers()['content-type']).toContain('javascript')
  expect(sw.headers()['cache-control']).toContain('no-store')

  const offline = await request.get('/offline.html')
  expect(offline.status()).toBe(200)
  expect(offline.headers()['content-type']).toContain('text/html')
  expect(await offline.text()).toContain('<html lang="he" dir="rtl">')
})

test('opening a page offline shows the Hebrew fallback without private content; Retry reloads and restores it online', async ({ page, owner }) => {
  void owner
  await page.goto('/home')
  await expect(page.getByText(ANSWERS.name).first()).toBeVisible()
  await controlledByServiceWorker(page)

  await page.context().setOffline(true)
  await page.reload()
  await expect(offlineHeading(page)).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/home')
  await expect(page.getByText(ANSWERS.name)).toHaveCount(0)
  await expectHealthyPage(page)
  await page.keyboard.press('Tab')
  await expect(retryButton(page)).toBeFocused()

  // Still offline: Retry really reloads the same URL and the fallback appears again.
  await retryAndReload(page)
  await expect(offlineHeading(page)).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/home')

  // Back online: Retry restores the original page, still signed in.
  await page.context().setOffline(false)
  await retryAndReload(page)
  await expect(page.getByRole('heading', { level: 1, name: 'איזה כיף שחזרתם!' })).toBeVisible()
  await expect(page.getByText(ANSWERS.name).first()).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/home')
})

test('tapping המפה from /home while offline shows the fallback at /map, and Retry restores /map online', async ({ page, owner }) => {
  void owner
  await page.goto('/home')
  await controlledByServiceWorker(page)

  await page.context().setOffline(true)
  await page.getByRole('navigation', { name: 'ניווט ראשי' }).getByRole('link', { name: 'המפה' }).click()
  await expect(offlineHeading(page)).toBeVisible()
  await expect(page).toHaveURL(/\/map$/)

  await page.context().setOffline(false)
  await retryAndReload(page)
  await expect(page.getByRole('heading', { level: 1, name: 'מפת האילוף' })).toBeAttached()
  await expect(offlineHeading(page)).toHaveCount(0)
  expect(new URL(page.url()).pathname).toBe('/map')
})

test('HTTP error responses pass through the service worker unchanged', async ({ page, owner }) => {
  void owner
  await page.goto('/home')
  await controlledByServiceWorker(page)

  const response = await page.goto('/does-not-exist')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1, name: 'הדף לא נמצא' })).toBeVisible()
  await expect(offlineHeading(page)).toHaveCount(0)
})

// Slice 4.3 redefines this privacy proof: the worker now also caches public build assets, and nothing else.
const OFFLINE_CACHE = 'woffiz-offline-v1'
const SHELL_CACHE = 'woffiz-shell-4.3.0'
const ICONS = ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-180.png']

/** Every Cache Storage entry as pathname + search, by cache name. */
const cacheContents = (page: Page) =>
  page.evaluate(async () => {
    const result: Record<string, string[]> = {}
    for (const name of await caches.keys()) {
      const cache = await caches.open(name)
      result[name] = (await cache.keys()).map((request) => {
        const url = new URL(request.url)
        return url.pathname + url.search
      })
    }
    return result
  })

test('only the public offline page and public build assets are ever cached', async ({ page, owner }) => {
  void owner
  await page.goto('/home')
  await controlledByServiceWorker(page)
  const levelId = await currentLevelId(page)
  for (const route of ['/map', '/review', '/puppy', `/exercise/${levelId}`]) await page.goto(route)
  expect(await page.evaluate(() => fetch('/api/auth/get-session').then((r) => r.status))).toBe(200)
  // Cache writes happen after the response (waitUntil), so wait for the first build asset instead of sleeping.
  await expect.poll(async () => (await cacheContents(page))[SHELL_CACHE]?.length ?? 0).toBeGreaterThan(0)

  const cached = await cacheContents(page)
  expect(Object.keys(cached).sort()).toEqual([OFFLINE_CACHE, SHELL_CACHE])
  expect(cached[OFFLINE_CACHE]).toEqual(['/offline.html'])

  const shell = cached[SHELL_CACHE]!
  expect(shell.length).toBeGreaterThan(0)
  // Every key is on the allowlist: a /_next/static/ file or one of the four icons with no query string.
  expect(shell.filter((entry) => !(entry.startsWith('/_next/static/') || ICONS.includes(entry)))).toEqual([])
  // And none is a page, an API call, an RSC payload, an optimized image or artwork.
  const forbidden = /^\/(api|art|home|map|review|puppy|exercise|onboarding)(\/|\?|$)|_rsc|\/_next\/(image|data)|^\/(offline\.html|sw\.js|manifest\.webmanifest)/
  expect(shell.filter((entry) => forbidden.test(entry))).toEqual([])
})
