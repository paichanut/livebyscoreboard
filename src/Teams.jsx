// Team logo library: upload logos once, name them, then pick a team with one tap when setting up a game.
import React, { useState } from 'react'
import { listTeams, saveTeam, updateTeam, removeTeam, nameFromFile } from './teamLibrary.js'
import { resizeImage } from './Options.jsx'

const PALETTE = ['#e63946', '#3a86ff', '#2a9d8f', '#f4a261', '#8338ec', '#ff006e', '#06d6a0', '#ffbe0b']

export default function Teams() {
  const [list, setList] = useState(listTeams)
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')
  const refresh = ok => { setList(listTeams()); setMsg(ok === false ? 'Could not save: this browser is out of space. Remove some teams or use smaller logos.' : '') }

  const addFiles = async files => {
    let ok = true
    for (const [i, f] of [...files].entries()) {
      const name = nameFromFile(f.name)
      if (!name) continue
      const logo = await resizeImage(f, 320)
      ok = saveTeam({ name, logo, color: listTeams().find(t => t.id === name.toLowerCase())?.color || PALETTE[(list.length + i) % PALETTE.length] }) && ok
    }
    refresh(ok)
  }
  const setLogo = async (id, f) => { if (f) refresh(updateTeam(id, { logo: await resizeImage(f, 320) })) }
  const shown = list.filter(t => t.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="teamsPage">
      <div className="head">
        <h1>Team logos</h1>
        <a href="/">Home</a>
      </div>
      <p className="hint">Upload logos once; each one becomes a team named after the file (edit the name below). When you set up a game, tap the team in the team sheet (tap a team name on the control page) or in Options → Teams. Saved in this browser.</p>
      <label className="btn primary upload">
        + Add logos
        <input type="file" accept="image/*" multiple onChange={e => { addFiles(e.target.files); e.target.value = '' }} hidden />
      </label>
      {msg && <div className="warn">{msg}</div>}
      {list.length > 6 && <input className="search" placeholder="search teams" value={q} onChange={e => setQ(e.target.value)} />}
      {!list.length && <div className="empty">No teams yet.</div>}
      <div className="tgrid">
        {shown.map(tm => (
          <div className="tcard" key={tm.id} style={{ '--c': tm.color }} data-team={tm.id}>
            <label className="logo" title="Change logo">
              {tm.logo ? <img src={tm.logo} alt="" /> : <span>no logo</span>}
              <input type="file" accept="image/*" hidden onChange={e => setLogo(tm.id, e.target.files?.[0])} />
            </label>
            <input className="tname" aria-label={`name of ${tm.name}`} defaultValue={tm.name}
              onBlur={e => { if (e.target.value.trim() !== tm.name) refresh(updateTeam(tm.id, { name: e.target.value })) }}
              onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
            <div className="trow">
              <input type="color" aria-label={`color of ${tm.name}`} value={tm.color} onChange={e => refresh(updateTeam(tm.id, { color: e.target.value }))} />
              <button className="btn sm ghost" aria-label={`delete ${tm.name}`} onClick={() => { if (window.confirm(`Delete ${tm.name}?`)) { removeTeam(tm.id); refresh() } }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
