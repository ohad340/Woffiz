import { expect, test } from '@playwright/test'

test.describe('map', () => {
  test('shows one path in level order with exactly one current level', async ({ page }) => {
    await page.goto('/map')
    const steps = page.getByRole('list').filter({ has: page.locator('button[aria-current="step"]') })
    await expect(steps).toHaveCount(1)
    await expect(page.locator('button[aria-current="step"]')).toHaveCount(1)
    await expect(page.locator('button[aria-current="step"]')).toContainText('רגע לבד בחדר')

    const numbers = await steps.locator('li').evaluateAll((items) =>
      items.map((li) => Number(li.querySelector('button')?.textContent?.match(/\d+/)?.[0])),
    )
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b))
  })

  test('painted map art is hidden from assistive technology', async ({ page }) => {
    await page.goto('/map')
    const art = page.locator('main img[src*="map-painted"]')
    await expect(art).toHaveCount(1)
    await expect(art).toHaveAttribute('aria-hidden', 'true')
  })

  test('a locked level explains the prerequisite and offers no way to start', async ({ page }) => {
    await page.goto('/map')
    await page.getByRole('button', { name: /פה רך/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('השלימו את השלב הקודם כדי לפתוח')
    await expect(dialog.getByRole('button', { name: /תרגלנו|ממשיכים/ })).toHaveCount(0)
  })

  test('sheet closes with Escape and returns focus to the node', async ({ page }) => {
    await page.goto('/map')
    const node = page.getByRole('button', { name: /פה רך/ })
    await node.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(node).toBeFocused()
  })

  test('bounded window loads earlier and later levels on request', async ({ page }) => {
    await page.goto('/map')
    await expect(page.getByRole('button', { name: /מגיב לשם/ })).toHaveCount(0)
    await page.getByRole('button', { name: /הצגת שלבים קודמים/ }).click()
    await expect(page.getByRole('button', { name: /מגיב לשם/ })).toBeVisible()
    await page.getByRole('button', { name: /הצגת שלבים הבאים/ }).click()
    await expect(page.getByRole('button', { name: /הליכה ברצועה/ })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'מוצגים' })).toHaveText(/מוצגים שלבים \d+ עד \d+/)
  })

  test('keyboard focus is visible on interactive controls', async ({ page }) => {
    await page.goto('/map')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'דילוג לתוכן הראשי' })).toBeFocused()
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab')
      const outline = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement
        const style = getComputedStyle(el)
        return { width: style.outlineWidth, style: style.outlineStyle }
      })
      expect(outline).toEqual({ width: '3px', style: 'solid' })
    }
  })
})

test('no screen runs looping animations', async ({ page }) => {
  for (const route of ['/', '/home', '/map', '/onboarding']) {
    await page.goto(route)
    const looping = await page.evaluate(() =>
      document.getAnimations().filter((a) => a.effect?.getTiming().iterations === Infinity).length,
    )
    expect(looping, route).toBe(0)
  }
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('opening a level sheet does not animate', async ({ page }) => {
    await page.goto('/map')
    await page.getByRole('button', { name: /פה רך/ }).click()
    const duration = await page.getByRole('dialog').evaluate((el) => getComputedStyle(el).animationDuration)
    expect(parseFloat(duration)).toBeLessThan(0.001)
  })
})
