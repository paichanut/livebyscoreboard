// Options model — mirrors the PC Scoreboards "Options" dialog, minus the desktop-only bits.

// Same layout as PC Scoreboards "Hockey Scoreboard Pro v3" (Options → Keys), plus Space and the arrows.
export const DEFAULT_KEYS = {
  // Team 1 (home) / Team 2 (away)
  homeGoal: 'KeyQ', homeGoalMinus: 'KeyE', homeShot: 'KeyR', homeShotMinus: 'KeyT',
  awayGoal: 'KeyA', awayGoalMinus: 'KeyD', awayShot: 'KeyF', awayShotMinus: 'KeyG',
  // Main clock
  startAll: 'KeyY', stopAll: 'KeyH',
  startClockOnly: 'KeyO', stopClockOnly: 'KeyP', resetClock: 'KeyL',
  penaltiesOn: 'KeyU', penaltiesOff: 'KeyJ', penaltyOn: 'KeyI', penaltyOff: 'KeyK',
  removePenalty: 'F7', timeout1: 'KeyB', timeout2: 'KeyN', timeOfDay: 'KeyM',
  startStop: 'Space', clockPlus: 'ArrowUp', clockMinus: 'ArrowDown',
  // Period
  periodPlus: 'BracketRight', periodMinus: 'BracketLeft',
  // Goal light
  goalLightHome: 'ArrowLeft', goalLightAway: 'ArrowRight', goalLightOff: 'F8',
  // Other
  newGame: 'F5', horn: 'F9', buzzer: 'F12', showDisplay: 'F3', correction: 'Backquote',
}

export const KEY_GROUPS = [
  ['Team 1 (home)', ['homeGoal', 'homeGoalMinus', 'homeShot', 'homeShotMinus']],
  ['Team 2 (away)', ['awayGoal', 'awayGoalMinus', 'awayShot', 'awayShotMinus']],
  ['Main clock', ['startAll', 'stopAll', 'startClockOnly', 'stopClockOnly', 'resetClock', 'penaltiesOn', 'penaltiesOff', 'penaltyOn', 'penaltyOff', 'removePenalty', 'timeout1', 'timeout2', 'timeOfDay', 'startStop', 'clockPlus', 'clockMinus']],
  ['Period', ['periodPlus', 'periodMinus']],
  ['Goal light', ['goalLightHome', 'goalLightAway', 'goalLightOff']],
  ['Other', ['newGame', 'horn', 'buzzer', 'showDisplay', 'correction']],
]

export const KEY_LABELS = {
  homeGoal: 'Score +1', homeGoalMinus: 'Score −1', homeShot: 'Shots on goal +1', homeShotMinus: 'Shots on goal −1',
  awayGoal: 'Score +1', awayGoalMinus: 'Score −1', awayShot: 'Shots on goal +1', awayShotMinus: 'Shots on goal −1',
  startAll: 'Start all times', stopAll: 'Stop all times',
  startClockOnly: 'Start period time', stopClockOnly: 'Stop period time', resetClock: 'Reset period time',
  penaltiesOn: 'Start all penalties', penaltiesOff: 'Stop all penalties', penaltyOn: 'Start penalty time', penaltyOff: 'Stop penalty time',
  removePenalty: 'Remove penalty (last added)', timeout1: 'Timeout 1', timeout2: 'Timeout 2', timeOfDay: 'Show / hide time of day',
  startStop: 'Start / stop clock (toggle)', clockPlus: 'Clock +1 s', clockMinus: 'Clock −1 s',
  periodPlus: 'Period +1', periodMinus: 'Period −1',
  goalLightHome: 'Goal light: Team 1', goalLightAway: 'Goal light: Team 2', goalLightOff: 'Goal light: none',
  newGame: 'New game', horn: 'Horn sound', buzzer: 'Buzzer sound', showDisplay: 'Show scoreboard (open display)', correction: 'Show correction screen (set clock)',
}

