// FullRink account (Keycloak at auth.fullrink.com, realm `fullrink`) for the serverless functions in api/.
// The browser signs in with the public client `scoreboard-web` (Authorization Code + PKCE, src/fullrink.js) and
// sends its access token as `Authorization: Bearer …`. The functions never trust a user id sent by the browser:
// the user is the `sub` of a token whose signature checks out against the realm's published keys.
import { createRemoteJWKSet, jwtVerify } from 'jose'

export const FULLRINK_ISSUER = 'https://auth.fullrink.com/realms/fullrink'
export const FULLRINK_CERTS = `${FULLRINK_ISSUER}/protocol/openid-connect/certs`
export const FULLRINK_CLIENT = 'scoreboard-web'

let remoteKeys = null
const realmKeys = () => (remoteKeys ||= createRemoteJWKSet(new URL(FULLRINK_CERTS), { timeoutDuration: 5000, cooldownDuration: 30_000 }))

// → { sub, name } or throws. `keys` is for tests (a local key set); production fetches the realm's certs (cached).
export async function verifyAccessToken(token, { keys = realmKeys(), issuer = FULLRINK_ISSUER, client = FULLRINK_CLIENT } = {}) {
  if (typeof token !== 'string' || !token || token.length > 8192) throw new Error('missing token')
  const { payload } = await jwtVerify(token, keys, { issuer, algorithms: ['RS256', 'PS256', 'ES256'], clockTolerance: 30 })
  // an access token (not an ID or refresh token) issued to this app, for a real user
  if (payload.typ && payload.typ !== 'Bearer') throw new Error('not an access token')
  if (payload.azp !== client) throw new Error('token was issued to another app')
  if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('no subject')
  const name = [payload.name, payload.preferred_username, payload.email].find(v => typeof v === 'string' && v.trim()) || ''
  return { sub: payload.sub, name: name.trim().slice(0, 120) }
}

export function bearer(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || ''
  const m = /^Bearer\s+(\S+)$/i.exec(String(h))
  return m ? m[1] : ''
}

// Same rule as cleanCode() in src/useGame.js: a-z, 0-9 and hyphens, at most 32
export const validBoardCode = id => typeof id === 'string' && /^[a-z0-9-]{1,32}$/.test(id)
