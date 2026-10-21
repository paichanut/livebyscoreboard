// Public address parts; the immutable installation UUID stays separate from the machine name.
export const machineCode = value => String(value || '').trim().toLowerCase()
export const validMachineCode = code => /^[a-z0-9][a-z0-9-]{2,39}$/.test(code)
export const validMachineId = id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
export const validUsername = name => typeof name === 'string' && name.length > 0 && name.length <= 100 && !['.', '..'].includes(name) && !/[/\\\u0000-\u001f\u007f]/.test(name)

export function desktopAddress(pathname) {
  const parts = pathname.replace(/\/+$/, '').split('/').slice(1)
  const kind = parts[0]
  if (!['b', 'c', 'o'].includes(kind)) return null
  if (![2, 3].includes(parts.length)) return { invalid: true }
  try {
    const namespaced = parts.length === 3
    const username = namespaced ? machineCode(decodeURIComponent(parts[1])) : ''
    const code = machineCode(decodeURIComponent(parts[namespaced ? 2 : 1]))
    if (!code || namespaced && (!validUsername(username) || !validMachineCode(code))) return { invalid: true }
    return { kind, code, username, namespaced }
  } catch { return { invalid: true } }
}
