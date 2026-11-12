import AxeBuilder from '@axe-core/playwright'
import { execFileSync } from 'node:child_process'
import type { Locator, Page, Request } from '@playwright/test'
import { ORIGIN, expect, freshEmail, onboardViaApi, register, test } from './fixtures'

// Owner-facing demonstrations on the SYNTHETIC PLAYABLE TEST CLIP (test/media/playable: H.264 + AAC, moving shapes, test tones,
// "SYNTHETIC TEST MEDIA - NOT TRAINING CONTENT"; no dog, no speech). These tests prove real decoding and playback in Chromium on
// the desktop, captions, link refresh, error handling, layout and that watching writes nothing. They say nothing about
// iPhone/Android playback, loudness, Hebrew narration or whether any real training clip is correct (docs/MEDIA_QA.md).
//
// The technique's state (published clip, suspension) is shared, so these tests run one after another in the desktop project
// only (playwright.config.ts leaves this file out of the other projects) and resize the page themselves to cover 360, 768 and 1280.
test.describe.configure({ mode: 'serial' })

const VIEWPORTS = [
  { width: 360, height: 780 },
  { width: 768, height: 1024 },
  { width: 1280, height: 860 },
]

function seed(email: string, mode: 'ready' | 'paused' | 'unavailable') {
  const output = execFileSync('npx', ['tsx', 'e2e/seed-demo.ts', email, mode], {
    encoding: 'utf8',
    shell: true,
    env: {
      ...process.env,
      DATABASE_URL: process.env.TEST_DATABASE_URL!,
      ...(process.env.TEST_DB_KIND === 'postgres' ? {} : { DATABASE_POOL_MAX: '1' }),
      APP_ENV: 'local',
      BETTER_AUTH_URL: ORIGIN,
      BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e-secret',
      MEDIA_LOCAL_DIR: 'e2e/.media',
    },
  })
  return JSON.parse(output.trim().split('\n').filter((l) => l.startsWith('{')).at(-1)!) as { levelId: string; exerciseVersionId: string }
}

async function ownerWithDemo(page: Page, mode: 'ready' | 'paused' | 'unavailable') {
  const email = freshEmail()
  await register(page, email)
  await onboardViaApi(page)
  return seed(email, mode)
}

async function expectHealthyPage(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([])
}

const PROGRESSION = /\/api\/(?:attempts|mastery|plan|onboarding)/

test('a ready demonstration: tap-to-play with native controls, Hebrew captions, keyboard transcript, easier clip, no writes', async ({ page }) => {
  const { levelId } = await ownerWithDemo(page, 'ready')
  const requests: Request[] = []
  page.on('request', (r) => requests.push(r))

  await page.goto(`/exercise/${levelId}`)
  const video = page.getByLabel(/^סרטון הדגמה: /).first()
  await expect(video).toBeVisible()
  await expect(video).toHaveAttribute('controls', '')
  await expect(video).toHaveAttribute('preload', 'none')
  expect(await video.getAttribute('autoplay')).toBeNull()
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true) // nothing plays until the owner taps

  const track = video.locator('track')
  await expect(track).toHaveAttribute('kind', 'captions')
  await expect(track).toHaveAttribute('srclang', 'he')
  const captions = await page.request.get((await track.getAttribute('src'))!)
  expect(captions.status()).toBe(200)
  expect(captions.headers()['content-type']).toContain('text/vtt')
  expect(await captions.text()).toContain('בוני!')

  // The transcript opens and closes from the keyboard.
  await expect(page.getByText('אומרים את שמו פעם אחת.').first()).toBeHidden() // collapsed until opened
  const toggle = page.getByRole('button', { name: 'תמליל הסרטון' })
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'הסתרת תמליל הסרטון' })).toHaveAttribute('aria-expanded', 'true')
  // The first match is the main transcript; the easier sheet has its own (hidden) one.
  await expect(page.getByText('אומרים את שמו פעם אחת.').first()).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'תמליל הסרטון' })).toHaveAttribute('aria-expanded', 'false')

  for (const size of VIEWPORTS) {
    await page.setViewportSize(size)
    await expectHealthyPage(page)
  }

  // The easier sheet shows the EASIER clip.
  await page.getByRole('button', { name: 'צריך להקל?' }).click()
  await expect(page.getByRole('dialog').getByLabel('סרטון הדגמה: מתגמלים כל מבט')).toBeVisible()
  await page.keyboard.press('Escape')

  // Watching wrote nothing: no progression or AI endpoint, and no state-changing request at all.
  expect(requests.filter((r) => PROGRESSION.test(r.url())).map((r) => r.url())).toEqual([])
  expect(requests.filter((r) => r.method() !== 'GET' && r.url().startsWith(ORIGIN)).map((r) => `${r.method()} ${r.url()}`)).toEqual([])
})

