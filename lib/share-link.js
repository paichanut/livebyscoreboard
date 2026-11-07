// Pure helper shared by the locked operator screen (src/Control.jsx) and its tests.
// A pasted share link (…/c/CODE?k=KEY) or just the key
export function keyFromShareLink(text, gameId) {
  const t = String(text || '').trim()
  if (!t) return ''
  try {
    const u = new URL(t, 'https://x.invalid')
    const k = u.searchParams.get('k')
    if (k) {
      const m = u.pathname.match(/^\/c\/([^/]+)/)
      if (m && gameId && decodeURIComponent(m[1]).toLowerCase() !== gameId) return ''
      return k.trim()
    }
  } catch {}
  return /^[A-Za-z0-9_-]{4,128}$/.test(t) ? t : ''
}
