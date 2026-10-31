import type { Page } from '@playwright/test'
import { currentLevelId, expect, freshEmail, onboardViaApi, register, test } from './fixtures'

const currentNode = (page: Page) => page.locator('button[aria-current="step"]')

test('practice reports never unlock; explicit mastery unlocks exactly one level; review does not advance', async ({ page, owner }) => {
  void owner
  test.slow() // a long multi-screen journey; the local PGlite database is slower than PostgreSQL
  const level1 = await currentLevelId(page)

  // Exercise screen content, with an honest video placeholder.
  await page.goto(`/exercise/${level1}`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('מגיב לשם')
  await expect(page.getByText('סרטון ההדגמה עדיין לא זמין')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'מתי זה נחשב שליטה?' })).toBeVisible()

  // The easier variant is predefined content.
  await page.getByRole('button', { name: 'צריך להקל?' }).click()
  await expect(page.getByRole('dialog')).toContainText('גרסה קלה יותר')
  await page.keyboard.press('Escape')

  // 1) A help report is practice only.
  await page.getByRole('button', { name: 'תרגלנו' }).click()
  await page.getByText('הצליח עם עזרה').click()
  await page.getByRole('button', { name: 'שמירת תרגול' }).click()
  await expect(page.getByText('התרגול נשמר. השלב הנוכחי נשאר פתוח')).toBeVisible()
  await page.getByRole('button', { name: 'חזרה לתרגיל' }).click()

  // 2) Independent success but "not yet" is still practice only.
  await page.getByRole('button', { name: 'תרגלנו' }).click()
  await page.getByText('הצליח לבד').click()
  await expect(page.getByText('הקריטריון לשליטה')).toBeVisible()
  await expect(page.getByLabel('כן, שולט בתרגיל לפי הקריטריון')).not.toBeChecked()
  await page.getByRole('button', { name: 'שמירת תרגול' }).click()
  await expect(page.getByText('בחרו אם הגור שולט בתרגיל לפי הקריטריון').first()).toBeVisible()
  await page.getByText('עוד לא').click()
  await page.getByRole('button', { name: 'שמירת תרגול' }).click()
  await expect(page.getByText('התרגול נשמר. השלב הנוכחי נשאר פתוח')).toBeVisible()
  await page.getByRole('button', { name: 'חזרה לתרגיל' }).click()

  await page.goto('/map')
  await expect(currentNode(page)).toContainText('מגיב לשם')

  // 3) Explicit mastery unlocks the next level.
  await page.goto(`/exercise/${level1}`)
  await page.getByRole('button', { name: 'תרגלנו' }).click()
  await page.getByText('הצליח לבד').click()
  await page.getByText('כן, שולט בתרגיל לפי הקריטריון').click()
  await page.getByRole('button', { name: 'אישור שליטה ושמירה' }).click()
  await expect(page.getByText('שלב 2 נפתח')).toBeVisible()
  await page.getByRole('link', { name: 'לשלב הבא' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('יציאה קבועה לצרכים')

  // A refresh restores the server state.
  await page.goto('/map')
  await page.reload()
  await expect(currentNode(page)).toContainText('יציאה קבועה לצרכים')
  await page.goto('/home')
  await expect(page.getByText('1 מתוך 12 שלבים הושלמו')).toBeAttached()

  // 4) Reviewing the finished level changes nothing.
  await page.goto('/review')
  await page.getByRole('link', { name: /שלב 1: מגיב לשם/ }).click()
  await page.getByRole('button', { name: 'תרגלנו' }).click()
  await expect(page.getByText('תרגול חוזר לא משנה את ההתקדמות במסלול.')).toBeVisible()
  await page.getByText('הצליח לבד').click()
  await expect(page.getByText('הקריטריון לשליטה')).toHaveCount(0)
  await page.getByRole('button', { name: 'שמירת תרגול חוזר' }).click()
  await expect(page.getByText('זה לא משנה את ההתקדמות')).toBeVisible()
  await page.goto('/map')
  await expect(currentNode(page)).toContainText('יציאה קבועה לצרכים')
  await expect(page.getByRole('button', { name: /שלב 3:/ })).toContainText('נעול')
})

test('a failed save keeps the selection, shows no false "saved", and a retry succeeds', async ({ page, owner }) => {
  void owner
  const level1 = await currentLevelId(page)
  await page.goto(`/exercise/${level1}`)
  await page.getByRole('button', { name: 'תרגלנו' }).click()
  await page.getByText('עדיין מתקשה').click()

  await page.route('**/api/attempts', (route) => route.abort('failed'))
  await page.getByRole('button', { name: 'שמירת תרגול' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('הדיווח עוד לא נשמר')
  await expect(page.getByLabel('עדיין מתקשה')).toBeChecked()
  await expect(page.getByText('התרגול נשמר')).toHaveCount(0)

  await page.unroute('**/api/attempts')
  await page.getByRole('button', { name: 'שמירת תרגול' }).click()
  await expect(page.getByText(/זה בסדר גמור/)).toBeVisible()
})

test('locked levels explain the prerequisite and cannot be opened', async ({ page, owner }) => {
  void owner
  await page.goto('/map')
  await page.getByRole('button', { name: /שלב 2:/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('השלימו את השלב הקודם כדי לפתוח')
  await expect(dialog.getByRole('link')).toHaveCount(0)
})

test('another owner cannot open my exercise', async ({ browser, page, owner }) => {
  void owner
  const level1 = await currentLevelId(page)
  const other = await browser.newContext({ baseURL: 'http://localhost:3100' })
  const otherPage = await other.newPage()
  await register(otherPage, freshEmail())
  await onboardViaApi(otherPage)
  const response = await otherPage.goto(`/exercise/${level1}`)
  expect(response?.status()).toBe(404)
  await other.close()
})
