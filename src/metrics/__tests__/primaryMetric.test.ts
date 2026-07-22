import { describe, expect, it } from 'vitest'
import { TEST_MAP } from '../../tests/registry'
import type { SessionResult, TestId } from '../../types'
import { resolvePrimaryMetricValue } from '../primaryMetric'

function resultWithMetrics(
  customMetrics: SessionResult['customMetrics'],
  medianCorrectRT: number | null = 500
): Pick<SessionResult, 'rtMetrics' | 'customMetrics'> {
  return {
    rtMetrics: {
      medianCorrectRT,
      meanCorrectRT: medianCorrectRT,
      rtStandardDeviation: null,
      rtIQR: null,
      rtCoefficientOfVariation: null,
      p10RT: null,
      p90RT: null,
      anticipationRate: 0,
      lapseRate: 0,
      validTrialCount: 0,
      invalidTrialCount: 0,
    },
    customMetrics,
  }
}

function resolve(
  testId: TestId,
  customMetrics: SessionResult['customMetrics'],
  medianCorrectRT: number | null = 500
) {
  return resolvePrimaryMetricValue(
    TEST_MAP[testId],
    resultWithMetrics(customMetrics, medianCorrectRT)
  )
}

describe('resolvePrimaryMetricValue', () => {
  it('não substitui stroopCostRT nulo pelo RT mediano', () => {
    expect(resolve('stroop', { stroopCostRT: null }, 500)).toBeNull()
  })

  it('não substitui switchCostRT nulo pelo RT geral', () => {
    expect(resolve('taskswitch', { switchCostRT: null }, 500)).toBeNull()
  })

  it('preserva métrica customizada igual a zero', () => {
    expect(resolve('stroop', { stroopCostRT: 0 })).toBe(0)
  })

  it('preserva métrica customizada negativa', () => {
    expect(resolve('taskswitch', { switchCostRT: -25 })).toBe(-25)
  })

  it('preserva métrica customizada positiva', () => {
    expect(resolve('gonogo', { dPrime: 1.75 })).toBe(1.75)
  })

  it('retorna nulo quando a chave customizada está ausente', () => {
    expect(resolve('stroop', {})).toBeNull()
  })

  it('retorna nulo para valor customizado null', () => {
    expect(resolve('stroop', { stroopCostRT: null })).toBeNull()
  })

  it('retorna nulo para valor customizado undefined', () => {
    expect(resolve('stroop', { stroopCostRT: undefined as unknown as null })).toBeNull()
  })

  it('retorna nulo para valor customizado NaN', () => {
    expect(resolve('stroop', { stroopCostRT: Number.NaN })).toBeNull()
  })

  it('retorna nulo para valor customizado Infinity', () => {
    expect(resolve('stroop', { stroopCostRT: Number.POSITIVE_INFINITY })).toBeNull()
  })

  it('usa o RT válido do Simple RT', () => {
    expect(resolve('simple_rt', { medianCorrectRT: 999 }, 310)).toBe(310)
  })

  it('usa o RT válido do Choice RT', () => {
    expect(resolve('choice_rt', {}, 420)).toBe(420)
  })

  it('resolve a primária normal do Go/No-Go', () => {
    expect(resolve('gonogo', { dPrime: 1.2 })).toBe(1.2)
  })

  it('resolve a primária normal do SART', () => {
    expect(resolve('sart', { commissionErrorRate: 0.08 })).toBe(0.08)
  })

  it('resolve a primária normal do n-back', () => {
    expect(resolve('nback', { dPrime2Back: 0.9 })).toBe(0.9)
  })

  it('resolve a primária normal do Corsi', () => {
    expect(resolve('corsi', { confirmedSpan: 5 })).toBe(5)
  })
})
