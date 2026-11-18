import { execFileSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Browser, Page } from '@playwright/test'
import { ANSWERS, ORIGIN, OUTBOX, expect, expectHealthyPage, freshEmail, onboardViaApi, register, test } from './fixtures'

// Pilot metrics page, alerts and housekeeping (Phase 4, slice 6; docs/DECISIONS.md P4-6) against the e2e database.
// Test values only: the cron secret and alert address below are set for the local test server in playwright.config.ts.
const CRON_SECRET = 'e2e-cron-secret-e2e-cron-secret'
const ALERT_EMAIL = 'ops-alerts@example.test'

/** Runs e2e/seed-ops.ts against the e2e database and returns its JSON output, if any. */
function seedOps(...args: string[]): unknown {
  const output = execFileSync('npx', ['tsx', 'e2e/seed-ops.ts', ...args], {
    encoding: 'utf8',
    shell: true,
    env: {
      ...process.env,
      DATABASE_URL: process.env.TEST_DATABASE_URL!,
      ...(process.env.TEST_DB_KIND === 'postgres' ? {} : { DATABASE_POOL_MAX: '1' }),
      APP_ENV: 'local',
      BETTER_AUTH_URL: ORIGIN,
      BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e-secret',
    },
  })
  const line = output.trim().split('\n').filter((l) => l.startsWith('{')).at(-1)
  return line ? JSON.parse(line) : undefined
}

async function signedInAdmin(page: Page) {
  const email = freshEmail()
  await register(page, email)
  seedOps('admin', email)
  return email
}

/** An onboarded owner (puppy, plan, generation job), in its own browser context. */
async function practicedOwner(browser: Browser) {
  const context = await browser.newContext({ baseURL: ORIGIN, locale: 'he-IL' })
  const page = await context.newPage()
  const email = freshEmail()
  await register(page, email)
  await onboardViaApi(page)
  const home = await page.request.get('/home')
  expect(home.ok()).toBeTruthy()
  await context.close()
  return email
}

type OutboxMail = { kind: string; to: string; subject: string; html: string; text: string; url: string }
async function alertMails(): Promise<{ name: string; raw: string; mail: OutboxMail }[]> {
  const files = await readdir(OUTBOX).catch(() => [] as string[])
  const mails = await Promise.all(files.map(async (name) => ({ name, raw: await readFile(path.join(OUTBOX, name), 'utf8') })))
  return mails.map((m) => ({ ...m, mail: JSON.parse(m.raw) as OutboxMail })).filter((m) => m.mail.kind === 'ops-alert' && m.mail.to === ALERT_EMAIL)
}

