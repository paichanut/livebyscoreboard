// Click a number and type it (Pai 2026-11-06): on the control page and on the single-monitor scoreboard.
// Any element with data-edit="<field>" (and data-value = the text to start from, else its own text) opens a
// field right on top of it; Enter or leaving the field applies it, Esc keeps the old value, a wrong entry
// turns red. Fields: clock · period · score:home|away · shots:home|away · pen:<id>:time · pen:<id>:player
import React, { useRef, useState } from 'react'
import * as G from './game.js'

// what a typed text does to the game; false = not a valid entry (the field turns red)
export function applyEdit(field, text, { s, update, ur = update }) {
  const [kind, a, b] = field.split(':')
  const t = String(text ?? '').trim()
  const int = () => (/^\d{1,3}$/.test(t) ? Number(t) : null)
  if (kind === 'clock') {
    const ms = G.parseClockInput(t)
    if (ms === null) return false
    update(x => G.setClock(x, x.opts.clockDir === 'up' ? Math.max(0, G.periodLength(x) - ms) : ms))
    return true
  }
  if (kind === 'period') {
    const p = G.parsePeriodInput(s, t)
    if (!p) return false
    update(x => G.setPeriodOnly(x, p))
    return true
  }
  if (kind === 'score' || kind === 'shots') {
    const n = int()
    if (n === null) return false
    ur(x => (kind === 'score' ? G.setScore(x, a, n) : G.setShots(x, a, n)))
    return true
  }
  if (kind === 'pen' && b === 'time') {
    const ms = G.parseClockInput(t)
    if (ms === null) return false
    ur(x => G.setPenaltyRemaining(x, a, ms))
    return true
  }
  if (kind === 'pen' && b === 'player') {
    if (!/^\d{0,3}$/.test(t.replace(/^#/, ''))) return false
    ur(x => G.editPenalty(x, a, { player: t.replace(/^#/, '') }))
    return true
  }
  return false
}

// onClick for a container + the field to render: const { onClick, editor } = useInlineEdit(commit)
export function useInlineEdit(commit, { disabled = false } = {}) {
  const [edit, setEdit] = useState(null) // { field, text, rect, bad }
  const done = useRef(false)
  const onClick = e => {
    if (disabled) return
    const el = e.target.closest?.('[data-edit]')
    if (!el) return
    e.preventDefault()
    const r = el.getBoundingClientRect()
    const cs = window.getComputedStyle(el)
    done.current = false
    // the field looks like the number it replaces (same font and colour, e.g. the LCD digits)
    setEdit({ field: el.dataset.edit, text: el.dataset.value ?? el.textContent.trim(), rect: { left: r.left, top: r.top, width: r.width, height: r.height },
      font: cs.fontFamily, color: cs.color, size: parseFloat(cs.fontSize) || 0, bad: false })
  }
  const close = () => { done.current = true; setEdit(null) }
  const apply = () => {
    if (done.current || !edit) return true
    if (!commit(edit.field, edit.text)) { setEdit({ ...edit, bad: true }); return false }
    close()
    return true
  }
  const editor = edit && (
    <input className={`inline-edit tnum ${edit.bad ? 'bad' : ''}`} aria-label={`type ${edit.field.split(':')[0]}`} autoFocus value={edit.text}
      inputMode={edit.field === 'period' ? 'text' : 'decimal'}
      style={{ left: edit.rect.left, top: edit.rect.top, width: Math.max(edit.rect.width, 90), height: Math.max(edit.rect.height, 40), fontFamily: edit.font, color: edit.color,
        fontSize: Math.max(18, Math.min(edit.size || edit.rect.height * 0.62, edit.rect.height * 0.9, 160)) }}
      onFocus={e => e.target.select()} onChange={e => setEdit({ ...edit, text: e.target.value, bad: false })}
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') apply(); else if (e.key === 'Escape') close() }}
      onBlur={() => { if (!apply()) close() }} />
  )
  return { onClick, editor, editing: Boolean(edit) }
}
