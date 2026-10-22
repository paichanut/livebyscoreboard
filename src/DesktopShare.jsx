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

export function DesktopLinkStatus({ openSettings }) {
  const sh = useShare()
  const [copied, setCopied] = useState('')
  if (!sh) return null
  const online = sh.enabled && sh.state === 'online'
  const status = !sh.enabled ? 'Off' : online ? 'Online' : ({ starting: 'Connecting', verifying: 'Verifying', downloading: 'Preparing', offline: 'Reconnecting' }[sh.state] || 'Connecting')
  const groups = [
    ...(sh.fixed ? [{ name: 'Permanent link', links: sh.fixed.links, status: !sh.enabled ? 'Off' : sh.fixedStatus === 'online' && online ? 'Online' : sh.fixedStatus === 'error' ? 'Connection error' : 'Connecting' }] : []),
    ...(sh.links ? [{ name: 'Cloudflare', links: sh.links, status }] : []),
  ]
  const copy = async url => {
    try { await navigator.clipboard.writeText(url); setCopied(url) } catch { setCopied('') }
  }
  return <section className="desktop-link-status" aria-label="Desktop online links">
    <div className="desktop-link-heading"><strong className={online ? 'live' : 'local'}>Online link · {status}</strong><button className="linkbtn" onClick={openSettings}>Manage links</button></div>
    {!groups.length && <span>Turn on Online link to get Controller and Display URLs.</span>}
    {groups.map(group => <div className="desktop-link-group" key={group.name}>
      <span className="desktop-link-label">{group.name} · {group.status}</span>
      {[...(group.links.run || []).map(([label,url])=>[label,url]), ...(group.links.watch || []).filter(([,url])=>new URL(url).pathname.startsWith('/b/')).map(([label,url])=>[label === 'Scoreboard' ? 'Display' : label,url])].map(([label,url])=><div className="desktop-link-row" key={url}>
        <span>{label}</span><a href={url} onClick={e=>{e.preventDefault();window.desktop.openLink(url)}}>{url}</a>
        <button className="linkbtn" aria-label={`Copy ${group.name} ${label} URL`} onClick={()=>copy(url)}>{copied===url?'Copied':'Copy'}</button>
      </div>)}
    </div>)}
  </section>
}

export function ShareSheet({ t, close, Sheet }) {
  const api = window.desktop
  const sh = useShare()
  const [token, setToken] = useState('')
  const [chatId, setChatId] = useState(null)
  const [note, setNote] = useState('')
  const [copied, setCopied] = useState('')
  const [machine, setMachine] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [pairing, setPairing] = useState(false)
  const pair = async () => {
    setPairing(true); setNote('Pairing desktop…')
    try {
      const result = await api.pairFixedLink({code:machine,username,password})
      setNote(result.ok ? 'Fixed Vercel link paired.' : result.error)
    } catch { setNote('Could not pair this desktop. Please retry.') }
    finally { setPassword(''); setPairing(false) }
  }
  useEffect(() => { if (sh?.fixed && sh.fixed.version !== 2) setMachine(sh.fixed.code) }, [sh?.fixed?.code, sh?.fixed?.version])
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
      <h4>Fixed Vercel link</h4>
      {sh.fixed?.version === 2 ? <p className="hint">Account: <b>{sh.fixed.username}</b> · Machine: <b>{sh.fixed.code}</b> · {sh.fixedStatus || 'connecting'}<br />Controller links require this account’s operator login.</p> : <div>
        <p className="hint">Pair once with your operator account. Your machine name stays the same after restarts. Existing links can be upgraded here without changing your game.</p>
        <div className="field">Machine name<input aria-label="Machine name" autoCapitalize="none" value={machine} onChange={e => setMachine(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''))} maxLength={40} placeholder="arena-pc" /></div>
        <div className="field">Operator username<input aria-label="Operator username" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} /></div>
        <div className="field">Operator password<input aria-label="Operator password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></div>
        <button className="btn" onClick={pair} disabled={pairing || machine.length < 3 || !username.trim() || !password}>{pairing ? 'Pairing…' : 'Pair fixed link'}</button>
        <p className="hint">Your password is used only to pair this machine and is not saved.</p>
      </div>}
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
