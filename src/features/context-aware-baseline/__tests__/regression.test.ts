import { describe, it, expect } from 'vitest'
import {
  computeBaselineStats,
  getValidAssessmentSessions,
  recomputeStoredBaselinePhases,
} from '../../../statistics/baseline'
import { evaluatePrimaryZ } from '../../../statistics/zscore'
import { getTest } from '../../../tests/registry'
import { sanitizeEmotionalContext } from '../../emotion-lab/emotionalContext'
import { selectReference } from '../referenceSelection'
import {
  LEGACY_SERIES,
  METRIC_KEYS,
  PROTOCOL,
  TEST_ID,
  makeSession,
  sequence,
} from './fixtures'
import type { SessionRecord, TrialRecord } from '../../../types'

const test = getTest(TEST_ID)

/**
 * O estado dos dados ANTES desta funcionalidade: nenhuma sessão tem o campo.
 * É contra este universo que as garantias de regressão são medidas.
 */
function legacyUniverse(): SessionRecord[] {
  return sequence(Array.from({ length: 14 }, () => 'absent' as const), {
    medianRTs: Array.from({ length: 14 }, (_, i) => 290 + i * 7),
  })
}

/** O mesmo universo, agora com os estados medicamentosos classificados. */
function classifiedUniverse(): SessionRecord[] {
  return legacyUniverse().map((s, i) => ({
    ...s,
    checkIn: {
      ...s.checkIn,
      medications: { lisdexamfetamine: { status: i % 2 === 0 ? 'taken' : 'not_taken' } },
    },
  })) as SessionRecord[]
}

describe('1. a referência geral antiga continua idêntica', () => {
  it('mesmas estatísticas para o mesmo conjunto de sessões', () => {
    const universe = legacyUniverse()
    const first = computeBaselineStats(universe, TEST_ID, PROTOCOL, METRIC_KEYS)
    const second = computeBaselineStats(universe, TEST_ID, PROTOCOL, METRIC_KEYS)

    expect(second).toEqual(first)
    expect(first.phase).toBe('monitoring')
    expect(first.baselineCount).toBe(8)
  })

  it('classificar o estado medicamentoso não muda a referência geral', () => {
    expect(computeBaselineStats(classifiedUniverse(), TEST_ID, PROTOCOL, METRIC_KEYS)).toEqual(
      computeBaselineStats(legacyUniverse(), TEST_ID, PROTOCOL, METRIC_KEYS)
    )
  })

  it('a elegibilidade não passou a ler o registro medicamentoso', () => {
    const legacy = getValidAssessmentSessions(legacyUniverse(), TEST_ID, PROTOCOL)
    const classified = getValidAssessmentSessions(classifiedUniverse(), TEST_ID, PROTOCOL)

    expect(classified.map((s) => s.sessionId)).toEqual(legacy.map((s) => s.sessionId))
  })

  it('os rótulos de fase gravados não mudam', () => {
    const legacy = recomputeStoredBaselinePhases(legacyUniverse())
    const classified = recomputeStoredBaselinePhases(classifiedUniverse())

    expect([...classified.entries()]).toEqual([...legacy.entries()])
  })
})

describe('2. z-scores gerais idênticos quando não há referência contextual', () => {
  it('universo inteiro sem o campo produz exatamente o z anterior', () => {
    const universe = legacyUniverse()
    const before = computeBaselineStats(universe, TEST_ID, PROTOCOL, METRIC_KEYS)

    const selection = selectReference({
      sessions: universe,
      session: makeSession({ id: 'nova', day: 28, status: 'absent' }),
      testId: TEST_ID,
      protocolVersion: PROTOCOL,
      metricKeys: METRIC_KEYS,
    })

    expect(selection.reference.stats).toEqual(before)
    for (const value of [280, 300, 320, 350, null]) {
      expect(evaluatePrimaryZ(value, selection.reference.stats, test, LEGACY_SERIES)).toEqual(
        evaluatePrimaryZ(value, before, test, LEGACY_SERIES)
      )
    }
  })

  it('contexto registrado mas ainda incompleto também cai no z geral', () => {
    // Poucas sessões classificadas: a janela contextual não fecha.
    const universe = sequence([
      ...Array.from({ length: 11 }, () => 'absent' as const),
      'taken', 'taken',
    ])
    const general = computeBaselineStats(universe, TEST_ID, PROTOCOL, METRIC_KEYS)

    const selection = selectReference({
      sessions: universe,
      session: makeSession({ id: 'nova', day: 28, status: 'taken' }),
      testId: TEST_ID,
      protocolVersion: PROTOCOL,
      metricKeys: METRIC_KEYS,
    })

    expect(selection.reference.metadata.kind).toBe('general')
    expect(evaluatePrimaryZ(300, selection.reference.stats, test, LEGACY_SERIES)).toEqual(
      evaluatePrimaryZ(300, general, test, LEGACY_SERIES)
    )
  })
})

