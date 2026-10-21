import React from 'react'
import { penaltyCallActive } from './game.js'
import { signalForInfraction } from './refereeSignals.js'
import RefereeFigure from './RefereeFigure.jsx'
import './penalty-announcement.css'

export default function PenaltyAnnouncement({ s, team, now }) {
  const call = penaltyCallActive(s, now)
  if (!call || call.team !== team) return null
  const signal = signalForInfraction(call.infraction)
  return <div className="penalty-signal" role="status" aria-label={`Penalty announcement for ${s[team].name}`} data-team={team} data-signal={signal?.id || 'none'} key={`${call.at}-${signal?.id || 'none'}`}>
    <div className="penalty-signal-figure"><RefereeFigure signal={signal} playing={Boolean(signal)} label={signal ? `${signal.name} referee signal` : 'Referee'} /></div>
    <div className="penalty-signal-copy">
      <div className="penalty-signal-label">{s.opts.labels.penalty || 'PENALTY'}</div>
      <div className="penalty-signal-team">{s[team].name}</div>
      {call.player && <div className="penalty-signal-player">#{call.player}</div>}
      <div className="penalty-signal-name">{call.infraction || 'Penalty'}</div>
      {signal && <div className="penalty-signal-thai" lang="th">{signal.thai}</div>}
      <div className="penalty-signal-detail">{call.text}</div>
      {!signal && call.infraction && <div className="penalty-signal-no-gesture">{/misconduct/i.test(call.infraction) ? 'No prescribed hand signal' : 'Signal illustration unavailable'}</div>}
    </div>
  </div>
}