export const SOUND_CHOICES = [
  ['horn-nhl', 'NHL goal horn (4 s)'],
  ['horn-nhl-short', 'NHL horn, short'],
  ['horn', 'Horn'],
  ['horn-loop', 'Horn, long (3 s loop)'],
  ['horn-short', 'Horn, short'],
  ['buzzer', 'Buzzer'],
  ['beep', 'Beep ×3'],
  ['synth-horn', 'Synth horn'],
  ['synth-buzzer', 'Synth buzzer'],
  ['none', 'None'],
]
export const FONT_CHOICES = [
  ['Barlow Condensed', 'Arena (Barlow Condensed)'],
  ['Share Tech Mono', 'LED segments (Share Tech Mono)'],
  ['Oswald', 'Oswald'],
  ['Anton', 'Anton (heavy)'],
  ['Arial', 'Arial'],
]

export const COLOR_FIELDS = [
  ['bg', 'Background'],
  ['card', 'Number background'],
  ['text', 'Text and borders'],
  ['teamName', 'Team names'],
  ['clock', 'Main clock'],
  ['score', 'Scores'],
  ['period', 'Period'],
  ['shots', 'Shots on goal'],
  ['penPlayer', 'Penalty player'],
  ['penTime', 'Penalty time'],
  ['goal', 'Goal indicator'],
]

export function defaultOptions() {
  return {
    // Game setup
    periods: 3,
    otLabel: 'OT',
    smallIce: false, // two games on one rink (Rink A / Rink B) sharing the clock, see game.js rinkView
    shiftMs: 0, // line-change buzzer every … ms (0 = off), counted with the game clock
    otMinutes: 5, // overtime length; IIHF: 5:00 preliminary round, 10:00 playoffs (RB 84)
    clockDir: 'down', // 'down' | 'up'
    timeout1Sec: 30,
    timeout2Sec: 60,
    timeoutWarnSec: 15,
    goalIndicator: true,
    goalOffSec: 15,
    penaltyLengths: [2, 4, 5, 10],
    // Infraction templates on the penalty sheet: tap one to fill the name and the length
    // Penalty quick picks, IIHF 2026/27: the usual minutes for each infraction. `majorGM`: IIHF has no plain
    // major for it, so choosing 5 min adds the game misconduct (Rule 41–62). Other lengths are one tap away.
    penaltyTemplates: [
      { name: 'Tripping', minutes: 2 }, { name: 'Hooking', minutes: 2, majorGM: true }, { name: 'Holding', minutes: 2 },
      { name: 'Interference', minutes: 2 }, { name: 'Slashing', minutes: 2, majorGM: true }, { name: 'Roughing', minutes: 2, majorGM: true },
      { name: 'High-sticking', minutes: 2, majorGM: true }, { name: 'Cross-checking', minutes: 2, majorGM: true }, { name: 'Elbowing', minutes: 2 },
      { name: 'Boarding', minutes: 2 }, { name: 'Charging', minutes: 2 }, { name: 'Checking from behind', minutes: 2, majorGM: true },
      { name: 'Check to head or neck', minutes: 2, majorGM: true }, { name: 'Kneeing', minutes: 2, majorGM: true }, { name: 'Clipping', minutes: 2, majorGM: true },
      { name: 'Body checking', minutes: 2, majorGM: true }, { name: 'Goaltender interference', minutes: 2 },
      { name: 'Delay of game', minutes: 2 }, { name: 'Too many players', minutes: 2 }, { name: 'Unsportsmanlike', minutes: 2 }, { name: 'Diving', minutes: 2 },
      { name: 'High-sticking (injury)', minutes: 4 }, { name: 'Spearing', minutes: 4, majorGM: true }, { name: 'Butt-ending', minutes: 4, majorGM: true },
      { name: 'Fighting', minutes: 5, alsoGame: true },
      { name: 'Misconduct', minutes: 10 },
      { name: 'Major + game misconduct', minutes: 5, alsoGame: true },
      { name: 'Game misconduct', kind: 'game' },
    ],
    templatesV: 2, // 2 = IIHF 2026/27 quick picks; older games get them once in withDefaults
    layout: 'arena', // 'arena' (logos on top, penalty boxes, background photo) | 'full' | 'minimal' (no shots/logos/title, bigger numbers)
    bgImg: '', // arena layout background photo
    bgOpacity: 50, // display page background, % (100 = solid for a TV; lower lets video show through in OBS / camera overlays)
    uiLang: 'en', // control page language: 'en' | 'th' (display labels are the free-text `labels` below)
    // Teams
    homeLogo: '', awayLogo: '',
    // Keys
    keys: { ...DEFAULT_KEYS },
    // Colors (null = theme default)
    colors: {},
    // Sounds
    // same defaults as PC Scoreboards: horn button loops, timeout warning is the short blast
    sounds: { horn: 'horn-nhl', buzzer: 'buzzer', endPeriod: 'buzzer', timeoutStart: 'horn-nhl-short', timeoutWarn: 'horn-short', timeoutEnd: 'horn-nhl-short' },
    soundsV: 2, // 2 = NHL horn defaults; older games are moved over once in withDefaults
    // Text
    labels: { period: 'PERIOD', shots: 'SHOTS', player: 'PLAYER', penalty: 'PENALTY', goal: 'GOAL!', timeout: 'TIMEOUT', pp: 'PP', offside: 'OFFSIDE', shift: 'SHIFT', rinkA: 'RINK A', rinkB: 'RINK B' },
    font: 'Barlow Condensed',
    digits: 'normal', // 'normal' | 'segments'
    // Score banner (OBS overlay)
    banner: {
      chroma: '#00ff00',
      useChroma: true,
      show: { logo: true, title: false, teamLogo: true, teamName: true, score: true, period: true, clock: true, shots: false, penalties: true },
      bg: '#111111', fg: '#ffffff', clockBg: '#ffffff', clockFg: '#000000',
      mirror: false,
    },
    // Other
    title: '',
    bannerImg: '', // replaces title
    logoImg: '',
    topLeftImg: '', topRightImg: '',
    confirm: { newGame: true, period: true, removePenalty: true },
  }
}

