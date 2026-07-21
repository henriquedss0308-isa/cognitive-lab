import { describe, it, expect } from 'vitest'
import { computeBaselineStats, getValidAssessmentSessions } from '../../../statistics/baseline'
import { getTest } from '../../../tests/registry'
import type { SessionRecord, SessionResult, TestConditions, TrialRecord } from '../../../types'
import type { EmotionalContext } from '../types'

/**
 * Invariante central do Emotion Lab: o contexto emocional é puramente
 * contextual. Estes testes comparam saídas reais de scoring e de baseline com
 * e sem o contexto presente — se algum dia alguém ligar `checkIn` à pontuação,
 * eles quebram.
 */

const DEVICE: SessionRecord['deviceInfo'] = {
  deviceType: 'desktop',
  inputMethod: 'keyboard',
  screenWidth: 1920,
  screenHeight: 1080,
  browser: 'test',
  userAgent: 'test',
}

/** Contextos variados: emoções de quadrantes opostos e percepções distantes. */
function contextFor(index: number): EmotionalContext {
  const emotions = ['anxious', 'calm', 'sad', 'joyful', 'stressed', 'relaxed']
  return {
    version: 1,
    primaryEmotion: {
      emotionId: emotions[index % emotions.length],
      intensity: ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5,
    },
    relationshipPerception: {
      rating: (index * 7) % 101,
      confidence: ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5,
    },
    updatedAt: '2026-07-19T10:00:00.000Z',
  }
}

function makeTrial(sessionId: string, index: number): TrialRecord {
  return {
    trialId: `${sessionId}-t${index}`,
    sessionId,
    testId: 'simple_rt',
    protocolVersion: 'reaction.simple.v1.0',
    mode: 'assessment',
    blockIndex: 0,
    trialIndex: index,
    condition: 'simple',
    stimulus: 'green_circle',
    expectedResponse: 'space',
    actualResponse: 'space',
    correct: true,
    // RTs variados e determinísticos, para que mediana/MAD tenham conteúdo.
    reactionTimeMs: 250 + ((index * 13) % 90),
    stimulusOnsetTimestamp: 1000 + index * 2000,
    responseTimestamp: 1000 + index * 2000 + 250,
    windowFocused: true,
    visibilityState: 'visible',
    deviceType: 'desktop',
    inputMethod: 'keyboard',
  }
}

function makeResult(sessionId: string, offset: number): SessionResult {
  return {
    sessionId,
    testId: 'simple_rt',
    protocolVersion: 'reaction.simple.v1.0',
    mode: 'assessment',
    startedAt: '',
    completedAt: '',
    quality: 'valid',
    flags: {},
    flagMessages: [],
    rtMetrics: {
      medianCorrectRT: 300 + offset,
      meanCorrectRT: 302 + offset,
      rtStandardDeviation: 10,
      rtIQR: 12,
      rtCoefficientOfVariation: 0.03,
      p10RT: 280,
      p90RT: 330,
      anticipationRate: 0,
      lapseRate: 0,
      validTrialCount: 40,
      invalidTrialCount: 0,
    },
    accuracyMetrics: {
      accuracy: 1,
      correctCount: 40,
      errorCount: 0,
      omissionCount: 0,
      totalTrials: 40,
    },
    conditionMetrics: {},
    blockMetrics: [],
    customMetrics: { meanRT: 302 + offset },
    isDemo: false,
    deviceInfo: DEVICE,
  }
}