type Playback = { paused: boolean; ended: boolean; currentTime: number; duration: number; readyState: number; width: number; height: number; audioBytes: number; videoBytes: number }
/**
 * Starts playback the way the native control does from the keyboard (focus the player, press Space). Headless Chromium
 * ignores synthetic mouse clicks on the native overlay, so a finger tap on iPhone/Android and a mouse click are
 * manual checks (docs/MEDIA_QA.md); this is a genuine user key press, not a script call to play().
 */
async function pressPlay(page: Page, video: Locator) {
  await video.focus()
  await page.keyboard.press('Space')
}

const playback = (video: Locator) =>
  video.evaluate(
    (v: HTMLVideoElement & { webkitAudioDecodedByteCount?: number; webkitVideoDecodedByteCount?: number }): Playback => ({
      paused: v.paused,
      ended: v.ended,
      currentTime: v.currentTime,
      duration: v.duration,
      readyState: v.readyState,
      width: v.videoWidth,
      height: v.videoHeight,
      audioBytes: v.webkitAudioDecodedByteCount ?? -1,
      videoBytes: v.webkitVideoDecodedByteCount ?? -1,
    }),
  )

test('the playable clip really decodes and plays: metadata, tap-to-play, time advances, audio and video decoded, captions, ends', async ({ page }) => {
  const { levelId } = await ownerWithDemo(page, 'ready')
  const requests: Request[] = []
  page.on('request', (r) => requests.push(r))
  await page.goto(`/exercise/${levelId}`)
  const video = page.getByLabel(/^סרטון הדגמה: /).first()
  await expect(video).toBeVisible()
  expect((await playback(video)).paused).toBe(true)

  // The native control starts playback (nothing autoplays).
  await pressPlay(page, video)
  await expect.poll(async () => (await playback(video)).readyState, { message: 'metadata and first frames load' }).toBeGreaterThanOrEqual(3)
  const first = await playback(video)
  expect(first.paused).toBe(false)
  expect([first.width, first.height]).toEqual([1280, 720])
  expect(first.duration).toBeGreaterThan(19)
  expect(first.duration).toBeLessThan(21)

  // currentTime advances in real time and both tracks are decoded (Chromium counters; -1 would mean unsupported).
  await page.waitForTimeout(1_200)
  const second = await playback(video)
  expect(second.currentTime).toBeGreaterThan(first.currentTime + 0.8)
  expect(second.videoBytes).toBeGreaterThan(0)
  expect(second.audioBytes).toBeGreaterThan(0)

  // The Hebrew captions load as a text track and show the right cue while the clip plays.
  const cues = await video.evaluate(async (v: HTMLVideoElement) => {
    const track = v.textTracks[0]!
    track.mode = 'showing'
    for (let i = 0; i < 50 && !track.cues?.length; i++) await new Promise((r) => setTimeout(r, 100))
    return { language: track.language, kind: track.kind, texts: Array.from(track.cues ?? []).map((c) => (c as VTTCue).text) }
  })
  expect(cues.language).toBe('he')
  expect(cues.kind).toBe('captions')
  expect(cues.texts).toHaveLength(6)
  expect(cues.texts).toContain('(המדגים:) בוני!')
  await video.evaluate((v: HTMLVideoElement) => (v.currentTime = 5.6)) // inside the demonstrator line
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => Array.from(v.textTracks[0]!.activeCues ?? []).map((c) => (c as VTTCue).text)))
    .toContain('(המדגים:) בוני!')

  // Playback reaches the end (jump near it, then let it run out).
  await video.evaluate((v: HTMLVideoElement) => (v.currentTime = v.duration - 1.2))
  await expect.poll(async () => (await playback(video)).ended, { timeout: 8_000 }).toBe(true)
  expect((await playback(video)).currentTime).toBeGreaterThan(19)
  await expect(page.getByRole('alert').filter({ hasText: 'לא הצלחנו להפעיל את הסרטון' })).toHaveCount(0)

  // Watching changed nothing: no progression or AI endpoint, no state-changing request at all.
  expect(requests.filter((r) => PROGRESSION.test(r.url())).map((r) => r.url())).toEqual([])
  expect(requests.filter((r) => r.method() !== 'GET' && r.url().startsWith(ORIGIN)).map((r) => `${r.method()} ${r.url()}`)).toEqual([])
})

