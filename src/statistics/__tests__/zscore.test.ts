import { describe, it, expect } from 'vitest'
import { evaluatePrimaryZ } from '../zscore'
import { ALL_TESTS, TEST_MAP } from '../../tests/registry'
import type { BaselineStats } from '../../types'
import type { CognitiveTestDefinition } from '../../tests/types'

function baselineFor(
  test: CognitiveTestDefinition,
  metric: { median: number | null; mad: number | null; n: number },
  phase: BaselineStats['phase'] = 'monitoring'
): BaselineStats {
  return {
    testId: test.id,
    protocolVersion: test.protocolVersion,
    phase,
    sessionCount: 12,
    familiarizationCount: 3,
    baselineCount: 8,
    warningCount: 0,
    metrics: { [test.primaryMetricKey]: metric },
  }
}

describe('metricDirections — cobertura obrigatória', () => {
  it('toda métrica primária e de baseline tem direção explícita ±1', () => {
    for (const test of ALL_TESTS) {
      const keys = [test.primaryMetricKey, ...test.baselineMetricKeys]
      for (const key of keys) {
        const dir = test.metricDirections[key]
        expect([1, -1], `${test.id}.${key} sem direção`).toContain(dir)
      }
    }
  })

  it('direções semânticas corretas nos casos que a heurística antiga invertia', () => {
    expect(TEST_MAP.gonogo.metricDirections.dPrime).toBe(1)
    expect(TEST_MAP.nback.metricDirections.dPrime2Back).toBe(1)
    expect(TEST_MAP.corsi.metricDirections.confirmedSpan).toBe(1)
    expect(TEST_MAP.sart.metricDirections.commissionErrorRate).toBe(-1)
    expect(TEST_MAP.simple_rt.metricDirections.medianCorrectRT).toBe(-1)
    expect(TEST_MAP.stroop.metricDirections.stroopCostRT).toBe(-1)
    expect(TEST_MAP.taskswitch.metricDirections.switchCostRT).toBe(-1)
  })
})

describe('evaluatePrimaryZ', () => {
  const gonogo = TEST_MAP.gonogo

  it('d′ acima da mediana produz z POSITIVO (melhora)', () => {
    const out = evaluatePrimaryZ(3.0, baselineFor(gonogo, { median: 2.0, mad: 0.3, n: 8 }), gonogo)
    expect(out.kind).toBe('ok')
    if (out.kind === 'ok') expect(out.z).toBeGreaterThan(0)
  })

  it('RT abaixo da mediana produz z POSITIVO (melhora)', () => {
    const simple = TEST_MAP.simple_rt
    const out = evaluatePrimaryZ(280, baselineFor(simple, { median: 320, mad: 20, n: 8 }), simple)
    expect(out.kind).toBe('ok')
    if (out.kind === 'ok') expect(out.z).toBeGreaterThan(0)
  })

  it('valor nulo NUNCA vira z de 0 — retorna value_missing', () => {
    const out = evaluatePrimaryZ(null, baselineFor(gonogo, { median: 2.0, mad: 0.3, n: 8 }), gonogo)
    expect(out.kind).toBe('value_missing')
  })

  it('NaN é tratado como ausente', () => {
    const out = evaluatePrimaryZ(NaN, baselineFor(gonogo, { median: 2.0, mad: 0.3, n: 8 }), gonogo)
    expect(out.kind).toBe('value_missing')
  })

  it('fora de monitoring não há z', () => {
    const out = evaluatePrimaryZ(
      3.0,
      baselineFor(gonogo, { median: 2.0, mad: 0.3, n: 5 }, 'baseline_building'),
      gonogo
    )
    expect(out.kind).toBe('not_monitoring')
  })

  it('MAD zero vira zero_mad com delta bruto, nunca divisão degenerada', () => {
    const corsi = TEST_MAP.corsi
    const out = evaluatePrimaryZ(6, baselineFor(corsi, { median: 5, mad: 0, n: 8 }), corsi)
    expect(out.kind).toBe('zero_mad')
    if (out.kind === 'zero_mad') {
      expect(out.median).toBe(5)
      expect(out.delta).toBe(1)
    }
  })

  it('métrica ausente do baseline retorna no_baseline_metric', () => {
    const base = baselineFor(gonogo, { median: 2, mad: 0.3, n: 8 })
    base.metrics = {}
    expect(evaluatePrimaryZ(3.0, base, gonogo).kind).toBe('no_baseline_metric')
  })

  it('n abaixo do mínimo suprime o z com motivo (spec §3.2)', () => {
    const out = evaluatePrimaryZ(3.0, baselineFor(gonogo, { median: 2.0, mad: 0.3, n: 5 }), gonogo)
    expect(out.kind).toBe('insufficient_n')
    if (out.kind === 'insufficient_n') expect(out.n).toBe(5)
  })

  it('n exatamente no mínimo ainda produz z', () => {
    const out = evaluatePrimaryZ(3.0, baselineFor(gonogo, { median: 2.0, mad: 0.3, n: 6 }), gonogo)
    expect(out.kind).toBe('ok')
  })
})
