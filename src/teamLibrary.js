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

// Change name / color / logo of a saved team. A new name that matches another team replaces it.
export function updateTeam(id, patch) {
  const list = listTeams()
  const old = list.find(t => t.id === id)
  if (!old) return false
  const name = patch.name != null ? String(patch.name).trim() : old.name
  if (!name || DEFAULT_NAMES.includes(name.toLowerCase())) return false
  const entry = { ...old, ...patch, name, id: name.toLowerCase() }
  return write(list.map(t => (t.id === id ? entry : t)).filter((t, i, a) => t === entry || t.id !== entry.id))
}

// "zeus_logo-2026.png" → "Zeus Logo 2026"
export function nameFromFile(filename) {
  return String(filename || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\b\w/g, c => c.toUpperCase()).slice(0, 40)
}

export function removeTeam(id) {
  return write(listTeams().filter(t => t.id !== id))
}