describe('3. scoring bruto idêntico com e sem contexto', () => {
  function trials(sessionId: string, count: number): TrialRecord[] {
    return Array.from({ length: count }, (_, i) => ({
      trialId: `${sessionId}-t${i}`,
      sessionId,
      testId: TEST_ID,
      protocolVersion: PROTOCOL,
      mode: 'assessment' as const,
      blockIndex: 0,
      trialIndex: i,
      condition: 'simple',
      stimulus: 'green_circle',
      expectedResponse: 'space',
      actualResponse: 'space',
      correct: true,
      reactionTimeMs: 250 + ((i * 13) % 90),
      stimulusOnsetTimestamp: 1000 + i * 2000,
      responseTimestamp: 1000 + i * 2000 + 250,
      windowFocused: true,
      visibilityState: 'visible' as const,
      deviceType: 'desktop',
      inputMethod: 'keyboard',
    }))
  }

  it.each(['simple_rt', 'gonogo', 'stroop'] as const)(
    '%s: o scorer não recebe nem menciona o contexto medicamentoso',
    (testId) => {
      const definition = getTest(testId)
      const sessionTrials = trials('score', 30).map((t) => ({
        ...t,
        testId,
        protocolVersion: definition.protocolVersion,
      }))
      const device = makeSession({ id: 'd', day: 1 }).deviceInfo

      const scored = definition.scoreSession(sessionTrials, 'assessment', device, {})
      const again = definition.scoreSession(sessionTrials, 'assessment', device, {})

      expect(again).toEqual(scored)
      // Garantia estrutural: a assinatura é (trials, mode, device, flags).
      expect(definition.scoreSession).toHaveLength(4)
      expect(scored).not.toHaveProperty('checkIn')
      expect(scored).not.toHaveProperty('medications')
      expect(JSON.stringify(scored)).not.toMatch(/lisdex|medication|taken/i)
    }
  )
})

describe('4. editar o estado medicamentoso não altera nada além das condições', () => {
  it('trials, métricas, qualidade e timestamps permanecem idênticos', () => {
    const before = makeSession({ id: 'edit', day: 5, status: 'absent', medianRT: 317 })
    const after: SessionRecord = {
      ...before,
      checkIn: { ...before.checkIn, medications: { lisdexamfetamine: { status: 'taken' } } },
    }

    expect(after.trials).toEqual(before.trials)
    expect(after.result?.rtMetrics).toEqual(before.result?.rtMetrics)
    expect(after.result?.accuracyMetrics).toEqual(before.result?.accuracyMetrics)
    expect(after.result?.customMetrics).toEqual(before.result?.customMetrics)
    expect(after.result?.conditionMetrics).toEqual(before.result?.conditionMetrics)
    expect(after.quality).toBe(before.quality)
    expect(after.flags).toEqual(before.flags)
    expect(after.startedAt).toBe(before.startedAt)
    expect(after.completedAt).toBe(before.completedAt)
    expect(after.randomizationSeed).toBe(before.randomizationSeed)
  })

  it('altera apenas referências derivadas e comparações futuras', () => {
    const universe = sequence([
      'absent', 'absent', 'absent',
      ...Array.from({ length: 8 }, () => 'taken' as const),
    ])

    const args = {
      sessions: universe,
      testId: TEST_ID,
      protocolVersion: PROTOCOL,
      metricKeys: METRIC_KEYS,
    }
    const asUnknown = selectReference({
      ...args,
      session: makeSession({ id: 'x', day: 28, status: 'absent' }),
    })
    const asTaken = selectReference({
      ...args,
      session: makeSession({ id: 'x', day: 28, status: 'taken' }),
    })

    // Só a REFERÊNCIA escolhida muda; o baseline geral segue o mesmo objeto.
    expect(asUnknown.reference.metadata.kind).toBe('general')
    expect(asTaken.reference.metadata.kind).toBe('lisdexamfetamine_taken')
    expect(computeBaselineStats(universe, TEST_ID, PROTOCOL, METRIC_KEYS)).toEqual(
      asUnknown.reference.stats
    )
  })
})

