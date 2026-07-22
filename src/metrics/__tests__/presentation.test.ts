import { describe, expect, it } from 'vitest'
import { ALL_TESTS } from '../../tests/registry'
import {
  formatMetricDelta,
  formatMetricValue,
  getMetricPresentation,
  isKnownMetric,
  presentMetricValue,
  sessionMedianPresentationKey,
} from '../presentation'

describe('registry explícito de apresentação', () => {
  it('formata d-prime e critério como adimensionais com duas casas', () => {
    expect(formatMetricValue('dPrime', 2.4)).toBe('2,40')
    expect(formatMetricValue('dPrime', 2.49)).toBe('2,49')
    expect(formatMetricValue('criterion', 0.42)).toBe('0,42')
  })

  it('transforma proporções em porcentagem sem alterar o valor de entrada', () => {
    const value = 0.11
    expect(formatMetricValue('commissionErrorRate', value)).toBe('11,0%')
    expect(value).toBe(0.11)
    expect(formatMetricValue('commissionErrorRate', 0)).toBe('0,0%')
    expect(formatMetricValue('accuracy', 0.875)).toBe('87,5%')
  })

  it('usa pontos percentuais para diferenças de precisão e preserva o sinal', () => {
    expect(formatMetricValue('stroopCostAccuracy', 0.08)).toBe('8,0 pp')
    expect(formatMetricValue('stroopCostAccuracy', -0.08)).toBe('−8,0 pp')
    expect(formatMetricDelta('accuracy', -0.08)).toBe('−8,0 pp')
  })

  it('distingue tempo, span e contagem', () => {
    expect(formatMetricValue('medianCorrectRT', 423.7)).toBe('423,7 ms')
    expect(formatMetricValue('switchCostRT', -37.4)).toBe('−37,4 ms')
    expect(formatMetricValue('confirmedSpan', 5)).toBe('5')
    expect(formatMetricValue('commissionErrors', 7)).toBe('7')
  })

  it('não transforma ausência em zero', () => {
    expect(formatMetricValue('dPrime', null)).toBe('Indisponível')
    expect(formatMetricValue('dPrime', undefined)).toBe('Indisponível')
    expect(formatMetricValue('dPrime', Number.NaN)).toBe('Indisponível')
    expect(formatMetricValue('accuracy', 0)).toBe('0,0%')
  })

  it('mantém valor negativo, zero e valor muito grande legíveis', () => {
    expect(formatMetricValue('criterion', -0.42)).toBe('−0,42')
    expect(formatMetricValue('criterion', 0)).toBe('0,00')
    expect(formatMetricValue('criterion', 1_234_567.891)).toBe('1.234.567,89')
  })

  it('usa fallback neutro e documentado para métrica desconhecida', () => {
    expect(isKnownMetric('unknownMetric')).toBe(false)
    expect(getMetricPresentation('unknownMetric').unit).toBe('dimensionless')
    expect(formatMetricValue('unknownMetric', 12.345)).toBe('12,35')
    expect(formatMetricValue('unknownRTCost', 12.345)).toBe('12,35')
    expect(formatMetricValue('unknownMetric', null)).toBe('Indisponível')
  })

  it('expõe número e unidade separadamente para componentes visuais', () => {
    expect(presentMetricValue('commissionErrorRate', 0.11)).toEqual({
      valueText: '11,0',
      unitText: '%',
      text: '11,0%',
      unavailable: false,
    })
  })

  it('dá semântica própria ao tempo de reprodução do Corsi', () => {
    expect(sessionMedianPresentationKey('corsi')).toBe('corsiReproductionTime')
    expect(sessionMedianPresentationKey('gonogo')).toBe('medianCorrectRT')
    expect(getMetricPresentation('corsiReproductionTime').label).toBe('Tempo mediano de reprodução')
  })

  it('cobre explicitamente métricas declaradas por todos os testes', () => {
    for (const test of ALL_TESTS) {
      expect(isKnownMetric(test.primaryMetricKey), `${test.id}: primária ${test.primaryMetricKey}`).toBe(true)
      for (const key of Object.keys(test.metricLabels)) {
        expect(isKnownMetric(key), `${test.id}: ${key}`).toBe(true)
      }
    }
  })
})
