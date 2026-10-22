import * as G from './game.js'
import { now } from './clock.js'
import { mergeGame, sameGameValue } from '../desktop/merge-game.mjs'
import { undoCorrection } from './statistics.js'

const same = sameGameValue
const compact = (e) =>
  Object.fromEntries(
    Object.entries(e).filter(
      ([k, v]) =>
        v != null &&
        !(
          ['scorer', 'a1', 'a2', 'player', 'infraction', 'kind'].includes(k) &&
          v === ''
        ) &&
        !(
          ['en', 'detailsComplete', 'coincidental', 'penaltyShot'].includes(
            k
          ) && v === false
        )
    )
  )
const materialize = (original, before, after) => {
  const result = { ...original }
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (same(before[key], after[key])) continue
    if (Object.hasOwn(after, key)) result[key] = after[key]
    else delete result[key]
  }
  return result
}
// Only the game ledger belongs in Undo. Clock anchors, audio, settings and elapsed penalty time do not.
export function undoSnapshot(s) {
  const team = (name) => ({
    score: s[name].score,
    shots: s[name].shots,
    offsides: s[name].offsides || 0,
  })
  return {
    home: team('home'),
    away: team('away'),
    events: (s.events || []).map(compact),
    penalties: s.penalties.map(({ elapsedMs, ...details }) => compact(details)),
    shootout: s.shootout,
  }
}
export function captureUndo(before, after) {
  if (
    !after ||
    before === after ||
    !same(before.clock, after.clock) ||
    before.period !== after.period ||
    before.playLive !== after.playLive ||
    before.undoEpoch !== after.undoEpoch
  )
    return null
  const lastCorrection = after.corrections?.at(-1)
  if (
    lastCorrection?.undoOf &&
    lastCorrection.id !== before.corrections?.at(-1)?.id
  )
    return null
  const previous = undoSnapshot(before),
    next = undoSnapshot(after)
  if (same(previous, next)) return null
  return {
    id: crypto.randomUUID(),
    epoch: before.undoEpoch ?? null,
    before: previous,
    after: next,
    clock: before.clock,
    playLive: before.playLive,
    penalties: before.penalties,
    events: before.events || [],
    flash: after.goalFlash,
    offside: after.offside,
    correctionId:
      lastCorrection && lastCorrection.id !== before.corrections?.at(-1)?.id
        ? lastCorrection.id
        : null,
  }
}
export function undoAction(s, action, actor = 'Operator') {
  if (!action) throw Error('There is nothing to undo.')
  if ((s.undoEpoch ?? null) !== action.epoch)
    throw Error('This undo belongs to the previous game.')
  if (action.correctionId) return undoCorrection(s, action.correctionId, actor)
  const current = G.foldPenalties(s)
  const currentSnapshot = undoSnapshot(current)
  const merged = mergeGame(action.after, action.before, currentSnapshot)
  if (merged.conflicts.length)
    throw Error(
      'Another operator changed this entry. Review the current game before undoing it.'
    )
  const restoring = merged.state.penalties.filter(
    (p) => !current.penalties.some((x) => x.id === p.id)
  )
  if (
    restoring.length &&
    (s.clock.running ||
      action.clock.running ||
      !same(s.clock, action.clock) ||
      s.playLive !== action.playLive)
  )
    throw Error(
      'This undo would restore a penalty after the clock advanced. Correct that penalty manually to keep its time accurate.'
    )
  const penalties = merged.state.penalties.map((details) => {
    const original =
      current.penalties.find((p) => p.id === details.id) ||
      action.penalties.find((p) => p.id === details.id)
    if (!original)
      throw Error(
        'The penalty has changed. Review its current details before undoing.'
      )
    const { elapsedMs, ...metadata } = original
    return materialize(original, compact(metadata), details)
  })
  const removedPenalties = action.after.penalties
    .filter((p) => !action.before.penalties.some((x) => x.id === p.id))
    .map((p) => p.id)
  const events = merged.state.events
    .filter(
      (e) => e.type !== 'penaltyEnd' || !removedPenalties.includes(e.penaltyId)
    )
    .map((details) => {
      const original =
        current.events.find((e) => e.id === details.id) ||
        action.events.find((e) => e.id === details.id) ||
        details
      return materialize(original, compact(original), details)
    })
  const removedGoals = action.after.events.filter(
    (e) => e.type === 'goal' && !action.before.events.some((x) => x.id === e.id)
  )
  const removedOffsides = action.after.events.filter(
    (e) =>
      e.type === 'offside' && !action.before.events.some((x) => x.id === e.id)
  )
  return {
    ...current,
    ...merged.state,
    home: { ...current.home, ...merged.state.home },
    away: { ...current.away, ...merged.state.away },
    events,
    penalties,
    ...(removedGoals.length && same(s.goalFlash, action.flash)
      ? { goalFlash: null }
      : {}),
    ...(removedOffsides.length && same(s.offside, action.offside)
      ? { offside: null }
      : {}),
    updatedAt: now(),
  }
}
