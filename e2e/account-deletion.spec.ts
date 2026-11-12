import { Client } from 'pg'
import type { Page } from '@playwright/test'
import { ORIGIN, PASSWORD, expect, expectHealthyPage, test } from './fixtures'

// Account deletion (Phase 4, slice 4; docs/DECISIONS.md P4-4). Disposable accounts from the `owner` fixture only, on the
// local test database. Runs against the local production build in the three viewport projects.

const OPENER = 'מחיקת החשבון'
const DELETE = 'מחיקה לצמיתות'
const WRONG = 'הסיסמה שגויה. לא נמחק דבר.'

const dialogOf = (page: Page) => page.getByRole('dialog', { name: OPENER })

async function openDialog(page: Page) {
  await page.goto('/puppy')
  const opener = page.getByRole('button', { name: OPENER })
  await opener.click()
  await expect(dialogOf(page)).toBeVisible()
  return opener
}

test('the dialog opens with focus on Cancel, states the scope honestly, closes with Escape and returns focus', async ({ page, owner }) => {
  void owner
  const opener = await openDialog(page)
  const dialog = dialogOf(page)
  await expect(dialog.getByRole('button', { name: 'ביטול' })).toBeFocused()
  await expect(dialog).toContainText('מה יימחק עכשיו, ולא ניתן לשחזר:')
  await expect(dialog).toContainText('דיווחי התרגול ואישורי השליטה')
  await expect(dialog).toContainText('מה נשאר:')
  await expect(dialog).toContainText('סרטוני ההדגמה המשותפים. הם אף פעם לא הכילו מידע שלכם.')
  await expect(dialog).toContainText('כדאי לדעת:')
  await expect(dialog).toContainText('אי אפשר לשחזר את החשבון.')
  await expect(dialog).not.toContainText('רשומות הבדיקה והפרסום') // the audit line is only for a former administrator
  // The scope statement promises no removal time and names no provider.
  await expect(dialog).not.toContainText(/\d+\s*(ימים|שעות|יום|שבועות)/)
  await expect(dialog).not.toContainText(/Supabase|Vercel|Resend|Anthropic|Gemini|גוגל/i)
  await expect(dialog.getByRole('button', { name: DELETE })).toBeDisabled() // nothing to send yet
  await expectHealthyPage(page) // Hebrew RTL, no overflow (360 px project included), axe clean with the dialog open

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
})

test('reduced motion: the dialog opens with no animation', async ({ page, owner }) => {
  void owner
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openDialog(page)
  const duration = await dialogOf(page).evaluate((el) => getComputedStyle(el).animationDuration)
  expect(Math.max(...duration.split(',').map((part) => parseFloat(part)))).toBeLessThanOrEqual(0.00001)
})

test('cancelling deletes nothing and forgets the typed password', async ({ page, owner }) => {
  void owner
  await openDialog(page)
  await dialogOf(page).getByLabel('הסיסמה הנוכחית').fill(PASSWORD)
  await dialogOf(page).getByRole('button', { name: 'ביטול' }).click()
  await expect(dialogOf(page)).toBeHidden()

  await page.getByRole('button', { name: OPENER }).click()
  await expect(dialogOf(page).getByLabel('הסיסמה הנוכחית')).toHaveValue('') // cleared when the dialog closed
  await page.keyboard.press('Escape')
  await page.goto('/home')
  expect(new URL(page.url()).pathname).toBe('/home') // still signed in, account intact
})

test('a wrong password shows an inline error, keeps the dialog open, refocuses the field and deletes nothing', async ({ page, owner }) => {
  void owner
  await openDialog(page)
  const field = dialogOf(page).getByLabel('הסיסמה הנוכחית')
  await field.fill('not the password')
  await page.keyboard.press('Enter') // submitted from the keyboard
  await expect(dialogOf(page).getByText(WRONG)).toBeVisible()
  await expect(dialogOf(page)).toBeVisible()
  await expect(field).toBeFocused()
  await expect(field).toHaveValue('')
  await expect(field).toHaveAttribute('aria-invalid', 'true')
  await expectHealthyPage(page)

  await page.keyboard.press('Escape')
  await page.goto('/home')
  expect(new URL(page.url()).pathname).toBe('/home')
})

test('a successful deletion signs out every device and the old credentials stop working', async ({ page, owner, browser }) => {
  // A second device: its own session for the same account.
  const other = await browser.newPage()
  const signedIn = await other.request.post('/api/auth/sign-in/email', { data: { email: owner.email, password: PASSWORD }, headers: { origin: ORIGIN } })
  expect(signedIn.ok()).toBeTruthy()
  await other.goto('/home')
  expect(new URL(other.url()).pathname).toBe('/home')

  await openDialog(page)
  await dialogOf(page).getByLabel('הסיסמה הנוכחית').fill(PASSWORD)
  await dialogOf(page).getByRole('button', { name: DELETE }).click()

  await expect(page).toHaveURL(/\/\?deleted=1$/)
  await expect(page.getByRole('status').filter({ hasText: 'החשבון נמחק.' })).toBeVisible()
  await expect(page.locator('h1').first()).toBeAttached()
  const cookies = await page.context().cookies()
  expect(cookies.filter((cookie) => cookie.name.includes('session_token') && cookie.value !== '')).toEqual([])

  await page.goto('/home')
  await expect.poll(() => new URL(page.url()).pathname).toBe('/')
  // The second device is signed out at its next navigation.
  await other.goto('/home')
  await expect.poll(() => new URL(other.url()).pathname).toBe('/')
  await other.close()

  const again = await page.request.post('/api/auth/sign-in/email', { data: { email: owner.email, password: PASSWORD }, headers: { origin: ORIGIN } })
  expect(again.status()).toBe(401)
})

test('an administrator account gets the explanation instead of the form', async ({ page, owner }) => {
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL })
  await client.connect()
  try {
    await client.query('UPDATE "user" SET "role" = $1 WHERE "email" = $2', ['ADMIN', owner.email]) // the disposable account only
  } finally {
    await client.end()
  }
  await openDialog(page)
  const dialog = dialogOf(page)
  await expect(dialog).toContainText('זהו חשבון מנהל. כדי למחוק אותו צריך קודם לבטל את הרשאת המנהל')
  await expect(dialog.getByLabel('הסיסמה הנוכחית')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: DELETE })).toHaveCount(0)
  await expect(dialog.locator('footer').getByRole('button', { name: 'סגירה' })).toBeFocused() // the header close button has the same name
  await expectHealthyPage(page)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
