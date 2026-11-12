import type { Page } from '@playwright/test'
import { currentLevelId, expect, expectHealthyPage, test } from './fixtures'

// Install guidance and owner-activated app updates (Phase 4, slice 2; docs/DECISIONS.md P4-2).
// Runs against the local production build (scripts/test-e2e.mjs) in all three viewport projects.

const INSTALL_HEADING = 'התקנה במסך הבית'
const INSTALL_INTRO = 'אפשר להוסיף את Woffiz למסך הבית ולפתוח אותה כמו אפליקציה.'
const INSTALLED_TEXT = 'Woffiz כבר מותקנת במכשיר הזה.'
const OTHER_TEXT = 'יש דפדפנים שלא תומכים בהתקנה'
const BANNER_TEXT = 'גרסה חדשה של Woffiz מוכנה. העדכון יטען מחדש את העמוד.'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP_CLASS =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15'

type TestWindow = Window & { __promptCalls?: number; __marker?: boolean }

/**
 * Headless Chromium may fire a genuine beforeinstallprompt for the installable localhost app, which would turn the
 * iOS/other cases into "prompt". Only synthetic events marked by these tests reach the app.
 */
async function blockGenuineInstallEvents(page: Page) {
  await page.addInitScript(() => {
    window.addEventListener(
      'beforeinstallprompt',
      (event) => {
        if (!(event as Event & { __e2e?: boolean }).__e2e) event.stopImmediatePropagation()
      },
      { capture: true },
    )
  })
}

const installCard = (page: Page) => page.locator('#install')

async function openInstallCard(page: Page) {
  await page.goto('/puppy#install')
  await expect(installCard(page).getByRole('heading', { level: 2, name: INSTALL_HEADING })).toBeVisible()
  await expect(installCard(page)).toContainText(INSTALL_INTRO)
}

test.describe('install guidance on /puppy', () => {
  test.beforeEach(async ({ page }) => {
    await blockGenuineInstallEvents(page)
  })

  test('other browsers get honest browser-menu instructions', async ({ page, owner }) => {
    void owner
    await openInstallCard(page)
    await expect(installCard(page)).toContainText(OTHER_TEXT)
    await expect(installCard(page).getByRole('button', { name: 'התקנה' })).toHaveCount(0)
    await expectHealthyPage(page)
  })

  test('with a native prompt, "התקנה" calls prompt() once, then appinstalled shows "already installed"', async ({ page, owner }) => {
    void owner
    await openInstallCard(page)
    await expect(installCard(page)).toContainText(OTHER_TEXT) // hydrated, so the prompt store is listening
    await page.evaluate(() => {
      const w = window as TestWindow
      w.__promptCalls = 0
      const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { __e2e?: boolean; prompt?: () => Promise<unknown> }
      event.__e2e = true
      event.prompt = () => {
        w.__promptCalls = (w.__promptCalls ?? 0) + 1
        return Promise.resolve({ outcome: 'accepted' })
      }
      window.dispatchEvent(event)
    })
    const install = installCard(page).getByRole('button', { name: 'התקנה' })
    await expect(install).toBeVisible()
    await expect(installCard(page)).toContainText('הדפדפן יציג חלון אישור משלו.')
    await expectHealthyPage(page)

    // Keyboard: Tab reaches the button with the visible 3px focus ring.
    await page.getByRole('heading', { level: 2, name: INSTALL_HEADING }).click()
    for (let i = 0; i < 10 && !(await install.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
    await expect(install).toBeFocused()
    expect(await install.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe('3px')

    await install.click()
    await expect(install).toHaveCount(0)
    expect(await page.evaluate(() => (window as TestWindow).__promptCalls)).toBe(1)

    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')))
    await expect(installCard(page)).toContainText(INSTALLED_TEXT)
  })

  test.describe('iPhone Safari', () => {
    test.use({ userAgent: IPHONE_SAFARI })
    test('shows the three Share-sheet steps in order', async ({ page, owner }) => {
      void owner
      await openInstallCard(page)
      const steps = installCard(page).getByRole('list').getByRole('listitem')
      await expect(steps).toHaveCount(3)
      await expect(steps.nth(0)).toContainText('כפתור השיתוף')
      await expect(steps.nth(1)).toContainText('הוספה למסך הבית')
      await expect(steps.nth(2)).toContainText('„הוספה”')
      await expect(installCard(page)).toContainText('באייפון ובאייפד ההתקנה נעשית דרך תפריט השיתוף.')
      await expectHealthyPage(page)
    })
  })

  test.describe('iPadOS with a desktop-class user agent', () => {
    test.use({ userAgent: IPAD_DESKTOP_CLASS })
    test('a touch-screen "Macintosh" gets the iOS steps', async ({ page, owner }) => {
      void owner
      await page.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 })
      })
      await openInstallCard(page)
      await expect(installCard(page).getByRole('list').getByRole('listitem')).toHaveCount(3)
    })
  })

  test('an installed app (display-mode: standalone) says it is already installed', async ({ page, owner }) => {
    void owner
    await page.addInitScript(() => {
      const original = window.matchMedia.bind(window)
      window.matchMedia = (query: string) =>
        query.includes('display-mode: standalone')
          ? ({
              matches: true,
              media: query,
              onchange: null,
              addEventListener() {},
              removeEventListener() {},
              addListener() {},
              removeListener() {},
              dispatchEvent: () => false,
            } as MediaQueryList)
          : original(query)
    })
    await openInstallCard(page)
    await expect(installCard(page)).toContainText(INSTALLED_TEXT)
    await expect(installCard(page)).not.toContainText(OTHER_TEXT)
  })

  test('reduced motion: the card renders the same, healthy, with no animation', async ({ page, owner }) => {
    void owner
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openInstallCard(page)
    await expect(installCard(page)).toContainText(OTHER_TEXT)
    expect(await installCard(page).evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
    await expectHealthyPage(page)
  })

  test('/home is unchanged: no install hint', async ({ page, owner }) => {
    void owner
    await page.goto('/home')
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeAttached()
    await expect(page.getByRole('heading', { name: INSTALL_HEADING })).toHaveCount(0)
    await expect(page.getByText(INSTALL_INTRO)).toHaveCount(0)
  })
})

