import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { currentLevelId, expect, test } from './fixtures'

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

test('welcome page is Hebrew RTL, has no overflow and no serious a11y violations', async ({ page }) => {
  await page.goto('/')
  await expectHealthyPage(page)
  await expect(page.getByRole('note')).toContainText('תצוגת פיתוח')
})

const OWNER_ROUTES = [
  '/home',
  '/map',
  '/map?state=loading',
  '/map?state=empty',
  '/map?state=error',
  '/map?state=offline',
  '/review',
  '/review?state=empty',
  '/puppy',
]

for (const route of OWNER_ROUTES) {
  test(`${route} is Hebrew RTL, has no horizontal overflow and no serious a11y violations`, async ({ page, owner }) => {
    void owner
    await page.goto(route)
    await expectHealthyPage(page)
    await expect(page.getByRole('note')).toContainText('תצוגת פיתוח')
  })
}

test('the exercise screen and its report sheet are accessible', async ({ page, owner }) => {
  void owner
  await page.goto(`/exercise/${await currentLevelId(page)}`)
  await expectHealthyPage(page)
  await page.getByRole('button', { name: 'תרגלנו' }).click()
  await page.getByText('הצליח לבד').click()
  await expectHealthyPage(page)
})

for (const route of ['/onboarding', '/onboarding?state=generating', '/onboarding?state=generation-error']) {
  test(`${route} is Hebrew RTL with no overflow or serious a11y violations`, async ({ page, newOwner }) => {
    void newOwner
    await page.goto(route)
    await expectHealthyPage(page)
  })
}

test('PWA manifest is Hebrew RTL and its icons are served', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json()
  expect(manifest.lang).toBe('he')
  expect(manifest.dir).toBe('rtl')
  expect(manifest.name).toBe('Woffiz')
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('image/png')
  }
})

test('private pages are never cached publicly', async ({ page, owner }) => {
  void owner
  const response = await page.goto('/home')
  expect(response?.headers()['cache-control'] ?? '').not.toMatch(/public|s-maxage/)
})
