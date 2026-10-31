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

/** Signs in through the real magic-link endpoints, reading the link from the local dev inbox. */
export async function signIn(page: Page, email: string) {
  const sent = await page.request.post('/api/auth/sign-in/magic-link', {
    data: { email, name: 'בדיקה', callbackURL: '/home' },
    headers: { origin: ORIGIN },
  })
  expect(sent.ok()).toBeTruthy()
  const inbox = await page.request.get(`/api/dev/inbox?email=${encodeURIComponent(email)}`)
  expect(inbox.ok()).toBeTruthy()
  const { url } = (await inbox.json()) as { url: string }
  await page.goto(url)
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
    await signIn(page, email)
    await provide({ email })
  },
  owner: async ({ page }, provide) => {
    const email = freshEmail()
    await signIn(page, email)
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
