// Desktop app only (window.desktop from desktop/preload.cjs): Control → 🌐 Online link.
// Turns the Cloudflare link on/off, shows it, and sets up the Telegram chat that gets it (desktop/share.cjs).
import React, { useEffect, useState } from 'react'

export function useShare() {
  const api = window.desktop
  const [sh, setSh] = useState(null)
  useEffect(() => {
    if (!api?.getShare) return
    api.getShare().then(setSh)
    return api.onShare(setSh)
  }, [api, api?.getShare])
  return api?.getShare ? sh : null
}

const CLOUD = { synced: 'Synced', offline: 'Sync waits for internet', login: 'Log in to sync', error: 'Sync error' }

export function DesktopLinkStatus({ openSettings }) {
  const sh = useShare()
  const [copied, setCopied] = useState('')
  if (!sh) return null
  const online = sh.enabled && sh.state === 'online'
  const status = !sh.enabled ? 'Off' : online ? 'Online' : ({ starting: 'Connecting', verifying: 'Verifying', downloading: 'Preparing', offline: 'Reconnecting' }[sh.state] || 'Connecting')
  const groups = [
    // the online game (share.cjs syncCloud) keeps the permanent Display working without the Cloudflare link
    ...(sh.fixed ? [{ name: 'Permanent link', links: sh.fixed.links, status: CLOUD[sh.cloudStatus] || (!sh.enabled ? 'Off' : sh.fixedStatus === 'online' && online ? 'Online' : sh.fixedStatus === 'error' ? 'Connection error' : 'Connecting') }] : []),
    ...(sh.links ? [{ name: 'Cloudflare', links: sh.links, status }] : []),
  ]
  const copy = async url => {
    try { await navigator.clipboard.writeText(url); setCopied(url) } catch { setCopied('') }
  }
  const manage = <button className="linkbtn desktop-link-manage" onClick={openSettings}>Manage links</button>
  // one line per address (status + its Controller / Display links), so the control page keeps fitting the window
  return <section className="desktop-link-status" aria-label="Desktop online links">
    {!groups.length && <div className="desktop-link-group">
      <span className="desktop-link-label">Online link · {status}</span>
      <span className="desktop-link-row">Turn on Online link to get Controller and Display URLs.</span>{manage}
    </div>}
    {groups.map((group, i) => <div className="desktop-link-group" key={group.name}>
      <span className={`desktop-link-label ${['Online', 'Synced'].includes(group.status) ? 'on' : 'off'}`}>{group.name} · {group.status}</span>
      {[...(group.links.run || []).map(([label,url])=>[label,url]), ...(group.links.watch || []).filter(([,url])=>new URL(url).pathname.startsWith('/b/')).map(([label,url])=>[label === 'Scoreboard' ? 'Display' : label,url])].map(([label,url])=><div className="desktop-link-row" key={url}>
        <span>{label}</span><a href={url} title={url} onClick={e=>{e.preventDefault();window.desktop.openLink(url)}}>{url}</a>
        <button className="linkbtn" aria-label={`Copy ${group.name} ${label} URL`} onClick={()=>copy(url)}>{copied===url?'Copied':'Copy'}</button>
      </div>)}
      {i === 0 && manage}
    </div>)}
  </section>
}

