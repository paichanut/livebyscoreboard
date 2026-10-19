// GET /api/teams — the shared team library, read-only, for the offline desktop app (which has no
// Supabase keys built in). Same rows as team_list(null): name, color, logo, masked uploader.
export default async function handler(req, res) {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (!url || !key) return res.status(503).json({ error: 'not configured' })
  try {
    const r = await fetch(`${url}/rest/v1/rpc/team_list`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: null }),
    })
    if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` })
    const rows = await r.json()
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    res.status(200).json(rows.map(({ id, name, color, logo, uploader, updated_at }) => ({ id, name, color, logo, uploader, updated_at })))
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) })
  }
}
