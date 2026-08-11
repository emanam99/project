/**
 * Audit staging eBeddien — butuh env (jangan commit kredensial):
 *   STAGING_USER, STAGING_PASS, EBEDDIEN_BASE_URL=https://ebeddien2.alutsmani.id
 */
const { test, expect } = require('@playwright/test')
const fs = require('fs')
const path = require('path')

const STAGING_BASE = process.env.EBEDDIEN_BASE_URL || 'https://ebeddien2.alutsmani.id'
const STAGING_USER = process.env.STAGING_USER || ''
const STAGING_PASS = process.env.STAGING_PASS || ''

test.describe('Staging eBeddien — audit', () => {
  test.skip(!STAGING_USER || !STAGING_PASS, 'Set STAGING_USER dan STAGING_PASS')

  test('login, beranda, menu, API & keamanan publik', async ({ page, request }) => {
    test.setTimeout(120_000)
    const findings = []
    const consoleErrors = []
    const failedRequests = []
    let apiBase = null

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('requestfailed', (req) => {
      failedRequests.push({ url: req.url(), failure: req.failure()?.errorText })
    })
    page.on('response', async (res) => {
      const url = res.url()
      if (url.includes('/api/') && !apiBase) {
        try {
          const u = new URL(url)
          const idx = u.pathname.indexOf('/api/')
          if (idx >= 0) apiBase = `${u.origin}${u.pathname.slice(0, idx + 4)}`
        } catch {
          /* ignore */
        }
      }
    })

    // --- Security headers halaman utama ---
    const homeRes = await page.goto(`${STAGING_BASE}/login`, { waitUntil: 'networkidle' })
    expect(homeRes?.status()).toBeLessThan(500)
    const headers = homeRes?.headers() || {}
    if (!headers['strict-transport-security']) findings.push({ severity: 'medium', item: 'HSTS tidak terdeteksi di /login' })
    if (!headers['x-frame-options'] && !headers['content-security-policy']?.includes('frame-ancestors')) {
      findings.push({ severity: 'low', item: 'X-Frame-Options / CSP frame-ancestors tidak terdeteksi' })
    }

    await page.getByPlaceholder('Username').fill(STAGING_USER)
    await page.getByPlaceholder('Password').fill(STAGING_PASS)
    await page.getByRole('button', { name: /^Masuk$/ }).click()

    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 45_000 }).catch(() => null)
    const afterLoginUrl = page.url()
    if (afterLoginUrl.includes('/login')) {
      const errText = await page.locator('[class*="text-red"], [role="alert"]').first().textContent().catch(() => '')
      findings.push({ severity: 'critical', item: `Login gagal — masih di /login. Pesan: ${(errText || '').trim().slice(0, 120)}` })
      test.info().attach('findings', { body: JSON.stringify({ findings, consoleErrors, failedRequests }, null, 2), contentType: 'application/json' })
      expect(afterLoginUrl, 'Login staging gagal').not.toContain('/login')
    }

    findings.push({ severity: 'info', item: `Login OK → ${afterLoginUrl}` })

    // Token di localStorage (risiko arsitektural, bukan bug staging)
    const storageKeys = await page.evaluate(() => Object.keys(localStorage))
    if (storageKeys.includes('auth_token')) {
      findings.push({ severity: 'info', item: 'JWT disimpan di localStorage (auth_token) — ekspektasi arsitektur SPA saat ini' })
    }

    // Beranda / dashboard
    await page.goto(`${STAGING_BASE}/beranda`, { waitUntil: 'domcontentloaded' }).catch(() => null)
    if (page.url().includes('/login')) {
      findings.push({ severity: 'high', item: 'Redirect ke login saat akses /beranda setelah login' })
    } else {
      await expect(page.locator('body')).toBeVisible()
      findings.push({ severity: 'info', item: 'Halaman /beranda dapat diakses setelah login' })
    }

    // Cek beberapa rute umum
    const routes = ['/chat-ai', '/pendaftaran/data-pendaftar', '/public/santri?id=1']
    for (const route of routes) {
      const res = await page.goto(`${STAGING_BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null)
      const status = res?.status() ?? 0
      const finalUrl = page.url()
      if (status >= 500) {
        findings.push({ severity: 'high', item: `${route} → HTTP ${status}` })
      } else if (finalUrl.includes('/akses-ditolak')) {
        findings.push({ severity: 'info', item: `${route} → akses ditolak (guard menu, wajar jika role terbatas)` })
      } else if (finalUrl.includes('/login') && !route.startsWith('/public')) {
        findings.push({ severity: 'medium', item: `${route} → redirect login (sesi atau guard)` })
      } else {
        findings.push({ severity: 'info', item: `${route} → OK (${status}, ${finalUrl.replace(STAGING_BASE, '')})` })
      }
    }

    // API version & fitur menu (butuh token dari page)
    const token = await page.evaluate(() => localStorage.getItem('auth_token'))
    if (token && apiBase) {
      const verRes = await request.get(`${apiBase}/version`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (verRes.ok()) {
        const ver = await verRes.json().catch(() => ({}))
        findings.push({ severity: 'info', item: `API version: ${ver.version || ver.api_version || JSON.stringify(ver).slice(0, 80)}` })
      }

      const menuRes = await request.get(`${apiBase}/v2/me/fitur-menu`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (menuRes.ok()) {
        const menu = await menuRes.json().catch(() => ({}))
        const codes = menu?.data?.fitur_menu_codes || menu?.fitur_menu_codes || []
        findings.push({
          severity: 'info',
          item: `Fitur menu: ${Array.isArray(codes) ? codes.length : 0} kode`,
        })
      } else {
        findings.push({ severity: 'medium', item: `GET /v2/me/fitur-menu → ${menuRes.status()}` })
      }
    } else {
      findings.push({ severity: 'medium', item: 'Tidak bisa deteksi API base atau token setelah login' })
    }

    // Public santri PII (staging API)
    const publicApi =
      process.env.API_BASE_URL ||
      (apiBase ? apiBase.replace(/\/api\/?$/, '/api/public') : 'https://api2.alutsmani.id/api/public')
    const pubRes = await request.get(`${publicApi}/santri?id=1`)
    if (pubRes.status() < 500) {
      const body = await pubRes.json().catch(() => ({}))
      if (body.success && body.data) {
        const hasPii = Boolean(body.data.nik || body.data.no_telpon || body.data.email)
        if (hasPii && body.redacted !== true) {
          findings.push({
            severity: 'high',
            item: 'GET /public/santri masih membocorkan NIK/telepon/email tanpa token (hardening belum deploy?)',
          })
        } else if (body.redacted === true || !hasPii) {
          findings.push({ severity: 'info', item: 'GET /public/santri: PII disamarkan atau tidak ada (hardening aktif)' })
        }
      }
    }

    // Console & network
    const criticalConsole = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('404') && !e.includes('Failed to load resource')
    )
    if (criticalConsole.length > 0) {
      findings.push({
        severity: 'medium',
        item: `Console error (${criticalConsole.length}): ${criticalConsole.slice(0, 3).join(' | ')}`,
      })
    }
    const apiFails = failedRequests.filter((f) => f.url.includes('/api/'))
    if (apiFails.length > 0) {
      findings.push({
        severity: 'medium',
        item: `Request API gagal: ${apiFails.slice(0, 2).map((f) => f.url).join(', ')}`,
      })
    }

    await page.screenshot({ path: 'test-results/staging-audit-final.png', fullPage: false })
    test.info().attach('audit-findings', {
      body: JSON.stringify({ staging: STAGING_BASE, findings, consoleErrors: criticalConsole, apiFails }, null, 2),
      contentType: 'application/json',
    })
    fs.mkdirSync('test-results', { recursive: true })
    fs.writeFileSync(path.join('test-results', 'staging-audit-findings.json'), JSON.stringify({ staging: STAGING_BASE, findings, consoleErrors: criticalConsole, apiFails }, null, 2))

    // Tidak fail test — laporan via attachment; hanya fail jika login gagal total
    expect(findings.some((f) => f.severity === 'critical')).toBeFalsy()
  })

  test('crawl semua halaman menu fitur user', async ({ page, request }) => {
    test.setTimeout(600_000)
    const pageResults = []
    const consoleErrors = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await page.goto(`${STAGING_BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('Username').fill(STAGING_USER)
    await page.getByPlaceholder('Password').fill(STAGING_PASS)
    await page.getByRole('button', { name: /^Masuk$/ }).click()
    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 45_000 })
    expect(page.url()).not.toContain('/login')

    let apiBase = null
    page.on('response', (res) => {
      const url = res.url()
      if (url.includes('/api/') && !apiBase) {
        try {
          const u = new URL(url)
          const idx = u.pathname.indexOf('/api/')
          if (idx >= 0) apiBase = `${u.origin}${u.pathname.slice(0, idx + 4)}`
        } catch {
          /* ignore */
        }
      }
    })
    await page.goto(`${STAGING_BASE}/beranda`, { waitUntil: 'networkidle' }).catch(() => null)

    const token = await page.evaluate(() => localStorage.getItem('auth_token'))
    expect(token).toBeTruthy()

    if (!apiBase) {
      apiBase = process.env.API_BASE_URL?.replace(/\/public\/?$/, '') || 'https://api2.alutsmani.id/api'
    }

    const menuRes = await request.get(`${apiBase}/v2/me/fitur-menu?app_key=ebeddien&types=menu`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(menuRes.ok()).toBeTruthy()
    const menuData = await menuRes.json()
    const items = menuData?.data?.items || menuData?.items || []

    const catalogRes = await request.get(`${apiBase}/v2/fitur/ebeddien/menu-catalog`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null)
    const catalogItems =
      catalogRes?.ok() ? (await catalogRes.json().catch(() => ({})))?.data?.items || [] : []

    const codes = new Set(menuData?.data?.codes || menuData?.codes || [])
    const paths = new Set(['/beranda', '/profil'])

    for (const it of items) {
      if (it.path && String(it.path).startsWith('/')) paths.add(it.path.split('?')[0])
    }
    for (const it of catalogItems) {
      if (it.path && String(it.path).startsWith('/') && codes.has(it.code)) {
        paths.add(it.path.split('?')[0])
      }
    }

    const sortedPaths = [...paths].sort()
    for (const route of sortedPaths) {
      const entry = { route, status: 'ok', http: 0, finalUrl: '', note: '' }
      const res = await page
        .goto(`${STAGING_BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
        .catch(() => null)
      await page.locator('#root > *').first().waitFor({ state: 'attached', timeout: 8_000 }).catch(() => null)
      entry.http = res?.status() ?? 0
      entry.finalUrl = page.url().replace(STAGING_BASE, '')

      if (entry.http >= 500) {
        entry.status = 'error'
        entry.note = `HTTP ${entry.http}`
      } else if (entry.finalUrl.includes('/login')) {
        entry.status = 'error'
        entry.note = 'redirect login'
      } else if (entry.finalUrl.includes('/akses-ditolak')) {
        entry.status = 'denied'
        entry.note = 'akses ditolak'
      }
      pageResults.push(entry)
    }

    const criticalConsole = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('404') && !e.includes('Failed to load resource')
    )
    const summary = {
      user: STAGING_USER,
      staging: STAGING_BASE,
      totalPaths: sortedPaths.length,
      ok: pageResults.filter((p) => p.status === 'ok').length,
      denied: pageResults.filter((p) => p.status === 'denied').length,
      warn: pageResults.filter((p) => p.status === 'warn').length,
      error: pageResults.filter((p) => p.status === 'error').length,
      fiturMenuCount: items.length,
      pages: pageResults,
      consoleErrors: criticalConsole.slice(0, 20),
    }

    test.info().attach('menu-crawl-report', {
      body: JSON.stringify(summary, null, 2),
      contentType: 'application/json',
    })
    fs.mkdirSync('test-results', { recursive: true })
    fs.writeFileSync(path.join('test-results', 'menu-crawl-report.json'), JSON.stringify(summary, null, 2))

    const errors = pageResults.filter((p) => p.status === 'error')
    expect(errors, `Halaman error: ${errors.map((e) => e.route).join(', ')}`).toHaveLength(0)
  })
})
