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
  }, [api])
  return api?.getShare ? sh : null
}

export function ShareSheet({ t, close, Sheet }) {
  const api = window.desktop
  const sh = useShare()
  const [token, setToken] = useState('')
  const [chatId, setChatId] = useState(null)
  const [note, setNote] = useState('')
  const [copied, setCopied] = useState('')
  if (!sh) return null
  const chat = chatId ?? sh.telegram.chatId
  // every board and controller (share.cjs links()); the controllers ask for a Live by Scoreboard login
  const groups = sh.links ? [[t('linksWatch'), sh.links.watch], [t('shareRun'), sh.links.run]] : []
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
      <p className="hint">{t('shareHelp')}</p>
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
