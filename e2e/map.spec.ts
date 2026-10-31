import { expect, test } from './fixtures'

test.describe('map', () => {
  test('shows one path in level order with exactly one current level', async ({ page, owner }) => {
    void owner
    await page.goto('/map')
    await expect(page.locator('button[aria-current="step"]')).toHaveCount(1)
    await expect(page.locator('button[aria-current="step"]')).toContainText('מגיב לשם')
    const numbers = await page
      .locator('ol li button')
      .evaluateAll((buttons) => buttons.map((b) => Number(b.textContent?.match(/שלב (\d+):/)?.[1])))
    expect(numbers.length).toBe(8)
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b))
  })

  test('the painted map is hidden from assistive technology', async ({ page, owner }) => {
    void owner
    await page.goto('/map')
    const art = page.locator('main img[src*="map-painted"]')
    await expect(art).toHaveCount(1)
    await expect(art).toHaveAttribute('aria-hidden', 'true')
  })

  test('a locked level explains the prerequisite and offers no way to start', async ({ page, owner }) => {
    void owner
    await page.goto('/map')
    await page.getByRole('button', { name: /יציאה קבועה לצרכים/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('השלימו את השלב הקודם כדי לפתוח')
    await expect(dialog.getByRole('link')).toHaveCount(0)
  })

  test('the level sheet closes with Escape and returns focus to the node', async ({ page, owner }) => {
    void owner
    await page.goto('/map')
    const node = page.getByRole('button', { name: /יציאה קבועה לצרכים/ })
    await node.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(node).toBeFocused()
  })

  test('the pager slides the eight-level window along the plan', async ({ page, owner }) => {
    void owner
    await page.goto('/map')
    await expect(page.getByRole('button', { name: /הליכה ברצועה/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'הצגת שלבים קודמים' })).toBeDisabled()
    await page.getByRole('button', { name: 'הצגת שלבים הבאים' }).click()
    await expect(page.getByRole('button', { name: /הליכה ברצועה/ })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'מוצגים' })).toHaveText(/מוצגים שלבים \d+ עד \d+/)
    await expect(page.getByRole('button', { name: 'הצגת שלבים הבאים' })).toBeDisabled()
  })

  test('keyboard focus is visible on interactive controls', async ({ page, owner }) => {
    void owner
    await page.goto('/map')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'דילוג לתוכן הראשי' })).toBeFocused()
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab')
      const outline = await page.evaluate(() => {
        const style = getComputedStyle(document.activeElement as HTMLElement)
        return { width: style.outlineWidth, style: style.outlineStyle }
      })
      expect(outline).toEqual({ width: '3px', style: 'solid' })
    }
  })
})

test('no screen runs looping animations', async ({ page, owner }) => {
  void owner
  for (const route of ['/home', '/map', '/review', '/puppy']) {
    await page.goto(route)
    const looping = await page.evaluate(
      () => document.getAnimations().filter((a) => a.effect?.getTiming().iterations === Infinity).length,
    )
    expect(looping, route).toBe(0)
  }
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('opening a level sheet does not animate', async ({ page, owner }) => {
    void owner
    await page.goto('/map')
    await page.getByRole('button', { name: /יציאה קבועה לצרכים/ }).click()
    const duration = await page.getByRole('dialog').evaluate((el) => getComputedStyle(el).animationDuration)
    expect(parseFloat(duration)).toBeLessThan(0.001)
  })
})
