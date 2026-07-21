import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { cloneElement } from 'react'
import { ScatterTooltip, SessionTooltip } from '../SessionCharts'
import type { TrendPoint } from '../chartSelectors'

/**
 * O sessionId é identidade interna e não pode aparecer na interface.
 *
 * Ele vazou uma vez: o Recharts clona o elemento passado em `content` injetando
 * os próprios props, e um deles é `label` com o valor da categoria do eixo X —
 * que passou a ser o sessionId quando corrigimos a colisão de datas. Como o
 * tooltip tinha um prop chamado `label`, o injetado venceu e o UUID foi
 * renderizado no lugar do nome da métrica.
 */

const SESSION_ID = '270fb9a0-b47d-48e2-bb90-f0d9cb412cff'
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

const POINT: TrendPoint = {
  key: SESSION_ID,
  startedAt: '2026-07-21T15:42:05.000Z',
  shortLabel: '21/07/2026',
  fullLabel: '21/07/2026 às 12:42:05',
  value: 245.4000244140625,
}

/**
 * Reproduz como o Recharts renderiza `content`: clona o elemento injetando
 * `active`, `payload` e `label`. É o `label` que causou o vazamento, então ele
 * precisa estar presente aqui — sem isso o teste não testa nada.
 */
function renderAsRecharts(element: React.ReactElement, payloadEntry: unknown) {
  return render(
    cloneElement(element, {
      active: true,
      payload: [payloadEntry],
      label: SESSION_ID,
      coordinate: { x: 10, y: 10 },
    } as never)
  )
}

describe('SessionTooltip', () => {
  it('não exibe o sessionId, mesmo quando o Recharts o injeta como `label`', () => {
    const { container } = renderAsRecharts(
      <SessionTooltip metricKey="medianCorrectRT" metricLabel="TR mediano" />,
      { payload: POINT }
    )

    expect(container.textContent).not.toContain(SESSION_ID)
    expect(container.textContent).not.toMatch(UUID_PATTERN)
  })

  it('usa o nome legível da métrica e preserva unidade e formatação', () => {
    renderAsRecharts(
      <SessionTooltip metricKey="medianCorrectRT" metricLabel="TR mediano" />,
      { payload: POINT }
    )

    expect(screen.getByText(/TR mediano/)).toBeInTheDocument()
    expect(screen.getByText('245,4 ms')).toBeInTheDocument()
  })

  it('identifica a sessão por data e horário', () => {
    renderAsRecharts(
      <SessionTooltip metricKey="medianCorrectRT" metricLabel="TR mediano" />,
      { payload: POINT }
    )

    expect(screen.getByText('21/07/2026 às 12:42:05')).toBeInTheDocument()
  })

  it('não renderiza nada quando não está ativo', () => {
    const { container } = render(
      <SessionTooltip
        metricKey="medianCorrectRT"
        metricLabel="TR mediano"
        active={false}
        payload={[{ payload: POINT }]}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('formata proporções como porcentagem', () => {
    renderAsRecharts(<SessionTooltip metricKey="accuracy" metricLabel="Precisão" />, {
      payload: { ...POINT, value: 1 },
    })

    expect(screen.getByText('100,0%')).toBeInTheDocument()
  })

  it.each([
    ['dPrime', 2.4, '2,40'],
    ['commissionErrorRate', 0.11, '11,0%'],
    ['confirmedSpan', 5, '5'],
    ['stroopCostAccuracy', -0.08, '−8,0 pp'],
  ] as const)('mantém %s consistente com os cards', (metricKey, value, expected) => {
    renderAsRecharts(
      <SessionTooltip metricKey={metricKey} metricLabel="Métrica" />,
      { payload: { ...POINT, value } }
    )

    expect(screen.getByText(expected)).toBeInTheDocument()
  })
})

describe('ScatterTooltip', () => {
  const SCATTER_POINT = {
    key: SESSION_ID,
    fullLabel: '21/07/2026 às 12:42:05',
    speed: 245.4000244140625,
    accuracy: 0.975,
  }

  it('não exibe o sessionId', () => {
    const { container } = renderAsRecharts(<ScatterTooltip />, { payload: SCATTER_POINT })

    expect(container.textContent).not.toContain(SESSION_ID)
    expect(container.textContent).not.toMatch(UUID_PATTERN)
  })

  it('identifica a sessão por data e horário, com valores formatados', () => {
    renderAsRecharts(<ScatterTooltip />, { payload: SCATTER_POINT })

    expect(screen.getByText('21/07/2026 às 12:42:05')).toBeInTheDocument()
    expect(screen.getByText('245,4 ms')).toBeInTheDocument()
    expect(screen.getByText('97,5%')).toBeInTheDocument()
  })

  it('identifica o tempo de reprodução do Corsi pelo metadado explícito', () => {
    renderAsRecharts(<ScatterTooltip medianMetricKey="corsiReproductionTime" />, {
      payload: SCATTER_POINT,
    })

    expect(screen.getByText(/Tempo mediano de reprodução/)).toBeInTheDocument()
    expect(screen.getByText('245,4 ms')).toBeInTheDocument()
  })
})
