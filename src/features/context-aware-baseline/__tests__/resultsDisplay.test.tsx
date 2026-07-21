import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReferenceBadge } from '../components/ReferenceBadge'
import { ReferenceComposition } from '../components/ReferenceComposition'
import { SessionContextComparison } from '../components/SessionContextComparison'
import { buildContextComparison } from '../contextSummary'
import { buildContextualReference, buildGeneralReference } from '../contextualReference'
import { selectReference } from '../referenceSelection'
import { METRIC_KEYS, PROTOCOL, TEST_ID, makeSession, sequence } from './fixtures'
import type { LisdexamfetamineStatus } from '../types'
import type { SessionRecord } from '../../../types'

afterEach(() => {
  cleanup()
})

function universeWithCompleteTaken(): SessionRecord[] {
  return sequence([
    'absent', 'absent', 'absent',
    ...Array.from({ length: 8 }, () => 'taken' as const),
  ])
}

function selectionFor(sessions: SessionRecord[], status: LisdexamfetamineStatus | 'absent') {
  return selectReference({
    sessions,
    session: makeSession({ id: 'atual', day: 28, status }),
    testId: TEST_ID,
    protocolVersion: PROTOCOL,
    metricKeys: METRIC_KEYS,
  })
}

describe('a referência usada é exibida', () => {
  it('nomeia a referência com lisdexanfetamina', () => {
    render(<ReferenceBadge selection={selectionFor(universeWithCompleteTaken(), 'taken')} />)

    expect(screen.getByText(/referência com lisdexanfetamina/)).toBeInTheDocument()
    expect(screen.getByText(/apenas sessões em que você registrou/)).toBeInTheDocument()
  })

  it('nomeia a referência sem lisdexanfetamina', () => {
    const universe = sequence([
      'absent', 'absent', 'absent',
      ...Array.from({ length: 8 }, () => 'not_taken' as const),
    ])
    render(<ReferenceBadge selection={selectionFor(universe, 'not_taken')} />)

    expect(screen.getByText(/referência sem lisdexanfetamina/)).toBeInTheDocument()
  })
})

describe('o fallback é explicado', () => {
  it('referência contextual em construção mostra o progresso e avisa da mistura', () => {
    const universe = sequence([
      ...Array.from({ length: 11 }, () => 'absent' as const),
      'taken', 'taken',
    ])
    render(<ReferenceBadge selection={selectionFor(universe, 'taken')} />)

    expect(screen.getByText(/ainda está em construção/)).toBeInTheDocument()
    expect(screen.getByText(/2\/8 com lisdexanfetamina/)).toBeInTheDocument()
    expect(screen.getByText(/pode misturar contextos diferentes/)).toBeInTheDocument()
  })

  it('estado não informado é dito explicitamente, sem presumir nada', () => {
    render(<ReferenceBadge selection={selectionFor(universeWithCompleteTaken(), 'absent')} />)

    expect(screen.getByText(/não foi informado nesta sessão/)).toBeInTheDocument()
    expect(screen.getAllByText(/referência geral/).length).toBeGreaterThan(0)
    // Não afirma nem "tomou" nem "não tomou".
    expect(document.body.textContent).not.toMatch(/você não tomou|você tomou/i)
  })
})

describe('composição da referência', () => {
  function renderComposition(sessions: SessionRecord[], status: LisdexamfetamineStatus | 'absent') {
    const args = [sessions, TEST_ID, PROTOCOL, METRIC_KEYS] as const
    render(
      <ReferenceComposition
        selection={selectionFor(sessions, status)}
        general={buildGeneralReference(...args)}
        taken={buildContextualReference(...args, 'taken')}
        notTaken={buildContextualReference(...args, 'not_taken')}
      />
    )
  }

  it('mostra o progresso X/8 de cada contexto', () => {
    renderComposition(universeWithCompleteTaken(), 'taken')

    expect(screen.getByText('8/8')).toBeInTheDocument()
    expect(screen.getByText('0/8')).toBeInTheDocument()
    expect(screen.getAllByText(/Com lisdexanfetamina:/).length).toBeGreaterThan(0)
  })

  it('lista as colunas exigidas da composição', () => {
    renderComposition(universeWithCompleteTaken(), 'taken')

    for (const header of [
      'Data',
      'Lisdexanfetamina',
      'Cafeína',
      'Sono',
      'Qual. sono',
      'Horário',
      'Dispositivo',
      'Qualidade',
      'Protocolo',
    ]) {
      expect(screen.getAllByRole('columnheader', { name: header }).length).toBeGreaterThan(0)
    }
  })

  it('exibe a classificação descritiva sem usá-la para pontuar', () => {
    renderComposition(universeWithCompleteTaken(), 'taken')

    expect(screen.getByText(/Contexto (registrado predominantemente|misto|insuficientemente)/)).toBeInTheDocument()
    expect(screen.getByText(/apenas descritiva: ela não altera nenhuma métrica/)).toBeInTheDocument()
  })

  it('janela vazia é dita, não escondida', () => {
    renderComposition(universeWithCompleteTaken(), 'taken')
    expect(screen.getAllByText('Nenhuma sessão nesta janela ainda.').length).toBeGreaterThan(0)
  })

  it('não expõe observações pessoais nem detalhes da percepção relacional', () => {
    const universe = universeWithCompleteTaken().map((s) => ({
      ...s,
      checkIn: {
        ...s.checkIn,
        notes: 'observação pessoal secreta',
        emotionalContext: {
          version: 1 as const,
          relationshipPerception: { rating: 12, confidence: 5 as const },
        },
      },
    })) as SessionRecord[]

    renderComposition(universe, 'taken')

    expect(document.body.textContent).not.toContain('observação pessoal secreta')
    expect(document.body.textContent).not.toMatch(/percepção da relação/i)
  })
})

