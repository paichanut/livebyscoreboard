// /api/fullrink — boards owned by a FullRink account (Pai 2026-11-07).
//   GET  ?action=mine            → { boards: [{ id, key, title, home, away, updatedAt }] }  the boards this account created
//   GET  ?action=key&id=CODE     → { key }                                                    the operator key of one of them
//   POST { action:'create', id, state } → { id, key }                                         a new board owned by this account
// Every call needs `Authorization: Bearer <FullRink access token>`; the owner is the token's verified `sub`.
// The Supabase functions behind it (supabase/fullrink-owners.sql) run only with the server's service-role key
// (Vercel env SUPABASE_SERVICE_ROLE_KEY), never with the public anon key, so a browser cannot claim another sub.
// The board is then run with its ordinary operator key (save_game / check_key), like a helper link.
import { bearer, validBoardCode, verifyAccessToken } from '../lib/fullrink-auth.js'

const MAX_STATE = 300_000

export function createHandler({ verify = verifyAccessToken, env = process.env, fetchImpl = (...a) => fetch(...a) } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' })
    let user
    try { user = await verify(bearer(req)) } catch { return res.status(401).json({ error: 'Sign in with your FullRink account again.' }) }
    const base = env.VITE_SUPABASE_URL
    const service = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY
    // Without the service-role key the server uses the public anon key plus its own private key
    // (FULLRINK_BOARDS_KEY); the *_k functions check that key's hash in a schema the API does not expose.
    const boardsKey = env.FULLRINK_BOARDS_KEY
    const anon = env.VITE_SUPABASE_ANON_KEY
    if (!base || !(service || (boardsKey && anon))) return res.status(503).json({ error: 'FullRink boards are not set up on the server yet.', setup: true })
    const rpc = async (name, args) => {
      const viaKey = !service
      const apikey = viaKey ? anon : service
      const headers = { apikey, 'Content-Type': 'application/json' }
      if (apikey.startsWith('eyJ')) headers.Authorization = `Bearer ${apikey}` // legacy JWT keys
      const fn = viaKey ? `${name}_k` : name
      const body = viaKey ? { p_key: boardsKey, ...args } : args
      const r = await fetchImpl(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) })
      if (!r.ok) { const e = new Error(`rpc ${fn} ${r.status}`); e.status = r.status; throw e }
      return r.json()
    }
    const input = req.method === 'GET' ? req.query || {} : (req.body && typeof req.body === 'object' ? req.body : {})
    try {
      if (req.method === 'GET' && input.action === 'mine') {
        const rows = await rpc('fullrink_my_games', { p_sub: user.sub })
        const boards = (Array.isArray(rows) ? rows : []).map(r => ({
          id: r.id, key: r.key, title: r.title || '', home: r.home || '', away: r.away || '', updatedAt: r.updated_at ? Date.parse(r.updated_at) : 0,
        }))
        return res.status(200).json({ user: { name: user.name }, boards })
      }
      if (req.method === 'GET' && input.action === 'key') {
        if (!validBoardCode(input.id)) return res.status(400).json({ error: 'Invalid board code.' })
        const key = await rpc('fullrink_game_key', { p_id: input.id, p_sub: user.sub })
        return key ? res.status(200).json({ key }) : res.status(403).json({ error: 'This board does not belong to your FullRink account.' })
      }
      if (req.method === 'POST' && input.action === 'create') {
        if (!validBoardCode(input.id)) return res.status(400).json({ error: 'Use lowercase letters, numbers and hyphens (at most 32) for the board code.' })
        const state = input.state
        if (!state || typeof state !== 'object' || Array.isArray(state) || !state.home || !state.clock || JSON.stringify(state).length > MAX_STATE) {
          return res.status(400).json({ error: 'Invalid board.' })
        }
        const key = await rpc('fullrink_create_game', { p_id: input.id, p_state: state, p_sub: user.sub })
        return key ? res.status(200).json({ id: input.id, key }) : res.status(409).json({ error: 'That board code is taken. Choose another one.' })
      }
      return res.status(400).json({ error: 'Invalid action.' })
    } catch (e) {
      if (e.status === 404) return res.status(503).json({ error: 'FullRink boards need the fullrink-owners.sql migration on the server.', setup: true })
      if (e.status === 409) return res.status(409).json({ error: 'That board code is taken. Choose another one.' })
      return res.status(502).json({ error: 'Could not reach the online service. Please retry.' })
    }
  }
}

export default createHandler()
