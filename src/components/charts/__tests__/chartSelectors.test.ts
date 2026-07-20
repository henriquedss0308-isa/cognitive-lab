import { describe, it, expect } from 'vitest'
import { selectTrendSessions } from '../chartSelectors'
import type { SessionRecord, SessionResult } from '../../../types'

function makeSession(n: number, overrides: Partial<SessionRecord> = {}): SessionRecord {
  const id = `s-${n}`
  const result = {
    sessionId: id,
    testId: 'simple_rt',
    protocolVersion: 'reaction.simple.v1.0',
    mode: 'assessment',
    startedAt: '',
    completedAt: '',
    quality: 'valid',
    flags: {},
    flagMessages: [],
    rtMetrics: {
      medianCorrectRT: 300 + n,
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
    accuracyMetrics: { accuracy: 0.95, correctCount: 38, errorCount: 2, omissionCount: 0, totalTrials: 40 },
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
  } as SessionResult

  return {
    sessionId: id,
    testId: 'simple_rt',
    protocolVersion: 'reaction.simple.v1.0',
    mode: 'assessment',
    status: 'completed',
    startedAt: new Date(Date.UTC(2026, 0, n)).toISOString(),
    completedAt: new Date(Date.UTC(2026, 0, n, 1)).toISOString(),
    quality: 'valid',
    flags: {},
    flagMessages: [],
    trials: [],
    deviceInfo: result.deviceInfo,
    isDemo: false,
    practiceCompleted: true,
    randomizationSeed: n,
    result,
    ...overrides,
  }
}

describe('selectTrendSessions (spec §5/§6)', () => {
  it('sessões invalid ficam fora da série e são contadas', () => {
    const sel = selectTrendSessions([
      makeSession(1),
      makeSession(2, { quality: 'invalid' }),
      makeSession(3),
    ])
    expect(sel.sessions.map((s) => s.sessionId)).toEqual(['s-1', 's-3'])
    expect(sel.hiddenInvalid).toBe(1)
  })

  it('demo e treino nunca aparecem', () => {
    const sel = selectTrendSessions([
      makeSession(1, { isDemo: true }),
      makeSession(2, { mode: 'training' }),
      makeSession(3),
    ])
    expect(sel.sessions.map((s) => s.sessionId)).toEqual(['s-3'])
  })

  it('sessões sem result ficam fora', () => {
    const sel = selectTrendSessions([makeSession(1, { result: undefined }), makeSession(2)])
    expect(sel.sessions.map((s) => s.sessionId)).toEqual(['s-2'])
  })

  it('apenas a protocolVersion mais recente entra na série; as demais são contadas', () => {
    const sel = selectTrendSessions([
      makeSession(1, { protocolVersion: 'reaction.simple.v0.9' }),
      makeSession(2, { protocolVersion: 'reaction.simple.v0.9' }),
      makeSession(3),
      makeSession(4),
    ])
    expect(sel.protocolVersion).toBe('reaction.simple.v1.0')
    expect(sel.sessions.map((s) => s.sessionId)).toEqual(['s-3', 's-4'])
    expect(sel.hiddenOtherVersions).toBe(2)
  })

  it('ordenação crescente por startedAt', () => {
    const sel = selectTrendSessions([makeSession(5), makeSession(2), makeSession(9)])
    expect(sel.sessions.map((s) => s.sessionId)).toEqual(['s-2', 's-5', 's-9'])
  })

  it('lista vazia é bem comportada', () => {
    const sel = selectTrendSessions([])
    expect(sel.sessions).toEqual([])
    expect(sel.protocolVersion).toBeNull()
  })
})
