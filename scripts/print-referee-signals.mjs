// Renders public/referee-signals.html to public/referee-signals.pdf (A4) with Playwright's Chromium.
// PW_CHROMIUM_PATH=/path/to/chrome node scripts/print-referee-signals.mjs [png-preview-path]
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const b = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {})
const p = await (await b.newContext({ viewport: { width: 794, height: 1123 } })).newPage()
await p.goto('file://' + path.join(root, 'public/referee-signals.html'), { waitUntil: 'networkidle' })
await p.evaluate(() => document.fonts.ready)
await p.pdf({ path: path.join(root, 'public/referee-signals.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true })
if (process.argv[2]) await p.screenshot({ path: process.argv[2], fullPage: true })
console.log('pages:', await p.evaluate(() => Math.ceil(document.body.scrollHeight / 1123)))
await b.close()
