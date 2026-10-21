import { defineConfig } from '@playwright/test'
import base from './playwright.config.js'

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: '**/desktop-teams.spec.js',
  use: { ...base.use, baseURL: 'http://localhost:4174' },
  webServer: {
    ...base.webServer,
    command: 'npm run build:desktop && npm run preview -- --outDir desktop/web --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: false,
  },
})