test.describe('pilot metrics page', () => {
  test('signed-out visitors and owners get the 404 page, and that 404 records no server error', async ({ page }) => {
    const before = (seedOps('server-errors') as { count: number }).count
    expect((await page.goto('/admin/metrics'))?.status()).toBe(404)
    await register(page, freshEmail())
    expect((await page.goto('/admin/metrics'))?.status()).toBe(404)
    await page.waitForTimeout(500) // onRequestError would run right after the response
    expect((seedOps('server-errors') as { count: number }).count).toBe(before)
  })

  test('an ADMIN sees aggregates with denominators; the page is healthy, private and keyboard-reachable', async ({ page, browser }) => {
    const ownerEmail = await practicedOwner(browser)
    await signedInAdmin(page)
    const response = await page.goto('/admin/metrics')
    expect(response?.status()).toBe(200)
    expect(response?.headers()['cache-control']).toContain('no-store')
    await expect(page.getByRole('heading', { level: 1, name: 'מדדי הפיילוט' })).toBeVisible()
    await expect(page).toHaveTitle(/מדדי הפיילוט/)
    await expect(page.getByRole('navigation', { name: 'ניהול' }).getByRole('link', { name: 'מדדי הפיילוט' })).toHaveAttribute('aria-current', 'page')

    for (const title of ['התראות פתוחות', 'ניקוי ושמירת נתונים', 'משפך הצטרפות', 'ימי תרגול', 'חזרה ביום 7', 'קושי חוזר לפי שלב', 'דיווחי שליטה', 'יצירת תוכניות', 'תמונות יומיות']) {
      await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible()
    }
    const funnel = page.getByRole('region', { name: 'טבלת משפך ההצטרפות (אפשר לגלול הצידה)' })
    await expect(funnel.getByRole('row', { name: /השלימו את ההיכרות/ })).toContainText(/\d+ מתוך \d+ \(\d+%\)/)
    await expect(page.getByText('סרטוני הדגמה: לא נמדד בפיילוט, אין סרטוני הדגמה')).toBeVisible()
    await expect(page.getByText(/ספירה בלבד: המחיקה לא הופעלה/)).toBeVisible()

    // No personal data of the seeded owner in the page source.
    const html = await page.content()
    for (const value of [ownerEmail, ANSWERS.name]) expect(html).not.toContain(value)

    await expectHealthyPage(page)

    // Every scrollable table region is reachable with Tab.
    const regions = await page.locator('[role="region"][tabindex="0"]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label')))
    expect(regions.length).toBeGreaterThanOrEqual(3)
    const reached = new Set<string>()
    for (let i = 0; i < 80 && reached.size < regions.length; i++) {
      await page.keyboard.press('Tab')
      const label = await page.evaluate(() => (document.activeElement?.getAttribute('role') === 'region' ? document.activeElement.getAttribute('aria-label') : null))
      if (label) reached.add(label)
    }
    expect([...reached].sort()).toEqual([...regions].sort())
  })

  test.describe.serial('alerts and housekeeping (shared operational state: desktop project only)', () => {
    test('empty states, then three generation failures and one cron run give one alert, one email and the run on the page', { tag: '@desktop-only' }, async ({ page, browser }) => {
      test.slow() // one full housekeeping run (eight daily snapshots) on the shared local database
      seedOps('reset-ops')
      await signedInAdmin(page)
      await page.goto('/admin/metrics')
      await expect(page.getByText('אין התראות פתוחות.')).toBeVisible()
      await expect(page.getByText('עדיין לא הייתה הרצת ניקוי.')).toBeVisible()
      await expect(page.getByText('ההרצה היומית האחרונה שהצליחה ישנה מ-36 שעות')).toBeVisible()
      await expect(page.getByText('עדיין אין תמונות יומיות. הראשונה נכתבת בהרצה היומית הבאה.')).toBeVisible()
      await expectHealthyPage(page)

      const ownerEmail = await practicedOwner(browser)
      // Taken before the failures exist: any evaluation after that (this run, or another spec's generation request) may send it.
      const mailsBefore = (await alertMails()).map((m) => m.name)
      seedOps('failed-jobs', ownerEmail)

      const unauthorized = await page.request.get('/api/cron/housekeeping')
      expect(unauthorized.status()).toBe(401)
      const run = await page.request.get('/api/cron/housekeeping', { headers: { authorization: `Bearer ${CRON_SECRET}` } })
      expect(run.status()).toBe(200)
      expect(run.headers()['cache-control']).toContain('no-store')
      expect(await run.json()).toMatchObject({ outcome: 'ok' })

      await page.reload()
      const alerts = page.getByRole('region', { name: 'טבלת ההתראות הפתוחות (אפשר לגלול הצידה)' })
      await expect(alerts.getByRole('row')).toHaveCount(2) // header + one alert
      await expect(alerts.getByRole('row', { name: /כשלי יצירת תוכניות/ })).toContainText('נשלחה')
      await expect(page.getByText(/הרצה אחרונה: .* \(ידנית\)/)).toBeVisible()
      await expect(page.getByRole('region', { name: 'טבלת שלבי ההרצה האחרונה (אפשר לגלול הצידה)' }).getByRole('row')).toHaveCount(11)
      await expect(page.getByText('ההרצה היומית האחרונה שהצליחה ישנה מ-36 שעות')).toHaveCount(0)
      await expect(page.getByRole('region', { name: 'טבלת התמונות היומיות (אפשר לגלול הצידה)' })).toBeVisible()
      await expectHealthyPage(page)

      const newMails = (await alertMails()).filter((m) => !mailsBefore.includes(m.name))
      expect(newMails).toHaveLength(1)
      expect(newMails[0]!.mail.subject).toBe('Woffiz: התראה תפעולית (generation-failures)')
      for (const value of [ownerEmail, ANSWERS.name, 'בדיקה']) expect(newMails[0]!.raw).not.toContain(value)
    })
  })
})