// ----- App update -----

/** Waits until public/sw.js is active and controls this page (copied from offline.spec.ts, which stays unchanged). */
async function controlledByServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 10_000 }).toBe(true)
}

/**
 * Publishes a "new worker version" from inside the browser. Playwright cannot serve a changed sw.js body to the
 * browser's worker update fetch (spike in team-Yuri/dev-phase4.md: neither context.route nor CDP Fetch sees it), so
 * the same public/sw.js is registered under a second URL. The browser treats a changed script URL as a new version:
 * it installs and, finding an active worker, WAITS, exactly as after a SW_VERSION bump. The real bump is covered by
 * the recorded manual two-build check.
 */
async function publishNewWorker(page: Page) {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/sw.js?e2e-update=1', { scope: '/', updateViaCache: 'none' })
    for (let i = 0; i < 100 && !registration.waiting; i++) await new Promise((resolve) => setTimeout(resolve, 100))
  })
}

const registrationState = (page: Page) =>
  page.evaluate(async () => {
    const registration = (await navigator.serviceWorker.getRegistration())!
    return {
      installing: Boolean(registration.installing),
      waiting: registration.waiting?.scriptURL ?? null,
      active: registration.active?.scriptURL ?? null,
    }
  })

const banner = (page: Page) => page.locator('[data-update-banner]')
const setMarker = (page: Page) => page.evaluate(() => ((window as TestWindow).__marker = true))
const marker = (page: Page) => page.evaluate(() => (window as TestWindow).__marker ?? null)

type Box = { x: number; y: number; width: number; height: number }
const intersects = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

test('no update banner after a first install', async ({ page, owner }) => {
  void owner
  await page.goto('/home')
  await controlledByServiceWorker(page)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeAttached()
  await page.waitForTimeout(1000)
  await expect(page.getByText(BANNER_TEXT)).toHaveCount(0)
  expect((await registrationState(page)).waiting).toBeNull()
})

test('the update banner waits for the owner: "later" does nothing, "update now" reloads exactly once', async ({ page, owner }) => {
  void owner
  await page.goto('/home')
  await controlledByServiceWorker(page)
  await setMarker(page)
  await page.evaluate(() => document.activeElement?.setAttribute('data-e2e-focused', ''))

  // A new worker waits; the banner appears without stealing focus.
  await publishNewWorker(page)
  await expect(page.getByText(BANNER_TEXT)).toBeVisible()
  await expect(banner(page).getByRole('button', { name: 'לעדכן עכשיו' })).toBeVisible()
  await expect(banner(page).getByRole('button', { name: 'אחר כך' })).toBeVisible()
  expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-e2e-focused'))).toBe(true)
  expect(await marker(page)).toBe(true)
  await expectHealthyPage(page)

  // Clear of the bottom navigation, 48px controls, and no motion of its own.
  const bannerBox = (await banner(page).boundingBox())!
  const navBox = (await page.getByRole('navigation', { name: 'ניווט ראשי' }).boundingBox())!
  expect(intersects(bannerBox, navBox)).toBe(false)
  for (const name of ['לעדכן עכשיו', 'אחר כך']) expect((await banner(page).getByRole('button', { name }).boundingBox())!.height).toBeGreaterThanOrEqual(48)
  expect(await banner(page).evaluate((el) => [getComputedStyle(el).transitionDuration, getComputedStyle(el).animationName])).toEqual(['0s', 'none'])

  // "Later": hidden, no reload, the worker keeps waiting.
  await banner(page).getByRole('button', { name: 'אחר כך' }).click()
  await expect(page.getByText(BANNER_TEXT)).toHaveCount(0)
  expect(await marker(page)).toBe(true)
  expect((await registrationState(page)).waiting).not.toBeNull()

  // Next page load: offered again. (The page's own register('/sw.js') replaces the test version with a waiting
  // /sw.js; wait until that install settles before tapping.)
  await page.reload()
  await expect(page.getByText(BANNER_TEXT)).toBeVisible()
  await expect.poll(async () => registrationState(page)).toMatchObject({ installing: false, waiting: expect.stringMatching(/\/sw\.js$/) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await banner(page).evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
  expect(parseFloat(await banner(page).evaluate((el) => getComputedStyle(el).transitionDuration))).toBeLessThanOrEqual(0.00001)

  // "Update now": exactly one reload under the new worker.
  await setMarker(page)
  let documentRequests = 0
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests++
  })
  await Promise.all([page.waitForEvent('load'), banner(page).getByRole('button', { name: 'לעדכן עכשיו' }).click()])
  await page.waitForTimeout(3000)
  expect(documentRequests).toBe(1)
  expect(await marker(page)).toBeNull()
  expect((await registrationState(page)).waiting).toBeNull()
  await expect(page.getByText(BANNER_TEXT)).toHaveCount(0)

  // The offline fallback still works under the new worker.
  await page.context().setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'אין חיבור לאינטרנט' })).toBeVisible()
  await page.context().setOffline(false)
})

