// Control-page UI strings. Display labels (PERIOD / SHOTS / …) are separate: they are free text in opts.labels.
// Add a language: add a key to UI and to LANGS; missing keys fall back to English.

export const LANGS = [['en', 'English'], ['th', 'ไทย']]

export const UI = {
  en: {
    game: 'game', live: '● live', local: '● local only', connecting: 'connecting…', up: '▲ up',
    start: 'START', stop: 'STOP', set: 'SET', periodPrev: '◀ Period', periodNext: 'Period ▶', reset: 'Reset',
    horn: '📯 Horn', buzzer: '🔔 Buzzer', to: 'T/O', end: 'end',
    goal: '+ GOAL', goalHorn: '+ GOAL 📯', minus1: '−1', shotPlus: 'Shot +', penalty: '+ Penalty', infraction: 'Infraction', pen: 'PEN',
    options: '⚙ Options', display: '📺 Display', qr: 'QR', summary: '📋 Summary',
    confirmNext: 'Next period? Clock will reset.', confirmPrev: 'Previous period? Clock will reset.',
    confirmResetClock: 'Reset period clock?', confirmNewGame: 'Start a new game? Scores and clock reset.', home: 'Home', confirmHome: 'Go back to Home? This game keeps running and saved; you can open it again from Live games.', confirmRemovePenalty: 'Remove this penalty?',
    length: 'Length', min: 'min', addPenalty: 'Add penalty', cancel: 'Cancel',
    setClock: 'Set clock', remainingTime: '(remaining time)', minutes: 'Minutes', seconds: 'Seconds', setBtn: 'Set',
    whichTeam: '— which team?',
    publicLink: 'Public link (read-only)', copyLink: 'Copy link', share: 'Share…',
    publicHint: 'Anyone with this link can watch. Nobody can change scores without your operator link.',
    obsOverlay: 'OBS overlay:', copyBanner: 'Copy banner link', operatorLink: 'Operator link (keep private)', copyOperator: 'Copy operator link', close: 'Close',
    lockedTitle: 'Locked', lockedText: 'Running game {id} needs an operator. Log in, or paste a single-game key from an operator link. Watching needs nothing: open the public display.',
    keyPlaceholder: 'single-game key', unlock: 'Use key', login: 'Log in', logout: 'log out', keyOnly: 'game key only', editTeam: 'Rename team', homeTeam: 'Home team', awayTeam: 'Away team', teamName: 'Team name', teamColor: 'Color', teamLogo: 'Logo', savedTeams: 'Saved teams (tap to use)', openDisplay: 'Open public display', newGame: 'New game',
    summaryTitle: 'Game summary', copy: 'Copy', copied: 'Copied', downloadTxt: 'Download .txt', downloadCsv: 'Download .csv', printPdf: 'Print / PDF', contactDev: 'Contact Pai', refSignals: 'Referee signals (A4 PDF)', offside: 'Offside', addScorer: 'Scorer', goalDetails: 'Goal', scorer: 'Goal #', assist1: 'Assist 1 #', assist2: 'Assist 2 #', situation: 'Situation', emptyNet: 'empty net',
    soGoal: 'Goal', soMiss: 'Miss', undo: 'Undo', soHint: 'Shootout: record each attempt, then tap + GOAL for the winner.', soClear: 'Clear shootout',
    tabs: { Game: 'Game', Teams: 'Teams', Keys: 'Keys', Colors: 'Colors', Sounds: 'Sounds', Text: 'Text', Banner: 'Banner', Other: 'Other' },
    save: 'Save', language: 'Control page language',
    playLive: '🟢 PLAY LIVE', whistleOn: '⏸ WHISTLE', whistleHintLive: 'tap at the whistle to pause penalty clocks', whistleHintPaused: 'penalty clocks paused · tap at the faceoff',
    running: 'Running', paused: 'Paused', allTimes: 'All times', periodTime: 'Period time', allPenalties: 'All penalties',
    startBtn: 'Start', stopBtn: 'Stop', showTimeOfDay: 'Show time of day', showPeriodTime: 'Hide time of day', todOnDisplay: '+ time of day on display',
    timeoutBtn: 'Timeout', goalLight: 'Goal', none: 'None', scoreLbl: 'Score', correction: 'Correction', help: 'Help', savePenalty: 'Save penalty',
    keysTitle: 'Keyboard shortcuts', keysHint: 'Same layout as PC Scoreboards. Change any key in Options → Keys.',
    waiting: 'waiting', kind_minor: '2 min', kind_double: 'double', kind_major: 'major', kind_misconduct: 'misconduct', kind_game: 'game misconduct', gmShort: 'GM', restOfGame: 'rest of game', coincidental: 'Coincidental (not on display)', coincShort: 'coincidental', psGoal: 'Penalty-shot goal', notOnDisplay: 'not on display',
  },
  th: {
    game: 'เกม', live: '● ออนไลน์', local: '● เครื่องนี้เท่านั้น', connecting: 'กำลังเชื่อมต่อ…', up: '▲ นับขึ้น',
    start: 'เริ่ม', stop: 'หยุด', set: 'ตั้ง', periodPrev: '◀ ช่วง', periodNext: 'ช่วง ▶', reset: 'รีเซ็ต',
    horn: '📯 แตร', buzzer: '🔔 กริ่ง', to: 'เวลานอก', end: 'จบ',
    goal: '+ ประตู', goalHorn: '+ ประตู 📯', minus1: '−1', shotPlus: 'ยิง +', penalty: '+ โทษ', infraction: 'ประเภทฟาวล์', pen: 'โทษ',
    options: '⚙ ตั้งค่า', display: '📺 จอแสดงผล', qr: 'QR', summary: '📋 สรุปเกม',
    confirmNext: 'ไปช่วงถัดไป? นาฬิกาจะรีเซ็ต', confirmPrev: 'กลับช่วงก่อนหน้า? นาฬิกาจะรีเซ็ต',
    confirmResetClock: 'รีเซ็ตนาฬิกาของช่วงนี้?', confirmNewGame: 'เริ่มเกมใหม่? คะแนนและนาฬิกาจะรีเซ็ต', home: 'หน้าแรก', confirmHome: 'กลับหน้าแรก? เกมนี้ยังอยู่และเดินต่อ เปิดกลับมาได้จากหน้า Live games', confirmRemovePenalty: 'ลบโทษนี้?',
    length: 'ระยะเวลา', min: 'นาที', addPenalty: 'เพิ่มโทษ', cancel: 'ยกเลิก',
    setClock: 'ตั้งนาฬิกา', remainingTime: '(เวลาที่เหลือ)', minutes: 'นาที', seconds: 'วินาที', setBtn: 'ตั้งค่า',
    whichTeam: '— ทีมไหน?',
    publicLink: 'ลิงก์สาธารณะ (ดูอย่างเดียว)', copyLink: 'คัดลอกลิงก์', share: 'แชร์…',
    publicHint: 'ใครก็ดูได้จากลิงก์นี้ แต่แก้คะแนนไม่ได้ถ้าไม่มีลิงก์ผู้ควบคุม',
    obsOverlay: 'โอเวอร์เลย์ OBS:', copyBanner: 'คัดลอกลิงก์แบนเนอร์', operatorLink: 'ลิงก์ผู้ควบคุม (เก็บเป็นความลับ)', copyOperator: 'คัดลอกลิงก์ผู้ควบคุม', close: 'ปิด',
    lockedTitle: 'ล็อกอยู่', lockedText: 'ต้องเป็นผู้ควบคุมถึงจะคุมเกม {id} ได้ เข้าสู่ระบบ หรือวางคีย์ของเกมนี้จากลิงก์ผู้ควบคุม ส่วนการดูไม่ต้องทำอะไร เปิดจอแสดงผลสาธารณะได้เลย',
    keyPlaceholder: 'คีย์ของเกมนี้', unlock: 'ใช้คีย์', login: 'เข้าสู่ระบบ', logout: 'ออกจากระบบ', keyOnly: 'ใช้คีย์เกม', editTeam: 'เปลี่ยนชื่อทีม', homeTeam: 'ทีมเหย้า', awayTeam: 'ทีมเยือน', teamName: 'ชื่อทีม', teamColor: 'สี', teamLogo: 'โลโก้', savedTeams: 'ทีมที่เคยบันทึก (แตะเพื่อใช้)', openDisplay: 'เปิดจอแสดงผลสาธารณะ', newGame: 'เกมใหม่',
    summaryTitle: 'สรุปเกม', copy: 'คัดลอก', copied: 'คัดลอกแล้ว', downloadTxt: 'ดาวน์โหลด .txt', downloadCsv: 'ดาวน์โหลด .csv', printPdf: 'พิมพ์ / PDF', contactDev: 'ติดต่อ Pai', refSignals: 'ท่าสัญญาณกรรมการ (PDF A4)', offside: 'ล้ำหน้า', addScorer: 'ใส่คนยิง', goalDetails: 'ประตู', scorer: 'คนยิง #', assist1: 'แอสซิสต์ 1 #', assist2: 'แอสซิสต์ 2 #', situation: 'สถานการณ์', emptyNet: 'ประตูว่าง',
    soGoal: 'เข้า', soMiss: 'ไม่เข้า', undo: 'ย้อนกลับ', soHint: 'ชู้ตเอาต์: บันทึกผลทีละคน แล้วกด + ประตู ให้ทีมที่ชนะ', soClear: 'ล้างชู้ตเอาต์',
    tabs: { Game: 'เกม', Teams: 'ทีม', Keys: 'คีย์ลัด', Colors: 'สี', Sounds: 'เสียง', Text: 'ข้อความ', Banner: 'แบนเนอร์', Other: 'อื่นๆ' },
    save: 'บันทึก', language: 'ภาษาหน้าควบคุม',
    playLive: '🟢 เล่นอยู่', whistleOn: '⏸ นกหวีด', whistleHintLive: 'กดตอนเป่านกหวีด เพื่อหยุดเวลาโทษ', whistleHintPaused: 'เวลาโทษหยุดอยู่ · กดตอนเฟซออฟ',
    running: 'เดินอยู่', paused: 'หยุด', allTimes: 'ทุกเวลา', periodTime: 'เวลาช่วง', allPenalties: 'เวลาโทษทั้งหมด',
    startBtn: 'เริ่ม', stopBtn: 'หยุด', showTimeOfDay: 'แสดงเวลาปัจจุบัน', showPeriodTime: 'ซ่อนเวลาปัจจุบัน', todOnDisplay: 'จอแสดงเวลาปัจจุบันด้วย',
    timeoutBtn: 'เวลานอก', goalLight: 'ไฟประตู', none: 'ปิด', scoreLbl: 'คะแนน', correction: 'แก้เวลา', help: 'ช่วยเหลือ', savePenalty: 'บันทึกโทษ',
    keysTitle: 'คีย์ลัด', keysHint: 'ตำแหน่งเดียวกับ PC Scoreboards เปลี่ยนคีย์ได้ที่ ตั้งค่า → คีย์ลัด',
    waiting: 'รอ', kind_minor: '2 นาที', kind_double: 'ดับเบิล', kind_major: 'เมเจอร์', kind_misconduct: 'มิสคอนดักต์', kind_game: 'เกมมิสคอนดักต์', gmShort: 'GM', restOfGame: 'ตลอดเกม', coincidental: 'โทษหักล้าง (ไม่ขึ้นจอ)', coincShort: 'หักล้าง', psGoal: 'ประตูจากลูกโทษ', notOnDisplay: 'ไม่ขึ้นจอ',
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
