import AxeBuilder from '@axe-core/playwright'
import { execFileSync } from 'node:child_process'
import type { Page } from '@playwright/test'
import { ORIGIN, expect, freshEmail, register, test } from './fixtures'

// Everything here runs on SYNTHETIC FIXTURE media against the e2e database. The real technique definitions stay DRAFT,
// so even a fully reviewed fixture can never be published: the last step of the flow proves that gate in the browser.

/** Makes the account an ADMIN and stores a synthetic fixture bundle as a draft (see e2e/seed-media.ts). */
function seedDraft(email: string, unsuspend = false): string {
  const database = process.env.TEST_DATABASE_URL!
  const output = execFileSync('npx', ['tsx', 'e2e/seed-media.ts', email, String(1 + Math.floor(Math.random() * 900)), ...(unsuspend ? ['--unsuspend'] : [])], {
    encoding: 'utf8',
    shell: true,
    env: {
      ...process.env,
      DATABASE_URL: database,
      ...(process.env.TEST_DB_KIND === 'postgres' ? {} : { DATABASE_POOL_MAX: '1' }),
      APP_ENV: 'local',
      BETTER_AUTH_URL: ORIGIN,
      BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e-secret',
      MEDIA_LOCAL_DIR: 'e2e/.media',
    },
  })
  const line = output.trim().split('\n').filter((l) => l.startsWith('{')).at(-1)
  return (JSON.parse(line!) as { versionId: string }).versionId
}

async function expectHealthyPage(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('lang', 'he')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('h1').first()).toBeAttached()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([])
}

test.describe('admin media pages are invisible to everyone but an ADMIN', () => {
  test('signed-out visitors and owners get the 404 page, and admin endpoints answer 404 to an owner', async ({ page }) => {
    const signedOut = await page.goto('/admin/media')
    expect(signedOut?.status()).toBe(404)

    await register(page, freshEmail())
    const owner = await page.goto('/admin/media')
    expect(owner?.status()).toBe(404)
    const detail = await page.goto('/admin/media/00000000-0000-4000-8000-000000000000')
    expect(detail?.status()).toBe(404)

    const suspend = await page.request.post('/api/admin/media/techniques/mouthing-redirect-toy/1/suspend', { data: { note: 'owner trying' }, headers: { origin: ORIGIN } })
    expect(suspend.status()).toBe(404)
    const publish = await page.request.post('/api/admin/media/versions/00000000-0000-4000-8000-000000000000/publish', { data: {}, headers: { origin: ORIGIN } })
    expect(publish.status()).toBe(404)
    const captions = await page.request.get('/api/admin/media/versions/00000000-0000-4000-8000-000000000000/captions')
    expect(captions.status()).toBe(404)
  })
})

test.describe('review, publication gate and withdrawal in the browser', () => {
  test('lists the fixture, records both reviews, marks it reviewed, is refused publication while the technique is draft, and withdraws it', async ({ page }) => {
    const email = freshEmail()
    await register(page, email)
    const versionId = seedDraft(email)

    await page.goto('/admin/media')
    await expect(page.getByRole('heading', { level: 1, name: 'ניהול סרטוני הדגמה' })).toBeVisible()
    await expect(page.getByText('הגדרה בטיוטה: ברירות המחדל לא אושרו').first()).toBeVisible()
    await expectHealthyPage(page)

    await page.goto(`/admin/media/${versionId}`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('mouthing-redirect-toy@1')
    await expect(page.getByText('פיקסצ׳ר בדיקה סינתטי', { exact: false })).toBeVisible()
    await expect(page.getByText('no TECHNICAL review yet')).toBeVisible()
    await expect(page.getByText('הבדיקות האוטומטיות מוכיחות מבנה')).toBeVisible()
    // The sources are described for what they are, not as a full verification.
    await expect(page.getByText('זו לא קריאה מלאה של המקור').first()).toBeVisible()
    await expectHealthyPage(page)

    // Approving needs every item ticked, so the submit button stays disabled until then.
    const technical = page.getByRole('form', { name: 'סקירה טכנית' })
    await expect(technical.getByRole('button', { name: 'רישום הסקירה' })).toBeDisabled()
    for (const box of await technical.getByRole('checkbox').all()) await box.check()
    await technical.getByRole('button', { name: 'רישום הסקירה' }).click()
    await expect(technical.getByRole('status')).toHaveText('הסקירה נרשמה.')

    const content = page.getByRole('form', { name: 'סקירת תוכן' })
    for (const box of await content.getByRole('checkbox').all()) await box.check()
    await content.getByRole('button', { name: 'רישום הסקירה' }).click()
    await expect(content.getByRole('status')).toHaveText('הסקירה נרשמה.')

    await page.reload()
    await expect(page.getByText('no TECHNICAL review yet')).toHaveCount(0)
    await expect(page.getByText('no CONTENT review yet')).toHaveCount(0)

    await page.getByRole('button', { name: 'סימון כנסקר', exact: true }).click()
    await page.getByRole('button', { name: 'כן, לסמן כנסקר' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'הגרסה סומנה כנסקרת.' })).toBeVisible()
    await expect(page.getByText('נסקר', { exact: true }).first()).toBeVisible()

    // The real technique definition is a draft, so even a fully reviewed fixture cannot be published.
    await page.getByRole('button', { name: 'פרסום', exact: true }).click()
    await page.getByRole('button', { name: 'כן, לפרסם' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'still a draft' })).toBeVisible()
    await expect(page.getByText('הגרסה פורסמה.')).toHaveCount(0)

    await page.getByLabel('הערה (חובה)', { exact: true }).fill('בדיקת הסרה בדפדפן')
    await page.getByRole('button', { name: 'הסרה', exact: true }).click()
    await page.getByRole('button', { name: 'כן, להסיר' }).click()
    // The page re-renders into the withdrawn state (its actions are replaced), so assert the resulting state, not a transient message.
    await expect(page.getByText('גרסה שהוסרה לא חוזרת')).toBeVisible()
    await expect(page.getByText('הוסר', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('תקלה טכנית', { exact: true }).first()).toBeVisible()
    await expectHealthyPage(page)
  })

  test('suspends and lifts a technique from the list', async ({ page }, testInfo) => {
    // Suspension is technique-wide shared state: exercise it in one viewport only so parallel projects do not interfere.
    test.skip(testInfo.project.name !== 'desktop-1280', 'technique-wide state is exercised once')
    const email = freshEmail()
    await register(page, email)
    seedDraft(email, true)

    await page.goto('/admin/media')
    const card = page.locator('section').filter({ has: page.getByRole('heading', { name: /mouthing-redirect-toy@1/ }) })
    await card.locator('summary').click()
    await card.getByLabel('הערה להשעיה (חובה)').fill('בדיקת השעיה בדפדפן')
    await card.getByRole('button', { name: 'השעיית הטכניקה', exact: true }).click()
    await card.getByRole('button', { name: 'כן, להשעות' }).click()
    await expect(card.getByRole('status').filter({ hasText: 'הטכניקה הושעתה.' })).toBeVisible()
    await expect(card.getByText('מושעית', { exact: true })).toBeVisible()

    await card.getByLabel('הערה להסרת ההשעיה (חובה)').fill('הבדיקה הסתיימה')
    await card.getByRole('button', { name: 'הסרת השעיה', exact: true }).click()
    await card.getByRole('button', { name: 'כן, להסיר' }).click()
    await expect(card.getByRole('status').filter({ hasText: 'ההשעיה הוסרה.' })).toBeVisible()
    await expect(card.getByText('מושעית', { exact: true })).toHaveCount(0)
  })
})
