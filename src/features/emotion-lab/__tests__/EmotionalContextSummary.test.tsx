import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EmotionalContextSummary } from '../components/EmotionalContextSummary'
import type { EmotionalContext } from '../types'

afterEach(() => {
  cleanup()
})

const FULL: EmotionalContext = {
  version: 1,
  primaryEmotion: { emotionId: 'anxious', intensity: 4 },
  secondaryEmotion: { emotionId: 'hopeful', intensity: 2 },
  relationshipPerception: { rating: 70, confidence: 3 },
}

function bodyText() {
  return document.body.textContent ?? ''
}

describe('exibição do estado emocional', () => {
  it('mostra emoção, intensidade e descrição do quadrante', () => {
    render(<EmotionalContextSummary context={FULL} />)

    expect(screen.getByText('Estado emocional')).toBeInTheDocument()
    expect(screen.getByText('Ansioso')).toBeInTheDocument()
    expect(bodyText()).toContain('intensidade 4/5')
    expect(screen.getByText('Vermelho · Energia alta e desagradável')).toBeInTheDocument()
  })

  it('mostra a emoção secundária identificada como tal', () => {
    render(<EmotionalContextSummary context={FULL} />)

    expect(bodyText()).toContain('Emoção secundária:')
    expect(screen.getByText('Esperançoso')).toBeInTheDocument()
    expect(bodyText()).toContain('intensidade 2/5')
  })

  it('não exibe seção de emoção quando só há percepção da relação', () => {
    render(
      <EmotionalContextSummary
        context={{ version: 1, relationshipPerception: { rating: 40 } }}
      />
    )

    expect(screen.queryByText('Estado emocional')).toBeNull()
    expect(screen.getByText('Percepção da relação')).toBeInTheDocument()
  })

  it('descreve o estado "não consigo identificar" sem julgamento', () => {
    render(<EmotionalContextSummary context={{ version: 1, unidentifiedEmotion: true }} />)

    expect(bodyText()).toContain('não conseguia identificar como estava se sentindo')
  })

  it('a cor nunca aparece sozinha — sempre acompanhada de nome e descrição', () => {
    render(<EmotionalContextSummary context={FULL} />)

    // O ponto colorido é decorativo e escondido de leitores de tela.
    const swatches = document.querySelectorAll('[aria-hidden="true"]')
    expect(swatches.length).toBeGreaterThan(0)
    expect(bodyText()).toContain('Vermelho')
    expect(bodyText()).toContain('Energia alta e desagradável')
  })
})

describe('exibição da percepção da relação', () => {
  it('usa linguagem descritiva ancorada em quem relatou', () => {
    render(<EmotionalContextSummary context={FULL} />)

    expect(bodyText()).toContain('Você registrou sua percepção como:')
    expect(screen.getByText('Ok–Boa')).toBeInTheDocument()
  })

  it('mostra a confiança como descrição, não como correção', () => {
    render(<EmotionalContextSummary context={FULL} />)
    expect(bodyText()).toContain('Confiança nessa percepção: Médio')
  })

  it('omite a confiança quando não foi registrada', () => {
    render(
      <EmotionalContextSummary context={{ version: 1, relationshipPerception: { rating: 70 } }} />
    )

    expect(bodyText()).toContain('Você registrou sua percepção como:')
    expect(bodyText()).not.toContain('Confiança nessa percepção')
  })

  it('personaliza o título quando há rótulo configurado', () => {
    render(<EmotionalContextSummary context={FULL} relationshipLabel="Fulano" />)
    expect(screen.getByText('Percepção da relação com Fulano')).toBeInTheDocument()
  })

  it('mantém título genérico sem rótulo', () => {
    render(<EmotionalContextSummary context={FULL} />)
    expect(screen.getByText('Percepção da relação')).toBeInTheDocument()
  })
})

describe('linguagem proibida', () => {
  it('NUNCA afirma objetivamente como a relação está', () => {
    render(<EmotionalContextSummary context={FULL} relationshipLabel="Fulano" />)
    const text = bodyText()

    expect(text).not.toMatch(/[Ss]ua relação está/)
    expect(text).not.toMatch(/[Aa] relação está/)
    expect(text).not.toMatch(/relação com Fulano está/)
  })

  it('não sugere tendência, previsão ou risco', () => {
    render(<EmotionalContextSummary context={FULL} />)
    const text = bodyText().toLowerCase()

    for (const forbidden of [
      'piorando',
      'melhorando',
      'tendência',
      'risco',
      'alerta',
      'conflito',
      'término',
      'provável',
    ]) {
      expect(text).not.toContain(forbidden)
    }
  })

  it('não relaciona emoção com desempenho nem emite diagnóstico', () => {
    render(<EmotionalContextSummary context={FULL} />)
    const text = bodyText().toLowerCase()

    for (const forbidden of [
      'prejudicou',
      'afetou seu desempenho',
      'por causa da ansiedade',
      'diagnóstic',
      'transtorno',
      'sintoma',
      'score',
      'pontuação',
    ]) {
      expect(text).not.toContain(forbidden)
    }
  })

  it('enquadra o registro como percepção, não como avaliação', () => {
    render(<EmotionalContextSummary context={FULL} />)
    expect(bodyText()).toContain('não uma avaliação da relação')
  })
})

describe('robustez e compatibilidade retroativa', () => {
  it('sessão antiga sem contexto não renderiza nada', () => {
    const { container } = render(<EmotionalContextSummary context={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('contexto vazio não renderiza seção fantasma', () => {
    const { container } = render(<EmotionalContextSummary context={{ version: 1 }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('id de emoção desconhecido degrada sem quebrar a tela', () => {
    render(
      <EmotionalContextSummary
        context={
          {
            version: 1,
            primaryEmotion: { emotionId: 'do_futuro', intensity: 3 },
          } as EmotionalContext
        }
      />
    )

    expect(bodyText()).toContain('Emoção não reconhecida por esta versão')
    expect(bodyText()).toContain('intensidade 3/5')
  })

  it('rating fora da faixa não quebra a exibição', () => {
    render(
      <EmotionalContextSummary
        context={{ version: 1, relationshipPerception: { rating: 999 } } as EmotionalContext}
      />
    )
    expect(screen.getByText('Muito boa')).toBeInTheDocument()
  })

  it('rating não numérico não renderiza a seção', () => {
    render(
      <EmotionalContextSummary
        context={
          { version: 1, relationshipPerception: { rating: 'ótima' } } as unknown as EmotionalContext
        }
      />
    )
    expect(screen.queryByText('Percepção da relação')).toBeNull()
  })

  it('exibe quando o contexto foi atualizado, se houver carimbo', () => {
    render(
      <EmotionalContextSummary
        context={{ ...FULL, updatedAt: '2026-07-19T10:00:00.000Z' }}
      />
    )
    expect(bodyText()).toContain('Contexto atualizado em')
  })
})
