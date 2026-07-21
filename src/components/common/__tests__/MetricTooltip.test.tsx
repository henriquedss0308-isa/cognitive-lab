import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { getTest } from '../../../tests/registry'
import type { TestId } from '../../../types'
import { MetricCard } from '../MetricTooltip'

function renderCard(metric: string, value?: number | null, label?: string) {
  return render(<MetricCard metric={metric} value={value} label={label} />)
}

describe('MetricCard — apresentação semântica no DOM', () => {
  it.each([
    ['dPrime', 2.4, '2,40'],
    ['dPrime', 2.49, '2,49'],
    ['criterion', 0.42, '0,42'],
    ['commissionErrorRate', 0.11, '11,0%'],
    ['commissionErrorRate', 0, '0,0%'],
    ['confirmedSpan', 5, '5'],
    ['medianCorrectRT', 423.7, '423,7 ms'],
    ['switchCostRT', -37.4, '−37,4 ms'],
    ['stroopCostAccuracy', 0.08, '8,0 pp'],
    ['stroopCostAccuracy', -0.08, '−8,0 pp'],
    ['accuracy', 0.875, '87,5%'],
    ['commissionErrors', 7, '7'],
    ['criterion', 0, '0,00'],
    ['criterion', -0.42, '−0,42'],
    ['criterion', 1_234_567.891, '1.234.567,89'],
    ['unknownMetric', 12.345, '12,35'],
  ] as const)('%s = %s → %s', (metric, value, expected) => {
    renderCard(metric, value)
    expect(screen.getByLabelText(expected)).toBeInTheDocument()
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
  ] as const)('exibe ausência %s como Indisponível, sem unidade', (_name, value) => {
    const { container } = renderCard('medianCorrectRT', value)
    expect(screen.getByText('Indisponível')).toBeInTheDocument()
    expect(container).not.toHaveTextContent('ms')
  })

  it('usa fallback neutro no DOM para métrica desconhecida com nome enganoso', () => {
    const { container } = renderCard('unknownRTCost', 12.345, 'Desconhecida')
    expect(screen.getByLabelText('12,35')).toBeInTheDocument()
    expect(container).not.toHaveTextContent('ms')
    expect(container).not.toHaveTextContent('%')
  })

  it('dá rótulo específico ao tempo de reprodução do Corsi', () => {
    renderCard('corsiReproductionTime', 1_234.5)
    expect(screen.getByText('Tempo mediano de reprodução')).toBeInTheDocument()
    expect(screen.getByLabelText('1.234,5 ms')).toBeInTheDocument()
  })

  it.each([
    ['gonogo', 2.4, '2,40'],
    ['sart', 0.11, '11,0%'],
    ['nback', 2.49, '2,49'],
    ['corsi', 5, '5'],
    ['stroop', -31.2, '−31,2 ms'],
    ['taskswitch', -42.3, '−42,3 ms'],
  ] as const)(
    'renderiza a primária de %s pela definição explícita',
    (testId, value, expected) => {
      const test = getTest(testId as TestId)
      renderCard(test.primaryMetricKey, value, test.metricLabels[test.primaryMetricKey])
      expect(screen.getByLabelText(expected)).toBeInTheDocument()
    }
  )

  it('não associa ms a d-prime, span, proporção ou custo de precisão', () => {
    const { container } = render(
      <div>
        <MetricCard metric="dPrime" value={2.4} />
        <MetricCard metric="confirmedSpan" value={5} />
        <MetricCard metric="commissionErrorRate" value={0.11} />
        <MetricCard metric="stroopCostAccuracy" value={-0.08} />
      </div>
    )

    expect(container).not.toHaveTextContent('ms')
    expect(container).toHaveTextContent('2,40')
    expect(container).toHaveTextContent('5')
    expect(container).toHaveTextContent('11,0%')
    expect(container).toHaveTextContent('−8,0pp')
  })
})
