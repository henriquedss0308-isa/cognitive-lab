import { describe, expect, it } from 'vitest'
import { buildTrendPoints, selectTrendSessions } from '../../components/charts/chartSelectors'
import { getLongitudinalSeriesKey } from '../../longitudinal/series'
import { computeBaselineStats } from '../../statistics/baseline'
import { evaluatePrimaryZ } from '../../statistics/zscore'
import { TEST_MAP } from '../../tests/registry'
import type { DeviceInfo, SessionRecord, SessionResult } from '../../types'
import { PREONSET_EXCLUSION_SCORING_VERSION } from '../stimulusEligibility'

const LEGACY = 'sdt-hautus-1'
const CURRENT = PREONSET_EXCLUSION_SCORING_VERSION
const DEVICE: DeviceInfo = {
  deviceType: 'desktop',
  inputMethod: 'keyboard',
  screenWidth: 1920,
  screenHeight: 1080,
  browser: 'test',
  userAgent: 'anonymous-test',
}

function scoreVersion(testId: 'gonogo' | 'nback' | 'sart') {
  return TEST_MAP[testId].scoreSession([], 'assessment', DEVICE, {}).scoringVersion
}

function gonogoSession(index: number, scoringVersion: string): SessionRecord {
  const id = `gonogo-${scoringVersion}-${index}`
  const startedAt = new Date(Date.UTC(2026, 0, index + 1)).toISOString()
  const completedAt = new Date(Date.UTC(2026, 0, index + 1, 0, 1)).toISOString()
  const scored = TEST_MAP.gonogo.scoreSession([], 'assessment', DEVICE, {})
  const result: SessionResult = {
    ...scored,
    sessionId: id,
    startedAt,
    completedAt,
    quality: 'valid',
    flags: {},
    flagMessages: [],
    customMetrics: { ...scored.customMetrics, dPrime: 1 + index / 10 },
    isDemo: false,
    scoringVersion,
  }
  return {
    sessionId: id,
    testId: 'gonogo',
    protocolVersion: TEST_MAP.gonogo.protocolVersion,
    mode: 'assessment',
    status: 'completed',
    startedAt,
    completedAt,
    quality: 'valid',
    flags: {},
    flagMessages: [],
    result,
    trials: [],
    deviceInfo: DEVICE,
    isDemo: false,
    practiceCompleted: true,
    randomizationSeed: index,
  }
}

describe('scoringVersion da política pré-onset', () => {
  it.each(['gonogo', 'nback', 'sart'] as const)(
    '%s retorna e declara a mesma nova versão',
    (testId) => {
      expect(scoreVersion(testId)).toBe(CURRENT)
      expect(TEST_MAP[testId].scoringVersion).toBe(CURRENT)
    }
  )

  it('Corsi permanece na versão composta anterior', () => {
    expect(TEST_MAP.corsi.scoringVersion).toBe('sdt-hautus-1;corsi-replay-1')
  })

  it('testes não afetados mantêm sua scoringVersion', () => {
    expect(
      Object.fromEntries(
        ['simple_rt', 'choice_rt', 'stroop', 'taskswitch'].map((id) => [
          id,
          TEST_MAP[id as keyof typeof TEST_MAP].scoringVersion,
        ])
      )
    ).toEqual({
      simple_rt: LEGACY,
      choice_rt: LEGACY,
      stroop: LEGACY,
      taskswitch: LEGACY,
    })
  })
})

describe('isolamento longitudinal antigo × preonset-exclusion-1', () => {
  const legacy = Array.from({ length: 11 }, (_, index) => gonogoSession(index, LEGACY))
  const current = gonogoSession(20, CURRENT)

  it('sessões antigas e novas têm identidades de série distintas', () => {
    expect(getLongitudinalSeriesKey(legacy[0])).not.toBe(getLongitudinalSeriesKey(current))
  })

  it('baseline antigo não completa a familiarização da série nova', () => {
    const stats = computeBaselineStats(
      [...legacy, current],
      'gonogo',
      TEST_MAP.gonogo.protocolVersion,
      ['dPrime'],
      CURRENT
    )
    expect(stats.sessionCount).toBe(1)
    expect(stats.familiarizationCount).toBe(1)
    expect(stats.baselineCount).toBe(0)
    expect(stats.incompatibleScoringCount).toBe(11)
  })

  it('z novo rejeita referência construída pela versão antiga', () => {
    const legacyBaseline = computeBaselineStats(
      legacy,
      'gonogo',
      TEST_MAP.gonogo.protocolVersion,
      ['dPrime'],
      LEGACY
    )
    expect(evaluatePrimaryZ(2, legacyBaseline, TEST_MAP.gonogo, current)).toEqual({
      kind: 'incompatible_series',
    })
  })

  it('gráfico não conecta sessões antigas à série nova', () => {
    const selection = selectTrendSessions([...legacy, current], current)
    const points = buildTrendPoints(selection.sessions, 'dPrime')
    expect(selection.sessions.map((session) => session.sessionId)).toEqual([current.sessionId])
    expect(selection.hiddenOtherScoringVersions).toBe(11)
    expect(points).toHaveLength(1)
    expect(points[0].scoringVersion).toBe(CURRENT)
  })
})
