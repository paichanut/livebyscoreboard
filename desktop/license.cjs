// This copy works until the end of the day in package.json "expires" (this computer's local time).
// After that the app opens only the "Contact for license" page: no game, no online link, no updates;
// the operator installs a new version from Pai. The saved game stays on the computer.
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

const DEV = { name: 'Pai Chanut', phone: '+66816351945', phoneShown: '+66 81 635 1945', whatsapp: 'https://wa.me/66816351945', line: 'https://line.me/ti/p/~paichanut', email: 'paichanut@gmail.com' }

function expiredPage() {
  const d = new Date(END)
  const en = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const th = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
  const btn = (href, text) => `<a href="${href}">${text}</a>`
  return `<!doctype html><meta charset="utf-8"><title>Live by Scoreboard — Contact for license</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0f14;color:#e8edf2;font:18px system-ui,sans-serif;text-align:center}
main{max-width:640px;padding:40px}h1{font-size:30px;margin:0 0 8px}p{color:#aab4bf;line-height:1.5}
.who{margin:28px 0 12px;font-size:20px}.links{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
a{display:inline-block;padding:12px 18px;border-radius:10px;background:#1c2530;color:#e8edf2;text-decoration:none;font-weight:600}
a:hover{background:#2a3644}.v{margin-top:28px;font-size:13px;color:#66717d}
</style>
<main>
<h1>🏒 Live by Scoreboard</h1>
<p>This version expired on <b>${en}</b>.<br>Please install a new version to keep using the app. Your saved game stays on this computer.</p>
<p>เวอร์ชันนี้หมดอายุแล้วเมื่อ <b>${th}</b><br>กรุณาติดตั้งเวอร์ชันใหม่เพื่อใช้งานต่อ เกมที่บันทึกไว้ยังอยู่ในเครื่องนี้</p>
<div class="who">Contact for license · ติดต่อขอ license · <b>${DEV.name}</b></div>
<div class="links">${btn(`tel:${DEV.phone}`, `📞 ${DEV.phoneShown}`)}${btn(DEV.whatsapp, 'WhatsApp')}${btn(DEV.line, 'LINE')}${btn(`mailto:${DEV.email}`, `✉️ ${DEV.email}`)}</div>
<div class="v">version ${app.getVersion()}</div>
</main>`
}

module.exports = { isExpired, watchTime, expiredPage, EXPIRES }
