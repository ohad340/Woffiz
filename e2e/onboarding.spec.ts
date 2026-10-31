import { expect, test } from '@playwright/test'

test('onboarding validates, keeps answers across reload and reaches the summary', async ({ page }) => {
  await page.goto('/onboarding')
  await page.getByRole('button', { name: 'המשך' }).click()
  await expect(page.getByText('כתבו את שם הגור')).toBeVisible()
  await expect(page.getByLabel('איך קוראים לגור?')).toHaveAttribute('aria-invalid', 'true')

  await page.getByLabel('איך קוראים לגור?').fill('בוני')
  await page.getByText('לא בטוחים', { exact: true }).click()
  await page.getByRole('button', { name: 'המשך' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('מה הוא כבר יודע')
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()

  await page.reload()
  await expect(page.getByLabel('איך קוראים לגור?')).toHaveValue('בוני')

  await page.getByRole('button', { name: 'המשך' }).click()
  await page.getByRole('button', { name: 'המשך' }).click()
  await page.getByText('נשיכות').click()
  await page.getByRole('button', { name: 'המשך' }).click()
  await page.getByText('כ-10 דקות ביום').click()
  await page.getByRole('button', { name: 'המשך' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('בדקו שהכול נכון')
  await expect(page.locator('dl')).toContainText('בוני')
  await expect(page.locator('dl')).toContainText('נשיכות')
  await page.getByRole('button', { name: 'עריכת מה קשה' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('מה קשה')
})
