import type { Page } from '@playwright/test'
import { expect, freshEmail, PASSWORD, test } from './fixtures'

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

test('registering with an existing email is refused with a clear message', async ({ page, owner }) => {
  await page.context().clearCookies()
  await page.goto('/')
  await page.getByRole('button', { name: 'הרשמה' }).click()
  await page.getByLabel('אימייל').fill(owner.email)
  await page.getByLabel('סיסמה').fill(PASSWORD)
  await page.getByRole('button', { name: 'יצירת חשבון' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'כבר קיים חשבון עם האימייל הזה' })).toBeVisible()
})

test('a signed-in owner without a plan is sent to onboarding', async ({ page, newOwner }) => {
  void newOwner
  await page.goto('/map')
  await expect(page).toHaveURL(/\/onboarding/)
})