describe('5. Emotion Lab continua funcionando', () => {
  it('o contexto emocional convive com o registro medicamentoso', () => {
    const session = makeSession({
      id: 'ambos',
      day: 1,
      checkIn: {
        emotionalContext: {
          version: 1,
          primaryEmotion: { emotionId: 'anxious', intensity: 4 },
          relationshipPerception: { rating: 70, confidence: 3 },
        },
        medications: { lisdexamfetamine: { status: 'taken' } },
      },
    })

    expect(session.checkIn?.emotionalContext?.primaryEmotion).toEqual({
      emotionId: 'anxious',
      intensity: 4,
    })
    expect(session.checkIn?.medications?.lisdexamfetamine?.status).toBe('taken')
  })

  it('o saneamento emocional não foi afetado pelo novo campo', () => {
    const sanitized = sanitizeEmotionalContext({
      version: 1,
      primaryEmotion: { emotionId: 'calm', intensity: 2 },
      relationshipPerception: { rating: 150 },
    })

    expect(sanitized?.primaryEmotion).toEqual({ emotionId: 'calm', intensity: 2 })
    // Rating fora da faixa continua sendo DESCARTADO, não limitado.
    expect(sanitized?.relationshipPerception).toBeUndefined()
  })

  it('nenhuma emoção registrada seleciona referência', () => {
    const universe = sequence([
      'absent', 'absent', 'absent',
      ...Array.from({ length: 8 }, () => 'taken' as const),
    ]).map((s) => ({
      ...s,
      checkIn: {
        ...s.checkIn,
        emotionalContext: {
          version: 1 as const,
          primaryEmotion: { emotionId: 'sad', intensity: 5 as const },
        },
      },
    })) as SessionRecord[]

    const withGrimEmotion = selectReference({
      sessions: universe,
      session: makeSession({
        id: 'x',
        day: 28,
        checkIn: {
          emotionalContext: { version: 1, primaryEmotion: { emotionId: 'sad', intensity: 5 } },
        },
      }),
      testId: TEST_ID,
      protocolVersion: PROTOCOL,
      metricKeys: METRIC_KEYS,
    })

    // Emoção não classifica: sem registro medicamentoso, é a referência geral.
    expect(withGrimEmotion.reference.metadata.kind).toBe('general')
  })
})

describe('6. sessões antigas continuam funcionando', () => {
  it('sessão sem checkIn entra na referência geral normalmente', () => {
    const universe = Array.from({ length: 14 }, (_, i) =>
      makeSession({ id: `old-${i}`, day: i + 1, checkIn: undefined })
    )
    const baseline = computeBaselineStats(universe, TEST_ID, PROTOCOL, METRIC_KEYS)

    expect(baseline.phase).toBe('monitoring')
    expect(baseline.sessionCount).toBe(14)
    expect(baseline.metrics.medianCorrectRT.n).toBe(8)
  })

  it('sessões antigas ficam fora das referências contextuais até classificação', () => {
    const universe = Array.from({ length: 14 }, (_, i) =>
      makeSession({ id: `old-${i}`, day: i + 1, checkIn: { sleep: { hours: 7 } } })
    )
    const selection = selectReference({
      sessions: universe,
      session: makeSession({ id: 'nova', day: 20, status: 'taken' }),
      testId: TEST_ID,
      protocolVersion: PROTOCOL,
      metricKeys: METRIC_KEYS,
    })

    expect(selection.progress.taken.count).toBe(0)
    expect(selection.progress.notTaken.count).toBe(0)
    expect(selection.reference.metadata.kind).toBe('general')
    expect(selection.reference.metadata.fallbackReason).toBe('contextual_incomplete')
  })

  it('mistura de sessões antigas e novas não quebra nem reclassifica silenciosamente', () => {
    const universe = [
      ...Array.from({ length: 6 }, (_, i) =>
        makeSession({ id: `old-${i}`, day: i + 1, checkIn: { sleep: { hours: 7 } } })
      ),
      ...Array.from({ length: 8 }, (_, i) =>
        makeSession({ id: `new-${i}`, day: 10 + i, status: 'taken' })
      ),
    ]

    const selection = selectReference({
      sessions: universe,
      session: makeSession({ id: 'atual', day: 25, status: 'taken' }),
      testId: TEST_ID,
      protocolVersion: PROTOCOL,
      metricKeys: METRIC_KEYS,
    })

    // As antigas seguem 'unknown' — nada foi inferido para elas.
    expect(selection.progress.taken.count).toBe(8)
    expect(selection.reference.metadata.sessionIds.every((id) => id.startsWith('new-'))).toBe(true)
  })
})
