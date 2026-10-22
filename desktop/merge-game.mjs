// Three-way merge: disjoint fields/events combine; concurrent edits to one field fail visibly.
export function sameGameValue(a, b) {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, i) => sameGameValue(value, b[i]))
    )
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const ak = Object.keys(a).filter((k) => a[k] !== undefined),
    bk = Object.keys(b).filter((k) => b[k] !== undefined)
  return (
    ak.length === bk.length &&
    ak.every((k) => Object.hasOwn(b, k) && sameGameValue(a[k], b[k]))
  )
}
const same = sameGameValue
const object = (x) => x && typeof x === 'object' && !Array.isArray(x)
const identified = (a) =>
  Array.isArray(a) && a.every((x) => object(x) && typeof x.id === 'string')
export function mergeGame(base, local, current) {
  const conflicts = []
  function visit(b, l, c, path) {
    const counter = /^(rinkB\.)?(home|away)\.(score|shots|offsides)$/.exec(path)
    if (
      counter &&
      [b, l, c].every((value) => value == null || Number.isFinite(value))
    ) {
      b ??= 0
      l ??= 0
      c ??= 0
    }
    if (same(l, b)) return c
    if (same(c, b)) return l
    if (counter && [b, l, c].every(Number.isFinite)) {
      const scope = (x) => (counter[1] ? x?.rinkB : x)
      const type = { score: 'goal', shots: 'shot', offsides: 'offside' }[
        counter[3]
      ]
      const ids = (x) =>
        new Set(
          (scope(x)?.events || [])
            .filter((e) => e.type === type && e.team === counter[2])
            .map((e) => e.id)
        )
      const bi = ids(base),
        li = ids(local),
        ci = ids(current)
      const added = (x) => [...x].filter((id) => !bi.has(id)),
        removed = (x) => [...bi].filter((id) => !x.has(id))
      const la = added(li),
        lr = removed(li),
        ca = added(ci),
        cr = removed(ci)
      if (l - b === la.length - lr.length && c - b === ca.length - cr.length)
        return Math.max(
          0,
          l +
            c -
            b -
            la.filter((id) => ca.includes(id)).length +
            lr.filter((id) => cr.includes(id)).length
        )
      conflicts.push(path)
      return c
    }
    if (/^(rinkB\.)?(goalFlash|offside|penaltyCall)$/.test(path))
      return !l ? c : !c ? l : (l.at || 0) >= (c.at || 0) ? l : c
    if (/^(horn|buzzer)$/.test(path) && [l, c].every(Number.isFinite))
      return Math.max(l, c)
    if (same(c, l) && !object(l)) return l
    if (object(l) && object(c) && (b == null || object(b))) {
      const out = {}
      for (const key of new Set([
        ...Object.keys(b || {}),
        ...Object.keys(l),
        ...Object.keys(c),
      ])) {
        if (!path && key === 'updatedAt') {
          out[key] = Math.max(l[key] || 0, c[key] || 0) + 1
          continue
        }
        const value = visit(
          b?.[key],
          l[key],
          c[key],
          path ? path + '.' + key : key
        )
        if (value !== undefined) out[key] = value
      }
      return out
    }
    if (identified(l) && identified(c) && (b == null || identified(b))) {
      const bm = new Map((b || []).map((x) => [x.id, x])),
        lm = new Map(l.map((x) => [x.id, x])),
        cm = new Map(c.map((x) => [x.id, x]))
      const out = []
      for (const id of new Set([...cm.keys(), ...lm.keys(), ...bm.keys()])) {
        const value = visit(
          bm.get(id),
          lm.get(id),
          cm.get(id),
          `${path}[${id}]`
        )
        if (value !== undefined) out.push(value)
      }
      return out
    }
    conflicts.push(path)
    return c
  }
  let state = visit(base, local, current, '')
  // Equal totals can hide different event IDs (one operator removed an entry and
  // added another). Reconcile counters from the merged ledger, retaining any
  // pre-existing offset between a saved total and its historical event count.
  for (const scope of ['', 'rinkB']) {
    const b = scope ? base?.[scope] : base,
      l = scope ? local?.[scope] : local,
      c = scope ? current?.[scope] : current
    if (![b, l, c].every((x) => Array.isArray(x?.events))) continue
    for (const team of ['home', 'away'])
      for (const [field, type] of [
        ['score', 'goal'],
        ['shots', 'shot'],
        ['offsides', 'offside'],
      ]) {
        const values = [
          b[team]?.[field],
          l[team]?.[field],
          c[team]?.[field],
        ].map((value) => value ?? 0)
        if (!values.every(Number.isFinite)) continue
        const count = (x) =>
          new Set(
            (x?.events || [])
              .filter((e) => e.type === type && e.team === team)
              .map((e) => e.id)
          ).size
        const bc = count(b)
        if (
          values[1] - values[0] !== count(l) - bc ||
          values[2] - values[0] !== count(c) - bc
        )
          continue
        const output = scope ? state?.[scope] : state
        if (!output?.[team]) continue
        const expected = Math.max(0, values[0] + count(output) - bc)
        if (output[team][field] === expected) continue
        const fixed = {
          ...output,
          [team]: { ...output[team], [field]: expected },
        }
        state = scope ? { ...state, [scope]: fixed } : fixed
      }
  }
  return { state, conflicts }
}