export function ShareSheet({ t, close, Sheet, onNewAddress }) {
  const api = window.desktop
  const sh = useShare()
  const [token, setToken] = useState('')
  const [chatId, setChatId] = useState(null)
  const [note, setNote] = useState('')
  const [acctNote, setAcctNote] = useState('')
  const [copied, setCopied] = useState('')
  const [machine, setMachine] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [pairing, setPairing] = useState(false)
  const login = async () => {
    setPairing(true); setAcctNote('Logging in…')
    try {
      const result = await api.loginOnline({username,password})
      setAcctNote(result.ok ? `Logged in as ${result.username}. This computer stays logged in until Log out.` : result.error)
    } catch { setAcctNote('Could not log in. Please retry.') }
    finally { setPassword(''); setPairing(false) }
  }
  // a machine name works like a game code: a new one is created online and starts a new game here
  const pair = async () => {
    setPairing(true); setAcctNote('Connecting…')
    try {
      const result = await api.pairFixedLink({code:machine})
      if (!result.ok) return setAcctNote(result.error)
      setAcctNote(result.created ? `New address ${result.code} created.` : `This computer now uses ${result.code}.`)
      if (result.created) onNewAddress?.(result.code)
    } catch { setAcctNote('Could not connect this name. Please retry.') }
    finally { setPairing(false) }
  }
  useEffect(() => { if (sh?.fixed?.code) setMachine(sh.fixed.code) }, [sh?.fixed?.code])
  if (!sh) return null
  const chat = chatId ?? sh.telegram.chatId
  // every board and controller (share.cjs links()); the controllers ask for a Live by Scoreboard login
  const groups = [
    ...(sh.fixed ? [['Fixed Vercel · ' + t('linksWatch'),sh.fixed.links.watch],['Fixed Vercel · Controller (owner login)',sh.fixed.links.run]] : []),
    ...(sh.links ? [['Dynamic Cloudflare · ' + t('linksWatch'),sh.links.watch],['Dynamic Cloudflare · ' + t('shareRun'),sh.links.run]] : []),
  ]
  const copy = async url => { try { await navigator.clipboard.writeText(url); setCopied(url) } catch {} }
  const saveTelegram = async () => { await api.setTelegram({ botToken: token, chatId: chat }); setToken(''); setNote(t('saved')) }
  const find = async () => {
    setNote('…')
    const r = await api.findTelegramChat(token)
    if (r.ok) { setChatId(r.chatId); setToken(''); setNote(`${t('tgFound')}: ${r.name || r.chatId}`) } else setNote(r.error)
  }

  return (
    <Sheet close={close}>
      <h3>🌐 {t('shareTitle')}</h3>
      <p className="hint">Keep a permanent Vercel address and the dynamic Cloudflare tunnel. Only Cloudflare links are sent to Telegram. Permanent links are available here. The desktop must be online for either address to work.</p>
      <h4>Permanent link</h4>
      {!sh.account ? <div>
        <p className="hint">Log in once with your operator account. This computer stays logged in until you press Log out; the password is not saved.</p>
        <div className="field">Operator username<input aria-label="Operator username" autoCapitalize="none" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} /></div>
        <div className="field">Operator password<input aria-label="Operator password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && username.trim() && password) login() }} /></div>
        <button className="btn primary" onClick={login} disabled={pairing || !username.trim() || !password}>{pairing ? 'Logging in…' : 'Log in'}</button>
      </div> : <div>
        <p className="hint">Logged in as <b>{sh.account.username}</b> · <button className="linkbtn" onClick={() => { setAcctNote(''); api.logoutOnline() }}>Log out</button></p>
        <div className="field">Machine name<input aria-label="Machine name" autoCapitalize="none" value={machine} onChange={e => setMachine(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''))} onKeyDown={e => { if (e.key === 'Enter' && machine.length >= 3 && machine !== sh.fixed?.code) pair() }} maxLength={40} placeholder="arena-pc" /></div>
        <button className="btn primary" onClick={pair} disabled={pairing || machine.length < 3 || machine === sh.fixed?.code}>{pairing ? 'Connecting…' : 'Use this name'}</button>
        <p className="hint">A name you don’t have yet creates a new address and a new game. A name you already have moves to this computer.</p>
      </div>}
      {sh.fixed?.version === 2 && <p className="hint">Now: <b>{sh.fixed.username}/{sh.fixed.code}</b> · {sh.fixedStatus || 'connecting'}. Controller links ask for this account’s operator login.</p>}
      {sh.fixed?.gameId && <p className="hint">Online game: <b>livebyscoreboard.vercel.app/b/{sh.fixed.gameId}</b> · {CLOUD[sh.cloudStatus] || (sh.account ? 'Syncing…' : 'Log in to sync')}. Every change here is copied online and listed on Live games; the displays work without the Cloudflare link.</p>}
      {acctNote && <div className="sharestatus">{acctNote}</div>}
      <div className="row">
        <button className={`btn ${sh.enabled ? 'on' : ''}`} style={{ flex: 1 }} onClick={() => api.enableShare(!sh.enabled)}>
          {sh.enabled ? t('shareOn') : t('shareOff')}
        </button>
      </div>
      {sh.enabled && <div className="sharestatus">{t(`share_${sh.state}`)}</div>}
      {groups.map(([title, rows]) => (
        <React.Fragment key={title}>
          <h4>{title}</h4>
          {rows.map(([label, url]) => (
            <div className="sharelink" key={url}>
              <span>{label}</span>
              <code>{url}</code>
              <div className="row">
                <button className="btn sm" onClick={() => copy(url)}>{copied === url ? t('copied') : t('copy')}</button>
                <button className="btn sm ghost" onClick={() => api.openLink(url)}>{t('open')}</button>
              </div>
            </div>
          ))}
        </React.Fragment>
      ))}

      {sh.links && <button className="btn sm ghost" onClick={() => { if (confirm(t('newKeyConfirm'))) api.newControlKey() }}>🔑 {t('newKey')}</button>}

      {sh.local && <div className="sharelink">
        <span>{t('shareLocal')}</span>
        <code>{sh.local}/o/main</code>
        <code>{sh.local}/b/main</code>
      </div>}

      <h4>Telegram</h4>
      <p className="hint">{t('tgHelp')}</p>
      <div className="field">{t('tgToken')}
        <input type="password" autoComplete="off" placeholder={sh.telegram.tokenSet ? t('tgTokenSet') : '123456:ABC…'} value={token} onChange={e => setToken(e.target.value)} />
      </div>
      <div className="field">{t('tgChat')}
        <div className="row">
          <input value={chat} onChange={e => setChatId(e.target.value)} placeholder="-100… / 12345…" />
          <button className="btn sm" onClick={find} disabled={!token && !sh.telegram.tokenSet}>{t('tgFind')}</button>
        </div>
      </div>
      <div className="row">
        <button className="btn primary" style={{ flex: 1 }} onClick={saveTelegram}>{t('save')}</button>
        <button className="btn" onClick={async () => { await saveTelegram(); setNote(await api.testTelegram()) }} disabled={!sh.telegram.tokenSet && !token}>{t('tgTest')}</button>
      </div>
      {(note || sh.telegram.last) && <div className="sharestatus">{note || sh.telegram.last}</div>}
      <button className="btn ghost" onClick={close}>{t('close')}</button>
    </Sheet>
  )
}
