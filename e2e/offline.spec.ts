import type { Page } from '@playwright/test'
import { ANSWERS, expect, expectHealthyPage, test } from './fixtures'

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

test('only the public offline page is ever cached', async ({ page, owner }) => {
  void owner
  await page.goto('/home')
  await controlledByServiceWorker(page)
  for (const route of ['/map', '/review', '/puppy']) await page.goto(route)
  expect(await page.evaluate(() => fetch('/api/auth/get-session').then((r) => r.status))).toBe(200)

  const cached = await page.evaluate(async () => {
    const result: Record<string, string[]> = {}
    for (const name of await caches.keys()) {
      const cache = await caches.open(name)
      result[name] = (await cache.keys()).map((request) => new URL(request.url).pathname)
    }
    return result
  })
  expect(cached).toEqual({ 'woffiz-offline-v1': ['/offline.html'] })
})
