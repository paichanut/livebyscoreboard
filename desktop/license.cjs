// This copy is licensed until the end of the day in package.json "expires" (this computer's local time).
// After that it still works, but every scoreboard and banner shows UNLICENSED across the middle and the
// control page opens "Contact for license" every 30 s (src/License.jsx); no more updates (updater.cjs).
// Turning the computer's clock back doesn't help: the latest time the app has seen (this computer's clock,
// or GitHub's when online) is kept in the data folder.
const { app, net } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const EXPIRES = require('./package.json').expires || ''
const END = EXPIRES ? new Date(`${EXPIRES}T23:59:59.999`).getTime() : Infinity
const seenFile = () => path.join(app.getPath('userData'), 'seen.json')

function lastSeen() {
  try { return Number(JSON.parse(fs.readFileSync(seenFile(), 'utf8')).at) || 0 } catch { return 0 }
}
function see(ms) {
  if (!(ms > lastSeen())) return
  try { fs.writeFileSync(seenFile(), JSON.stringify({ at: ms })) } catch {}
}

const isExpired = () => {
  see(Date.now())
  return lastSeen() > END
}

// while the app runs: remember the time (every 10 min) and, when online, GitHub's time once
function watchTime() {
  setInterval(() => see(Date.now()), 10 * 60_000).unref?.()
  net.fetch('https://github.com', { method: 'HEAD' })
    .then(r => { const d = Date.parse(r.headers.get('date') || ''); if (d) see(d) })
    .catch(() => {})
}

module.exports = { isExpired, watchTime, EXPIRES }
