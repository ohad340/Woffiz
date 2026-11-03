import AxeBuilder from '@axe-core/playwright'
import { execFileSync } from 'node:child_process'
import type { Page, Request } from '@playwright/test'
import { ORIGIN, expect, freshEmail, onboardViaApi, register, test } from './fixtures'

// Owner-facing demonstrations on SYNTHETIC FIXTURE clips (e2e/seed-demo.ts). The fixture containers hold no real picture
// or sound, so a real browser cannot play them: these tests prove authorization, captions, transcript, link refresh,
// error handling, layout and that watching writes nothing. Watching and listening to real clips is a manual device check.
//
// The technique's state (published clip, suspension) is shared, so these tests run one after another in one project and
// resize the page themselves to cover 360, 768 and 1280.
test.describe.configure({ mode: 'serial' })
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280', 'technique-wide state: run once, sizes covered inside the test')
})

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

  // Tap to play. The fixture cannot really play, so the player refreshes its link once and then shows the error state
  // with the transcript and a retry; the written instructions stay.
  const refresh = page.waitForResponse((r) => r.url().includes('/api/media/playback'))
  await video.click()
  await video.evaluate((v: HTMLVideoElement) => v.play().catch(() => undefined))
  expect((await refresh).status()).toBe(200)
  await video.evaluate((v: HTMLVideoElement) => v.play().catch(() => undefined))
  await expect(page.getByRole('alert').filter({ hasText: 'לא הצלחנו להפעיל את הסרטון' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'לנסות שוב' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'הסתרת תמליל הסרטון' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'איך מתרגלים' })).toBeVisible()

  // The easier sheet shows the EASIER clip.
  await page.getByRole('button', { name: 'צריך להקל?' }).click()
  await expect(page.getByRole('dialog').getByLabel('סרטון הדגמה: מתגמלים כל מבט')).toBeVisible()
  await page.keyboard.press('Escape')

  // Watching wrote nothing: no progression or AI endpoint, and no state-changing request at all.
  expect(requests.filter((r) => PROGRESSION.test(r.url())).map((r) => r.url())).toEqual([])
  expect(requests.filter((r) => r.method() !== 'GET' && r.url().startsWith(ORIGIN)).map((r) => `${r.method()} ${r.url()}`)).toEqual([])
})

test('an expired link stops working and the playback endpoint hands out a working one', async ({ page }) => {
  const { levelId, exerciseVersionId } = await ownerWithDemo(page, 'ready')
  await page.goto(`/exercise/${levelId}`)
  const oldUrl = (await page.getByLabel(/^סרטון הדגמה: /).first().getAttribute('src'))!
  expect((await page.request.get(oldUrl, { headers: { range: 'bytes=0-15' } })).status()).toBe(206)
  await page.waitForTimeout(5_000) // MEDIA_URL_TTL_S is 4 in the e2e server
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
