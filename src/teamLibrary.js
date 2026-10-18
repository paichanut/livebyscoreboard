// Saved teams (name, color, logo) so teams that play again can be picked with one tap.
// Kept in this browser's localStorage: the operator's own laptop/phone remembers them.
const KEY = 'rinkboard:teams'
const DEFAULT_NAMES = ['home', 'away']

export function listTeams() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(list) ? list.filter(t => t && t.name) : []
  } catch { return [] }
}

function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true } catch { return false }
}

// Adds or updates by name (case-insensitive). An empty logo keeps the one already saved.
export function saveTeam({ name, color, logo }) {
  const n = String(name || '').trim()
  if (!n || DEFAULT_NAMES.includes(n.toLowerCase())) return false
  const id = n.toLowerCase()
  const list = listTeams()
  const old = list.find(t => t.id === id)
  const entry = { id, name: n, color: color || old?.color || '#888888', logo: logo || old?.logo || '', usedAt: Date.now() }
  return write([entry, ...list.filter(t => t.id !== id)].slice(0, 60))
}

export function removeTeam(id) {
  return write(listTeams().filter(t => t.id !== id))
}
