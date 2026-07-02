import { describe, it, expect } from 'vitest'
import { sanitizeNumericValues } from '../sanitize'

describe('sanitizeNumericValues', () => {
  it('converte NaN e Infinity para null', () => {
    expect(sanitizeNumericValues(NaN)).toBeNull()
    expect(sanitizeNumericValues(Infinity)).toBeNull()
    expect(sanitizeNumericValues(-Infinity)).toBeNull()
  })

  it('sanitiza métricas aninhadas do Task Switching', () => {
    const input = {
      customMetrics: {
        switchCostRT: NaN,
        mixingCostRT: 120,
        postErrorSlowing: Infinity,
      },
    }
    const out = sanitizeNumericValues(input)
    expect(out.customMetrics.switchCostRT).toBeNull()
    expect(out.customMetrics.mixingCostRT).toBe(120)
    expect(out.customMetrics.postErrorSlowing).toBeNull()
  })
})