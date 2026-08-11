const { test, expect } = require('@playwright/test')

/**
 * Smoke test keamanan API publik (butuh Apache/XAMPP + DB).
 * Set API_BASE_URL jika path berbeda, mis. http://localhost/api/public
 */
test.describe('API publik — hardening keamanan', () => {
  test.skip(!process.env.RUN_API_E2E, 'Set RUN_API_E2E=1 untuk menjalankan tes API')

  test('GET /public/santri tanpa token menyamarkan PII', async ({ request, baseURL }) => {
    const apiRoot = (process.env.API_BASE_URL || baseURL || 'http://localhost/api/public').replace(
      /\/$/,
      ''
    )
    const res = await request.get(`${apiRoot}/santri?id=1`)
    if (res.status() === 404) {
      test.skip(true, 'Santri id=1 tidak ada di DB lokal')
    }
    expect(res.status()).toBeLessThan(500)
    const body = await res.json()
    if (!body.success || !body.data) return

    expect(body.data.nik).toBeUndefined()
    expect(body.data.no_telpon).toBeUndefined()
    expect(body.data.email).toBeUndefined()
    if (body.redacted !== undefined) {
      expect(body.redacted).toBe(true)
    }
  })

  test('POST /user/update-password tanpa auth ditolak', async ({ request }) => {
    const apiAuth = (process.env.API_AUTH_BASE_URL || 'http://localhost/api').replace(/\/$/, '')
    const res = await request.post(`${apiAuth}/user/update-password`, {
      data: { user_id: '1', new_password: 'password123' },
    })
    expect([401, 403]).toContain(res.status())
  })
})
