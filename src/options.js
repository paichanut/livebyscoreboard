// Options model — mirrors the PC Scoreboards "Options" dialog, minus the desktop-only bits.

export const DEFAULT_KEYS = {
  startStop: 'Space',
  homeGoal: 'KeyQ', homeGoalMinus: 'KeyE', homeShot: 'KeyR', homeShotMinus: 'KeyT',
  awayGoal: 'KeyA', awayGoalMinus: 'KeyD', awayShot: 'KeyF', awayShotMinus: 'KeyG',
  periodPlus: 'BracketRight', periodMinus: 'BracketLeft',
  clockPlus: 'ArrowUp', clockMinus: 'ArrowDown',
  horn: 'F9', buzzer: 'F12', timeout1: 'KeyB', timeout2: 'KeyN',
  newGame: 'F5',
}

export const KEY_LABELS = {
  startStop: 'Start / stop clock',
  homeGoal: 'Home score +1', homeGoalMinus: 'Home score −1', homeShot: 'Home shots +1', homeShotMinus: 'Home shots −1',
  awayGoal: 'Away score +1', awayGoalMinus: 'Away score −1', awayShot: 'Away shots +1', awayShotMinus: 'Away shots −1',
  periodPlus: 'Period +1', periodMinus: 'Period −1',
  clockPlus: 'Clock +1 s', clockMinus: 'Clock −1 s',
  horn: 'Horn', buzzer: 'Buzzer', timeout1: 'Timeout 1', timeout2: 'Timeout 2',
  newGame: 'New game',
}

export const SOUND_CHOICES = ['horn', 'buzzer', 'beep', 'none']
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
    clockDir: 'down', // 'down' | 'up'
    timeout1Sec: 30,
    timeout2Sec: 60,
    timeoutWarnSec: 15,
    goalIndicator: true,
    goalOffSec: 15,
    penaltyLengths: [2, 5, 10],
    layout: 'full', // 'full' | 'minimal' (no shots/logos/title, bigger numbers)
    // Teams
    homeLogo: '', awayLogo: '',
    // Keys
    keys: { ...DEFAULT_KEYS },
    // Colors (null = theme default)
    colors: {},
    // Sounds
    sounds: { horn: 'horn', buzzer: 'buzzer', endPeriod: 'buzzer', timeoutStart: 'horn', timeoutWarn: 'beep', timeoutEnd: 'horn' },
    // Text
    labels: { period: 'PERIOD', shots: 'SHOTS', player: 'PLAYER', penalty: 'PENALTY', goal: 'GOAL!', timeout: 'TIMEOUT', pp: 'PP' },
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
  return { ...state, opts }
}

export function keyName(code) {
  if (!code) return '—'
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('Space', 'Space').replace('Bracket', '').replace('Arrow', '')
}
