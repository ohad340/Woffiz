import AxeBuilder from '@axe-core/playwright'
import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test as base, type Page } from '@playwright/test'

export const ORIGIN = 'http://localhost:3100'

export const ANSWERS = {
  name: 'לוקה',
  age: '10-16w',
  skills: ['name'],
  // None listed, so the local generator keeps the fixture order that these specs assert on.
  difficulties: [],
  limitations: '',
  time: '10',
}

export const freshEmail = () => `e2e-${randomUUID()}@example.test`

export const PASSWORD = 'e2e-password-123'

/** The app server writes mail here instead of sending it (EMAIL_TRANSPORT=outbox, local only; see playwright.config.ts). */
export const OUTBOX = path.resolve('e2e/.outbox')

type OutboxEmail = { kind: 'verify-email' | 'reset-password'; to: string; url: string; sentAt: string }

/** The link of the newest email of this kind to this address, waiting for it to arrive. */
export async function emailLink(kind: OutboxEmail['kind'], to: string): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const files = await readdir(OUTBOX).catch(() => [] as string[])
    const messages = await Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(OUTBOX, f), 'utf8')) as OutboxEmail))
    const match = messages.filter((m) => m.kind === kind && m.to === to.toLowerCase()).sort((a, b) => a.sentAt.localeCompare(b.sentAt)).at(-1)
    if (match) return match.url
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`No ${kind} email for ${to}`)
}

/** Registers through the real sign-up endpoint WITHOUT verifying: no session yet. */
export async function registerUnverified(page: Page, email: string) {
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { email, password: PASSWORD, name: 'בדיקה', callbackURL: '/verify-email?verified=1' },
    headers: { origin: ORIGIN },
  })
  expect(response.ok()).toBeTruthy()
}

/** Registers and opens the emailed verification link, which signs this context in. */
export async function register(page: Page, email: string) {
  await registerUnverified(page, email)
  const verified = await page.request.get(await emailLink('verify-email', email))
  expect(verified.ok(), `verification link answered ${verified.status()} at ${new URL(verified.url()).pathname}`).toBeTruthy()
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

/** Hebrew RTL, a heading, no horizontal overflow and no serious or critical axe violations. */
export async function expectHealthyPage(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('lang', 'he')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('h1').first()).toBeAttached()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([])
}

/** Id of the current level, read from the home screen's main action. */
export async function currentLevelId(page: Page) {
  await page.goto('/home')
  const href = await page.getByRole('link', { name: 'המשך לאימון' }).getAttribute('href')
  return href!.split('/').pop()!
}
