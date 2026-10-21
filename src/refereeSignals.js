import signals from './referee-signals.json'

export { signals }
export const RULEBOOK_URL = 'https://blob.iihf.com/iihf-media/iihfmvc/media/downloads/rule%20book/2026-27_iihf_rule_book.pdf'

const normalize = text => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const aliases = {
  'roughing': 'roughing', 'fighting': 'roughing',
  'high sticking injury': 'high-sticking',
  'goaltender interference': 'interference',
  'body checking': 'body-checking',
  'check to head or neck': 'head-neck',
  'delay of game': 'delay-game',
  'too many players': 'too-many',
  'unsportsmanlike': 'unsportsmanlike', 'diving': 'diving',
}
const byName = new Map(signals.flatMap(s => [[normalize(s.name), s], [normalize(s.thai), s], [normalize(s.id), s]]))
const byId = new Map(signals.map(s => [s.id, s]))

// A free-text or misconduct call must never borrow an unrelated referee gesture.
export function signalForInfraction(infraction) {
  const name = normalize(infraction)
  if (!name || name.includes('misconduct')) return null
  return byId.get(aliases[name]) || byName.get(name) || null
}
