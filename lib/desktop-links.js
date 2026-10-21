import { createHmac } from 'node:crypto'
export const LEASE_MS = 180000
export const machineCode = value => String(value || '').trim().toLowerCase()
export const validMachineCode = code => /^[a-z0-9][a-z0-9-]{2,39}$/.test(code)
export function tunnelOrigin(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && /^[a-z0-9-]+\.trycloudflare\.com$/.test(u.hostname) && !u.port && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash ? u.origin : '' } catch { return '' }
}
export const controllerKey = (key, nonce) => createHmac('sha256', key).update('desktop-control-v1:' + nonce).digest('hex').slice(0,24)
export const registryState = (code, owner, nonce, url, now = Date.now()) => ({ desktopRelay: { version: 1, machine: code, owner, nonce, url: tunnelOrigin(url), seenAt: now } })
export const isRegistry = s => s?.desktopRelay?.version === 1
export function destination(relay, kind, { rink, view } = {}, key = '') {
  const origin = tunnelOrigin(relay.url)
  if (!origin || !['b','c','o'].includes(kind)) return ''
  const u = new URL('/' + kind + '/main', origin)
  if (['a','b'].includes(rink)) u.searchParams.set('rink', rink)
  if (kind === 'b' && view === 'shift') u.searchParams.set('view', view)
  if (kind === 'c') { if (!key) return ''; u.searchParams.set('key', controllerKey(key, relay.nonce)) }
  return u.href
}
