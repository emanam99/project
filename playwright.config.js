// @ts-check
const { defineConfig, devices } = require('@playwright/test')

/**
 * E2E Alutsmani — eBeddien (5173), myBeddien (5174), API (opsional).
 * Dokumentasi: https://playwright.dev/docs/intro
 *
 * Jalankan dev server dulu, atau set PLAYWRIGHT_SKIP_WEBSERVER=1 jika sudah jalan:
 *   cd ebeddien && npm run dev
 *   cd mybeddien && npm run dev
 *
 * Lalu dari root:
 *   npm run test:e2e
 */
module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'ebeddien',
      testMatch: /ebeddien.*\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.EBEDDIEN_BASE_URL || 'http://localhost:5173',
      },
    },
    {
      name: 'mybeddien',
      testMatch: /mybeddien.*\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.MYBEDDIEN_BASE_URL || 'http://localhost:5174',
      },
    },
    {
      name: 'staging',
      testMatch: /staging-.*\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.EBEDDIEN_BASE_URL || 'https://ebeddien2.alutsmani.id',
        ignoreHTTPSErrors: false,
      },
    },
    {
      name: 'api',
      testMatch: /api-.*\.spec\.js/,
      use: {
        baseURL: process.env.API_BASE_URL || 'http://localhost/api/public',
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER || process.env.EBEDDIEN_BASE_URL?.includes('alutsmani.id')
    ? undefined
    : [
        {
          command: 'npm run dev',
          cwd: './ebeddien',
          url: 'http://localhost:5173',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command: 'npm run dev',
          cwd: './mybeddien',
          url: 'http://localhost:5174',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
})
