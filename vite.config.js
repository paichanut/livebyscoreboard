import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The desktop (offline) build has no internet: drop the Google Fonts links (fonts-offline.js bundles them)
const offlineHtml = mode => ({
  name: 'offline-html',
  transformIndexHtml: html => (mode === 'desktop' ? html.replace(/\s*<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>/g, '') : html),
})

export default defineConfig(({ mode }) => ({
  plugins: [react(), offlineHtml(mode)],
}))
