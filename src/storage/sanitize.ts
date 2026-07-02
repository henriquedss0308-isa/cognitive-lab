import type { SessionRecord } from '../types'

/**
 * Substitui NaN e Infinity por null para garantir serialização IndexedDB segura.
 */
export function sanitizeNumericValues<T>(value: T): T {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null as T
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeNumericValues(item)) as T
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      out[key] = sanitizeNumericValues(entry)
    }
    return out as T
  }
  return value
}

export function prepareSessionForStorage(session: SessionRecord): SessionRecord {
  return sanitizeNumericValues(session)
}