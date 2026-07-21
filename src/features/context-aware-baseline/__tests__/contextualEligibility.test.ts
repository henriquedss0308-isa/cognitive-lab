import { describe, it, expect } from 'vitest'
import {
  CONTEXTUAL_REFERENCE_SESSIONS,
  getContextualCandidates,
  getContextualWindow,
  getEligibleSessions,
  orderSessionsDeterministically,
  splitFamiliarization,
} from '../contextualEligibility'
import { getValidAssessmentSessions } from '../../../statistics/baseline'
import { METRIC_KEYS, PROTOCOL, TEST_ID, makeSession, makeSessions, sequence } from './fixtures'

const ids = (sessions: { sessionId: string }[]) => sessions.map((s) => s.sessionId)

describe('elegibilidade contextual usa exatamente a régua do baseline geral', () => {
  it('avaliação válida é elegível', () => {
    const sessions = makeSessions([{ id: 'a', day: 1, status: 'taken' }])
    expect(ids(getEligibleSessions(sessions, TEST_ID, PROTOCOL))).toEqual(['a'])
  })

  it('sessão inválida é inelegível', () => {
    const sessions = makeSessions([
      { id: 'ok', day: 1, status: 'taken' },
      { id: 'ruim', day: 2, status: 'taken', quality: 'invalid' },
    ])
    expect(ids(getEligibleSessions(sessions, TEST_ID, PROTOCOL))).toEqual(['ok'])
  })

  it('valid_with_warnings continua elegível (spec §2)', () => {
    const sessions = makeSessions([
      { id: 'aviso', day: 1, status: 'taken', quality: 'valid_with_warnings' },
    ])
    expect(ids(getEligibleSessions(sessions, TEST_ID, PROTOCOL))).toEqual(['aviso'])
  })

  it('sessão demo é inelegível', () => {
    const sessions = makeSessions([
      { id: 'real', day: 1, status: 'taken' },
      { id: 'demo', day: 2, status: 'taken', isDemo: true },
    ])
    expect(ids(getEligibleSessions(sessions, TEST_ID, PROTOCOL))).toEqual(['real'])
  })

  it('sessão incompleta (sem result / sem completedAt / não concluída) é inelegível', () => {
    const sessions = makeSessions([
      { id: 'ok', day: 1, status: 'taken' },
      { id: 'sem-result', day: 2, status: 'taken', withoutResult: true },
      { id: 'sem-fim', day: 3, status: 'taken', withoutCompletedAt: true },
      { id: 'andando', day: 4, status: 'taken', sessionStatus: 'in_progress' },
      { id: 'abandonada', day: 5, status: 'taken', sessionStatus: 'abandoned' },
      { id: 'interrompida', day: 6, status: 'taken', sessionStatus: 'interrupted' },
    ])
    expect(ids(getEligibleSessions(sessions, TEST_ID, PROTOCOL))).toEqual(['ok'])
  })

  it('protocolo diferente é inelegível', () => {
    const sessions = makeSessions([
      { id: 'v1', day: 1, status: 'taken' },
      { id: 'v2', day: 2, status: 'taken', protocolVersion: 'reaction.simple.v2.0' },
    ])
    expect(ids(getEligibleSessions(sessions, TEST_ID, PROTOCOL))).toEqual(['v1'])
  })

  it('prática insuficiente é inelegível', () => {
    const sessions = makeSessions([
      { id: 'ok', day: 1, status: 'taken' },
      { id: 'sem-treino', day: 2, status: 'taken', insufficientPractice: true },
    ])
    expect(ids(getEligibleSessions(sessions, TEST_ID, PROTOCOL))).toEqual(['ok'])
  })

  it('treino nunca entra', () => {
    const sessions = makeSessions([
      { id: 'aval', day: 1, status: 'taken' },
      { id: 'treino', day: 2, status: 'taken', mode: 'training' },
    ])
    expect(ids(getEligibleSessions(sessions, TEST_ID, PROTOCOL))).toEqual(['aval'])
  })

  it('o conjunto elegível é o mesmo do baseline geral, apenas reordenado', () => {
    const sessions = makeSessions([
      { id: 'c', day: 3, status: 'taken' },
      { id: 'a', day: 1, status: 'not_taken' },
      { id: 'demo', day: 2, status: 'taken', isDemo: true },
      { id: 'b', day: 2, status: 'absent' },
    ])
    const contextual = getEligibleSessions(sessions, TEST_ID, PROTOCOL)
    const general = getValidAssessmentSessions(sessions, TEST_ID, PROTOCOL)
    expect(new Set(ids(contextual))).toEqual(new Set(ids(general)))
    expect(ids(contextual)).toEqual(['a', 'b', 'c'])
  })
})