describe('contexto complementar', () => {
  it('apresenta os dados como contexto e nega causalidade', () => {
    const universe = universeWithCompleteTaken()
    const selection = selectionFor(universe, 'taken')
    const current = makeSession({
      id: 'atual',
      day: 28,
      checkIn: {
        sleep: { hours: 5.67 },
        substances: { caffeine: true },
        medications: { lisdexamfetamine: { status: 'taken' } },
      },
    })

    render(
      <SessionContextComparison
        comparison={buildContextComparison(current, selection.reference.sessions)}
        referenceKind={selection.reference.metadata.kind}
        referenceCount={selection.reference.metadata.sessionCount}
      />
    )

    expect(screen.getByText(/apenas como contexto/)).toBeInTheDocument()
    expect(screen.getByText(/não demonstra causa/)).toBeInTheDocument()
    expect(screen.getByText('5h40')).toBeInTheDocument()
  })

  it('não conclui nada sobre desempenho a partir do contexto', () => {
    const universe = universeWithCompleteTaken()
    const selection = selectionFor(universe, 'taken')
    const current = makeSession({
      id: 'atual',
      day: 28,
      checkIn: {
        sleep: { hours: 4 },
        currentState: { energy: 1, stress: 5 },
        medications: { lisdexamfetamine: { status: 'taken' } },
        emotionalContext: {
          version: 1,
          primaryEmotion: { emotionId: 'anxious', intensity: 5 },
        },
      },
    })

    render(
      <SessionContextComparison
        comparison={buildContextComparison(current, selection.reference.sessions)}
        referenceKind={selection.reference.metadata.kind}
        referenceCount={selection.reference.metadata.sessionCount}
      />
    )

    const text = document.body.textContent ?? ''
    // Frases proibidas da missão, em forma de padrões de afirmação.
    for (const forbidden of [
      /melhorou (o |seu )?desempenho/i,
      /funciona melhor/i,
      /você deveria/i,
      /(seu sono|sua emoção|a emoção) (causou|prejudicou|explica)/i,
      /por causa d/i,
      /porque (você )?dormiu/i,
      /piorou/i,
    ]) {
      expect(text).not.toMatch(forbidden)
    }
  })

  it('campo ausente aparece como travessão, não como zero', () => {
    const universe = universeWithCompleteTaken()
    const selection = selectionFor(universe, 'taken')
    const current = makeSession({
      id: 'atual',
      day: 28,
      checkIn: { medications: { lisdexamfetamine: { status: 'taken' } } },
    })

    render(
      <SessionContextComparison
        comparison={buildContextComparison(current, selection.reference.sessions)}
        referenceKind={selection.reference.metadata.kind}
        referenceCount={selection.reference.metadata.sessionCount}
      />
    )

    const text = document.body.textContent ?? ''
    expect(text).toContain('—')
    expect(text).not.toMatch(/NaN|Infinity|undefined|null/)
  })

  it('nenhuma sessão da referência com o dado é dito explicitamente', () => {
    const universe = universeWithCompleteTaken()
    const selection = selectionFor(universe, 'taken')
    const current = makeSession({ id: 'atual', day: 28, status: 'taken' })

    render(
      <SessionContextComparison
        comparison={buildContextComparison(current, selection.reference.sessions)}
        referenceKind={selection.reference.metadata.kind}
        referenceCount={selection.reference.metadata.sessionCount}
      />
    )

    expect(screen.getAllByText(/Nenhuma sessão da referência registrou este dado/).length).toBeGreaterThan(0)
  })
})
