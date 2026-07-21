import { describe, expect, it } from 'vitest'
import { buildTrendPoints, selectTrendSessions } from '../../components/charts/chartSelectors'
import { buildContextualReference } from '../../features/context-aware-baseline/contextualReference'
import { computeBaselineStats, getValidAssessmentSessions } from '../../statistics/baseline'
import { MIN_BASELINE_N, evaluatePrimaryZ } from '../../statistics/zscore'
import { TEST_MAP } from '../../tests/registry'
import type { SessionQuality, SessionRecord } from '../../types'

const CORSI = TEST_MAP.corsi
const PROTOCOL = CORSI.protocolVersion
const LEGACY = 'sdt-hautus-1'
const CURRENT = 'sdt-hautus-1;corsi-replay-1'
const DEVICE: SessionRecord['deviceInfo'] = {
  deviceType: 'desktop',
  inputMethod: 'mouse',
  screenWidth: 1280,
  screenHeight: 800,
  browser: 'test',
  userAgent: 'anonymous-test',
}

interface CorsiSpec {
  id: string
  order: number
  scoringVersion?: string
  confirmedSpan?: number
  quality?: SessionQuality
  medication?: 'taken' | 'not_taken' | 'unknown'
  replayUnderCurrentRules?: number
}

function corsiSession({
  id,
  order,
  scoringVersion,
  confirmedSpan = 5,
  quality = 'valid',
  medication = 'unknown',
  replayUnderCurrentRules,
}: CorsiSpec): SessionRecord {
  const startedAt = new Date(Date.UTC(2026, 0, 1, 10, order)).toISOString()
  const completedAt = new Date(Date.UTC(2026, 0, 1, 10, order + 1)).toISOString()
  return {
    sessionId: id,
    testId: 'corsi',
    protocolVersion: PROTOCOL,
    mode: 'assessment',
    status: 'completed',
    startedAt,
    completedAt,
    quality,
    flags: {},
    flagMessages: quality === 'valid_with_warnings' ? ['aviso anônimo'] : [],
    trials: replayUnderCurrentRules
      ? [
          {
            trialId: `${id}-trial`,
            sessionId: id,
            testId: 'corsi',
            protocolVersion: PROTOCOL,
            mode: 'assessment',
            blockIndex: 0,
            trialIndex: 0,
            condition: 'forward',
            stimulus: '[]',
            expectedResponse: '',
            actualResponse: '',
            correct: true,
            reactionTimeMs: 900,
            stimulusOnsetTimestamp: 0,
            responseTimestamp: 900,
            windowFocused: true,
            visibilityState: 'visible',
            deviceType: 'desktop',
            inputMethod: 'mouse',
            metadata: { replayUnderCurrentRules },
          },
        ]
      : [],
    checkIn:
      medication === 'unknown'
        ? undefined
        : { medications: { lisdexamfetamine: { status: medication } } },
    deviceInfo: DEVICE,
    isDemo: false,
    practiceCompleted: true,
    randomizationSeed: order,
    result: {
      sessionId: id,
      testId: 'corsi',
      protocolVersion: PROTOCOL,
      mode: 'assessment',
      startedAt,
      completedAt,
      quality,
      flags: {},
      flagMessages: quality === 'valid_with_warnings' ? ['aviso anônimo'] : [],
      rtMetrics: {
        medianCorrectRT: 900 + order,
        meanCorrectRT: 900 + order,
        rtStandardDeviation: 10,
        rtIQR: 10,
        rtCoefficientOfVariation: 0.01,
        p10RT: 880,
        p90RT: 920,
        anticipationRate: 0,
        lapseRate: 0,
        validTrialCount: 1,
        invalidTrialCount: 0,
      },
      accuracyMetrics: {
        accuracy: 1,
        correctCount: 1,
        errorCount: 0,
        omissionCount: 0,
        totalTrials: 1,
      },
      conditionMetrics: { forward: { confirmedSpan } },
      blockMetrics: [],
      customMetrics: { confirmedSpan },
      isDemo: false,
      deviceInfo: DEVICE,
      scoringVersion,
    },
  }
}

function series(
  count: number,
  prefix: string,
  scoringVersion: string,
  startOrder = 1,
  extra: Partial<CorsiSpec> = {}
): SessionRecord[] {
  return Array.from({ length: count }, (_, index) =>
    corsiSession({
      id: `${prefix}-${index + 1}`,
      order: startOrder + index,
      scoringVersion,
      confirmedSpan: 4 + (index % 3),
      ...extra,
    })
  )
}

