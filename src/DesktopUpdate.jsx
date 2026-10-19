// Desktop app only (window.desktop comes from desktop/preload.cjs): version + update state in the control
// status line. The update installs when the app closes, or now with "Restart".
import { useEffect, useState } from 'react'

export default function DesktopUpdate({ t }) {
  const api = window.desktop
  const [u, setU] = useState(null)
  useEffect(() => {
    if (!api?.getUpdate || api.license?.unlicensed) return // no updates once the licence has ended
    api.getUpdate().then(setU)
    return api.onUpdate(setU)
  }, [api])
  if (!api || !u) return null

  const restart = () => { if (confirm(t('updConfirm', { v: u.newVersion }))) api.installUpdate() }
  let body
  if (u.status === 'ready') body = <button className="linkbtn updready" onClick={restart}>⬆ {t('updReady', { v: u.newVersion })}</button>
  else if (u.status === 'available') body = <button className="linkbtn updready" onClick={() => api.openDownload()}>⬆ {t('updAvailable', { v: u.newVersion })}</button>
  else if (u.status === 'downloading') body = <span>{t('updDownloading', { p: u.percent ?? 0 })}</span>
  else if (u.status === 'checking') body = <span>{t('updChecking')}</span>
  else body = <>
    {u.status === 'none' && <span>{t('updNone')} · </span>}
    {u.status === 'error' && <span>{t('updError')} · </span>}
    <button className="linkbtn" onClick={() => api.checkForUpdates()}>⟳ {t('updCheck')}</button>
  </>
  return <span className="who desktopupd">v{u.version} · {body}</span>
}
