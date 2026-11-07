import React, { useEffect, useState } from 'react'
import { finishSignIn, signIn } from './fullrink.js'

// /auth/callback: Keycloak sends the browser back here after "Sign in with FullRink account" (and silent renew
// loads it in a hidden frame). Exchange the code (PKCE), then return to the page the sign-in started from.
export default function AuthCallback() {
  const [err, setErr] = useState('')
  useEffect(() => {
    finishSignIn().then(to => { if (to) window.location.replace(to) })
      .catch(e => setErr(e?.error_description || e?.message || 'Sign-in failed.'))
  }, [])
  return (
    <div className="home login">
      <h1>Live by Scoreboard</h1>
      {err ? (<>
        <p>FullRink sign-in did not finish: {err}</p>
        <div className="links">
          <button className="btn primary" onClick={() => signIn('/')}>Try again</button>
          <a className="btn" href="/">Use without signing in</a>
        </div>
      </>) : <p>Signing in with your FullRink account…</p>}
    </div>
  )
}
