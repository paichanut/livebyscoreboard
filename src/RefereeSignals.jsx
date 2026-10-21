import React, { useEffect, useRef, useState } from 'react'
import RefereeFigure, { useReducedMotion } from './RefereeFigure.jsx'
import { RULEBOOK_URL, signals } from './refereeSignals.js'
import './referee-signals.css'

function SignalCard({ signal, playing, onToggle }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '60px' })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return <article ref={ref} className="signal-card" aria-labelledby={`title-${signal.id}`}>
    <div className="signal-picture">
      <span className={`signal-category ${signal.category}`}>{signal.category === 'penalty' ? 'Penalty' : 'Game flow'}</span>
      <button className="signal-toggle" onClick={onToggle} aria-label={`${playing ? 'Pause' : 'Play'} ${signal.name} animation`} aria-pressed={playing}>
        {playing ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4v12M14 4v12" /></svg> : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 9 6-9 6Z" /></svg>}
      </button>
      <RefereeFigure signal={signal} playing={playing && visible} ignoreReducedMotion />
    </div>
    <div className="signal-copy">
      <div className="signal-title-row"><h2 id={`title-${signal.id}`}>{signal.name}</h2><a className="signal-rule" href={`${RULEBOOK_URL}#page=${signal.page}`} target="_blank" rel="noreferrer" aria-label={`Read ${signal.name} in the IIHF rulebook`}>{signal.rule === 'Various' ? 'Various rules' : `Rule ${signal.rule}`} <span aria-hidden="true">↗</span></a></div>
      <p className="signal-thai" lang="th">{signal.thai}</p>
      <p>{signal.description}</p>
      <p className="signal-description-th" lang="th">{signal.descriptionTh}</p>
      {signal.note && <p className="signal-note">{signal.note}</p>}
    </div>
  </article>
}

export default function RefereeSignals() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const reduced = useReducedMotion()
  const [motion, setMotion] = useState(null)
  const playing = motion ?? !reduced
  const [overrides, setOverrides] = useState({})
  useEffect(() => {
    const title = document.title
    document.title = 'Animated referee signals · Live by Scoreboard'
    return () => { document.title = title }
  }, [])
  const filtered = signals.filter(s => (category === 'all' || s.category === category)
    && `${s.name} ${s.thai} ${s.rule} ${s.description} ${s.descriptionTh}`.toLowerCase().includes(query.trim().toLowerCase()))
  const toggleAll = () => { setMotion(!playing); setOverrides({}) }
  return <main className="ref-guide">
    <header className="ref-nav"><a href="/" className="ref-brand"><span aria-hidden="true">←</span> LIVE BY SCOREBOARD</a><a href="/referee-signals.pdf" target="_blank" rel="noreferrer">Printable PDF <span aria-hidden="true">↗</span></a></header>
    <section className="ref-intro">
      <div className="ref-eyebrow"><span /> THE OFFICIALS’ FIELD GUIDE</div>
      <h1>Referee signals<span>in motion.</span></h1>
      <p>A clear view of the call. Learn the gestures with original animated illustrations, in English and Thai.</p>
      <p lang="th" className="ref-intro-th">เรียนรู้ท่าสัญญาณกรรมการฮอกกี้ ผ่านภาพเคลื่อนไหวพร้อมคำอธิบายสองภาษา</p>
      <div className="ref-source"><b>IIHF 2026/27</b><span>Appendix I · {signals.length} signals</span><a href={RULEBOOK_URL} target="_blank" rel="noreferrer">Official rulebook ↗</a></div>
    </section>
    <section className="ref-toolbar" aria-label="Find a referee signal">
      <label className="ref-search"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg><span className="ref-sr-only">Search referee signals</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search a signal, rule or Thai name…" /></label>
      <button className="ref-motion" onClick={toggleAll} aria-pressed={playing}>{playing ? 'Ⅱ Pause animations' : '▶ Play animations'}</button>
      <div className="ref-filters" role="group" aria-label="Signal category">
        {[['all', 'All signals'], ['penalty', 'Penalties'], ['play', 'Game flow']].map(([id, title]) => <button key={id} onClick={() => setCategory(id)} aria-pressed={category === id}>{title}<span>{signals.filter(s => id === 'all' || s.category === id).length}</span></button>)}
      </div>
      <span className="ref-count" role="status" aria-live="polite">{filtered.length} {filtered.length === 1 ? 'signal' : 'signals'}</span>
    </section>
    <section className="ref-grid" aria-label="Referee signal guide">
      {filtered.map(signal => <SignalCard key={signal.id} signal={signal} playing={overrides[signal.id] ?? playing}
        onToggle={() => setOverrides(old => ({ ...old, [signal.id]: !(old[signal.id] ?? playing) }))} />)}
    </section>
    {!filtered.length && <div className="ref-empty"><h2>No matching signals</h2><p>Try an English or Thai name, or a rule number.</p><button onClick={() => { setQuery(''); setCategory('all') }}>Show all signals</button></div>}
    <footer className="ref-footer"><p>Original illustrated memory aid based on <a href={`${RULEBOOK_URL}#page=163`} target="_blank" rel="noreferrer">IIHF Official Rule Book 2026/27, Appendix I, pages 163–169</a>.</p><p>Misconduct and game misconduct have no prescribed hand signal. The rulebook contains the full rules and officiating procedures.</p><a href="/">← Back to the scoreboard</a></footer>
  </main>
}