function deepMerge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over === undefined ? base : over
  const out = { ...base }
  for (const k of Object.keys(over)) {
    out[k] = base && typeof base[k] === 'object' && !Array.isArray(base[k]) ? deepMerge(base[k], over[k]) : over[k]
  }
  return out
}

export function withDefaults(state) {
  if (!state) return state
  const opts = deepMerge(defaultOptions(), state.opts || {})
  // games saved before the IIHF quick picks: the list is not editable, so just take the new one
  if (!state.opts?.templatesV) opts.penaltyTemplates = defaultOptions().penaltyTemplates
  // games saved before the NHL horn: swap the old default horns for it once (a deliberate choice made later stays)
  if (!state.opts?.soundsV) {
    const old = { horn: 'horn-loop', timeoutStart: 'horn', timeoutEnd: 'horn' }
    const nhl = defaultOptions().sounds
    for (const [k, v] of Object.entries(old)) if (opts.sounds[k] === v) opts.sounds[k] = nhl[k]
  }
  // fields added after v2 games were first saved
  const events = Array.isArray(state.events) ? state.events : []
  const shootout = state.shootout && Array.isArray(state.shootout.home) ? state.shootout : { home: [], away: [] }
  // penalties saved before they counted real time (they derived from the game clock via clockAtStart)
  let { penalties = [], penFoldAt = null, playLive = true } = state
  if (penalties.some(p => p.elapsedMs == null)) {
    const c = state.clock || {}
    const now = Date.now()
    const rem = c.running && c.since != null ? Math.max(0, c.remainingMs - (now - c.since)) : c.remainingMs
    penalties = penalties.map(p => (p.elapsedMs != null ? p : {
      ...p,
      elapsedMs: Math.min(p.durationMs, Math.max(0, (p.clockAtStart ?? rem) - rem)),
    }))
    if (c.running) penFoldAt = now
  }
  return { ...state, opts, events, shootout, penalties, penFoldAt, playLive: playLive !== false }
}

const KEY_NAMES = { BracketRight: ']', BracketLeft: '[', Backquote: '~', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Backspace: 'Backspace' }
export function keyName(code) {
  if (!code) return '—'
  return KEY_NAMES[code] || code.replace(/^Key/, '').replace(/^Digit/, '')
}