describe('ordem cronológica determinística', () => {
  it('ordena por startedAt crescente', () => {
    const sessions = makeSessions([
      { id: 'terceira', day: 3 },
      { id: 'primeira', day: 1 },
      { id: 'segunda', day: 2 },
    ])
    expect(ids(orderSessionsDeterministically(sessions))).toEqual([
      'primeira',
      'segunda',
      'terceira',
    ])
  })

  it('timestamps iguais são desempatados por sessionId, independentemente da ordem de entrada', () => {
    const at = '2026-06-10T10:00:00.000Z'
    const a = makeSession({ id: 'aaa', day: 10, startedAt: at })
    const b = makeSession({ id: 'bbb', day: 10, startedAt: at })
    const c = makeSession({ id: 'ccc', day: 10, startedAt: at })

    expect(ids(orderSessionsDeterministically([c, a, b]))).toEqual(['aaa', 'bbb', 'ccc'])
    expect(ids(orderSessionsDeterministically([b, c, a]))).toEqual(['aaa', 'bbb', 'ccc'])
    expect(ids(orderSessionsDeterministically([a, b, c]))).toEqual(['aaa', 'bbb', 'ccc'])
  })

  it('a janela contextual é estável mesmo com todos os timestamps iguais', () => {
    const at = '2026-06-10T10:00:00.000Z'
    const sessions = Array.from({ length: 14 }, (_, i) =>
      makeSession({ id: `s${String(i).padStart(2, '0')}`, day: 10, startedAt: at, status: 'taken' })
    )
    const forward = getContextualWindow(getEligibleSessions(sessions, TEST_ID, PROTOCOL), 'taken')
    const reversed = getContextualWindow(
      getEligibleSessions([...sessions].reverse(), TEST_ID, PROTOCOL),
      'taken'
    )
    expect(ids(forward)).toEqual(ids(reversed))
    expect(ids(forward)).toEqual(['s03', 's04', 's05', 's06', 's07', 's08', 's09', 's10'])
  })

  it('não muta o array recebido', () => {
    const sessions = makeSessions([
      { id: 'z', day: 3 },
      { id: 'a', day: 1 },
    ])
    const original = ids(sessions)
    orderSessionsDeterministically(sessions)
    expect(ids(sessions)).toEqual(original)
  })
})

describe('familiarização global', () => {
  it('separa as três primeiras elegíveis gerais', () => {
    const sessions = sequence(['taken', 'not_taken', 'taken', 'not_taken', 'taken'])
    const split = splitFamiliarization(getEligibleSessions(sessions, TEST_ID, PROTOCOL))
    expect(ids(split.familiarization)).toEqual(['s1', 's2', 's3'])
    expect(ids(split.afterFamiliarization)).toEqual(['s4', 's5'])
  })

  it('a familiarização não reinicia por contexto', () => {
    // Três primeiras "com", depois a primeira "sem": a sessão sem medicação já
    // é candidata contextual — a prática aprendida no teste não se perde.
    const sessions = sequence(['taken', 'taken', 'taken', 'not_taken'])
    const eligible = getEligibleSessions(sessions, TEST_ID, PROTOCOL)
    expect(ids(getContextualCandidates(eligible, 'not_taken'))).toEqual(['s4'])
    // E nenhuma das três primeiras entra na janela "com", mesmo sendo 'taken'.
    expect(ids(getContextualCandidates(eligible, 'taken'))).toEqual([])
  })

  it('sessão anterior à familiarização global nunca entra em referência contextual', () => {
    const sessions = sequence(['taken', 'taken', 'taken', 'taken'])
    const eligible = getEligibleSessions(sessions, TEST_ID, PROTOCOL)
    const candidates = getContextualCandidates(eligible, 'taken')
    expect(ids(candidates)).toEqual(['s4'])
    expect(ids(candidates)).not.toContain('s1')
    expect(ids(candidates)).not.toContain('s2')
    expect(ids(candidates)).not.toContain('s3')
  })

  it('menos de três elegíveis ⇒ nenhuma candidata contextual', () => {
    const eligible = getEligibleSessions(sequence(['taken', 'taken']), TEST_ID, PROTOCOL)
    expect(splitFamiliarization(eligible).afterFamiliarization).toHaveLength(0)
    expect(getContextualCandidates(eligible, 'taken')).toHaveLength(0)
  })
})