test('on the exercise screen the banner leaves the report action free and stays below an open sheet', async ({ page, owner }) => {
  void owner
  const levelId = await currentLevelId(page)
  await page.goto(`/exercise/${levelId}`)
  await controlledByServiceWorker(page)
  await publishNewWorker(page)
  await expect(page.getByText(BANNER_TEXT)).toBeVisible()
  const report = page.getByRole('button', { name: 'תרגלנו' })
  expect(intersects((await banner(page).boundingBox())!, (await report.boundingBox())!)).toBe(false)
  await expectHealthyPage(page)

  await report.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  const coveredBySheet = await banner(page).evaluate((el) => {
    const box = el.getBoundingClientRect()
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return Boolean(hit && !el.contains(hit) && hit.closest('dialog'))
  })
  expect(coveredBySheet).toBe(true)
})

test('previews stay available on the local machine', async ({ page, owner }) => {
  void owner
  await page.goto('/map?state=error')
  await expect(page.getByRole('heading', { level: 1, name: 'לא הצלחנו לטעון את המפה' })).toBeVisible()
})

// ----- Slice 4.3: public build assets in the shell cache -----

const OFFLINE_CACHE = 'woffiz-offline-v1'
const SHELL_CACHE = 'woffiz-shell-4.3.0'

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

test('offline: a cached build asset still loads from the worker, the API fails and a page shows the fallback', async ({ page, owner }) => {
  void owner
  await page.goto('/home')
  await controlledByServiceWorker(page)
  await page.goto('/map')
  const staticEntry = async () => (await cacheContents(page))[SHELL_CACHE]?.find((entry) => entry.startsWith('/_next/static/')) ?? null
  await expect.poll(staticEntry).not.toBeNull()
  const asset = (await staticEntry())!

  await page.context().setOffline(true)
  // cache: 'no-store' skips the browser's HTTP cache, so a 200 here can only come from the worker's cache.
  const result = await page.evaluate(async (path) => {
    const outcome = (url: string) => fetch(url, { cache: 'no-store' }).then((response) => response.status, () => 'failed')
    return {
      cached: await outcome(path),
      uncached: await outcome(`/_next/static/chunks/never-cached-${Date.now()}.js`), // no synthetic response (S4)
      api: await outcome('/api/auth/get-session'),
    }
  }, asset)
  expect(result).toEqual({ cached: 200, uncached: 'failed', api: 'failed' })

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'אין חיבור לאינטרנט' })).toBeVisible()
  await page.context().setOffline(false)
})

test('the 4.3 update path: a stale shell cache survives until the owner taps, then it is purged', async ({ page, owner }) => {
  void owner
  await page.goto('/home')
  await controlledByServiceWorker(page)
  // Seeded only now: the first worker's own activation would otherwise have purged it already.
  await page.evaluate(async () => {
    const cache = await caches.open('woffiz-shell-0.0.0')
    await cache.put('/_next/static/chunks/stale.js', new Response('stale'))
  })

  await publishNewWorker(page)
  await expect(page.getByText(BANNER_TEXT)).toBeVisible()
  // The new worker is waiting and has not activated, so nothing was purged yet. (That it caches nothing before the tap
  // is proved by the unit test of its install handler: it only adds /offline.html.)
  const state = await registrationState(page)
  expect(state.waiting).toMatch(/e2e-update=1/)
  expect(state.active).toMatch(/\/sw\.js$/)
  const waiting = await cacheContents(page)
  expect(waiting['woffiz-shell-0.0.0']).toEqual(['/_next/static/chunks/stale.js'])
  expect(waiting[OFFLINE_CACHE]).toEqual(['/offline.html'])

  await Promise.all([page.waitForEvent('load'), banner(page).getByRole('button', { name: 'לעדכן עכשיו' }).click()])
  await expect.poll(async () => Object.keys(await cacheContents(page)).sort()).toEqual([OFFLINE_CACHE, SHELL_CACHE])
  const after = await cacheContents(page)
  expect(after[OFFLINE_CACHE]).toEqual(['/offline.html'])
  expect(after['woffiz-shell-0.0.0']).toBeUndefined()
})
