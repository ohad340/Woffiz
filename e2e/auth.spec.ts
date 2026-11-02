import type { Page } from '@playwright/test'
import { emailLink, expect, freshEmail, PASSWORD, registerUnverified, test } from './fixtures'

async function completeOnboarding(page: Page) {
  await page.getByRole('button', { name: 'המשך' }).click()
  await expect(page.getByText('כתבו את שם הגור')).toBeVisible()
  await page.getByLabel('איך קוראים לגור?').fill('בוני')
  await page.getByText('4–6 חודשים').click()
  await page.getByRole('button', { name: 'המשך' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('מה הוא כבר יודע')
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()

  // Answers are saved on the server: a refresh restores the step and the earlier answers.
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('מה הוא כבר יודע')
  await page.getByRole('button', { name: 'חזרה' }).click()
  await expect(page.getByLabel('איך קוראים לגור?')).toHaveValue('בוני')
  await page.getByRole('button', { name: 'המשך' }).click()

  await page.getByRole('button', { name: 'המשך' }).click()
  await page.getByText('נשיכות').click()
  await page.getByRole('button', { name: 'המשך' }).click()
  await page.getByText('כ-10 דקות ביום').click()
  await page.getByRole('button', { name: 'המשך' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('בדקו שהכול נכון')
  await expect(page.locator('dl')).toContainText('בוני')
  await page.getByRole('button', { name: 'מכינים את המסלול' }).click()
  await expect(page).toHaveURL(/\/home/)
}

test('signed-out visitors are sent to the welcome page from every protected screen', async ({ page }) => {
  for (const path of ['/home', '/map', '/review', '/puppy', '/onboarding', '/complete']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('button', { name: 'כניסה', exact: true }).last()).toBeVisible()
  }
})

test('register, onboard, refresh, sign out and sign back in through the real screens', async ({ page }) => {
  const email = freshEmail()
  await page.goto('/')

  // Registration validation before anything is sent.
  await page.getByRole('button', { name: 'הרשמה' }).click()
  await page.getByRole('button', { name: 'יצירת חשבון' }).click()
  await expect(page.getByText('כתבו כתובת אימייל תקינה')).toBeVisible()
  await expect(page.getByText('כתבו סיסמה')).toBeVisible()
  await page.getByLabel('אימייל').fill(email)
  await page.getByLabel('סיסמה').fill('short')
  await page.getByRole('button', { name: 'יצירת חשבון' }).click()
  await expect(page.getByText('הסיסמה צריכה להיות לפחות 8 תווים')).toBeVisible()

  await page.getByLabel('סיסמה').fill(PASSWORD)
  await page.getByRole('button', { name: 'יצירת חשבון' }).click()

  // No session until the address is verified through the emailed link.
  await expect(page).toHaveURL(/\/verify-email$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('בדקו את תיבת הדואר')
  await page.goto('/home')
  await expect(page).toHaveURL(/\/$/)

  await page.goto(await emailLink('verify-email', email))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('האימייל אומת')
  await page.getByRole('link', { name: 'מתחילים להכיר את הגור' }).click()
  await expect(page).toHaveURL(/\/onboarding/)

  await completeOnboarding(page)
  await expect(page.getByText('0 מתוך 12 שלבים הושלמו')).toBeAttached()

  // A refresh keeps the session.
  await page.reload()
  await expect(page).toHaveURL(/\/home/)
  await page.goto('/puppy')
  await expect(page.getByText(email)).toBeVisible()

  // Sign out removes access; the wrong password is refused; the right one returns to the plan.
  await page.getByRole('button', { name: 'התנתקות' }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/home')
  await expect(page).toHaveURL(/\/$/)

  await page.getByLabel('אימייל').fill(email)
  await page.getByLabel('סיסמה').fill('not the password')
  await page.getByRole('button', { name: 'כניסה', exact: true }).last().click()
  await expect(page.getByRole('alert').filter({ hasText: 'האימייל או הסיסמה לא נכונים.' })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)

  await page.getByLabel('סיסמה').fill(PASSWORD)
  await page.getByRole('button', { name: 'כניסה', exact: true }).last().click()
  await expect(page).toHaveURL(/\/home/)
  await expect(page.getByText('0 מתוך 12 שלבים הושלמו')).toBeAttached()
})

test('registering with an existing email looks like a new registration and signs nobody in', async ({ page, owner }) => {
  await page.context().clearCookies()
  await page.goto('/')
  await page.getByRole('button', { name: 'הרשמה' }).click()
  await page.getByLabel('אימייל').fill(owner.email)
  await page.getByLabel('סיסמה').fill('a different password')
  await page.getByRole('button', { name: 'יצירת חשבון' }).click()
  await expect(page).toHaveURL(/\/verify-email$/)
  await page.goto('/home')
  await expect(page).toHaveURL(/\/$/)
})

test('an unverified owner cannot sign in and can ask for a new link', async ({ page }) => {
  const email = freshEmail()
  await registerUnverified(page, email)
  await page.goto('/')
  await page.getByLabel('אימייל').fill(email)
  await page.getByLabel('סיסמה').fill(PASSWORD)
  await page.getByRole('button', { name: 'כניסה', exact: true }).last().click()
  await expect(page.getByRole('alert').filter({ hasText: 'צריך לאמת את כתובת האימייל' })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)

  await page.getByRole('link', { name: 'לשליחת קישור חדש' }).click()
  await expect(page).toHaveURL(/\/verify-email$/)
  await expect(page.getByLabel('אימייל')).toHaveValue(email)
  await page.getByRole('button', { name: 'שליחת קישור חדש' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'אמור להגיע אליה קישור חדש' })).toBeVisible()
})

test('an expired or broken verification link explains what to do', async ({ page }) => {
  await page.goto('/verify-email?verified=1&error=TOKEN_EXPIRED')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('פג תוקף הקישור')
  await expect(page.getByRole('button', { name: 'שליחת קישור חדש' })).toBeVisible()
  await page.goto('/api/auth/verify-email?token=not-a-token&callbackURL=%2Fverify-email%3Fverified%3D1')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('הקישור לא תקין')
})

test('forgot password: reset once through the emailed link, then sign in with the new password', async ({ page, owner }) => {
  const NEW_PASSWORD = 'e2e-new-password-456'
  await page.context().clearCookies()
  await page.goto('/')
  await page.getByRole('link', { name: 'שכחתי סיסמה' }).click()
  await expect(page).toHaveURL(/\/forgot-password$/)
  await page.getByLabel('אימייל').fill(owner.email)
  await page.getByRole('button', { name: 'שליחת קישור לאיפוס' }).click()
  await expect(page.getByRole('status')).toContainText('אם יש חשבון לכתובת הזו')

  const link = await emailLink('reset-password', owner.email)
  await page.goto(link)
  await expect(page).toHaveURL(/\/reset-password\?token=/)
  await page.getByLabel('סיסמה חדשה', { exact: true }).fill(NEW_PASSWORD)
  await page.getByLabel('אימות הסיסמה החדשה').fill('something else')
  await page.getByRole('button', { name: 'שמירת הסיסמה החדשה' }).click()
  await expect(page.getByText('הסיסמאות לא זהות')).toBeVisible()
  await page.getByLabel('אימות הסיסמה החדשה').fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'שמירת הסיסמה החדשה' }).click()
  // Hashing and revoking sessions on the single local PGlite connection can be slow under parallel load.
  await expect(page.getByRole('status')).toContainText('הסיסמה עודכנה', { timeout: 15_000 })

  // The link is single-use.
  await page.goto(link)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('הקישור לא תקף')

  await page.goto('/')
  await page.getByLabel('אימייל').fill(owner.email)
  await page.getByLabel('סיסמה').fill(PASSWORD)
  await page.getByRole('button', { name: 'כניסה', exact: true }).last().click()
  await expect(page.getByRole('alert').filter({ hasText: 'האימייל או הסיסמה לא נכונים.' })).toBeVisible()
  await page.getByLabel('סיסמה').fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'כניסה', exact: true }).last().click()
  await expect(page).toHaveURL(/\/home/)
})

test('a signed-in owner without a plan is sent to onboarding', async ({ page, newOwner }) => {
  void newOwner
  await page.goto('/map')
  await expect(page).toHaveURL(/\/onboarding/)
})
