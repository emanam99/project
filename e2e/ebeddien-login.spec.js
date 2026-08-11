const { test, expect } = require('@playwright/test')

test.describe('eBeddien — halaman login', () => {
  test('memuat halaman login tanpa error fatal', async ({ page }) => {
    const errors = []
    page.on('pageerror', (err) => errors.push(err.message))

    const response = await page.goto('/login', { waitUntil: 'domcontentloaded' })
    expect(response?.status()).toBeLessThan(500)

    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: /selamat datang/i })).toBeVisible()
    await expect(page.getByRole('textbox', { name: /username/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /masuk/i })).toBeVisible()

    expect(errors, `JS error di halaman: ${errors.join('; ')}`).toHaveLength(0)
  })

  test('redirect root ke login atau beranda (bukan blank)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('body')).not.toBeEmpty()
    const url = page.url()
    expect(url).toMatch(/\/(login|beranda)/)
  })
})
