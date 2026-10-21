import { test, expect } from '@playwright/test'
import { uniqueCode, openControl, openBoard, home, away, openOptions, saveOptions } from './helpers.js'

test('public animated guide supports search, pause and reduced motion', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Referee signals · animated' }).click()
  await expect(page.locator('.signal-card')).toHaveCount(34)
  await page.getByRole('searchbox').fill('Slashing')
  await expect(page.locator('.signal-card')).toHaveCount(1)
  const svg = page.locator('.referee-figure')
  await expect(svg).toHaveAttribute('data-playing', 'true')
  await page.getByRole('button', { name: 'Pause Slashing animation', exact: true }).click()
  await expect(svg).toHaveAttribute('data-playing', 'false')
  expect(await svg.evaluate(el => el.animationsPaused())).toBe(true)
  if (process.env.LBS_PREVIEW_DIR) {
    await page.screenshot({ path: `${process.env.LBS_PREVIEW_DIR}/referee-guide-desktop.png` })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: `${process.env.LBS_PREVIEW_DIR}/referee-guide-mobile.png`, fullPage: true })
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await expect(page.getByRole('button', { name: '▶ Play animations', exact: true })).toBeVisible()
  await expect(page.locator('.referee-figure').first()).toHaveAttribute('data-playing', 'false')
  await page.getByRole('searchbox').fill('zzzz')
  await expect(page.getByText('No matching signals')).toBeVisible()
})

test('penalty animation fills the shots area below the score and clears after announcement', async ({ page, context }) => {
  const code = uniqueCode('signal')
  await openControl(page, code)
  await openOptions(page)
  await page.locator('.opts').getByRole('button', { name: /^Compact —/ }).click()
  await saveOptions(page)
  const board = await context.newPage()
  await board.goto(`/b/${code}`)
  await expect(board.locator('.compactb')).toBeVisible()
  const scoreBefore = await board.locator('.cteam .cscore').last().boundingBox()
  await away(page).getByRole('button', { name: 'add penalty' }).click()
  const sheet = page.locator('.sheet')
  await sheet.getByPlaceholder('#').fill('12')
  await sheet.locator('.templates').getByRole('button', { name: /^Hooking/ }).click()
  await sheet.getByRole('button', { name: /^Add penalty/ }).click()
  const announcement = board.locator('.penalty-signal')
  await expect(announcement).toHaveCount(1)
  await expect(announcement).toHaveAttribute('data-team', 'away')
  await expect(announcement).toHaveAttribute('data-signal', 'hooking')
  await expect(announcement.locator('.penalty-signal-player')).toHaveText('#12')
  await expect(announcement.locator('animate').first()).toBeAttached()
  const region = await announcement.boundingBox()
  const scoreAfter = await board.locator('.cteam .cscore').last().boundingBox()
  expect(scoreAfter).toEqual(scoreBefore)
  expect(region.height).toBeGreaterThan(150)
  expect(region.x).toBeGreaterThan(board.viewportSize().width / 2)
  expect(region.y).toBeGreaterThanOrEqual(scoreAfter.y + scoreAfter.height)
  const lower = await board.locator('.cteam-lower').last().boundingBox()
  expect(region.y).toBeCloseTo(lower.y, 0)
  expect(region.y + region.height).toBeLessThanOrEqual(lower.y + lower.height + 1)
  const clock = await board.locator('.cclock').boundingBox()
  expect(region.x).toBeGreaterThanOrEqual(clock.x + clock.width)
  const motion = await announcement.locator('svg').evaluate(svg => {
    const arm = svg.querySelector('polyline')
    const points = () => Array.from(arm.animatedPoints, p => [p.x, p.y])
    svg.pauseAnimations()
    svg.setCurrentTime(0.1)
    const before = points()
    svg.setCurrentTime(1.2)
    const after = points()
    svg.unpauseAnimations()
    return { before, after }
  })
  expect(motion.after).not.toEqual(motion.before)
  if (process.env.LBS_PREVIEW_DIR) await board.screenshot({ path: `${process.env.LBS_PREVIEW_DIR}/penalty-away-preview.png` })
  await board.clock.install()
  await board.clock.runFor(16000)
  await expect(announcement).toHaveCount(0)
})


