import { expect, freshEmail, test } from './fixtures'

test('signed-out visitors are sent to the welcome page from every protected screen', async ({ page }) => {
  for (const path of ['/home', '/map', '/review', '/puppy', '/onboarding', '/complete']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('button', { name: 'כניסה עם אימייל' })).toBeVisible()
  }
})

test('sign-in, onboarding, refresh and sign-out through the real screens', async ({ page }) => {
  const email = freshEmail()
  await page.goto('/')

  // Email validation before anything is sent.
  await page.getByRole('button', { name: 'כניסה עם אימייל' }).click()
  await expect(page.getByText('כתבו כתובת אימייל תקינה')).toBeVisible()

  await page.getByLabel('אימייל').fill(email)
  await page.getByRole('button', { name: 'כניסה עם אימייל' }).click()
  await expect(page.getByText('מצב פיתוח — לא נשלח מייל')).toBeVisible()
  await page.getByRole('link', { name: 'כניסה עם הקישור' }).click()

  // Onboarding: validation, save per step, restore after refresh.
  await expect(page).toHaveURL(/\/onboarding/)
  await page.getByRole('button', { name: 'המשך' }).click()
  await expect(page.getByText('כתבו את שם הגור')).toBeVisible()
  await page.getByLabel('איך קוראים לגור?').fill('בוני')
  await page.getByText('4–6 חודשים').click()
  await page.getByRole('button', { name: 'המשך' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('מה הוא כבר יודע')
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()

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
  await expect(page.getByText('0 מתוך 12 שלבים הושלמו')).toBeAttached()

  // Refresh keeps the session; signing out removes access.
  await page.reload()
  await expect(page).toHaveURL(/\/home/)
  await page.goto('/puppy')
  await expect(page.getByText(email)).toBeVisible()
  await page.getByRole('button', { name: 'התנתקות' }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/home')
  await expect(page).toHaveURL(/\/$/)
})

test('a signed-in owner without a plan is sent to onboarding', async ({ page, newOwner }) => {
  void newOwner
  await page.goto('/map')
  await expect(page).toHaveURL(/\/onboarding/)
})
