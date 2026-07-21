/**
 * AC-12 — Renderização REAL do MetricCard e da lógica de unidade de Results.
 *
 * O GPT-5.6 e a auditoria anterior argumentaram por leitura de substring.
 * Aqui o componente é montado com @testing-library/react e o TEXTO EXIBIDO é
 * lido do DOM. As expressões de `unit` são as MESMAS de Results.tsx:237
 * (cartão principal) e :298 (cartões secundários), reproduzidas como fixtures
 * de comportamento.
 *
 * Nota de leitura: valor e unidade ficam em <span> irmãos com `gap-1` (CSS), de
 * modo que `textContent` devolve "2ms" enquanto a TELA mostra "2 ms". As
 * asserções usam o textContent real; o espaço é apresentação.
 */
import { describe, expect, it } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MetricCard } from '../../src/components/common/MetricTooltip'
import { formatTrendValue } from '../../src/components/charts/chartSelectors'
import { ALL_TESTS } from '../../src/tests/registry'

/** Regra de unidade do CARTÃO PRINCIPAL — Results.tsx:237. */
function primaryUnit(metricKey: string): string {
  return metricKey.includes('accuracy') || metricKey.includes('span') ? '' : ' ms'
}

/** Regra de unidade dos CARTÕES SECUNDÁRIOS — Results.tsx:298. */
function secondaryUnit(key: string): string {
  return key.includes('Rate') || key.includes('accuracy')
    ? ''
    : key.includes('Cost') || key.includes('RT')
      ? ' ms'
      : ''
}

function renderCard(metric: string, value: number | null, unit: string): string {
  cleanup()
  const { container } = render(
    <MetricCard metric={metric} label="X" value={value} unit={unit} />
  )
  return container.querySelector('.mt-2')!.textContent!.trim()
}

describe('AC-12 — cartão PRINCIPAL: unidade falsa e casas decimais', () => {
  it("d' 2.4 (Go/No-Go) renderiza \"2ms\" — unidade inventada e resolução perdida", () => {
    expect(renderCard('dPrime', 2.4, primaryUnit('dPrime'))).toBe('2ms')
  })

  it("d' 2.6 → \"3ms\": 2.4 e 2.6 caem em cartões diferentes; 2.4 e 2.49 no mesmo", () => {
    expect(renderCard('dPrime', 2.6, primaryUnit('dPrime'))).toBe('3ms')
    expect(renderCard('dPrime', 2.49, primaryUnit('dPrime'))).toBe('2ms')
  })

  it("d'2-back (n-back) 1.87 → \"2ms\"", () => {
    expect(renderCard('dPrime2Back', 1.87, primaryUnit('dPrime2Back'))).toBe('2ms')
  })

  it('commissionErrorRate 0.11 (SART) → "0.11ms": proporção não vira %, e ganha ms', () => {
    expect(renderCard('commissionErrorRate', 0.11, primaryUnit('commissionErrorRate')))
      .toBe('0.11ms')
  })

  it('NOVO — confirmedSpan (Corsi) TAMBÉM recebe "ms": o guard `includes("span")` é case-sensitive', () => {
    // 'confirmedSpan'.includes('span') === false (a chave tem "Span").
    // A auditoria anterior (AC-12) e a revisão GPT-5.6 afirmaram que o Corsi
    // escapava da unidade falsa. Não escapa.
    expect('confirmedSpan'.includes('span')).toBe(false)
    expect(renderCard('confirmedSpan', 5, primaryUnit('confirmedSpan'))).toBe('5ms')
  })

  it('métricas realmente em ms permanecem corretas', () => {
    expect(renderCard('medianCorrectRT', 412.7, primaryUnit('medianCorrectRT'))).toBe('413ms')
    expect(renderCard('stroopCostRT', 88.4, primaryUnit('stroopCostRT'))).toBe('88ms')
    expect(renderCard('switchCostRT', 120.2, primaryUnit('switchCostRT'))).toBe('120ms')
  })

  it('ALCANCE: 4 dos 8 testes exibem unidade falsa na métrica principal', () => {
    const wrong = ALL_TESTS
      .filter((t) => {
        const k = t.primaryMetricKey
        const isTime = k.includes('RT') || k.includes('Cost')
        return primaryUnit(k) === ' ms' && !isTime
      })
      .map((t) => `${t.id}:${t.primaryMetricKey}`)
    expect(wrong.sort()).toEqual([
      'corsi:confirmedSpan', 'gonogo:dPrime', 'nback:dPrime2Back', 'sart:commissionErrorRate',
    ])
  })
})

