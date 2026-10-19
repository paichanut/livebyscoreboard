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
    summaryTitle: 'Game summary', copy: 'Copy', copied: 'Copied', downloadTxt: 'Download .txt', downloadCsv: 'Download .csv', printPdf: 'Print / PDF', contactDev: 'Contact for license', unlicensed: 'This copy is unlicensed (its licence ended on {date}). Everything still works, but the scoreboards show UNLICENSED until a licensed version is installed.', offlineApp: 'offline · this computer', relText: '{team} has {who}{inf} in the box, {time} left. IIHF Rule 16: a power-play goal ends that minor penalty. Release it?', relDouble: 'Double minor: only the current 2:00 ends; the second 2:00 starts now.', relYes: 'Goal + release {who}', relNo: 'Goal, keep {who} in the box', linkBoard: 'Scoreboard', linkCenterBoard: 'Center scoreboard', linkShift: 'Shift clock', linkCenterControl: 'Center controller (C: clock + both rinks)', linkRinkControl: 'Controller', linksWatch: 'Watch (public)', linksRun: 'Run the game (keep private)', shiftReset: 'New shift', confirmNewShift: 'Start a new shift now? The shift clock starts over.', rinkController: '{rink} controller (score and penalties; the clock is run from the center controller)', copyRinkController: 'Copy controller link', shareBtn: 'Online link', shareTitle: 'Online link', shareHelp: 'Puts this game on the internet: the scoreboards and banners for anyone to watch (phones, OBS), and the controllers for operators: the controller links carry this app’s key (open once, then the phone stays logged in; no website login). Needs internet; without it the game works as usual and the link waits. The link changes every time the app starts; it is sent to Telegram each time.', shareOn: '● Online link is ON (tap to turn off)', shareOff: 'Turn on the online link', share_off: 'off', share_downloading: 'Downloading Cloudflare tunnel (once, ~60 MB)…', share_starting: 'Getting the link…', share_verifying: 'Checking the link works from the internet…', share_online: '● Online', share_offline: 'No internet: trying again every minute…', shareLocal: 'OBS on this computer (works without internet)', shareRun: 'Run the game (keep these links private: the link is the key)', newKey: 'New controller key', newKeyConfirm: 'Make a new controller key? Controller links sent before stop working and phones using them are logged out. The new links go to Telegram.', shareBoard: 'Scoreboard', shareBanner: 'OBS banner', open: 'Open', saved: 'Saved', tgHelp: 'Optional: the link is sent to a Telegram chat. Make a bot with @BotFather, paste its token, send any message to the bot (or add it to a group), then press Find.', tgToken: 'Bot token', tgTokenSet: 'saved (type to change)', tgChat: 'Chat ID', tgFind: 'Find', tgFound: 'Chat found', tgTest: 'Send test', updCheck: 'Check for updates', updChecking: 'checking for updates…', updNone: 'up to date', updError: "couldn't check (offline?)", updDownloading: 'downloading update {p}%', updReady: 'Update {v} ready · Restart', updConfirm: 'Restart now and install version {v}? The game is kept.', updAvailable: 'New version {v} · Download', refSignals: 'Referee signals (A4 PDF)', keysPdf: 'Keyboard shortcuts, English + Thai (A4 PDF)', offside: 'Offside', addScorer: 'Scorer', goalDetails: 'Goal', scorer: 'Goal #', assist1: 'Assist 1 #', assist2: 'Assist 2 #', situation: 'Situation', emptyNet: 'empty net',
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
    summaryTitle: 'สรุปเกม', copy: 'คัดลอก', copied: 'คัดลอกแล้ว', downloadTxt: 'ดาวน์โหลด .txt', downloadCsv: 'ดาวน์โหลด .csv', printPdf: 'พิมพ์ / PDF', contactDev: 'ติดต่อขอ license', unlicensed: 'เครื่องนี้ไม่มี license แล้ว (หมดเมื่อ {date}) ยังใช้งานได้ตามปกติ แต่สกอร์บอร์ดจะขึ้น UNLICENSED จนกว่าจะติดตั้งเวอร์ชันที่มี license', offlineApp: 'ออฟไลน์ · เครื่องนี้', relText: '{team} มี {who}{inf} อยู่ในกล่องโทษ เหลือ {time} กฎ IIHF ข้อ 16: ยิงประตูตอนได้เปรียบจำนวนคน จะจบโทษ minor นั้นทันที ปล่อยออกเลยไหม?', relDouble: 'Double minor: จบเฉพาะ 2:00 ที่กำลังนับ แล้วเริ่มนับ 2:00 ที่สองทันที', relYes: 'ประตู + ปล่อย {who} ออก', relNo: 'ประตู แต่ {who} ยังอยู่ในกล่อง', linkBoard: 'สกอร์บอร์ด', linkCenterBoard: 'สกอร์บอร์ดกลาง', linkShift: 'Shift clock', linkCenterControl: 'คอนโทรลกลาง (C: เวลา + ทั้ง 2 ฝั่ง)', linkRinkControl: 'คอนโทรล', linksWatch: 'ดู (สาธารณะ)', linksRun: 'คุมเกม (เก็บเป็นความลับ)', shiftReset: 'เริ่ม shift ใหม่', confirmNewShift: 'เริ่ม shift ใหม่ตอนนี้เลยไหม? shift clock จะเริ่มนับใหม่', rinkController: 'คอนโทรล {rink} (สกอร์และ penalty; เวลาคุมจากคอนโทรลกลาง)', copyRinkController: 'คัดลอกลิงก์คอนโทรล', shareBtn: 'ลิงก์ออนไลน์', shareTitle: 'ลิงก์ออนไลน์', shareHelp: 'เอาเกมนี้ขึ้นอินเทอร์เน็ต: สกอร์บอร์ดและแบนเนอร์ให้ทุกคนดู (มือถือ, OBS) และคอนโทรลสำหรับผู้คุม ลิงก์คอนโทรลมีกุญแจของแอปนี้อยู่ในตัว (เปิดครั้งแรกแล้วมือถือจำไว้ ไม่ต้อง login เว็บ) ต้องมีเน็ต ถ้าไม่มีเน็ตเกมก็ใช้ได้ปกติ ลิงก์จะรอจนต่อได้ ลิงก์เปลี่ยนทุกครั้งที่เปิดแอป และส่งเข้า Telegram ทุกครั้ง', shareOn: '● ลิงก์ออนไลน์เปิดอยู่ (กดเพื่อปิด)', shareOff: 'เปิดลิงก์ออนไลน์', share_off: 'ปิด', share_downloading: 'กำลังโหลด Cloudflare tunnel (ครั้งเดียว ~60 MB)…', share_starting: 'กำลังขอลิงก์…', share_verifying: 'กำลังตรวจว่าลิงก์เปิดจากอินเทอร์เน็ตได้จริง…', share_online: '● ออนไลน์', share_offline: 'ไม่มีเน็ต: ลองใหม่ทุก 1 นาที…', shareLocal: 'OBS บนเครื่องนี้ (ใช้ได้แม้ไม่มีเน็ต)', shareRun: 'คุมเกม (เก็บลิงก์เป็นความลับ: ลิงก์คือกุญแจ)', newKey: 'เปลี่ยนกุญแจคอนโทรล', newKeyConfirm: 'สร้างกุญแจคอนโทรลใหม่? ลิงก์คอนโทรลเก่าจะใช้ไม่ได้ และมือถือที่ใช้อยู่จะถูกออก ลิงก์ใหม่จะส่งเข้า Telegram', shareBoard: 'สกอร์บอร์ด', shareBanner: 'แบนเนอร์ OBS', open: 'เปิด', saved: 'บันทึกแล้ว', tgHelp: 'ไม่บังคับ: ส่งลิงก์เข้าแชท Telegram สร้างบอทกับ @BotFather วาง token ส่งข้อความอะไรก็ได้หาบอท (หรือเพิ่มบอทเข้ากลุ่ม) แล้วกด ค้นหา', tgToken: 'Bot token', tgTokenSet: 'บันทึกแล้ว (พิมพ์เพื่อเปลี่ยน)', tgChat: 'Chat ID', tgFind: 'ค้นหา', tgFound: 'เจอแชทแล้ว', tgTest: 'ส่งทดสอบ', updCheck: 'เช็กอัปเดต', updChecking: 'กำลังเช็กอัปเดต…', updNone: 'เป็นเวอร์ชันล่าสุดแล้ว', updError: 'เช็กไม่ได้ (ไม่มีเน็ต?)', updDownloading: 'กำลังโหลดอัปเดต {p}%', updReady: 'อัปเดต {v} พร้อม · รีสตาร์ท', updConfirm: 'รีสตาร์ทเพื่อติดตั้งเวอร์ชัน {v} เลยไหม? เกมที่เล่นอยู่ไม่หาย', updAvailable: 'มีเวอร์ชันใหม่ {v} · ดาวน์โหลด', refSignals: 'ท่าสัญญาณกรรมการ (PDF A4)', keysPdf: 'คู่มือคีย์ลัด ไทย + อังกฤษ (PDF A4)', offside: 'ล้ำหน้า', addScorer: 'ใส่คนยิง', goalDetails: 'ประตู', scorer: 'คนยิง #', assist1: 'แอสซิสต์ 1 #', assist2: 'แอสซิสต์ 2 #', situation: 'สถานการณ์', emptyNet: 'ประตูว่าง',
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