test('referee animation option saves, persists, and keeps normal penalties when disabled', async ({ page, context }) => {
  const code = uniqueCode('signal-option')
  await openControl(page, code)
  await openOptions(page)
  const toggle = page.getByRole('checkbox', { name: 'Show referee animation on scoreboard', exact: true })
  await expect(toggle).toBeChecked()
  await page.locator('.opts').getByRole('button', { name: /^Compact —/ }).click()
  await toggle.uncheck()
  await saveOptions(page)
  await page.reload()
  await openOptions(page)
  await expect(toggle).not.toBeChecked()
  await page.locator('.opts .foot').getByRole('button', { name: 'Cancel', exact: true }).click()
  const board = await context.newPage()
  await board.goto(`/b/${code}`)
  await away(page).getByRole('button', { name: 'add penalty' }).click()
  const sheet = page.locator('.sheet')
  await sheet.getByPlaceholder('#').fill('12')
  await sheet.locator('.templates').getByRole('button', { name: /^Hooking/ }).click()
  await sheet.getByRole('button', { name: /^Add penalty/ }).click()
  await expect(board.locator('.cteam .cpen').last()).toContainText('#12')
  await expect(board.locator('.pencall')).toContainText('HOOKING')
  await expect(board.locator('.penalty-signal')).toHaveCount(0)
  await openOptions(page)
  await toggle.check()
  await saveOptions(page)
  await expect(board.locator('.penalty-signal')).toHaveAttribute('data-signal', 'hooking')
  await openOptions(page)
  await toggle.uncheck()
  await saveOptions(page)
  await expect(board.locator('.penalty-signal')).toHaveCount(0)
  await expect(board.locator('.cteam .cpen').last()).toContainText('#12')
})


for (const [layout, team, width, height] of [
  ['Compact', 'home', 2254, 1309],
  ['Compact', 'away', 1920, 1080],
  ['Compact', 'home', 390, 844],
  ['Arena', 'home', 1280, 720],
  ['Full', 'away', 1280, 720],
  ['Minimal', 'home', 1280, 720],
  ['Small ice', 'home', 1920, 1080],
]) {
  test(`${layout} ${team} penalty cannot cover scores at ${width}x${height}`, async ({ page, context }) => {
    const code = uniqueCode('safe-scores')
    await openControl(page, code)
    await openOptions(page)
    const small = layout === 'Small ice'
    await page.locator('.opts').getByRole('button', { name: new RegExp(`^${small ? 'Small ice' : layout} —`) }).click()
    await saveOptions(page)
    const board = await context.newPage()
    await board.setViewportSize({ width, height })
    await board.goto(`/b/${code}`)
    const selector = small ? '.dscore' : layout === 'Compact' ? '.cscore' : '.team .score'
    const scores = board.locator(selector)
    await expect(scores).toHaveCount(small ? 4 : 2)
    const before = await scores.evaluateAll(els => els.map(el => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }))
    await (team === 'home' ? home(page) : away(page)).getByRole('button', { name: 'add penalty' }).click()
    const sheet = page.locator('.sheet')
    await sheet.getByPlaceholder('#').fill('33')
    await sheet.locator('.templates').getByRole('button', { name: /^Kneeing/ }).click()
    await sheet.getByRole('button', { name: /^Add penalty/ }).click()
    const announcement = board.locator('.penalty-signal')
    await expect(announcement).toHaveCount(1)
    const region = await announcement.boundingBox()
    const after = await scores.evaluateAll(els => els.map(el => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }))
    expect(after).toEqual(before)
    for (const score of after) {
      const overlaps = region.x < score.x + score.width && region.x + region.width > score.x && region.y < score.y + score.height && region.y + region.height > score.y
      expect(overlaps).toBe(false)
    }
    expect(region.width).toBeGreaterThan(0)
    expect(region.height).toBeGreaterThan(0)
    await expect(announcement.locator('[lang="th"]')).toHaveCount(0)
    expect(await announcement.locator('.penalty-signal-figure').evaluate(el => getComputedStyle(el).backgroundImage)).toContain('linear-gradient')
    if (process.env.LBS_PREVIEW_DIR && width === 2254) await board.screenshot({ path: `${process.env.LBS_PREVIEW_DIR}/penalty-safe-scores.png` })
  })
}
