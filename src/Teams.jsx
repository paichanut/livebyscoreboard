// Team logo library: upload logos once, name them, then pick a team with one tap when setting up a game.
// Online (web app): one shared library for every operator (table `teams`): anyone picks from it, a
// logged-in operator uploads, the uploader edits their own teams and the admin can fix any logo.
// Desktop app: teams saved on this computer, plus the shared library read-only when there is internet.
// Test build (no server): this browser only.
import React, { useEffect, useState } from 'react'
import { listTeams, saveTeam, updateTeam, removeTeam, nameFromFile } from './teamLibrary.js'
import { resizeImage } from './Options.jsx'
import { ONLINE, DESKTOP, getSession, sessionUser, listSharedTeams, saveSharedTeam, updateSharedTeam, deleteSharedTeam } from './sync.js'

const PALETTE = ['#e63946', '#3a86ff', '#2a9d8f', '#f4a261', '#8338ec', '#ff006e', '#06d6a0', '#ffbe0b']
const colorTimers = {}
const fileName = name => `${name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'logo'}.png`

export default function Teams() {
  return ONLINE ? <SharedTeams /> : <LocalTeams />
}

function SharedTeams() {
  const [list, setList] = useState(null)
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')
  const loggedIn = Boolean(getSession())
  const refresh = () => listSharedTeams().then(setList, e => { setList([]); setMsg(`Could not load the team library: ${e.message}`) })
  useEffect(() => { refresh() }, [])

  const run = async fn => { setMsg(''); try { await fn() } catch (e) { setMsg(e.message) } refresh() }
  const addFiles = files => run(async () => {
    const taken = []
    for (const [i, f] of [...files].entries()) {
      const name = nameFromFile(f.name)
      if (!name) continue
      const r = await saveSharedTeam({ name, logo: await resizeImage(f, 320), color: PALETTE[((list?.length || 0) + i) % PALETTE.length] })
      if (r === 'taken') taken.push(name)
      if (r === 'login') throw new Error('Log in to add teams.')
    }
    if (taken.length) setMsg(`Already in the library (added by someone else): ${taken.join(', ')}. Pick them from the list instead.`)
  })
  const shown = (list || []).filter(t => t.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="teamsPage">
      <div className="head">
        <h1>Team logos</h1>
        <a href="/">Home</a>
      </div>
      <p className="hint">One library for everybody who uses Live by Scoreboard: every team and logo uploaded here can be picked by any operator
        (tap the team in the control page's team sheet or in Options → Teams). You can change the teams you uploaded; "by pa*******" shows who added a team.
        {sessionUser() ? '' : ' Log in to upload.'}</p>
      {loggedIn
        ? <label className="btn primary upload">
            + Add logos
            <input type="file" accept="image/*" multiple onChange={e => { addFiles(e.target.files); e.target.value = '' }} hidden />
          </label>
        : <a className="btn primary upload" href="/login?next=/teams">Log in to add logos</a>}
      {msg && <div className="warn">{msg}</div>}
      {list && list.length > 6 && <input className="search" placeholder="search teams" value={q} onChange={e => setQ(e.target.value)} />}
      {!list && <div className="empty">loading…</div>}
      {list && !list.length && <div className="empty">No teams yet.</div>}
      <div className="tgrid">
        {shown.map(tm => (
          <div className={`tcard ${tm.can_edit ? '' : 'ro'}`} key={tm.id} style={{ '--c': tm.color }} data-team={tm.name.toLowerCase()}>
            {tm.can_edit
              ? <label className="logo" title={tm.mine ? 'Change logo' : 'Replace logo (admin)'}>
                  {tm.logo ? <img src={tm.logo} alt="" /> : <span>no logo</span>}
                  <input type="file" accept="image/*" hidden aria-label={`replace logo of ${tm.name}`}
                    onChange={e => { const f = e.target.files?.[0]; if (f) run(async () => updateSharedTeam(tm.id, { logo: await resizeImage(f, 320) })) }} />
                </label>
              : <div className="logo">{tm.logo ? <img src={tm.logo} alt="" /> : <span>no logo</span>}</div>}
            {tm.can_edit
              ? <input className="tname" aria-label={`name of ${tm.name}`} defaultValue={tm.name}
                  onBlur={e => { if (e.target.value.trim() && e.target.value.trim() !== tm.name) run(() => updateSharedTeam(tm.id, { name: e.target.value })) }}
                  onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
              : <div className="tname">{tm.name}</div>}
            <div className="by">by {tm.uploader || '—'}{tm.mine ? ' (you)' : ''}</div>
            <div className="trow">
              {tm.can_edit && <input type="color" aria-label={`color of ${tm.name}`} defaultValue={tm.color}
                onChange={e => { const c = e.target.value; clearTimeout(colorTimers[tm.id]); colorTimers[tm.id] = setTimeout(() => run(() => updateSharedTeam(tm.id, { color: c })), 400) }} />}
              {tm.logo && <a className="btn sm ghost" href={tm.logo} download={fileName(tm.name)} aria-label={`download logo of ${tm.name}`}>⬇</a>}
              {tm.can_edit && <button className="btn sm ghost" aria-label={`delete ${tm.name}`}
                onClick={() => { if (window.confirm(`Delete ${tm.name} for everybody?`)) run(() => deleteSharedTeam(tm.id)) }}>Delete</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// This browser / this computer. The desktop app also shows the shared library (read-only) when online.
function LocalTeams() {
  const [list, setList] = useState(listTeams)
  const [shared, setShared] = useState([])
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')
  const refresh = ok => { setList(listTeams()); setMsg(ok === false ? 'Could not save: this browser is out of space. Remove some teams or use smaller logos.' : '') }
  useEffect(() => { if (DESKTOP) listSharedTeams().then(setShared, () => setShared([])) }, [])

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
  const match = t => t.name.toLowerCase().includes(q.trim().toLowerCase())
  const shown = list.filter(match)
  const mineIds = new Set(list.map(t => t.id))
  const sharedShown = shared.filter(t => !mineIds.has(t.name.toLowerCase()) && match(t))

  return (
    <div className="teamsPage">
      <div className="head">
        <h1>Team logos</h1>
        {!DESKTOP && <a href="/">Home</a>}
      </div>
      <p className="hint">Upload logos once; each one becomes a team named after the file (edit the name below). When you set up a game, tap the team in the team sheet (tap a team name on the control page) or in Options → Teams. Saved {DESKTOP ? 'on this computer' : 'in this browser'}.</p>
      <label className="btn primary upload">
        + Add logos
        <input type="file" accept="image/*" multiple onChange={e => { addFiles(e.target.files); e.target.value = '' }} hidden />
      </label>
      {msg && <div className="warn">{msg}</div>}
      {list.length + shared.length > 6 && <input className="search" placeholder="search teams" value={q} onChange={e => setQ(e.target.value)} />}
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
      {sharedShown.length > 0 && <>
        <h2 className="subhead">Shared library (online)</h2>
        <p className="hint">Teams uploaded by Live by Scoreboard operators. They also show up in the team pickers while this computer is online; "Keep" saves one here so it works offline too.</p>
        <div className="tgrid">
          {sharedShown.map(tm => (
            <div className="tcard ro" key={tm.id} style={{ '--c': tm.color }}>
              <div className="logo">{tm.logo ? <img src={tm.logo} alt="" /> : <span>no logo</span>}</div>
              <div className="tname">{tm.name}</div>
              <div className="by">by {tm.uploader || '—'}</div>
              <div className="trow"><button className="btn sm" aria-label={`keep ${tm.name}`} onClick={() => refresh(saveTeam(tm))}>Keep on this computer</button></div>
            </div>
          ))}
        </div>
      </>}
    </div>
  )
}
