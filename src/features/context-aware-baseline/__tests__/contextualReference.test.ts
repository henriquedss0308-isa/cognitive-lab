import { describe, it, expect } from 'vitest'
import { buildContextualReference, buildGeneralReference } from '../contextualReference'
import { computeBaselineStats } from '../../../statistics/baseline'
import { evaluatePrimaryZ, MIN_BASELINE_N } from '../../../statistics/zscore'
import { getTest } from '../../../tests/registry'
import { METRIC_KEYS, PROTOCOL, TEST_ID, makeSession, sequence } from './fixtures'
import type { SessionRecord } from '../../../types'

const ids = (sessions: { sessionId: string }[]) => sessions.map((s) => s.sessionId)

/** 3 de familiarização + 8 "com" + 8 "sem", intercaladas após a familiarização. */
function fullyPopulated(): SessionRecord[] {
  const statuses: ('taken' | 'not_taken' | 'absent')[] = ['absent', 'absent', 'absent']
  for (let i = 0; i < 8; i++) statuses.push('taken', 'not_taken')
  return sequence(statuses, {
    // RTs distintos por contexto: as referências precisam ser numericamente
    // diferentes para que os testes provem que a escolha importa.
    medianRTs: statuses.map((s, i) => (s === 'taken' ? 300 + i : s === 'not_taken' ? 400 + i : 350)),
  })
}

describe('referência geral preservada', () => {
  it('delega inteiramente a computeBaselineStats', () => {
    const sessions = fullyPopulated()
    const reference = buildGeneralReference(sessions, TEST_ID, PROTOCOL, METRIC_KEYS)
    expect(reference.stats).toEqual(
      computeBaselineStats(sessions, TEST_ID, PROTOCOL, METRIC_KEYS)
    )
  })

  it('a janela exibida é a das sessões realmente usadas no cálculo (elegíveis 4–11)', () => {
    const sessions = fullyPopulated()
    const reference = buildGeneralReference(sessions, TEST_ID, PROTOCOL, METRIC_KEYS)
    expect(reference.metadata.sessionCount).toBe(8)
    expect(ids(reference.sessions)).toEqual(['s4', 's5', 's6', 's7', 's8', 's9', 's10', 's11'])
    expect(reference.metadata.kind).toBe('general')
    expect(reference.metadata.fallback).toBe(false)
  })

  it('nenhum estado medicamentoso altera a referência geral', () => {
    const neutral = sequence(Array.from({ length: 14 }, () => 'absent' as const))
    const classified = neutral.map((s, i) => ({
      ...s,
      checkIn: {
        ...s.checkIn,
        medications: { lisdexamfetamine: { status: i % 2 === 0 ? 'taken' : 'not_taken' } },
      },
    })) as SessionRecord[]

    expect(computeBaselineStats(classified, TEST_ID, PROTOCOL, METRIC_KEYS)).toEqual(
      computeBaselineStats(neutral, TEST_ID, PROTOCOL, METRIC_KEYS)
    )
  })
})

describe('construção da referência contextual', () => {
  it('usa as primeiras oito do contexto após a familiarização global', () => {
    const sessions = fullyPopulated()
    const taken = buildContextualReference(sessions, TEST_ID, PROTOCOL, METRIC_KEYS, 'taken')

    expect(taken.metadata.kind).toBe('lisdexamfetamine_taken')
    expect(taken.metadata.sessionCount).toBe(8)
    expect(taken.metadata.composition).toBe('complete')
    expect(taken.metadata.requiredCount).toBe(8)
    expect(taken.stats.phase).toBe('monitoring')
    // Nenhuma sessão de familiarização entrou.
    expect(ids(taken.sessions)).not.toContain('s1')
    expect(ids(taken.sessions)).not.toContain('s3')
  })

  it('as duas referências contextuais são disjuntas e numericamente distintas', () => {
    const sessions = fullyPopulated()
    const taken = buildContextualReference(sessions, TEST_ID, PROTOCOL, METRIC_KEYS, 'taken')
    const notTaken = buildContextualReference(
      sessions, TEST_ID, PROTOCOL, METRIC_KEYS, 'not_taken'
    )

    const overlap = ids(taken.sessions).filter((id) => ids(notTaken.sessions).includes(id))
    expect(overlap).toEqual([])
    expect(taken.stats.metrics.medianCorrectRT.median).not.toBe(
      notTaken.stats.metrics.medianCorrectRT.median
    )
  })

  it('sessão de estado desconhecido nunca entra em referência contextual', () => {
    const sessions = sequence([
      'absent', 'absent', 'absent',
      'taken', 'unknown', 'taken', 'absent', 'taken',
    ])
    const taken = buildContextualReference(sessions, TEST_ID, PROTOCOL, METRIC_KEYS, 'taken')
    expect(ids(taken.sessions)).toEqual(['s4', 's6', 's8'])
    expect(ids(taken.sessions)).not.toContain('s5')
    expect(ids(taken.sessions)).not.toContain('s7')
  })

  it('janela incompleta fica em building e não vira monitoring', () => {
    const sessions = sequence([
      'absent', 'absent', 'absent',
      'taken', 'taken', 'taken',
    ])
    const taken = buildContextualReference(sessions, TEST_ID, PROTOCOL, METRIC_KEYS, 'taken')
    expect(taken.metadata.composition).toBe('building')
    expect(taken.metadata.sessionCount).toBe(3)
    expect(taken.stats.phase).toBe('baseline_building')
  })

  it('contexto sem nenhuma sessão fica vazio, sem NaN nem divisão por zero', () => {
    const sessions = sequence(['absent', 'absent', 'absent', 'taken'])
    const notTaken = buildContextualReference(
      sessions, TEST_ID, PROTOCOL, METRIC_KEYS, 'not_taken'
    )

    expect(notTaken.metadata.composition).toBe('empty')
    expect(notTaken.metadata.sessionCount).toBe(0)
    expect(notTaken.metadata.dateRange).toBeNull()
    for (const key of METRIC_KEYS) {
      const stats = notTaken.stats.metrics[key]
      expect(stats.n).toBe(0)
      expect(stats.median).toBeNull()
      expect(stats.mad).toBeNull()
    }
  })

  it('metadados registram protocolo, IDs e intervalo de datas', () => {
    const sessions = fullyPopulated()
    const taken = buildContextualReference(sessions, TEST_ID, PROTOCOL, METRIC_KEYS, 'taken')

    expect(taken.metadata.testId).toBe(TEST_ID)
    expect(taken.metadata.protocolVersion).toBe(PROTOCOL)
    expect(taken.metadata.sessionIds).toEqual(ids(taken.sessions))
    expect(taken.metadata.sessionIds).toHaveLength(8)
    expect(taken.metadata.dateRange?.first).toBe(taken.sessions[0].startedAt)
    expect(taken.metadata.dateRange?.last).toBe(taken.sessions[7].startedAt)
    expect(new Date(taken.metadata.dateRange!.first).getTime()).toBeLessThanOrEqual(
      new Date(taken.metadata.dateRange!.last).getTime()
    )
  })

  it('conta sessões com avisos dentro da janela contextual', () => {
    const sessions = [
      ...sequence(['absent', 'absent', 'absent']),
      ...Array.from({ length: 8 }, (_, i) =>
        makeSession({
          id: `c${i}`,
          day: 10 + i,
          status: 'taken',
          quality: i < 2 ? 'valid_with_warnings' : 'valid',
        })
      ),
    ]
    const taken = buildContextualReference(sessions, TEST_ID, PROTOCOL, METRIC_KEYS, 'taken')
    expect(taken.stats.warningCount).toBe(2)
    expect(taken.metadata.sessionCount).toBe(8)
  })
})

