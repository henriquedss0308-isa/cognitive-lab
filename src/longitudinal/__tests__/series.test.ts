import { describe, expect, it } from 'vitest'
import { getValidAssessmentSessions } from '../../statistics/baseline'
import type { SessionRecord, TestId } from '../../types'
import {
  LEGACY_UNVERSIONED_SCORING_VERSION,
  getLongitudinalSeriesIdentity,
  getLongitudinalSeriesKey,
  normalizeScoringVersion,
  type LongitudinalSeriesSource,
} from '../series'

const PROTOCOL = 'corsi.forward.v1.0'
const LEGACY_CORSI = 'sdt-hautus-1'
const CURRENT_CORSI = 'sdt-hautus-1;corsi-replay-1'

function source(
  scoringVersion?: unknown,
  testId: TestId = 'corsi',
  protocolVersion = PROTOCOL
): LongitudinalSeriesSource {
  return { testId, protocolVersion, result: { scoringVersion } }
}

function oldImportedSession(): SessionRecord {
  const session = source(undefined) as Pick<SessionRecord, 'testId' | 'protocolVersion'>
  return {
    ...session,
    sessionId: 'anonymous-import-1',
    mode: 'assessment',
    status: 'completed',
    startedAt: '2025-01-01T10:00:00.000Z',
    completedAt: '2025-01-01T10:05:00.000Z',
    quality: 'valid',
    flags: {},
    flagMessages: [],
    trials: [],
    deviceInfo: {
      deviceType: 'desktop',
      inputMethod: 'mouse',
      screenWidth: 1280,
      screenHeight: 800,
      browser: 'test',
      userAgent: 'test',
    },
    isDemo: false,
    practiceCompleted: true,
    randomizationSeed: 1,
    result: {
      sessionId: 'anonymous-import-1',
      testId: 'corsi',
      protocolVersion: PROTOCOL,
      mode: 'assessment',
      startedAt: '2025-01-01T10:00:00.000Z',
      completedAt: '2025-01-01T10:05:00.000Z',
      quality: 'valid',
      flags: {},
      flagMessages: [],
      rtMetrics: {
        medianCorrectRT: 900,
        meanCorrectRT: 900,
        rtStandardDeviation: 0,
        rtIQR: 0,
        rtCoefficientOfVariation: 0,
        p10RT: 900,
        p90RT: 900,
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
      conditionMetrics: {},
      blockMetrics: [],
      customMetrics: { confirmedSpan: 5 },
      isDemo: false,
      deviceInfo: {
        deviceType: 'desktop',
        inputMethod: 'mouse',
        screenWidth: 1280,
        screenHeight: 800,
        browser: 'test',
        userAgent: 'test',
      },
      // Importação antiga válida: scoringVersion legitimamente ausente.
    },
  }
}

describe('identidade longitudinal canônica', () => {
  it('mesmo teste, protocolo e scoringVersion formam a mesma série', () => {
    expect(getLongitudinalSeriesKey(source(CURRENT_CORSI))).toBe(
      getLongitudinalSeriesKey(source(CURRENT_CORSI))
    )
  })

  it('scoringVersion diferente separa séries do mesmo teste e protocolo', () => {
    expect(getLongitudinalSeriesKey(source(LEGACY_CORSI))).not.toBe(
      getLongitudinalSeriesKey(source(CURRENT_CORSI))
    )
  })

  it('duas ausências formam juntas a série legacy-unversioned', () => {
    expect(getLongitudinalSeriesKey(source(undefined))).toBe(
      getLongitudinalSeriesKey(source(undefined))
    )
    expect(getLongitudinalSeriesIdentity(source(undefined)).scoringVersion).toBe(
      LEGACY_UNVERSIONED_SCORING_VERSION
    )
  })

  it('ausência e versão atual nunca formam a mesma série', () => {
    expect(getLongitudinalSeriesKey(source(undefined))).not.toBe(
      getLongitudinalSeriesKey(source(CURRENT_CORSI))
    )
  })

  it('protocolo diferente separa séries', () => {
    expect(getLongitudinalSeriesKey(source(CURRENT_CORSI))).not.toBe(
      getLongitudinalSeriesKey(source(CURRENT_CORSI, 'corsi', 'corsi.forward.v2.0'))
    )
  })

  it('testId diferente separa séries', () => {
    expect(getLongitudinalSeriesKey(source('sdt-hautus-1'))).not.toBe(
      getLongitudinalSeriesKey(source('sdt-hautus-1', 'simple_rt'))
    )
  })

  it('Corsi legacy e current ficam explicitamente separados', () => {
    expect(getLongitudinalSeriesIdentity(source(LEGACY_CORSI)).scoringVersion).toBe(
      LEGACY_CORSI
    )
    expect(getLongitudinalSeriesIdentity(source(CURRENT_CORSI)).scoringVersion).toBe(
      CURRENT_CORSI
    )
    expect(getLongitudinalSeriesKey(source(LEGACY_CORSI))).not.toBe(
      getLongitudinalSeriesKey(source(CURRENT_CORSI))
    )
  })

  it('string vazia é legacy-unversioned', () => {
    expect(normalizeScoringVersion('')).toBe(LEGACY_UNVERSIONED_SCORING_VERSION)
  })

  it('espaços externos são normalizados sem alterar a versão composta', () => {
    expect(normalizeScoringVersion(`  ${CURRENT_CORSI}  `)).toBe(CURRENT_CORSI)
    expect(getLongitudinalSeriesKey(source(`  ${CURRENT_CORSI}  `))).toBe(
      getLongitudinalSeriesKey(source(CURRENT_CORSI))
    )
  })

  it('resultado ausente é classificado com estabilidade como legacy-unversioned', () => {
    const noResult = { testId: 'corsi' as const, protocolVersion: PROTOCOL }
    expect(getLongitudinalSeriesIdentity(noResult).scoringVersion).toBe(
      LEGACY_UNVERSIONED_SCORING_VERSION
    )
  })

  it('importação antiga válida sem scoringVersion permanece elegível apenas no legado', () => {
    const imported = oldImportedSession()
    expect(getValidAssessmentSessions([imported], 'corsi', PROTOCOL)).toEqual([imported])
    expect(
      getValidAssessmentSessions([imported], 'corsi', PROTOCOL, CURRENT_CORSI)
    ).toEqual([])
  })
})