test('an expired link: the first tap fails, the player refreshes the signed link once, the next tap plays', async ({ page }) => {
  const { levelId } = await ownerWithDemo(page, 'ready')
  await page.goto(`/exercise/${levelId}`)
  const video = page.getByLabel(/^סרטון הדגמה: /).first()
  await expect(video).toBeVisible()
  await page.waitForTimeout(9_000) // MEDIA_URL_TTL_S is 8 in the e2e server: the link rendered into the page has expired

  const oldSrc = await video.getAttribute('src')
  const refresh = page.waitForResponse((r) => r.url().includes('/api/media/playback'))
  await pressPlay(page, video)
  expect((await refresh).status()).toBe(200)
  await expect.poll(() => video.getAttribute('src')).not.toBe(oldSrc)
  await expect(page.getByRole('alert').filter({ hasText: 'לא הצלחנו להפעיל' })).toHaveCount(0) // a silent refresh, not an error

  await pressPlay(page, video)
  await expect.poll(async () => (await playback(video)).currentTime, { timeout: 8_000 }).toBeGreaterThan(0.5)
  expect((await playback(video)).paused).toBe(false)
})

test('when playback keeps failing: an honest error with the transcript, the retry and the written instructions', async ({ page }) => {
  const { levelId } = await ownerWithDemo(page, 'ready')
  await page.route('**/api/media/local*', (route) => (route.request().url().includes('.vtt') ? route.continue() : route.abort()))
  await page.goto(`/exercise/${levelId}`)
  const video = page.getByLabel(/^סרטון הדגמה: /).first()
  await expect(video).toBeVisible()
  // The first failure triggers one silent link refresh; the second tap fails again, so the error state appears.
  const refresh = page.waitForResponse((r) => r.url().includes('/api/media/playback'))
  await pressPlay(page, video)
  await refresh
  await expect(page.getByRole('alert').filter({ hasText: 'לא הצלחנו להפעיל את הסרטון' })).toHaveCount(0)
  await pressPlay(page, video)
  await expect(page.getByRole('alert').filter({ hasText: 'לא הצלחנו להפעיל את הסרטון' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'לנסות שוב' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'הסתרת תמליל הסרטון' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'איך מתרגלים' })).toBeVisible()
  for (const size of VIEWPORTS) {
    await page.setViewportSize(size)
    await expectHealthyPage(page)
  }
})

test('an expired link stops working and the playback endpoint hands out a working one', async ({ page }) => {
  const { levelId, exerciseVersionId } = await ownerWithDemo(page, 'ready')
  await page.goto(`/exercise/${levelId}`)
  const oldUrl = (await page.getByLabel(/^סרטון הדגמה: /).first().getAttribute('src'))!
  expect((await page.request.get(oldUrl, { headers: { range: 'bytes=0-15' } })).status()).toBe(206)
  await page.waitForTimeout(9_000) // MEDIA_URL_TTL_S is 8 in the e2e server
  expect((await page.request.get(oldUrl)).status()).toBe(404)

  const refreshed = await page.request.get(`/api/media/playback?exerciseVersionId=${exerciseVersionId}&variant=STANDARD`)
  expect(refreshed.status()).toBe(200)
  const view = (await refreshed.json()) as { state: string; videoUrl: string }
  expect(view.state).toBe('ready')
  expect(view.videoUrl).not.toBe(oldUrl)
  expect((await page.request.get(view.videoUrl)).status()).toBe(200)
})

