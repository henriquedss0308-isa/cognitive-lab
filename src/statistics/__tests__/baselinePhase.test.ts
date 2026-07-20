import { describe, it, expect } from 'vitest'
import {
  getBaselinePhase,
  getValidAssessmentSessions,
  recomputeStoredBaselinePhases,
} from '../baseline'
import type { SessionRecord, SessionResult } from '../../types'

function makeResult(sessionId: string): SessionResult {
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
      medianCorrectRT: 300,
      meanCorrectRT: 300,
      rtStandardDeviation: 10,
      rtIQR: 10,
      rtCoefficientOfVariation: 0.03,
      p10RT: 280,
      p90RT: 330,
      anticipationRate: 0,
      lapseRate: 0,
      validTrialCount: 40,
      invalidTrialCount: 0,
    },
    accuracyMetrics: { accuracy: 1, correctCount: 40, errorCount: 0, omissionCount: 0, totalTrials: 40 },
    conditionMetrics: {},
    blockMetrics: [],
    customMetrics: {},
    isDemo: false,
    deviceInfo: {
      deviceType: 'desktop',
      inputMethod: 'keyboard',
      screenWidth: 1920,
      screenHeight: 1080,
      browser: 'test',
      userAgent: 'test',
    },
  }
}

function makeSession(n: number, overrides: Partial<SessionRecord> = {}): SessionRecord {
  const id = `s-${String(n).padStart(3, '0')}`
  return {
    sessionId: id,
    testId: 'simple_rt',
    protocolVersion: 'reaction.simple.v1.0',
    mode: 'assessment',
    status: 'completed',
    startedAt: new Date(Date.UTC(2026, 0, n, 12)).toISOString(),
    completedAt: new Date(Date.UTC(2026, 0, n, 12, 10)).toISOString(),
    quality: 'valid',
    flags: {},
    flagMessages: [],
    trials: [],
    deviceInfo: makeResult(id).deviceInfo,
    isDemo: false,
    practiceCompleted: true,
    randomizationSeed: n,
    result: makeResult(id),
    ...overrides,
  }
}

describe('getBaselinePhase — semântica: n = sessões elegíveis ANTERIORES', () => {
  it.each([
    [0, 'familiarization'],
    [1, 'familiarization'],
    [2, 'familiarization'],
    [3, 'baseline_building'],
    [10, 'baseline_building'],
    [11, 'monitoring'],
    [12, 'monitoring'],
  ] as const)('n=%i → %s', (n, expected) => {
    expect(getBaselinePhase(n)).toBe(expected)
  })
})

describe('recomputeStoredBaselinePhases — fronteiras da regra 3/8', () => {
  it('sessões 1–3 = familiarization, 4–11 = building, 12+ = monitoring', () => {
    const sessions = Array.from({ length: 13 }, (_, i) => makeSession(i + 1))
    const phases = recomputeStoredBaselinePhases(sessions)

    expect(phases.get('s-001')).toBe('familiarization')
    expect(phases.get('s-003')).toBe('familiarization')
    expect(phases.get('s-004')).toBe('baseline_building')
    expect(phases.get('s-011')).toBe('baseline_building')
    expect(phases.get('s-012')).toBe('monitoring')
    expect(phases.get('s-013')).toBe('monitoring')
  })

  it('sessão inválida recebe rótulo da posição mas não avança a contagem', () => {
    const sessions = [
      makeSession(1),
      makeSession(2),
      makeSession(3, { quality: 'invalid' }),
      makeSession(4),
      makeSession(5),
    ]
    const phases = recomputeStoredBaselinePhases(sessions)
    // s-003 é inválida: cai onde estaria (após 2 elegíveis → familiarization)
    expect(phases.get('s-003')).toBe('familiarization')
    // s-004 é a 3ª ELEGÍVEL → ainda familiarization
    expect(phases.get('s-004')).toBe('familiarization')
    // s-005 é a 4ª elegível → building
    expect(phases.get('s-005')).toBe('baseline_building')
  })

  it('valid_with_warnings conta como elegível', () => {
    const sessions = [
      makeSession(1),
      makeSession(2),
      makeSession(3, { quality: 'valid_with_warnings' }),
      makeSession(4),
    ]
    const phases = recomputeStoredBaselinePhases(sessions)
    expect(phases.get('s-004')).toBe('baseline_building')
  })

  it('protocolVersions distintas têm contagens independentes', () => {
    const v1 = Array.from({ length: 4 }, (_, i) => makeSession(i + 1))
    const v2 = [makeSession(10, { protocolVersion: 'reaction.simple.v2.0', sessionId: 'v2-1' })]
    const phases = recomputeStoredBaselinePhases([...v1, ...v2])
    expect(phases.get('s-004')).toBe('baseline_building')
    expect(phases.get('v2-1')).toBe('familiarization')
  })

  it('demo, interrompida e sem treino não avançam a contagem', () => {
    const sessions = [
      makeSession(1, { isDemo: true }),
      makeSession(2, { status: 'interrupted', completedAt: undefined, result: undefined }),
      makeSession(3, { flags: { insufficientPractice: true } }),
      makeSession(4),
    ]
    const phases = recomputeStoredBaselinePhases(sessions)
    // s-004 é a PRIMEIRA elegível → familiarization
    expect(phases.get('s-004')).toBe('familiarization')
  })

  it('empate de startedAt desempata por sessionId (determinístico)', () => {
    const t = new Date(Date.UTC(2026, 0, 1, 12)).toISOString()
    const sessions = [
      makeSession(2, { startedAt: t }),
      makeSession(1, { startedAt: t }),
    ]
    const a = recomputeStoredBaselinePhases(sessions)
    const b = recomputeStoredBaselinePhases([...sessions].reverse())
    expect(a.get('s-001')).toBe(b.get('s-001'))
    expect(a.get('s-002')).toBe(b.get('s-002'))
  })

  it('consistência com getValidAssessmentSessions (fonte única)', () => {
    const sessions = Array.from({ length: 12 }, (_, i) => makeSession(i + 1))
    const eligible = getValidAssessmentSessions(sessions, 'simple_rt', 'reaction.simple.v1.0')
    expect(eligible).toHaveLength(12)
    const phases = recomputeStoredBaselinePhases(sessions)
    expect(phases.get(eligible[11].sessionId)).toBe('monitoring')
  })
})