describe('regras estatísticas preservadas na referência contextual', () => {
  const test = getTest(TEST_ID)

  function contextualWith(medianRTs: (number | null)[]) {
    const sessions = [
      ...sequence(['absent', 'absent', 'absent']),
      ...medianRTs.map((rt, i) => {
        const session = makeSession({ id: `c${i}`, day: 10 + i, status: 'taken' })
        session.result!.rtMetrics.medianCorrectRT = rt
        session.result!.customMetrics = {}
        return session
      }),
    ]
    return buildContextualReference(sessions, TEST_ID, PROTOCOL, ['medianCorrectRT'], 'taken')
  }

  it('n conta apenas valores não nulos', () => {
    const reference = contextualWith([300, null, 320, null, 340, 360, 380, 400])
    expect(reference.metadata.sessionCount).toBe(8)
    expect(reference.stats.metrics.medianCorrectRT.n).toBe(6)
  })

  it('n abaixo do mínimo suprime o z (mesma regra do baseline geral)', () => {
    const reference = contextualWith([300, null, null, null, 340, 360, 380, null])
    expect(reference.stats.metrics.medianCorrectRT.n).toBeLessThan(MIN_BASELINE_N)

    const outcome = evaluatePrimaryZ(310, reference.stats, test)
    expect(outcome.kind).toBe('insufficient_n')
  })

  it('MAD zero recebe o tratamento já definido na especificação', () => {
    const reference = contextualWith([300, 300, 300, 300, 300, 300, 300, 300])
    expect(reference.stats.metrics.medianCorrectRT.mad).toBe(0)

    const outcome = evaluatePrimaryZ(330, reference.stats, test)
    expect(outcome.kind).toBe('zero_mad')
    if (outcome.kind === 'zero_mad') {
      expect(outcome.median).toBe(300)
      expect(outcome.delta).toBe(30)
    }
  })

  it('métrica ausente na sessão avaliada não vira z fabricado', () => {
    const reference = contextualWith([300, 310, 320, 330, 340, 350, 360, 370])
    expect(evaluatePrimaryZ(null, reference.stats, test).kind).toBe('value_missing')
    expect(evaluatePrimaryZ(undefined, reference.stats, test).kind).toBe('value_missing')
  })

  it('nenhuma estatística produz NaN ou Infinity', () => {
    const reference = contextualWith([300, null, 320, 320, 320, 360, 380, null])
    for (const stats of Object.values(reference.stats.metrics)) {
      for (const value of [stats.median, stats.mad]) {
        if (value !== null) {
          expect(Number.isFinite(value)).toBe(true)
        }
      }
      expect(Number.isInteger(stats.n)).toBe(true)
    }
  })

  it('z contextual usa a mediana do próprio contexto', () => {
    const reference = contextualWith([300, 310, 320, 330, 340, 350, 360, 370])
    const outcome = evaluatePrimaryZ(335, reference.stats, test)
    expect(outcome.kind).toBe('ok')
    if (outcome.kind === 'ok') {
      // medianCorrectRT tem direção -1 (menor é melhor): valor acima da
      // mediana (335 > 335? mediana = 335) ⇒ z ≈ 0.
      expect(Number.isFinite(outcome.z)).toBe(true)
      expect(outcome.n).toBe(8)
    }
  })
})
