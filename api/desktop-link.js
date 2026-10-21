// Fixed desktop addresses use the existing private game-key and operator login RPCs.
// Registry rows have no scoreboard fields and are excluded from the live game list.
import { randomBytes, createHash } from 'node:crypto'
import { LEASE_MS, machineCode, validMachineCode, tunnelOrigin, registryState, isRegistry, destination } from '../lib/desktop-links.js'
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  const base = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!base || !key) return res.status(503).json({ error: 'Online service is not configured.' })
  const rpc = async (name, args) => {
    const r = await fetch(base + '/rest/v1/rpc/' + name, { method: 'POST', headers: { apikey:key, Authorization:'Bearer '+key, 'Content-Type':'application/json' }, body:JSON.stringify(args), signal:AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error('Online service request failed (' + r.status + ').')
    return r.json()
  }
  const read = async code => {
    const r = await fetch(base + '/rest/v1/games?id=eq.' + encodeURIComponent(code) + '&select=state&limit=1', { headers:{apikey:key,Authorization:'Bearer '+key}, signal:AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error('Could not look up this desktop.')
    return (await r.json())[0]?.state
  }
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
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
  } catch { return res.status(502).json({error:'Could not reach the online service. Please retry.'}) }
}
