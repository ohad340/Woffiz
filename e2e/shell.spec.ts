import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const ROUTES = [
  '/',
  '/onboarding',
  '/onboarding?state=generating',
  '/onboarding?state=generation-error',
  '/map',
  '/map?state=loading',
  '/map?state=empty',
  '/map?state=error',
  '/map?state=offline',
  '/review',
  '/review?state=empty',
  '/puppy',
]

for (const route of ROUTES) {
  test(`${route} is Hebrew RTL, has no horizontal overflow and no serious a11y violations`, async ({ page }) => {
    await page.goto(route)
    await expect(page.locator('html')).toHaveAttribute('lang', 'he')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('h1').first()).toBeAttached()

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)

    const results = await new AxeBuilder({ page }).analyze()
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([])
  })
}

test('every development screen is labeled as fixture data', async ({ page }) => {
  for (const route of ['/', '/onboarding', '/map', '/review', '/puppy']) {
    await page.goto(route)
    await expect(page.getByRole('note')).toContainText('תצוגת פיתוח')
  }
})

test('PWA manifest is Hebrew RTL and icons are served', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json()
  expect(manifest.lang).toBe('he')
  expect(manifest.dir).toBe('rtl')
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('image/png')
  }
})