describe('isolamento longitudinal por scoringVersion', () => {
  it('baseline Corsi não mistura legacy e current', () => {
    const legacy = series(11, 'legacy', LEGACY)
    const current = series(1, 'current', CURRENT, 20)
    const stats = computeBaselineStats(
      [...legacy, ...current],
      'corsi',
      PROTOCOL,
      ['confirmedSpan'],
      CURRENT
    )

    expect(stats.sessionCount).toBe(1)
    expect(stats.familiarizationCount).toBe(1)
    expect(stats.baselineCount).toBe(0)
    expect(stats.metrics.confirmedSpan.n).toBe(0)
    expect(stats.incompatibleScoringCount).toBe(11)
  })

  it('baseline contextual não usa sessões legacy para completar a janela current', () => {
    const legacyTaken = series(11, 'legacy', LEGACY, 1, { medication: 'taken' })
    const currentFamiliarization = series(3, 'current-fam', CURRENT, 20)
    const currentTaken = series(1, 'current-taken', CURRENT, 30, { medication: 'taken' })
    const reference = buildContextualReference(
      [...legacyTaken, ...currentFamiliarization, ...currentTaken],
      'corsi',
      PROTOCOL,
      ['confirmedSpan'],
      'taken',
      CURRENT
    )

    expect(reference.sessions.map((session) => session.sessionId)).toEqual(['current-taken-1'])
    expect(reference.metadata.composition).toBe('building')
    expect(reference.stats.incompatibleScoringCount).toBe(11)
  })

  it('z da sessão current rejeita explicitamente um baseline legacy', () => {
    const legacy = series(11, 'legacy', LEGACY)
    const legacyBaseline = computeBaselineStats(
      legacy,
      'corsi',
      PROTOCOL,
      ['confirmedSpan'],
      LEGACY
    )
    const current = corsiSession({
      id: 'current-z',
      order: 30,
      scoringVersion: CURRENT,
      confirmedSpan: 6,
    })

    expect(evaluatePrimaryZ(6, legacyBaseline, CORSI, current)).toEqual({
      kind: 'incompatible_series',
    })
  })

  it('janela current não atinge MIN_BASELINE_N com valores legacy', () => {
    const legacy = series(12, 'legacy', LEGACY)
    const current = series(8, 'current', CURRENT, 20)
    const stats = computeBaselineStats(
      [...legacy, ...current],
      'corsi',
      PROTOCOL,
      ['confirmedSpan'],
      CURRENT
    )

    expect(stats.metrics.confirmedSpan.n).toBe(5)
    expect(stats.metrics.confirmedSpan.n).toBeLessThan(MIN_BASELINE_N)
    expect(stats.incompatibleScoringCount).toBe(12)
  })

  it('gráfico seleciona uma única série e não cria segmento legacy→current', () => {
    const legacy = series(6, 'legacy', LEGACY)
    const current = series(1, 'current', CURRENT, 20)
    const selection = selectTrendSessions([...legacy, ...current], current[0])
    const points = buildTrendPoints(selection.sessions, 'confirmedSpan')

    expect(selection.sessions.map((session) => session.sessionId)).toEqual(['current-1'])
    expect(selection.hiddenOtherScoringVersions).toBe(6)
    expect(points).toHaveLength(1)
    expect(new Set(points.map((point) => point.scoringVersion))).toEqual(new Set([CURRENT]))
  })

  it('sessão inválida continua fora de baseline e gráfico', () => {
    const valid = series(3, 'valid', CURRENT)
    const invalid = corsiSession({
      id: 'invalid-current',
      order: 10,
      scoringVersion: CURRENT,
      quality: 'invalid',
    })

    expect(getValidAssessmentSessions([...valid, invalid], 'corsi', PROTOCOL, CURRENT)).toHaveLength(3)
    const trend = selectTrendSessions([...valid, invalid], valid[0])
    expect(trend.sessions).toHaveLength(3)
    expect(trend.hiddenInvalid).toBe(1)
  })

  it('valid_with_warnings mantém elegibilidade e composição existentes', () => {
    const sessions = [
      ...series(3, 'fam', CURRENT),
      corsiSession({
        id: 'warning-current',
        order: 10,
        scoringVersion: CURRENT,
        quality: 'valid_with_warnings',
      }),
    ]
    const stats = computeBaselineStats(
      sessions,
      'corsi',
      PROTOCOL,
      ['confirmedSpan'],
      CURRENT
    )

    expect(stats.sessionCount).toBe(4)
    expect(stats.baselineCount).toBe(1)
    expect(stats.warningCount).toBe(1)
  })

  it('familiarização é contada separadamente por scoringVersion', () => {
    const legacy = series(3, 'legacy', LEGACY)
    const current = series(3, 'current', CURRENT, 10)
    const universe = [...legacy, ...current]

    const legacyStats = computeBaselineStats(
      universe,
      'corsi',
      PROTOCOL,
      ['confirmedSpan'],
      LEGACY
    )
    const currentStats = computeBaselineStats(
      universe,
      'corsi',
      PROTOCOL,
      ['confirmedSpan'],
      CURRENT
    )
    expect(legacyStats.familiarizationCount).toBe(3)
    expect(currentStats.familiarizationCount).toBe(3)
    expect(legacyStats.baselineCount).toBe(0)
    expect(currentStats.baselineCount).toBe(0)
  })

  it('reproduz 6 legacy + 1 current sem reprocessar valores persistidos', () => {
    const legacy = series(6, 'anonymous-legacy', LEGACY).map((session, index) => {
      if (index < 3) {
        session.result!.customMetrics.confirmedSpan = 5
        session.result!.conditionMetrics.forward.confirmedSpan = 5
        session.trials = corsiSession({
          id: session.sessionId,
          order: index + 1,
          scoringVersion: LEGACY,
          replayUnderCurrentRules: 6,
        }).trials
      }
      return session
    })
    const current = corsiSession({
      id: 'anonymous-current-1',
      order: 20,
      scoringVersion: CURRENT,
      confirmedSpan: 6,
    })
    const universe = [...legacy, current]

    const stats = computeBaselineStats(
      universe,
      'corsi',
      PROTOCOL,
      ['confirmedSpan'],
      CURRENT
    )
    const trend = selectTrendSessions(universe, current)

    expect(stats.phase).toBe('familiarization')
    expect(stats.sessionCount).toBe(1)
    expect(stats.incompatibleScoringCount).toBe(6)
    expect(trend.sessions.map((session) => session.sessionId)).toEqual([
      'anonymous-current-1',
    ])
    expect(legacy.slice(0, 3).map((session) => session.result!.customMetrics.confirmedSpan)).toEqual([
      5,
      5,
      5,
    ])
    expect(
      legacy.slice(0, 3).map((session) => session.trials[0].metadata?.replayUnderCurrentRules)
    ).toEqual([6, 6, 6])
  })
})
