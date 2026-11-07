// FullRink account sign-in (one account for every FullRink app; Keycloak at auth.fullrink.com, realm `fullrink`).
// OIDC Authorization Code + PKCE in the browser with oidc-client-ts, public client `scoreboard-web` (no secret).
// Optional: "Use without signing in" keeps every board working as before (operator login, share links ?k=).
// Off in the desktop app and the test build (no FullRink there), unless VITE_FULLRINK_AUTH=1 (dev check).
import { useEffect, useState } from 'react'
import { DESKTOP, ONLINE, rememberKey } from './sync.js'

export const FULLRINK_ISSUER = import.meta.env.VITE_FULLRINK_ISSUER || 'https://auth.fullrink.com/realms/fullrink'
export const FULLRINK_CLIENT = 'scoreboard-web'
export const FULLRINK_AUTH = !DESKTOP && (ONLINE || import.meta.env.VITE_FULLRINK_AUTH === '1') && typeof window !== 'undefined'
export const CALLBACK_PATH = '/auth/callback'

let managerPromise = null
// loaded only when needed, so pages that never touch the account (displays, OBS) stay as light as before
function manager() {
  if (!FULLRINK_AUTH) return Promise.resolve(null)
  managerPromise ||= import('oidc-client-ts').then(({ UserManager, WebStorageStateStore }) => {
    const origin = window.location.origin
    const m = new UserManager({
      authority: FULLRINK_ISSUER,
      client_id: FULLRINK_CLIENT,
      redirect_uri: origin + CALLBACK_PATH,
      silent_redirect_uri: origin + CALLBACK_PATH,
      post_logout_redirect_uri: origin + '/',
      response_type: 'code', // + PKCE S256 (oidc-client-ts always sends a code challenge)
      scope: 'openid profile email',
      automaticSilentRenew: true, // refresh token grant; falls back to a hidden iframe on /auth/callback
      monitorSession: false,
      userStore: new WebStorageStateStore({ store: window.localStorage, prefix: 'fullrink.' }),
    })
    m.events.addUserLoaded(u => emit(u))
    m.events.addUserUnloaded(() => emit(null))
    m.events.addUserSignedOut(() => { m.removeUser(); emit(null) })
    m.events.addSilentRenewError(() => {})
    return m
  })
  return managerPromise
}

const listeners = new Set()
let current // undefined = not read yet
function emit(u) { current = u && !u.expired ? u : null; listeners.forEach(fn => fn(current)) }

export async function getUser() {
  const m = await manager()
  if (!m) return null
  let u = await m.getUser()
  if (u?.expired) { try { u = await m.signinSilent() } catch { u = null } }
  emit(u)
  return current
}

export const displayName = u => {
  const p = u?.profile || {}
  return [p.name, p.preferred_username, p.email].find(v => typeof v === 'string' && v.trim()) || 'FullRink account'
}

// { user: undefined (checking) | null (signed out) | User }
export function useFullRinkUser() {
  const [user, setUser] = useState(FULLRINK_AUTH ? current : null)
  useEffect(() => {
    if (!FULLRINK_AUTH) return
    listeners.add(setUser)
    if (current === undefined) getUser().catch(() => setUser(null))
    return () => listeners.delete(setUser)
  }, [])
  return user
}

const safeReturn = p => (typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') && !p.startsWith(CALLBACK_PATH) ? p : '/')

export async function signIn(returnTo = window.location.pathname + window.location.search) {
  const m = await manager()
  if (m) await m.signinRedirect({ state: { returnTo: safeReturn(returnTo) } })
}

// ends the Keycloak session too (end-session endpoint), back to this site's home page
export async function signOut() {
  const m = await manager()
  if (!m) return
  const u = await m.getUser()
  await m.removeUser()
  emit(null)
  await m.signoutRedirect({ id_token_hint: u?.id_token, post_logout_redirect_uri: window.location.origin + '/' })
}

// /auth/callback: the redirect after sign-in → the page to go back to; null in the hidden silent-renew frame
// (oidc-client-ts tells them apart by the stored request and hands the silent answer to the parent page)
export async function finishSignIn() {
  const m = await manager()
  if (!m) return '/'
  const u = await m.signinCallback()
  if (!u) return null
  emit(u)
  return safeReturn(u.state?.returnTo)
}

// "Use without signing in": remembered on this device, so the choice is asked once
const SKIP = 'rinkboard:fullrink:skip'
export const skippedSignIn = () => { try { return localStorage.getItem(SKIP) === '1' } catch { return false } }
export const skipSignIn = (on = true) => { try { on ? localStorage.setItem(SKIP, '1') : localStorage.removeItem(SKIP) } catch {} }

// ---------- boards owned by the account (api/fullrink.js) ----------
async function api(path, init = {}) {
  const u = await getUser()
  if (!u) throw Object.assign(new Error('Sign in with your FullRink account.'), { status: 401 })
  const r = await fetch(`/api/fullrink${path}`, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${u.access_token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(data.error || `HTTP ${r.status}`), { status: r.status, setup: Boolean(data.setup) })
  return data
}

// The key of a board this account owns is kept like a helper key, marked so Control uses it before an operator login
const FR_KEY = id => `rinkboard:frkey:${id}`
export function rememberOwnedKey(id, key) { rememberKey(id, key); try { localStorage.setItem(FR_KEY(id), key) } catch {} }
export function ownedKey(id) { try { return localStorage.getItem(FR_KEY(id)) || '' } catch { return '' } }

export async function myBoards() {
  const { boards } = await api('?action=mine')
  for (const b of boards) if (b.key) rememberOwnedKey(b.id, b.key)
  return boards.map(({ key, ...b }) => b)
}

export async function createBoard(id, state) {
  const { key } = await api('', { method: 'POST', body: JSON.stringify({ action: 'create', id, state }) })
  rememberOwnedKey(id, key)
  return key
}

export async function boardKey(id) {
  const { key } = await api(`?action=key&id=${encodeURIComponent(id)}`)
  rememberOwnedKey(id, key)
  return key
}

export { keyFromShareLink } from '../lib/share-link.js'