test('another account cannot get the playback links of this exercise', async ({ page, browser }) => {
  const { exerciseVersionId } = await ownerWithDemo(page, 'ready')
  const other = await browser.newPage()
  await register(other, freshEmail())
  const answer = await other.request.get(`/api/media/playback?exerciseVersionId=${exerciseVersionId}&variant=STANDARD`)
  expect(answer.status()).toBe(404)
  await other.close()
})

test('a withdrawn clip shows the honest unavailable state and keeps the written instructions', async ({ page }) => {
  const { levelId } = await ownerWithDemo(page, 'unavailable')
  await page.goto(`/exercise/${levelId}`)
  await expect(page.getByText('סרטון ההדגמה לא זמין כרגע')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'איך מתרגלים' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'תרגלנו' })).toBeVisible()
  await expectHealthyPage(page)
})

test('a suspended technique pauses the guidance: no instructions, no report, progress kept', async ({ page }) => {
  const { levelId } = await ownerWithDemo(page, 'paused')
  await page.goto(`/exercise/${levelId}`)
  await expect(page.getByRole('heading', { name: 'התרגיל מושהה לבדיקה' })).toBeVisible()
  await expect(page.getByText('ההתקדמות שלכם נשמרה.', { exact: false })).toBeVisible()
  await expect(page.getByText('אין כרגע תרגיל חלופי', { exact: false })).toBeVisible() // the real catalog offers no replacement
  await expect(page.getByRole('button', { name: 'תרגלנו' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'איך מתרגלים' })).toHaveCount(0)
  for (const size of VIEWPORTS) {
    await page.setViewportSize(size)
    await expectHealthyPage(page)
  }

  const report = await page.request.post('/api/attempts', {
    data: { levelId, outcome: 'WITH_HELP' },
    headers: { origin: ORIGIN, 'idempotency-key': `e2e-${Date.now()}-paused` },
  })
  expect(report.status()).toBe(409)
  expect((await report.json()).error).toBe('GUIDANCE_PAUSED')
})

// Slice 4.3: media is never cached. Same invariant as the privacy proof in offline.spec.ts, after a session that plays a
// fixture clip. Lives here because this file owns the technique-wide clip state and runs serially in the desktop project.
test('media is never cached: after playing a clip, the caches hold only the offline page and build assets', async ({ page }) => {
  const { levelId, exerciseVersionId } = await ownerWithDemo(page, 'ready')
  await page.goto('/home')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 10_000 }).toBe(true)

  await page.goto(`/exercise/${levelId}`)
  const video = page.getByLabel(/^סרטון הדגמה: /).first()
  await expect(video).toBeVisible()
  await pressPlay(page, video)
  await expect.poll(async () => (await playback(video)).currentTime, { timeout: 8_000 }).toBeGreaterThan(0.5)
  // The page itself asks for the captions and a fresh signed playback link, through the worker.
  const captionsUrl = (await video.locator('track').getAttribute('src'))!
  const statuses = await page.evaluate(
    async ([captions, id]) => [(await fetch(captions)).status, (await fetch(`/api/media/playback?exerciseVersionId=${id}&variant=STANDARD`)).status],
    [captionsUrl, exerciseVersionId] as const,
  )
  expect(statuses).toEqual([200, 200])

  const contents = () =>
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
  await expect.poll(async () => (await contents())['woffiz-shell-4.3.0']?.length ?? 0).toBeGreaterThan(0)
  const cached = await contents()
  expect(Object.keys(cached).sort()).toEqual(['woffiz-offline-v1', 'woffiz-shell-4.3.0'])
  expect(cached['woffiz-offline-v1']).toEqual(['/offline.html'])
  const icons = ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-180.png']
  const shell = cached['woffiz-shell-4.3.0']!
  expect(shell.filter((entry) => !(entry.startsWith('/_next/static/') || icons.includes(entry)))).toEqual([])
  expect(shell.filter((entry) => /\/api\/|\.(mp4|vtt|m4s|webm)|token=|\/art\//.test(entry))).toEqual([])
})