describe('AC-12 — cartões SECUNDÁRIOS', () => {
  it('stroopCostAccuracy 0.043 → "0ms": proporção com unidade de tempo e 0 casas', () => {
    expect(renderCard('stroopCostAccuracy', 0.043, secondaryUnit('stroopCostAccuracy')))
      .toBe('0ms')
  })

  it('taxas ficam sem unidade, mas em escala 0–1 sob rótulo de porcentagem', () => {
    expect(renderCard('falseAlarmRate', 0.075, secondaryUnit('falseAlarmRate'))).toBe('0.07')
    expect(renderCard('hitRate', 0.925, secondaryUnit('hitRate'))).toBe('0.93')
  })

  it('criterion 0.42 (escala z) → "0": métrica secundária perde toda a informação', () => {
    expect(renderCard('criterion', 0.42, secondaryUnit('criterion'))).toBe('0')
  })

  it("d' secundário perde a unidade falsa, mantém 0 casas", () => {
    expect(renderCard('dPrime', 2.4, secondaryUnit('dPrime'))).toBe('2')
  })
})

describe('AC-12 — bordas: zero, null, negativo, extremo', () => {
  it('null exibe travessão e OMITE a unidade (comportamento correto)', () => {
    expect(renderCard('dPrime', null, ' ms')).toBe('—')
  })

  it('zero é exibido, não confundido com ausente', () => {
    expect(renderCard('dPrime', 0, primaryUnit('dPrime'))).toBe('0ms')
    expect(renderCard('commissionErrorRate', 0, primaryUnit('commissionErrorRate')))
      .toBe('0.00ms')
  })

  it('negativos preservam sinal; d′ negativo pequeno vira "-0ms"', () => {
    expect(renderCard('stroopCostRT', -12.6, primaryUnit('stroopCostRT'))).toBe('-13ms')
    expect(renderCard('dPrime', -0.4, primaryUnit('dPrime'))).toBe('-0ms')
  })

  it('extremos não quebram a formatação', () => {
    expect(renderCard('medianCorrectRT', 1999.99, primaryUnit('medianCorrectRT'))).toBe('2000ms')
    expect(renderCard('commissionErrorRate', 1, primaryUnit('commissionErrorRate'))).toBe('1.00ms')
  })
})

describe('AC-12 — o GRÁFICO usa outro formatador, este correto', () => {
  it('formatTrendValue converte taxas para % e não inventa ms', () => {
    expect(formatTrendValue('commissionErrorRate', 0.11)).toBe('11,0%')
    expect(formatTrendValue('accuracy', 0.925)).toBe('92,5%')
    expect(formatTrendValue('confirmedSpan', 5)).toBe('5')
    expect(formatTrendValue('medianCorrectRT', 412.7)).toBe('412,7 ms')
  })

  it("d' no gráfico tem 2 casas — cartão e gráfico DISCORDAM para a mesma sessão", () => {
    expect(formatTrendValue('dPrime', 2.4)).toBe('2,40')
    expect(renderCard('dPrime', 2.4, primaryUnit('dPrime'))).toBe('2ms')
  })
})

describe('AC-12 — o valor persistido e o z NÃO são afetados', () => {
  it('MetricCard só formata: mesmo número, dois textos', () => {
    const v = 2.4
    expect(renderCard('dPrime', v, ' ms')).toBe('2ms')
    expect(renderCard('dPrime', v, '')).toBe('2')
    expect(v).toBe(2.4)
  })
})
