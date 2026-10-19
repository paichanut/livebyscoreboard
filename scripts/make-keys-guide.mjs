// Keyboard shortcuts guide, English + Thai, one A4 page: public/keyboard-shortcuts.html → .pdf.
// Built from the app's own key list (src/options.js DEFAULT_KEYS / KEY_GROUPS / KEY_LABELS), so it always shows the
// default keys the app ships with. Linked from Control → ⌨ Help.
// PW_CHROMIUM_PATH=/path/to/chrome node scripts/make-keys-guide.mjs [png-preview-path]
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_KEYS, KEY_GROUPS, KEY_LABELS, keyName } from '../src/options.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const TH = {
  homeGoal: 'สกอร์ +1', homeGoalMinus: 'สกอร์ −1', homeShot: 'ยิงเข้ากรอบ +1', homeShotMinus: 'ยิงเข้ากรอบ −1',
  awayGoal: 'สกอร์ +1', awayGoalMinus: 'สกอร์ −1', awayShot: 'ยิงเข้ากรอบ +1', awayShotMinus: 'ยิงเข้ากรอบ −1',
  startAll: 'เริ่มเวลาทั้งหมด (นาฬิกา + โทษ)', stopAll: 'หยุดเวลาทั้งหมด',
  startClockOnly: 'เริ่มเวลาช่วงเกมอย่างเดียว', stopClockOnly: 'หยุดเวลาช่วงเกม', resetClock: 'รีเซ็ตเวลาช่วงเกม',
  penaltiesOn: 'เริ่มเวลาโทษทั้งหมด', penaltiesOff: 'หยุดเวลาโทษทั้งหมด', penaltyOn: 'เริ่มเวลาโทษ', penaltyOff: 'หยุดเวลาโทษ',
  removePenalty: 'ลบโทษที่ใส่ล่าสุด', timeout1: 'ขอเวลานอก ทีม 1', timeout2: 'ขอเวลานอก ทีม 2', timeOfDay: 'แสดง / ซ่อนเวลาปัจจุบัน',
  startStop: 'เริ่ม / หยุดนาฬิกา (กดสลับ)', clockPlus: 'นาฬิกา +1 วินาที', clockMinus: 'นาฬิกา −1 วินาที',
  periodPlus: 'ช่วงถัดไป', periodMinus: 'ช่วงก่อนหน้า',
  goalLightHome: 'ไฟประตู: ทีม 1', goalLightAway: 'ไฟประตู: ทีม 2', goalLightOff: 'ปิดไฟประตู',
  newGame: 'เริ่มเกมใหม่', horn: 'เสียงแตร', buzzer: 'เสียงออด', showDisplay: 'เปิดจอสกอร์บอร์ด', correction: 'หน้าแก้เวลา (ตั้งนาฬิกา)',
}
const GROUP_TH = { 'Team 1 (home)': 'ทีม 1 (เหย้า)', 'Team 2 (away)': 'ทีม 2 (เยือน)', 'Main clock': 'นาฬิกาหลัก', Period: 'ช่วงเกม', 'Goal light': 'ไฟประตู', Other: 'อื่น ๆ' }
const COLOR = { 'Team 1 (home)': '#e63946', 'Team 2 (away)': '#3a86ff', 'Main clock': '#f4a100', Period: '#2a9d8f', 'Goal light': '#8338ec', Other: '#555' }

// which group (color) each key code belongs to, for the keyboard picture
const groupOf = {}
for (const [g, names] of KEY_GROUPS) for (const n of names) groupOf[DEFAULT_KEYS[n]] = g

