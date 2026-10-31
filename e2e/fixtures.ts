import { randomUUID } from 'node:crypto'
import { expect, test as base, type Page } from '@playwright/test'

export const ORIGIN = 'http://localhost:3100'

export const ANSWERS = {
  name: 'לוקה',
  age: '10-16w',
  skills: ['name'],
  difficulties: ['biting'],
  limitations: '',
  time: '10',
}

export const freshEmail = () => `e2e-${randomUUID()}@example.test`

export const PASSWORD = 'e2e-password-123'

/** Registers through the real sign-up endpoint; the response sets the session cookie in this context. */
export async function register(page: Page, email: string) {
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { email, password: PASSWORD, name: 'בדיקה' },
    headers: { origin: ORIGIN },
  })
  expect(response.ok()).toBeTruthy()
}

export async function onboardViaApi(page: Page) {
  const draft = await page.request.post('/api/onboarding/draft', { data: { step: 4, answers: ANSWERS }, headers: { origin: ORIGIN } })
  expect(draft.ok()).toBeTruthy()
  const done = await page.request.post('/api/onboarding/complete', { data: {}, headers: { origin: ORIGIN } })
  expect(done.ok()).toBeTruthy()
}

type Fixtures = {
  /** Signed in, no puppy yet. */
  newOwner: { email: string }
  /** Signed in with a completed onboarding and a fresh plan. */
  owner: { email: string }
}

export const test = base.extend<Fixtures>({
  newOwner: async ({ page }, provide) => {
    const email = freshEmail()
    await register(page, email)
    await provide({ email })
  },
  owner: async ({ page }, provide) => {
    const email = freshEmail()
    await register(page, email)
    await onboardViaApi(page)
    await page.goto('/home')
    await provide({ email })
  },
})

export { expect }

/** Id of the current level, read from the home screen's main action. */
export async function currentLevelId(page: Page) {
  await page.goto('/home')
  const href = await page.getByRole('link', { name: 'המשך לאימון' }).getAttribute('href')
  return href!.split('/').pop()!
}
