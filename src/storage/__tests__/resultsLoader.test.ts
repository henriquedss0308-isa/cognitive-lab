import { describe, it, expect, vi } from 'vitest'
import { loadResultsSession } from '../resultsLoader'
import type { SessionRecord } from '../../types'

function sessionWithResult(id: string): SessionRecord {
  return {
    sessionId: id,
    testId: 'taskswitch',
    protocolVersion: 'taskswitch.standard.v1.0',
    mode: 'assessment',
    status: 'completed',
    startedAt: new Date().toISOString(),
    quality: 'valid',
    flags: {},
    flagMessages: [],
    trials: [],
    deviceInfo: {
      deviceType: 'desktop',
      inputMethod: 'keyboard',
      screenWidth: 1920,
      screenHeight: 1080,
      browser: 'test',
      userAgent: 'test',
    },
    isDemo: false,
    practiceCompleted: true,
    randomizationSeed: 1,
    result: {
      sessionId: id,
      testId: 'taskswitch',
      protocolVersion: 'taskswitch.standard.v1.0',
      mode: 'assessment',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      quality: 'valid',
      flags: {},
      flagMessages: [],
      rtMetrics: {
        medianCorrectRT: 400,
        meanCorrectRT: 400,
        rtStandardDeviation: 50,
        rtIQR: 60,
        rtCoefficientOfVariation: 0.1,
        p10RT: 350,
        p90RT: 450,
        anticipationRate: 0,
        lapseRate: 0,
        validTrialCount: 10,
        invalidTrialCount: 0,
      },
      accuracyMetrics: {
        accuracy: 0.9,
        correctCount: 9,
        errorCount: 1,
        omissionCount: 0,
        totalTrials: 10,
      },
      conditionMetrics: {},
      blockMetrics: [],
      customMetrics: { switchCostRT: 50 },
      isDemo: false,
      deviceInfo: {
        deviceType: 'desktop',
        inputMethod: 'keyboard',
        screenWidth: 1920,
        screenHeight: 1080,
        browser: 'test',
        userAgent: 'test',
      },
    },
  }
}

describe('loadResultsSession', () => {
  it('permanece loading enquanto appLoading sem sessão no banco', async () => {
    const outcome = await loadResultsSession('id-1', {
      getSession: vi.fn().mockResolvedValue(undefined),
      appLoading: true,
    })
    expect(outcome.state).toBe('loading')
  })

  it('found via IndexedDB quando contexto ainda não hidratou', async () => {
    const s = sessionWithResult('id-1')
    const outcome = await loadResultsSession('id-1', {
      getSession: vi.fn().mockResolvedValue(s),
      getFromContext: () => undefined,
      appLoading: false,
    })
    expect(outcome.state).toBe('found')
    expect(outcome.session?.sessionId).toBe('id-1')
  })

  it('not_found somente após consulta concluída', async () => {
    const outcome = await loadResultsSession('missing', {
      getSession: vi.fn().mockResolvedValue(undefined),
      appLoading: false,
    })
    expect(outcome.state).toBe('not_found')
  })

  it('retry único após refresh quando necessário', async () => {
    const s = sessionWithResult('id-2')
    const getSession = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(s)
    const refresh = vi.fn().mockResolvedValue(undefined)

    const outcome = await loadResultsSession('id-2', {
      getSession,
      appLoading: false,
      retryAfterRefresh: refresh,
    })

    expect(refresh).toHaveBeenCalledOnce()
    expect(getSession).toHaveBeenCalledTimes(2)
    expect(outcome.state).toBe('found')
  })
})