// a plain keyboard: [code, label, width in key units]
const ROWS = [
  [['Escape', 'Esc', 1], ['gap', '', .5], ...['F1', 'F2', 'F3', 'F4'].map(f => [f, f, 1]), ['gap', '', .5], ...['F5', 'F6', 'F7', 'F8'].map(f => [f, f, 1]), ['gap', '', .5], ...['F9', 'F10', 'F11', 'F12'].map(f => [f, f, 1])],
  [['Backquote', '`', 1], ...'1234567890'.split('').map(d => [`Digit${d}`, d, 1]), ['Minus', '-', 1], ['Equal', '=', 1], ['Backspace', '⌫', 2]],
  [['Tab', 'Tab', 1.5], ...'QWERTYUIOP'.split('').map(k => [`Key${k}`, k, 1]), ['BracketLeft', '[', 1], ['BracketRight', ']', 1], ['Backslash', '\\', 1.5]],
  [['CapsLock', 'Caps', 1.75], ...'ASDFGHJKL'.split('').map(k => [`Key${k}`, k, 1]), ['Semicolon', ';', 1], ['Quote', "'", 1], ['Enter', 'Enter', 2.25]],
  [['ShiftLeft', 'Shift', 2.25], ...'ZXCVBNM'.split('').map(k => [`Key${k}`, k, 1]), ['Comma', ',', 1], ['Period', '.', 1], ['Slash', '/', 1], ['ShiftRight', 'Shift', 2.75]],
  [['gap', '', 3.75], ['Space', 'Space', 6.25], ['gap', '', .5], ['ArrowLeft', '←', 1], ['ArrowDown', '↓', 1], ['ArrowUp', '↑', 1], ['ArrowRight', '→', 1]],
]
const U = 11.4 // mm per key unit
const keyboard = ROWS.map(row => `<div class="krow">${row.map(([code, label, w]) => {
  if (code === 'gap') return `<span class="kgap" style="width:${w * U}mm"></span>`
  const g = groupOf[code]
  return `<span class="kcap${g ? ' on' : ''}" style="width:${w * U - 1}mm${g ? `;--g:${COLOR[g]}` : ''}">${label}</span>`
}).join('')}</div>`).join('')

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const ARROWS = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Backquote: '`' }
const cap = code => ARROWS[code] || keyName(code)
const groups = KEY_GROUPS.map(([g, names]) => `
  <section style="--g:${COLOR[g]}">
    <h2><span>${esc(g)}</span><span class="th">${GROUP_TH[g]}</span></h2>
    ${names.map(n => `<div class="row"><kbd>${esc(cap(DEFAULT_KEYS[n]))}</kbd><span class="txt"><span class="en">${esc(KEY_LABELS[n])}</span><span class="th">${TH[n]}</span></span></div>`).join('')}
  </section>`).join('')

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Live by Scoreboard · Keyboard shortcuts</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700&family=Sarabun:wght@400;600;700&family=Barlow+Condensed:wght@700;800&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 8mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Barlow, Sarabun, sans-serif; color: #111; width: 194mm; }
header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid #111; padding-bottom: 2mm; margin-bottom: 3mm; }
h1 { font-family: 'Barlow Condensed', sans-serif; font-size: 21pt; font-weight: 800; line-height: 1; }
h1 .th { font-family: Sarabun, sans-serif; font-size: 15pt; font-weight: 700; margin-left: 3mm; color: #b0121f; }
header .sub { font-size: 7.5pt; color: #444; text-align: right; line-height: 1.35; }
header .sub .th { font-family: Sarabun, sans-serif; }
.kb { display: flex; flex-direction: column; align-items: center; gap: 1mm; padding: 2.5mm; border: 1px solid #ccc; border-radius: 3mm; background: #f6f7f9; margin-bottom: 2mm; }
.krow { display: flex; gap: 1mm; }
.kcap { height: 7.6mm; display: flex; align-items: center; justify-content: center; border-radius: 1.4mm; background: #fff; border: 1px solid #c9ced6; font-size: 7pt; font-weight: 700; color: #9aa2ad; }
.kcap.on { background: var(--g); border-color: var(--g); color: #fff; font-size: 8.5pt; }
.kgap { display: inline-block; }
.legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 1.5mm 4mm; font-size: 7.5pt; font-weight: 600; margin-bottom: 3mm; }
.legend i { display: inline-block; width: 3mm; height: 3mm; border-radius: .8mm; background: var(--g); vertical-align: -.4mm; margin-right: 1mm; }
.legend .th { font-family: Sarabun, sans-serif; color: #555; margin-left: .8mm; }
.cols { column-count: 2; column-gap: 5mm; }
section { break-inside: avoid; margin-bottom: 2.6mm; border-left: 1.4mm solid var(--g); padding-left: 2mm; }
h2 { display: flex; gap: 2mm; align-items: baseline; font-family: 'Barlow Condensed', sans-serif; font-size: 11pt; font-weight: 800; text-transform: uppercase; color: var(--g); margin-bottom: .8mm; }
h2 .th { font-family: Sarabun, sans-serif; text-transform: none; font-size: 9.5pt; }
.row { display: grid; grid-template-columns: 13mm 1fr; column-gap: 2mm; align-items: center; padding: .45mm 0; border-bottom: 1px solid #eee; }
.row .txt { display: flex; flex-wrap: wrap; column-gap: 2mm; align-items: baseline; }
.row kbd { justify-self: start; min-width: 9mm; text-align: center; font-family: Barlow, sans-serif; font-weight: 700; font-size: 8pt; background: #111; color: #fff; border-radius: 1.2mm; padding: .7mm 1.5mm; }
.row .en { font-size: 8pt; font-weight: 600; line-height: 1.15; }
.row .th { font-family: Sarabun, sans-serif; font-size: 7.6pt; color: #b0121f; line-height: 1.2; }
.notes { margin-top: 1mm; border-top: 1.5px solid #111; padding-top: 2mm; display: grid; grid-template-columns: 1fr 1fr; gap: 1.2mm 5mm; font-size: 7.3pt; line-height: 1.3; }
.notes b { font-weight: 700; }
.notes .th { font-family: Sarabun, sans-serif; color: #333; }
</style></head><body>
<header>
  <h1>Keyboard shortcuts<span class="th">คีย์ลัด</span></h1>
  <div class="sub">Live by Scoreboard · control page / หน้าคอนโทรล<br>
  <span>Default keys</span> · <span class="th">คีย์ตั้งต้นของแอป</span></div>
</header>
<div class="kb">${keyboard}</div>
<div class="legend">${KEY_GROUPS.map(([g]) => `<span style="--g:${COLOR[g]}"><i></i>${esc(g)}<span class="th">${GROUP_TH[g]}</span></span>`).join('')}</div>
<div class="cols">${groups}</div>
<div class="notes">
  <div><b>Start / stop act the moment the key goes down</b>, and the clock stops at the time of the press. Holding a key does not repeat it.</div>
  <div class="th"><b>เริ่ม / หยุด ทำงานทันทีที่กดคีย์ลง</b> นาฬิกาหยุดที่เวลาตอนกดจริง กดค้างไว้ไม่สลับซ้ำ</div>
  <div><b>Change any key:</b> Options → Keys. The keys in use are always listed in Control → ⌨ Help.</div>
  <div class="th"><b>เปลี่ยนคีย์ได้:</b> Options → Keys · คีย์ที่ใช้อยู่จริงดูได้ที่ คอนโทรล → ⌨ Help</div>
  <div><b>Keys don’t work</b> while typing in a box or while a window (sheet) is open on the control page.</div>
  <div class="th"><b>คีย์ไม่ทำงาน</b> ตอนพิมพ์ในช่องข้อความ หรือตอนมีหน้าต่างเปิดค้างบนหน้าคอนโทรล</div>
  <div><b>Rink A / B controllers</b> (small ice): only score and shot keys. <b>Desktop app:</b> F4 switches control ↔ scoreboard, F11 full screen on the scoreboard.</div>
  <div class="th"><b>คอนโทรล Rink A / B</b> (small ice): ใช้ได้แค่คีย์สกอร์และยิงเข้ากรอบ · <b>แอป desktop:</b> F4 สลับหน้าคอนโทรล ↔ สกอร์บอร์ด, F11 เต็มจอบนสกอร์บอร์ด</div>
</div>
</body></html>`

fs.writeFileSync(path.join(root, 'public/keyboard-shortcuts.html'), html)
const b = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {})
const p = await (await b.newContext({ viewport: { width: 794, height: 1123 } })).newPage()
await p.goto('file://' + path.join(root, 'public/keyboard-shortcuts.html'), { waitUntil: 'networkidle' })
await p.evaluate(() => document.fonts.ready)
await p.pdf({ path: path.join(root, 'public/keyboard-shortcuts.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true })
if (process.argv[2]) await p.screenshot({ path: process.argv[2], fullPage: true })
console.log('pages:', await p.evaluate(() => Math.ceil(document.body.scrollHeight / 1123)))
await b.close()
