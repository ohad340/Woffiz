import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { ANSWERS, ORIGIN, expect, test } from './fixtures'

// The server uses the labeled local generator in e2e (AI_PROVIDER=fake, see playwright.config.ts). Failure
// states are driven by intercepting the browser's request, so the screens are tested exactly as the server answers.

async function atSummary(page: Page) {
  const draft = await page.request.post('/api/onboarding/draft', { data: { step: 4, answers: ANSWERS }, headers: { origin: ORIGIN } })
  expect(draft.ok()).toBeTruthy()
  await page.goto('/onboarding')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('בדקו שהכול נכון')
}

const submit = (page: Page) => page.getByRole('button', { name: 'מכינים את המסלול' }).click()

async function expectHealthy(page: Page) {
  // Right after a router refresh the document can be between two heads for a moment; axe must see the settled page.
  await expect(page).toHaveTitle(/.+/)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([])
}

test('shows the generating screen while the plan is prepared, then the plan', async ({ page, newOwner }) => {
  void newOwner
  await atSummary(page)
  await page.route('**/api/onboarding/complete', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200))
    await route.continue()
  })
  await submit(page)
  await expect(page.getByRole('heading', { level: 1, name: 'מכינים את תוכנית האימון' })).toBeFocused()
  await expectHealthy(page)
  await expect(page).toHaveURL(/\/home/, { timeout: 20_000 })
  await expect(page.getByText('0 מתוך 12 שלבים הושלמו')).toBeAttached()
})

test('a failed generation keeps the answers and offers a retry that works', async ({ page, newOwner }) => {
  void newOwner
  await atSummary(page)
  let calls = 0
  await page.route('**/api/onboarding/complete', async (route) => {
    calls += 1
    if (calls === 1) {
      return route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'GENERATION_FAILED', message: 'לא הצלחנו להכין את התוכנית הפעם. מה ששמרתם נשאר כפי שהוא. נסו שוב.' }),
      })
    }
    return route.continue()
  })
  await submit(page)
  await expect(page.getByRole('heading', { level: 1, name: 'לא הצלחנו להכין את התוכנית' })).toBeVisible()
  await expectHealthy(page)
  await page.getByRole('button', { name: 'ניסיון חוזר' }).click()
  await expect(page).toHaveURL(/\/home/, { timeout: 20_000 })
  expect(calls).toBe(2)
})

test('the daily limit is explained honestly and offers no retry', async ({ page, newOwner }) => {
  void newOwner
  await atSummary(page)
  await page.route('**/api/onboarding/complete', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'AI_QUOTA_EXCEEDED', message: 'הגעתם למגבלת ההתאמות להיום. נסו שוב מחר. מה שכבר נשמר לא ישתנה.' }),
    }),
  )
  await submit(page)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('הגעתם למגבלה להיום')
  await expect(page.getByRole('button', { name: 'ניסיון חוזר' })).toHaveCount(0)
  await expectHealthy(page)
  await page.getByRole('button', { name: 'חזרה לתשובות' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('בדקו שהכול נכון')
})

test('a plan that is still being prepared is awaited, not duplicated', async ({ page, newOwner }) => {
  void newOwner
  await atSummary(page)
  let calls = 0
  await page.route('**/api/onboarding/complete', async (route) => {
    calls += 1
    if (calls === 1) {
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'GENERATION_PENDING', message: 'אנחנו עדיין מכינים את התוכנית. המתינו רגע.' }),
      })
    }
    return route.continue()
  })
  await submit(page)
  await expect(page).toHaveURL(/\/home/, { timeout: 15_000 })
  expect(calls).toBe(2)
})

test('the exercise offers an adaptation only after repeated struggles, and the owner decides mastery', async ({ page, owner }) => {
  void owner
  await page.goto('/home')
  const href = await page.getByRole('link', { name: 'המשך לאימון' }).getAttribute('href')
  await page.goto(href!)
  await expect(page.getByRole('button', { name: 'להתאים את התרגיל' })).toHaveCount(0)

  for (let i = 0; i < 2; i++) {
    const levelId = href!.split('/').pop()!
    const response = await page.request.post('/api/attempts', {
      data: { levelId, outcome: 'STRUGGLING' },
      headers: { origin: ORIGIN, 'idempotency-key': `e2e-struggle-${Date.now()}-${i}-padding` },
    })
    expect(response.ok()).toBeTruthy()
  }
  await page.reload()
  const before = await page.getByRole('heading', { level: 1 }).textContent()
  await page.getByRole('button', { name: 'להתאים את התרגיל' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'התרגיל הותאם' }).first()).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(before ?? '')
  await expect(page.getByRole('button', { name: 'להתאים את התרגיל' })).toHaveCount(0) // new version, no struggles yet
  await expectHealthy(page)
})

test('the owner can ask for the rest of the path to be rebuilt; completed progress is not touched', async ({ page, owner }) => {
  void owner
  await page.goto('/puppy')
  await page.getByRole('button', { name: 'לעדכן את המשך המסלול' }).click()
  await expect(page.getByText('המשך המסלול עודכן.')).toBeVisible()
  await page.goto('/home')
  await expect(page.getByText('0 מתוך 12 שלבים הושלמו')).toBeAttached()
  await page.goto('/puppy')
  await expectHealthy(page)
})
