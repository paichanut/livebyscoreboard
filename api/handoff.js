// POST /api/handoff { code } → { username }: the desktop app's online link redeems the one-time code made by
// /handoff (a browser already logged in to Live by Scoreboard). Single use, 60 s (see supabase.sql).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return res.status(503).json({ error: 'not configured' })
  const code = String((typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}).code || '')
  if (!/^[0-9a-f]{32}$/.test(code)) return res.status(400).json({ error: 'bad code' })
  try {
    const r = await fetch(`${url}/rest/v1/rpc/handoff_redeem`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_code: code }),
    })
    const username = r.ok ? await r.json() : null
    if (!username) return res.status(401).json({ error: 'code not valid (used or older than 60 s)' })
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({ username })
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) })
  }
}
