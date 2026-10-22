import React, { useEffect, useRef, useState } from 'react'
import * as G from './game.js'
import { createPortal } from 'react-dom'
import {
  correctEvent,
  undoCorrection,
  eventDetails,
  eventClock,
  parseEventTime,
  editableTypes,
} from './statistics.js'

export default function StatsMode({
  s,
  update,
  now,
  actor,
  addGoal,
  addPenalty,
  blocked,
  small,
  rink,
  setRink,
  locked,
}) {
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const deferred = useRef(new Set())
  const events = s.events || []
  const pending = events.filter(
    (e) => e.type === 'goal' && !e.scorer
  )
  useEffect(() => {
    if (editing || blocked) return
    const next = pending.find((e) => !deferred.current.has(e.id))
    if (next) setEditing(next.id)
  }, [events, editing, blocked])
  const close = () => {
    if (editing) deferred.current.add(editing)
    setEditing(null)
  }
  const totals = G.gameSheet(s).totals
  const active = G.penaltyView(s, now)
  const selected = events.find((e) => e.id === editing)
  useEffect(() => {
    if (editing && !selected) setEditing(null)
  }, [editing, Boolean(selected)])
  const apply = (id, patch, expected) => {
    let failure = ''
    update((current) => {
      try {
        return correctEvent(current, id, patch, expected, actor)
      } catch (e) {
        failure = e.message
        return current
      }
    })
    if (failure) throw Error(failure)
  }
  const undo = (id) => {
    update((current) => {
      try {
        return undoCorrection(current, id, actor)
      } catch (e) {
        setError(e.message)
        return current
      }
    })
  }
  return (
    <section className="stats-workspace" aria-label="Stats mode">
      <header className="stats-score">
        <div>
          <b>{s.home.name}</b>
          <strong>{s.home.score}</strong>
        </div>
        <div className="stats-clock">
          <span>Period {G.periodLabel(s)}</span>
          <b>
            {G.fmtClock(G.clockShown(s, now), {
              countdown: s.opts.clockDir !== 'up',
            })}
          </b>
          <small>{s.clock.running ? 'Running' : 'Paused'}</small>
        </div>
        <div>
          <strong>{s.away.score}</strong>
          <b>{s.away.name}</b>
        </div>
      </header>
      {small && !locked && (
        <div className="rinktabs">
          {['a', 'b'].map((k) => (
            <button
              className={`btn ${rink === k ? 'on' : ''}`}
              key={k}
              onClick={() => {
                setEditing(null)
                setRink(k)
              }}
            >
              {s.opts.labels[k === 'a' ? 'rinkA' : 'rinkB']}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="stats-error">
          {error}
          <button className="linkbtn" onClick={() => setError('')}>
            Dismiss
          </button>
        </p>
      )}
      <div className="stats-columns">
        <aside>
          <div className="card">
            <h3>Game totals</h3>
            <table className="stats-totals">
              <thead>
                <tr>
                  <th>Stat</th>
                  <th>{s.home.name}</th>
                  <th>{s.away.name}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Goals', 'goals'],
                  ['Shots on goal', 'shots'],
                  ['Penalty minutes', 'pim'],
                  ['Power-play goals', 'ppg'],
                  ['Short-handed goals', 'shg'],
                  ['Offsides', 'offsides'],
                ].map(([label, k]) => (
                  <tr key={k}>
                    <th>{label}</th>
                    {['home', 'away'].map((team) => (
                      <td key={team}>
                        {totals[team][k]}
                        {['goals', 'shots', 'offsides'].includes(k) && (
                          <button
                            className="stats-minus"
                            aria-label={`Remove last ${k} ${s[team].name}`}
                            title={`Remove last ${k}`}
                            disabled={totals[team][k] <= 0}
                            onClick={() => {
                              if (
                                confirm(
                                  `Remove the last ${k} entry for ${s[team].name}?`
                                )
                              )
                                update((x) =>
                                  k === 'goals'
                                    ? G.addScore(x, team, -1)
                                    : k === 'shots'
                                      ? G.addShot(x, team, -1)
                                      : G.addOffside(x, team, -1)
                                )
                            }}
                          >
                            −
                          </button>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card stats-active">
            <h3>Active penalties</h3>
            {s.penalties
              .filter((p) => active[p.id] && active[p.id].status !== 'done')
              .map((p) => {
                const event = events.find(
                  (e) => e.type === 'penalty' && e.penaltyId === p.id
                )
                return (
                  <button
                    className="stats-penalty"
                    key={p.id}
                    disabled={!event}
                    onClick={() => setEditing(event.id)}
                  >
                    <span>
                      {s[p.team].name} · #{p.player || '?'}
                    </span>
                    <b>
                      {active[p.id].status === 'shot'
                        ? 'PS'
                        : G.fmtClock(active[p.id].remainingMs, {
                            tenths: false,
                          })}
                    </b>
                    <small>
                      {p.infraction || p.kind} · {active[p.id].status === 'running' && !G.isLive(s) ? 'paused' : active[p.id].status}
                    </small>
                  </button>
                )
              })}
            {!s.penalties.length && (
              <p className="hint">No active penalties.</p>
            )}
          </div>
        </aside>
        <div className="card stats-events">
          <h2>Live events</h2>
          <p className="hint">
            Changes update the same game and scoreboard.{' '}
            {pending.length > 0
              ? `${pending.length} goal${pending.length === 1 ? '' : 's'} need details.`
              : ''}
          </p>
          <div className="stats-add">
            {['home', 'away'].map((team) => (
              <div key={team}>
                <b>{s[team].name}</b>
                <div className="row">
                  <button className="btn sm" onClick={() => addGoal(team)}>
                    + Goal
                  </button>
                  <button className="btn sm" onClick={() => addPenalty(team)}>
                    + Penalty
                  </button>
                  <button
                    className="btn sm"
                    onClick={() => update((x) => G.addShot(x, team, 1))}
                  >
                    + Shot
                  </button>
                  <button
                    className="btn sm"
                    onClick={() => update((x) => G.addOffside(x, team, 1))}
                  >
                    + Offside
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="stats-filters" role="group" aria-label="Event filter">
            {[
              ['all', 'All'],
              ['goal', 'Goals'],
              ['penalty', 'Penalties'],
              ['shot', 'Shots'],
              ['offside', 'Offsides'],
              ['other', 'Other'],
            ].map(([value, label]) => (
              <button
                className={`btn sm ${filter === value ? 'on' : ''}`}
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="stats-event-list">
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Game clock</th>
                  <th>Event</th>
                  <th>Team / player</th>
                  <th>Status</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {[...events]
                  .reverse()
                  .filter(
                    (e) =>
                      filter === 'all' ||
                      (filter === 'other' &&
                        !['goal', 'penalty', 'shot', 'offside'].includes(
                          e.type
                        )) ||
                      e.type === filter
                  )
                  .map((e) => {
                    const p = e.type === 'penalty' && active[e.penaltyId]
                    const needs =
                      e.type === 'goal' && !e.scorer
                    return (
                      <tr key={e.id} data-event-id={e.id}>
                        <td>{G.periodLabel({ ...s, period: e.period })}</td>
                        <td>{eventClock(s, e)}</td>
                        <td>
                          <b>
                            {{ penaltyEnd: 'Penalty ended', so: 'Shootout' }[
                              e.type
                            ] || e.type}
                          </b>
                          <small>{e.infraction || e.situation || ''}</small>
                        </td>
                        <td>
                          {s[e.team]?.name || '—'}
                          <small>
                            {e.scorer || e.player
                              ? `#${e.scorer || e.player}`
                              : ''}
                            {e.a1
                              ? ` · assists #${e.a1}${e.a2 ? `, #${e.a2}` : ''}`
                              : ''}
                          </small>
                        </td>
                        <td>
                          <span
                            className={`stats-badge ${needs || p ? 'pending' : ''}`}
                          >
                            {p && p.status !== 'done'
                              ? 'Active'
                              : needs
                                ? 'Needs details'
                                : 'Recorded'}
                          </span>
                        </td>
                        <td>
                          {editableTypes.includes(e.type) && (
                            <button
                              className="btn sm"
                              aria-label={`Review ${e.type} ${e.id}`}
                              onClick={() => setEditing(e.id)}
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
            {!events.length && <p className="hint">Waiting for game events…</p>}
          </div>
        </div>
      </div>
      <section className="card stats-history">
        <h3>Recent corrections</h3>
        {[...(s.corrections || [])]
          .reverse()
          .slice(0, 15)
          .map((c) => (
            <div key={c.id}>
              <span>
                {c.actor} ·{' '}
                {c.undoOf
                  ? 'Undid correction'
                  : 'Updated ' +
                    Object.keys(c.after)
                      .filter(
                        (k) => !['periodMs', 'detailsComplete'].includes(k)
                      )
                      .join(', ')}{' '}
                · {new Date(c.at).toLocaleTimeString()}
              </span>
              {!c.undoOf &&
                !(s.corrections || []).some((x) => x.undoOf === c.id) && (
                  <button className="btn sm" onClick={() => undo(c.id)}>
                    Undo
                  </button>
                )}
            </div>
          ))}
        {!s.corrections?.length && (
          <p className="hint">Corrections from both operators appear here.</p>
        )}
      </section>
      {selected &&
        !blocked &&
        createPortal(
          <EventEditor
            key={`${rink}-${selected.id}`}
            s={s}
            event={selected}
            apply={apply}
            close={close}
          />,
          document.body
        )}
    </section>
  )
}

function EventEditor({ s, event, apply, close }) {
  const [original] = useState(() => eventDetails(event))
  const [form, setForm] = useState(() => ({
    ...eventDetails(event),
    period: event.period,
    time: eventClock(s, event),
    minutes: event.minutes ?? 2,
  }))
  const [error, setError] = useState('')
  const field = (k, value) => setForm((x) => ({ ...x, [k]: value }))
  const save = (e) => {
    e.preventDefault()
    setError('')
    try {
      const time = parseEventTime(s, form.period, form.time)
      const keys =
        event.type === 'goal'
          ? ['scorer', 'a1', 'a2', 'situation', 'en']
          : event.type === 'penalty'
            ? ['player', 'infraction', 'minutes', 'coincidental']
            : event.type === 'so'
              ? ['scored', 'player']
              : event.type === 'timeout'
                ? ['seconds']
                : ['player']
      const patch = {}
      for (const k of keys)
        if (
          JSON.stringify(form[k] ?? null) !==
          JSON.stringify(original[k] ?? null)
        )
          patch[k] = form[k]
      if (
        form.time !== eventClock(s, { ...event, ...original }) ||
        form.period !== original.period
      )
        Object.assign(patch, time)
      if (event.type === 'goal' && 'scorer' in patch) patch.detailsComplete = Boolean(form.scorer)
      apply(event.id, patch, original)
      close()
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <div className="sheet-bg" onClick={close}>
      <form
        className="sheet stats-editor"
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        aria-label="Edit live event"
      >
        <h3>
          {event.type === 'goal' ? 'Goal details' : `Edit ${event.type}`} ·{' '}
          {s[event.team]?.name}
        </h3>
        <p className="hint">
          Editing the original event. The live game clock keeps its current
          time.
        </p>
        <div className="grid3">
          <label>
            Period
            <select
              value={form.period}
              onChange={(e) => field('period', e.target.value)}
            >
              {G.periodList(s).map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Game clock at event
            <input
              aria-label="Game clock at event"
              value={form.time}
              onChange={(e) => field('time', e.target.value)}
              placeholder="mm:ss"
              required
            />
          </label>
        </div>
        {event.type === 'goal' ? (
          <>
            <div className="grid3">
              {[
                ['scorer', 'Goal #'],
                ['a1', 'Assist 1 #'],
                ['a2', 'Assist 2 #'],
              ].map(([k, label]) => (
                <label key={k}>
                  {label}
                  <input
                    inputMode="numeric"
                    autoFocus={k === 'scorer'}
                    value={form[k] || ''}
                    maxLength={3}
                    onChange={(e) => field(k, e.target.value)}
                    placeholder="#"
                  />
                </label>
              ))}
            </div>
            <div className="field">
              Situation
              <div className="choices">
                {['EQ', 'PP1', 'PP2', 'SH1', 'SH2', 'PS'].map((value) => (
                  <button
                    type="button"
                    className={`btn sm ${form.situation === value ? 'on' : ''}`}
                    key={value}
                    onClick={() => field('situation', value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <label className="stats-checkbox">
              <input
                type="checkbox"
                checked={Boolean(form.en)}
                onChange={(e) => field('en', e.target.checked)}
              />{' '}
              Empty net (EN)
            </label>
          </>
        ) : (
          <>
            {event.type === 'so' && (
              <label className="stats-checkbox">
                <input
                  type="checkbox"
                  checked={Boolean(form.scored)}
                  onChange={(e) => field('scored', e.target.checked)}
                />{' '}
                Shootout attempt scored
              </label>
            )}
            {event.type === 'timeout' && (
              <label>
                Timeout seconds
                <input
                  type="number"
                  min="1"
                  max="3600"
                  value={form.seconds || ''}
                  onChange={(e) => field('seconds', Number(e.target.value))}
                />
              </label>
            )}
            {['penalty', 'shot', 'so'].includes(event.type) && (
              <label>
                Player #
                <input
                  inputMode="numeric"
                  value={form.player || ''}
                  maxLength={3}
                  onChange={(e) => field('player', e.target.value)}
                />
              </label>
            )}
            {event.type === 'penalty' && (
              <>
                <label>
                  Infraction
                  <input
                    value={form.infraction || ''}
                    list="stats-infractions"
                    onChange={(e) => field('infraction', e.target.value)}
                  />
                </label>
                <datalist id="stats-infractions">
                  {(s.opts.penaltyTemplates || []).map((p, i) => (
                    <option key={i} value={p.name} />
                  ))}
                </datalist>
                <label>
                  Penalty minutes
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={form.minutes}
                    onChange={(e) => field('minutes', Number(e.target.value))}
                  />
                </label>
                <label className="stats-checkbox">
                  <input
                    type="checkbox"
                    checked={Boolean(form.coincidental)}
                    onChange={(e) => field('coincidental', e.target.checked)}
                  />{' '}
                  Coincidental
                </label>
                <p className="hint">
                  Player and infraction edits keep the countdown running.
                  Duration corrections preserve time already served. Recorded
                  event time does not change time served.
                </p>
              </>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="stats-error">
            {error}
          </p>
        )}
        <div className="row">
          <button className="btn primary" type="submit">
            Save changes
          </button>
          <button type="button" className="btn ghost" onClick={close}>
            Later / Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