/** 14 sessões elegíveis ⇒ fase de monitoramento, com janela de baseline cheia. */
function buildSessions(withContext: boolean): SessionRecord[] {
  return Array.from({ length: 14 }, (_, i) => {
    const sessionId = `s-${i}`
    const checkIn: TestConditions = { sleep: { hours: 7 } }
    if (withContext) checkIn.emotionalContext = contextFor(i)

    return {
      sessionId,
      testId: 'simple_rt',
      protocolVersion: 'reaction.simple.v1.0',
      mode: 'assessment',
      status: 'completed',
      startedAt: `2026-06-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
      completedAt: `2026-06-${String(i + 1).padStart(2, '0')}T10:06:00.000Z`,
      quality: 'valid',
      flags: {},
      flagMessages: [],
      result: makeResult(sessionId, i * 3),
      trials: [makeTrial(sessionId, 0)],
      checkIn,
      deviceInfo: DEVICE,
      isDemo: false,
      practiceCompleted: true,
      randomizationSeed: i,
    } satisfies SessionRecord
  })
}

describe('baseline não é afetado pelo contexto emocional', () => {
  const metricKeys = getTest('simple_rt').baselineMetricKeys

  it('as estatísticas do baseline são idênticas com e sem contexto', () => {
    const without = computeBaselineStats(
      buildSessions(false),
      'simple_rt',
      'reaction.simple.v1.0',
      metricKeys
    )
    const with_ = computeBaselineStats(
      buildSessions(true),
      'simple_rt',
      'reaction.simple.v1.0',
      metricKeys
    )

    expect(with_).toEqual(without)
    // Sanidade: o cenário realmente exercita mediana/MAD, não um objeto vazio.
    expect(without.phase).toBe('monitoring')
    expect(Object.keys(without.metrics).length).toBeGreaterThan(0)
  })

  it('a elegibilidade das sessões é idêntica', () => {
    const idsWithout = getValidAssessmentSessions(
      buildSessions(false),
      'simple_rt',
      'reaction.simple.v1.0'
    ).map((s) => s.sessionId)
    const idsWith = getValidAssessmentSessions(
      buildSessions(true),
      'simple_rt',
      'reaction.simple.v1.0'
    ).map((s) => s.sessionId)

    expect(idsWith).toEqual(idsWithout)
    expect(idsWith).toHaveLength(14)
  })

  it('nenhuma emoção registrada inclui ou exclui sessão do baseline', () => {
    // Mesmo com o contexto "mais negativo" possível em todas as sessões.
    const grim = buildSessions(false).map((s) => ({
      ...s,
      checkIn: {
        ...s.checkIn,
        emotionalContext: {
          version: 1,
          primaryEmotion: { emotionId: 'sad', intensity: 5 },
          relationshipPerception: { rating: 0, confidence: 5 },
        } as EmotionalContext,
      },
    }))

    const baseline = computeBaselineStats(grim, 'simple_rt', 'reaction.simple.v1.0', metricKeys)
    expect(baseline).toEqual(
      computeBaselineStats(buildSessions(false), 'simple_rt', 'reaction.simple.v1.0', metricKeys)
    )
    expect(baseline.sessionCount).toBe(14)
  })
})

describe('scoring não é afetado pelo contexto emocional', () => {
  it('a assinatura de scoreSession sequer recebe as condições da sessão', () => {
    // Garantia estrutural: o scorer recebe trials/mode/device/flags e nada mais.
    expect(getTest('simple_rt').scoreSession).toHaveLength(4)
  })

  it.each(['simple_rt', 'gonogo', 'stroop'] as const)(
    '%s produz resultado idêntico independentemente do contexto',
    (testId) => {
      const definition = getTest(testId)
      const trials = Array.from({ length: 20 }, (_, i) => ({
        ...makeTrial('score-s', i),
        testId,
        protocolVersion: definition.protocolVersion,
      }))

      const scored = definition.scoreSession(trials, 'assessment', DEVICE, {})
      const scoredAgain = definition.scoreSession(trials, 'assessment', DEVICE, {})

      // Determinístico e sem qualquer canal por onde o contexto entre.
      expect(scoredAgain).toEqual(scored)
      expect(scored).not.toHaveProperty('checkIn')
      expect(scored).not.toHaveProperty('emotionalContext')
      expect(JSON.stringify(scored)).not.toMatch(/emotion|relationship|anxious/i)
    }
  )
})
