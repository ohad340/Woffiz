import { currentLevelId, expect, test } from './fixtures'

test('home shows real progress and its main action opens the current exercise', async ({ page, owner }) => {
  void owner
  await page.goto('/home')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('איזה כיף שחזרתם!')
  await expect(page.getByText('0 מתוך 12 שלבים הושלמו')).toBeAttached()
  await expect(page.getByRole('link', { name: 'בית' })).toHaveAttribute('aria-current', 'page')
  // No reward economy: the reference art's coins and prizes are intentionally absent.
  await expect(page.getByText(/מטבעות|פרסים/)).toHaveCount(0)

  const levelId = await currentLevelId(page)
  await page.getByRole('link', { name: 'המשך לאימון' }).click()
  await expect(page).toHaveURL(new RegExp(`/exercise/${levelId}$`))
  await expect(page.getByRole('heading', { level: 1 })).toContainText('מגיב לשם')
})

test('decorative art is hidden from assistive technology', async ({ page, owner }) => {
  void owner
  await page.goto('/home')
  for (const svg of await page.locator('main svg').all()) await expect(svg).toHaveAttribute('aria-hidden', 'true')
  for (const img of await page.locator('main img').all()) await expect(img).toHaveAttribute('aria-hidden', 'true')
})
