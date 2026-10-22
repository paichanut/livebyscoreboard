import * as G from './game.js'
import { now } from './clock.js'

export const editableTypes = [
  'goal',
  'penalty',
  'shot',
  'offside',
  'timeout',
  'so',
  'penaltyEnd',
]
export const detailFields = [
  'scorer',
  'a1',
  'a2',
  'situation',
  'en',
  'detailsComplete',
  'player',
  'infraction',
  'minutes',
  'kind',
  'coincidental',
  'period',
  'periodMs',
  'clockMs',
  'scored',
  'seconds',
]
const equal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
export const eventDetails = (e) =>
  Object.fromEntries(detailFields.map((k) => [k, e?.[k] ?? null]))
export function eventClock(s, e) {
  return G.fmtGameTime(
    s.opts.clockDir === 'up' ? (e.periodMs || 0) - (e.clockMs || 0) : e.clockMs
  )
}
export function parseEventTime(s, period, text) {
  if (!G.periodList(s).includes(period) || !/^\d{1,3}:[0-5]\d$/.test(text))
    throw Error('Enter the event clock as mm:ss.')
  const [m, sec] = text.split(':').map(Number)
  const periodMs =
    period === 'OT'
      ? (Number(s.opts.otMinutes) || 5) * G.MIN
      : period === 'SO'
        ? 0
        : s.periodLengthMs
  const shown = (m * 60 + sec) * 1000
  if (shown > periodMs)
    throw Error('Event time must fit within the selected period.')
  return {
    period,
    periodMs,
    clockMs: s.opts.clockDir === 'up' ? periodMs - shown : shown,
  }
}

// Edit the original event and its active penalty together. Never correct the live clock here.
export function correctEvent(
  s,
  id,
  patch,
  expected,
  actor = 'Operator',
  undoOf = null
) {
  const event = (s.events || []).find((e) => e.id === id)
  if (!event) throw Error('This event was removed. Refresh the event list.')
  const keys = Object.keys(patch).filter((k) => detailFields.includes(k))
  if (expected && keys.some((k) => !equal(event[k], expected[k])))
    throw Error(
      'Another operator changed these details. Reopen the event to review their changes.'
    )
  let changes = Object.fromEntries(
    keys.filter((k) => !equal(event[k], patch[k])).map((k) => [k, patch[k]])
  )
  if (!Object.keys(changes).length) return s
  const num = (value) =>
    String(value ?? '')
      .replace(/[^0-9]/g, '')
      .slice(0, 3)
  for (const field of ['scorer', 'a1', 'a2', 'player'])
    if (field in changes) changes[field] = num(changes[field])
  if (
    'minutes' in changes &&
    (!Number.isFinite(changes.minutes) ||
      changes.minutes < 0 ||
      changes.minutes > 60)
  )
    throw Error('Penalty minutes must be between 0 and 60.')
  if (
    'situation' in changes &&
    !['EQ', 'PP1', 'PP2', 'SH1', 'SH2', 'PS'].includes(changes.situation)
  )
    throw Error('Invalid goal situation.')
  let next = s
  if (event.type === 'so' && 'scored' in changes) {
    const attempts = [...(s.shootout?.[event.team] || [])]
    if (!attempts[event.attempt - 1])
      throw Error('This shootout attempt was removed.')
    attempts[event.attempt - 1] = changes.scored ? 'goal' : 'miss'
    next = { ...s, shootout: { ...s.shootout, [event.team]: attempts } }
  }
  if (event.type === 'timeout' && 'seconds' in changes) {
    if (
      !Number.isFinite(changes.seconds) ||
      changes.seconds <= 0 ||
      changes.seconds > 3600
    )
      throw Error('Timeout must be between 1 and 3600 seconds.')
    const latest = [...s.events].reverse().find((e) => e.type === 'timeout')
    if (s.timeout && latest?.id === event.id)
      next = {
        ...next,
        timeout: { ...s.timeout, durationMs: changes.seconds * 1000 },
      }
  }
  const penaltyKeys = [
    'player',
    'infraction',
    'minutes',
    'kind',
    'coincidental',
  ]
  if (
    event.type === 'penalty' &&
    s.penalties.some((p) => p.id === event.penaltyId) &&
    penaltyKeys.some((k) => k in changes)
  ) {
    next = G.editPenalty(
      s,
      event.penaltyId,
      Object.fromEntries(
        penaltyKeys.filter((k) => k in changes).map((k) => [k, changes[k]])
      )
    )
    const updated = next.events.find((e) => e.id === id)
    changes = {
      ...changes,
      ...Object.fromEntries(
        penaltyKeys
          .filter((k) => !equal(event[k], updated[k]))
          .map((k) => [k, updated[k] ?? null])
      ),
    }
  }
  const before = Object.fromEntries(
    Object.keys(changes).map((k) => [k, event[k] ?? null])
  )
  const correction = {
    id: crypto.randomUUID(),
    eventId: id,
    actor,
    at: now(),
    before,
    after: changes,
    ...(undoOf ? { undoOf } : {}),
  }
  return {
    ...next,
    events: next.events.map((e) => (e.id === id ? { ...e, ...changes } : e)),
    corrections: [...(next.corrections || []), correction].slice(-500),
    updatedAt: now(),
  }
}
export function undoCorrection(s, id, actor) {
  const entry = (s.corrections || []).find((c) => c.id === id)
  if (!entry || (s.corrections || []).some((c) => c.undoOf === id))
    throw Error('This correction has already been undone.')
  return correctEvent(s, entry.eventId, entry.before, entry.after, actor, id)
}
