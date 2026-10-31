import { expect, test } from '@playwright/test'

test('home shows real path progress and its CTA opens the current level', async ({ page }) => {
  await page.goto('/home')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('איזה כיף שחזרתם!')
  await expect(page.getByText('5 מתוך 12 שלבים הושלמו')).toBeVisible()
  await expect(page.getByRole('link', { name: 'בית' })).toHaveAttribute('aria-current', 'page')

  // No reward economy: the reference art's coins and prizes are intentionally absent.
  await expect(page.getByText(/מטבעות|פרסים/)).toHaveCount(0)

  await page.getByRole('link', { name: 'המשך לאימון' }).click()
  await expect(page).toHaveURL(/\/map\?open=current/)
  await expect(page.getByRole('dialog')).toContainText('רגע לבד בחדר')
})

test('mascot art is decorative and hidden from assistive technology', async ({ page }) => {
  await page.goto('/home')
  const svgs = page.locator('main svg')
  for (const svg of await svgs.all()) await expect(svg).toHaveAttribute('aria-hidden', 'true')
})
