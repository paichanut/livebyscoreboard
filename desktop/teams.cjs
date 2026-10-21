// Downloaded shared teams are independent of the operator's own teams and current game.
// Keep the complete library on disk, including image bytes, across restarts and updates.
const fs = require('node:fs/promises')
const path = require('node:path')

const LIBRARY_URL = 'https://livebyscoreboard.vercel.app/api/teams'
const REFRESH_MS = 60_000
const MAX_LOGO_BYTES = 8 * 1024 * 1024

function createTeamCache({ directory, fetch, onUpdate = () => {} }) {
  const filename = path.join(directory, 'downloaded-teams.json')
  let records = []
  let hasCache = false
  let loading
  let pending
  let lastAttempt = -Infinity
  const teams = () => records.map(record => ({ ...record.team, can_edit: false, mine: false }))

  function load() {
    if (!loading) loading = (async () => {
      try {
        const data = JSON.parse(await fs.readFile(filename, 'utf8'))
        if (data.version === 1 && Array.isArray(data.records) && data.records.every(r => r?.team?.name && r.team.id != null)) {
          records = data.records
          hasCache = true
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    })()
    return loading
  }

  async function downloadLogo(source) {
    if (!source || source.startsWith('data:image/')) return source
    const url = new URL(source)
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported logo address.')
    const response = await fetch(source, { credentials: 'omit', cache: 'no-cache', signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error('Could not download a team logo.')
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!type.startsWith('image/')) throw new Error('Team logo is not an image.')
    if (Number(response.headers.get('content-length')) > MAX_LOGO_BYTES) throw new Error('Team logo is too large.')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > MAX_LOGO_BYTES) throw new Error('Team logo is too large.')
    return `data:${type};base64,${bytes.toString('base64')}`
  }

  async function update() {
    await load()
    const response = await fetch(LIBRARY_URL, { credentials: 'omit', cache: 'no-cache', signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error('Could not refresh the downloaded team library.')
    const rows = await response.json()
    if (!Array.isArray(rows) || !rows.every(t => t && t.id != null && typeof t.name === 'string' && t.name.trim() && (t.logo == null || typeof t.logo === 'string'))) {
      throw new Error('Invalid team library response.')
    }
    // Merge by server ID: a rename updates its entry; previously downloaded teams stay available.
    const next = new Map(records.map(record => [String(record.team.id), record]))
    for (const row of rows) {
      const previous = next.get(String(row.id))
      const sourceLogo = row.logo || ''
      const version = row.updated_at || ''
      let logo = previous?.team.logo || ''
      let downloaded = true
      if (sourceLogo !== previous?.sourceLogo || version !== previous?.version) {
        try { logo = await downloadLogo(sourceLogo) }
        catch { downloaded = false } // Keep the old image and retry the changed image next time.
      }
      next.set(String(row.id), {
        team: { id: row.id, name: row.name.trim(), color: row.color || '#888888', logo, uploader: row.uploader || '', updated_at: row.updated_at },
        sourceLogo: downloaded ? sourceLogo : previous?.sourceLogo,
        version: downloaded ? version : previous?.version,
      })
    }
    const updated = [...next.values()].sort((a, b) => a.team.name.localeCompare(b.team.name))
    if (!hasCache || JSON.stringify(updated) !== JSON.stringify(records)) {
      await fs.mkdir(directory, { recursive: true })
      await fs.writeFile(filename + '.tmp', JSON.stringify({ version: 1, records: updated }), 'utf8')
      await fs.rename(filename + '.tmp', filename)
      records = updated
      hasCache = true
      onUpdate(teams())
    }
    return teams()
  }

  function refresh() {
    if (!pending) {
      lastAttempt = Date.now()
      pending = update().finally(() => { pending = null })
    }
    return pending
  }

  async function list() {
    await load()
    if (!hasCache) return refresh()
    // Never make offline startup or picking a team wait for the network.
    if (Date.now() - lastAttempt >= REFRESH_MS) refresh().catch(() => {})
    return teams()
  }

  return { list, refresh }
}

module.exports = { createTeamCache }
