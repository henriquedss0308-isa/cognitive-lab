function canonicalize(value: unknown, seen: Set<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError('Cannot canonicalize a circular value.')
    seen.add(value)
    const result = value.map((entry) =>
      entry === undefined || typeof entry === 'function' || typeof entry === 'symbol'
        ? null
        : canonicalize(entry, seen)
    )
    seen.delete(value)
    return result
  }

  if (typeof value === 'object') {
    if (seen.has(value)) throw new TypeError('Cannot canonicalize a circular value.')
    seen.add(value)
    const source = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort()) {
      const entry = source[key]
      if (entry === undefined || typeof entry === 'function' || typeof entry === 'symbol') continue
      result[key] = canonicalize(entry, seen)
    }
    seen.delete(value)
    return result
  }

  if (typeof value === 'bigint') throw new TypeError('Cannot canonicalize bigint values.')
  return null
}

/** Serialização JSON determinística: chaves de objetos em ordem lexical. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value, new Set()))
}