describe('particionamento por contexto', () => {
  it('sessões intercaladas vão para as janelas corretas', () => {
    const sessions = sequence([
      'absent', 'absent', 'absent', // familiarização global
      'taken', 'not_taken', 'taken', 'not_taken', 'unknown', 'taken', 'not_taken',
    ])
    const eligible = getEligibleSessions(sessions, TEST_ID, PROTOCOL)
    expect(ids(getContextualCandidates(eligible, 'taken'))).toEqual(['s4', 's6', 's9'])
    expect(ids(getContextualCandidates(eligible, 'not_taken'))).toEqual(['s5', 's7', 's10'])
  })

  it('estado desconhecido não entra em nenhuma referência contextual', () => {
    const sessions = sequence([
      'absent', 'absent', 'absent',
      'unknown', 'absent', 'unknown', 'absent',
    ])
    const eligible = getEligibleSessions(sessions, TEST_ID, PROTOCOL)
    expect(getContextualCandidates(eligible, 'taken')).toHaveLength(0)
    expect(getContextualCandidates(eligible, 'not_taken')).toHaveLength(0)
  })

  it('a janela congela nas primeiras oito do contexto', () => {
    const sessions = sequence([
      'absent', 'absent', 'absent',
      ...Array.from({ length: 12 }, () => 'taken' as const),
    ])
    const eligible = getEligibleSessions(sessions, TEST_ID, PROTOCOL)
    const window = getContextualWindow(eligible, 'taken')

    expect(window).toHaveLength(CONTEXTUAL_REFERENCE_SESSIONS)
    expect(ids(window)).toEqual(['s4', 's5', 's6', 's7', 's8', 's9', 's10', 's11'])
    // A 12ª, 13ª, 14ª e 15ª sessões não deslocam a janela já formada.
    expect(ids(window)).not.toContain('s12')
    expect(ids(window)).not.toContain('s15')
  })

  it('acrescentar sessões novas não altera a janela congelada', () => {
    const base = sequence([
      'absent', 'absent', 'absent',
      ...Array.from({ length: 8 }, () => 'taken' as const),
    ])
    const windowBefore = ids(
      getContextualWindow(getEligibleSessions(base, TEST_ID, PROTOCOL), 'taken')
    )

    const extended = [
      ...base,
      makeSession({ id: 'nova1', day: 20, status: 'taken' }),
      makeSession({ id: 'nova2', day: 21, status: 'taken' }),
    ]
    const windowAfter = ids(
      getContextualWindow(getEligibleSessions(extended, TEST_ID, PROTOCOL), 'taken')
    )

    expect(windowAfter).toEqual(windowBefore)
    expect(windowAfter).toHaveLength(8)
  })
})

describe('sanidade das chaves de métrica usadas nos testes', () => {
  it('as métricas do fixture existem no resultado gravado', () => {
    const session = makeSession({ id: 'x', day: 1 })
    expect(session.result?.rtMetrics.medianCorrectRT).toBeTypeOf('number')
    expect(METRIC_KEYS).toContain('medianCorrectRT')
  })
})
