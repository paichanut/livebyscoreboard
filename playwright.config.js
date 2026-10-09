import { defineConfig, devices } from '@playwright/test'

// Set PW_CHROMIUM_PATH to use a system Chromium instead of the one `npx playwright install chromium` downloads.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: executablePath ? { executablePath } : {},
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build:test && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
