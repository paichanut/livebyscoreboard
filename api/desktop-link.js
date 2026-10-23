// Account-scoped desktop addresses use a separate owner-protected registry.
// Legacy flat addresses remain compatible with older desktop releases.
import { randomBytes, createHash } from 'node:crypto'
import { LEASE_MS, machineCode, validMachineCode, tunnelOrigin, registryState, isRegistry, destination } from '../lib/desktop-links.js'
import { validUsername, validMachineId } from '../lib/desktop-address.js'

const online = relay => Boolean(tunnelOrigin(relay.url) && Number(relay.seenAt) > Date.now() - LEASE_MS)

async function machineRequest(req, res, rpc) {
  const input = req.method === 'GET' ? req.query : req.body || {}
  const username = machineCode(input.username)
  const code = machineCode(input.code)
  const fail = error => {
    const errors = {
      login: [401, 'Operator login required.'],
      forbidden: [403, 'Sign in with the account that owns this desktop.'],
      missing: [404, 'Desktop not found.'],
      invalid_machine: [400, 'Use 3–40 letters, numbers or hyphens for the machine name.'],
    }
    const [status, message] = errors[error] || [502, 'Could not connect this desktop.']
    return res.status(status).json({ desktop: true, error: message })
  }
  if ((req.method === 'GET' && input.action) || (req.method === 'POST' && !['publish', 'register', 'resolve', 'login', 'logout', 'session'].includes(input.action))) return res.status(400).json({ error: 'Invalid desktop action.' })
  // The desktop app logs in once and keeps the operator session (30 days) until its Log out (Pai 2026-10-23).
  if (input.action === 'login') {
    if (!validUsername(username) || typeof input.password !== 'string' || !input.password || input.password.length > 1000) return res.status(400).json({ error: 'Enter your operator login.' })
    const token = await rpc('operator_login', { p_username: username, p_password: input.password })
    if (!token) return res.status(401).json({ desktop: true, error: 'Wrong username or password.' })
    return res.status(200).json({ token, username: await rpc('operator_whoami', { p_token: token }) || username })
  }
  if (input.action === 'session' || input.action === 'logout') {
    if (typeof input.token !== 'string' || !input.token || input.token.length > 200) return fail('login')
    if (input.action === 'logout') { await rpc('operator_logout', { p_token: input.token }); return res.status(200).json({ ok: true }) }
    const account = await rpc('operator_whoami', { p_token: input.token })
    return account ? res.status(200).json({ username: account }) : fail('login')
  }
  if (req.method === 'POST' && input.action === 'publish') {
    if (!validMachineId(input.machineId) || typeof input.machineKey !== 'string' || !/^[0-9a-f]{32}$/.test(input.nonce || '') || typeof input.url !== 'string' || input.url && !tunnelOrigin(input.url)) {
      return res.status(400).json({ error: 'Invalid desktop registration.' })
    }
    const saved = await rpc('desktop_machine_publish', { p_machine_id: input.machineId, p_key: input.machineKey, p_nonce: input.nonce, p_url: input.url })
    return res.status(saved ? 200 : 403).json(saved ? { ok: true } : { error: 'Pair this desktop again.' })
  }
  if (!validUsername(username) || !validMachineCode(code)) return res.status(400).json({ error: 'Invalid account or machine name.' })
  if (req.method === 'POST' && input.action === 'register') {
    if (!validMachineId(input.machineId)) return res.status(400).json({ error: 'Invalid desktop registration.' })
    // the desktop's saved session; a password (older desktop builds) logs in just for this request
    const saved = typeof input.token === 'string' && input.token && input.token.length <= 200
    if (!saved && (typeof input.password !== 'string' || !input.password || input.password.length > 1000)) return res.status(400).json({ error: 'Enter your operator login.' })
    const token = saved ? input.token : await rpc('operator_login', { p_username: username, p_password: input.password })
    if (!token) return fail('login')
    try {
      const result = await rpc('desktop_machine_register', { p_token: token, p_machine_id: input.machineId, p_machine: code })
      return result?.error ? fail(result.error) : res.status(200).json(result)
    } finally { if (!saved) await rpc('operator_logout', { p_token: token }).catch(() => {}) }
  }
  const kind = input.kind
  if (!['b', 'c', 'o'].includes(kind)) return res.status(400).json({ error: 'Invalid display choice.' })
  let relay
  if (kind === 'c') {
    if (req.method !== 'POST' || typeof input.token !== 'string' || !input.token) return fail('login')
    relay = await rpc('desktop_machine_control', { p_token: input.token, p_username: username, p_machine: code })
    if (relay?.error) return fail(relay.error)
  } else relay = await rpc('desktop_machine_lookup', { p_username: username, p_machine: code })
  if (!relay) return res.status(404).json({ desktop: false, error: 'Desktop not found.' })
  // the desktop copies its game online (desktop_machines.game_id): watchers get that game, no tunnel needed
  if (kind !== 'c' && relay.gameId && relay.synced) return res.status(200).json({ desktop: true, online: true, machine: code, username, game: relay.gameId })
  if (!online(relay)) return res.status(200).json({ desktop: true, online: false, machine: code, username })
  const url = destination(relay, kind, input, kind === 'c' ? relay.key : '')
  if (!url) return res.status(400).json({ error: 'Invalid desktop connection.' })
  return res.status(200).json({ desktop: true, online: true, machine: code, username, url })
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  const base = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!base || !key) return res.status(503).json({ error: 'Online service is not configured.' })
  const rpc = async (name, args) => {
    const r = await fetch(base + '/rest/v1/rpc/' + name, { method: 'POST', headers: { apikey:key, Authorization:'Bearer '+key, 'Content-Type':'application/json' }, body:JSON.stringify(args), signal:AbortSignal.timeout(10000) })
    if (!r.ok) {
      const error = new Error('Online service request failed (' + r.status + ').')
      if (name.startsWith('desktop_machine_') && r.status === 404) error.setupRequired = true
      throw error
    }
    return r.json()
  }
  const read = async code => {
    const r = await fetch(base + '/rest/v1/games?id=eq.' + encodeURIComponent(code) + '&select=state&limit=1', { headers:{apikey:key,Authorization:'Bearer '+key}, signal:AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error('Could not look up this desktop.')
    return (await r.json())[0]?.state
  }
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    if (!['GET','POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed.'})
    // the public Supabase address + anon key (the same the web app ships): the desktop saves its online game with them
    if (req.method === 'POST' && body.action === 'config') return res.status(200).json({ url: base, anonKey: key })
    if (body.version === 2 || body.machineId != null || req.method === 'GET' && req.query.username != null || body.action === 'resolve' && body.username != null) {
      return await machineRequest(req, res, rpc)
    }
    const code = machineCode(req.method === 'GET' ? req.query.code : body.code)
    if (!validMachineCode(code)) return req.method === 'GET'
      ? res.status(200).json({ desktop:false })
      : res.status(400).json({error:'Use 3–40 lowercase letters, numbers or hyphens, starting with a letter or number.'})
    if (!['GET','POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed.'})
    if (req.method === 'POST' && body.action === 'register') {
      if (typeof body.username !== 'string' || typeof body.password !== 'string' || body.username.length > 100 || body.password.length > 1000) return res.status(400).json({error:'Enter your operator login.'})
      const token = await rpc('operator_login', {p_username:body.username,p_password:body.password})
      if (!token) return res.status(401).json({error:'Wrong username or password.'})
      try {
        const username = await rpc('operator_whoami', {p_token:token})
        if (!username) throw new Error('Operator session expired.')
        const owner = createHash('sha256').update(username).digest('hex')
        let state = await read(code)
        if (state && (!isRegistry(state) || state.desktopRelay.owner !== owner)) return res.status(409).json({error:'This machine name is already in use. Choose another name.'})
        if (!state) {
          state = registryState(code,owner,randomBytes(16).toString('hex'),'')
          if (!await rpc('create_game',{p_id:code,p_key:token,p_state:state})) return res.status(409).json({error:'This name was just claimed. Choose another name.'})
        }
        const machineKey = await rpc('get_game_key',{p_id:code,p_token:token})
        if (!machineKey) throw new Error('Could not pair this desktop.')
        return res.status(200).json({code,key:machineKey,nonce:state.desktopRelay.nonce})
      } finally { await rpc('operator_logout',{p_token:token}).catch(()=>{}) }
    }
    const state = await read(code)
    if (!isRegistry(state)) return res.status(200).json({desktop:false})
    const relay = state.desktopRelay
    if (req.method === 'POST' && body.action === 'publish') {
      if (typeof body.machineKey !== 'string' || !/^[0-9a-f]{32}$/.test(body.nonce || '') || (body.url && !tunnelOrigin(body.url))) return res.status(400).json({error:'Invalid desktop registration.'})
      const saved = await rpc('save_game',{p_id:code,p_key:body.machineKey,p_state:registryState(code,relay.owner,body.nonce,body.url || '')})
      return res.status(saved ? 200 : 403).json(saved ? {ok:true} : {error:'Pair this desktop again.'})
    }
    const kind = req.method === 'GET' ? req.query.kind : body.kind
    const options = req.method === 'GET' ? req.query : body
    const online = Boolean(tunnelOrigin(relay.url) && Number(relay.seenAt) > Date.now()-LEASE_MS)
    if (!online) return res.status(200).json({desktop:true,online:false,machine:code})
    let machineKey = ''
    if (kind === 'c') {
      if (req.method !== 'POST' || typeof body.token !== 'string' || !await rpc('operator_check',{p_token:body.token})) return res.status(401).json({desktop:true,error:'Operator login required.'})
      machineKey = await rpc('get_game_key',{p_id:code,p_token:body.token})
    }
    const url = destination(relay,kind,options,machineKey)
    if (!url) return res.status(400).json({error:'Invalid display choice.'})
    return res.status(200).json({desktop:true,online:true,url})
  } catch (error) {
    return res.status(error.setupRequired ? 503 : 502).json({ error: error.setupRequired ? 'Permanent desktop links need setup on the server.' : 'Could not reach the online service. Please retry.' })
  }
}
