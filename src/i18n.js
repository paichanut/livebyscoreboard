// Control-page UI strings. Display labels (PERIOD / SHOTS / …) are separate: they are free text in opts.labels.
// Add a language: add a key to UI and to LANGS; missing keys fall back to English.

export const LANGS = [['en', 'English'], ['th', 'ไทย']]

export const UI = {
  en: {
    game: 'game', live: '● live', local: '● local only', connecting: 'connecting…', up: '▲ up',
    start: 'START', stop: 'STOP', set: 'SET', periodPrev: '◀ Period', periodNext: 'Period ▶', reset: 'Reset',
    horn: '📯 Horn', buzzer: '🔔 Buzzer', to: 'T/O', end: 'end',
    goal: '+ GOAL', minus1: '−1', shotPlus: 'Shot +', penalty: 'Penalty', pen: 'PEN',
    options: '⚙ Options', display: '📺 Display', qr: 'QR', summary: '📋 Summary',
    confirmNext: 'Next period? Clock will reset.', confirmPrev: 'Previous period? Clock will reset.',
    confirmResetClock: 'Reset period clock?', confirmNewGame: 'Start a new game? Scores and clock reset.', confirmRemovePenalty: 'Remove this penalty?',
    length: 'Length', min: 'min', addPenalty: 'Add penalty', cancel: 'Cancel',
    setClock: 'Set clock', remainingTime: '(remaining time)', minutes: 'Minutes', seconds: 'Seconds', setBtn: 'Set',
    whichTeam: '— which team?',
    publicLink: 'Public link (read-only)', copyLink: 'Copy link', share: 'Share…',
    publicHint: 'Anyone with this link can watch. Nobody can change scores without your operator link.',
    obsOverlay: 'OBS overlay:', copyBanner: 'Copy banner link', operatorLink: 'Operator link (keep private)', copyOperator: 'Copy operator link', close: 'Close',
    lockedTitle: 'Locked', lockedText: 'Game {id} exists and this browser doesn\'t have its operator key. Paste the key from the operator link, or open the public display.',
    keyPlaceholder: 'operator key', unlock: 'Unlock', openDisplay: 'Open public display', newGame: 'New game',
    summaryTitle: 'Game summary', copy: 'Copy', copied: 'Copied', downloadTxt: 'Download .txt', downloadCsv: 'Download .csv',
    soGoal: 'Goal', soMiss: 'Miss', undo: 'Undo', soHint: 'Shootout: record each attempt, then tap + GOAL for the winner.', soClear: 'Clear shootout',
    tabs: { Game: 'Game', Teams: 'Teams', Keys: 'Keys', Colors: 'Colors', Sounds: 'Sounds', Text: 'Text', Banner: 'Banner', Other: 'Other' },
    save: 'Save', language: 'Control page language',
    localWarn: 'Local mode: this control only reaches displays open in this same browser. Phones, TVs and OBS on other devices will NOT follow. Add the Supabase keys on Vercel (see README) to go live.',
  },
  th: {
    game: 'เกม', live: '● ออนไลน์', local: '● เครื่องนี้เท่านั้น', connecting: 'กำลังเชื่อมต่อ…', up: '▲ นับขึ้น',
    start: 'เริ่ม', stop: 'หยุด', set: 'ตั้ง', periodPrev: '◀ ช่วง', periodNext: 'ช่วง ▶', reset: 'รีเซ็ต',
    horn: '📯 แตร', buzzer: '🔔 กริ่ง', to: 'เวลานอก', end: 'จบ',
    goal: '+ ประตู', minus1: '−1', shotPlus: 'ยิง +', penalty: 'ลงโทษ', pen: 'โทษ',
    options: '⚙ ตั้งค่า', display: '📺 จอแสดงผล', qr: 'QR', summary: '📋 สรุปเกม',
    confirmNext: 'ไปช่วงถัดไป? นาฬิกาจะรีเซ็ต', confirmPrev: 'กลับช่วงก่อนหน้า? นาฬิกาจะรีเซ็ต',
    confirmResetClock: 'รีเซ็ตนาฬิกาของช่วงนี้?', confirmNewGame: 'เริ่มเกมใหม่? คะแนนและนาฬิกาจะรีเซ็ต', confirmRemovePenalty: 'ลบโทษนี้?',
    length: 'ระยะเวลา', min: 'นาที', addPenalty: 'เพิ่มโทษ', cancel: 'ยกเลิก',
    setClock: 'ตั้งนาฬิกา', remainingTime: '(เวลาที่เหลือ)', minutes: 'นาที', seconds: 'วินาที', setBtn: 'ตั้งค่า',
    whichTeam: '— ทีมไหน?',
    publicLink: 'ลิงก์สาธารณะ (ดูอย่างเดียว)', copyLink: 'คัดลอกลิงก์', share: 'แชร์…',
    publicHint: 'ใครก็ดูได้จากลิงก์นี้ แต่แก้คะแนนไม่ได้ถ้าไม่มีลิงก์ผู้ควบคุม',
    obsOverlay: 'โอเวอร์เลย์ OBS:', copyBanner: 'คัดลอกลิงก์แบนเนอร์', operatorLink: 'ลิงก์ผู้ควบคุม (เก็บเป็นความลับ)', copyOperator: 'คัดลอกลิงก์ผู้ควบคุม', close: 'ปิด',
    lockedTitle: 'ล็อกอยู่', lockedText: 'เกม {id} มีอยู่แล้ว แต่เบราว์เซอร์นี้ไม่มีคีย์ผู้ควบคุม วางคีย์จากลิงก์ผู้ควบคุม หรือเปิดจอแสดงผลสาธารณะ',
    keyPlaceholder: 'คีย์ผู้ควบคุม', unlock: 'ปลดล็อก', openDisplay: 'เปิดจอแสดงผลสาธารณะ', newGame: 'เกมใหม่',
    summaryTitle: 'สรุปเกม', copy: 'คัดลอก', copied: 'คัดลอกแล้ว', downloadTxt: 'ดาวน์โหลด .txt', downloadCsv: 'ดาวน์โหลด .csv',
    soGoal: 'เข้า', soMiss: 'ไม่เข้า', undo: 'ย้อนกลับ', soHint: 'ชู้ตเอาต์: บันทึกผลทีละคน แล้วกด + ประตู ให้ทีมที่ชนะ', soClear: 'ล้างชู้ตเอาต์',
    tabs: { Game: 'เกม', Teams: 'ทีม', Keys: 'คีย์ลัด', Colors: 'สี', Sounds: 'เสียง', Text: 'ข้อความ', Banner: 'แบนเนอร์', Other: 'อื่นๆ' },
    save: 'บันทึก', language: 'ภาษาหน้าควบคุม',
    localWarn: 'Local mode: หน้าควบคุมนี้คุยได้เฉพาะจอที่เปิดในเบราว์เซอร์เดียวกันเท่านั้น มือถือ ทีวี หรือ OBS บนเครื่องอื่นจะไม่ตาม ต้องใส่ Supabase keys ใน Vercel (ดู README) ถึงจะ live',
  },
}

// t('start') → string for the given language, English fallback. {id}-style placeholders are filled from vars.
export function translator(lang) {
  const d = UI[lang] || UI.en
  return (key, vars) => {
    let v = d[key] ?? UI.en[key] ?? key
    if (vars && typeof v === 'string') for (const [k, val] of Object.entries(vars)) v = v.replace(`{${k}}`, val)
    return v
  }
}
