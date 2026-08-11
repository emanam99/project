const { test, expect } = require('@playwright/test')

test.describe('myBeddien — halaman login', () => {
  test('memuat halaman login tanpa error fatal', async ({ page }) => {
    const errors = []
    page.on('pageerror', (err) => errors.push(err.message))

    const response = await page.goto('/login', { waitUntil: 'domcontentloaded' })
    expect(response?.status()).toBeLessThan(500)

    await expect(page).toHaveURL(/\/login/)
    await expect(page.locator('body')).toBeVisible()

    const hasLoginCue =
      (await page.getByRole('button', { name: /login|masuk/i }).count()) > 0 ||
      (await page.locator('input[type="password"]').count()) > 0
    expect(hasLoginCue).toBeTruthy()

    expect(errors, `JS error di halaman: ${errors.join('; ')}`).toHaveLength(0)
  })
})
