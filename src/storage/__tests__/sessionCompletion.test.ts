import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  assertSessionId,
  completeAssessmentSession,
  SessionPersistenceError,
} from '../sessionCompletion'
import type { SessionRecord } from '../../types'
import { testDefinition as taskswitch } from '../../tests/taskswitch'
import { detectDevice } from '../../utils/device'

const saveSession = vi.fn()
const getSession = vi.fn()

vi.mock('../repository', () => ({
  saveSession: (...args: unknown[]) => saveSession(...args),
  getSession: (...args: unknown[]) => getSession(...args),
}))

function makeCompletedSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  const device = detectDevice()
  const trials = taskswitch.generateTrials('assessment', 42).slice(0, 20).map((g, i) => ({
    trialId: `t-${i}`,
    sessionId: 'sess-abc',
    testId: 'taskswitch' as const,
    protocolVersion: taskswitch.protocolVersion,
    mode: 'assessment' as const,
    blockIndex: g.blockIndex,
    trialIndex: g.trialIndex,
    condition: g.condition,
    stimulus: g.stimulus,
    expectedResponse: g.expectedResponse,
    actualResponse: g.expectedResponse,
    correct: true,
    reactionTimeMs: 400,
    stimulusOnsetTimestamp: 1000 + i,
    responseTimestamp: 1400 + i,
    windowFocused: true,
    visibilityState: 'visible' as const,
    deviceType: device.deviceType,
    inputMethod: 'keyboard',
    metadata: g.metadata,
  }))

  const scored = taskswitch.scoreSession(trials, 'assessment', device, {})
  return {
    sessionId: 'sess-abc',
    testId: 'taskswitch',
    protocolVersion: taskswitch.protocolVersion,
    mode: 'assessment',
    status: 'completed',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    quality: scored.quality,
    flags: scored.flags,
    flagMessages: scored.flagMessages,
    trials,
    deviceInfo: device,
    isDemo: false,
    practiceCompleted: true,
    randomizationSeed: 42,
    result: {
      ...scored,
      sessionId: 'sess-abc',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      isDemo: false,
    },
    ...overrides,
  }
}

describe('assertSessionId', () => {
  it('rejeita ID indefinido', () => {
    expect(() => assertSessionId(makeCompletedSession(), '')).toThrow(SessionPersistenceError)
  })

  it('rejeita ID divergente', () => {
    const s = makeCompletedSession({ sessionId: 'other' })
    expect(() => assertSessionId(s, 'sess-abc')).toThrow(/inconsistente/)
  })
})

describe('completeAssessmentSession', () => {
  beforeEach(() => {
    saveSession.mockReset()
    getSession.mockReset()
  })

  it('salva e confirma leitura imediata pelo mesmo sessionId', async () => {
    const session = makeCompletedSession()
    getSession.mockResolvedValueOnce(session)

    const verified = await completeAssessmentSession(session)

    expect(saveSession).toHaveBeenCalledOnce()
    expect(getSession).toHaveBeenCalledWith('sess-abc')
    expect(verified.sessionId).toBe('sess-abc')
    expect(verified.result).toBeDefined()
  })

  it('falha se leitura não retorna result — impede navegação', async () => {
    const session = makeCompletedSession()
    getSession.mockResolvedValueOnce({ ...session, result: undefined })

    await expect(completeAssessmentSession(session)).rejects.toThrow(/sem result/)
  })

  it('Task Switching com poucos RT válidos ainda persiste', async () => {
    const session = makeCompletedSession()
    session.result!.customMetrics.switchCostRT = null
    session.result!.customMetrics.mixingCostRT = null
    getSession.mockResolvedValueOnce(session)

    const verified = await completeAssessmentSession(session)
    expect(verified.result?.customMetrics.switchCostRT).toBeNull()
  })

  it('Task Switching com NaN nas métricas é sanitizado no save', async () => {
    const session = makeCompletedSession()
    session.result!.customMetrics.switchCostRT = NaN as unknown as null
    getSession.mockImplementation(async () => {
      const saved = saveSession.mock.calls[0][0] as SessionRecord
      expect(saved.result?.customMetrics.switchCostRT).toBeNull()
      return { ...session, ...saved }
    })

    await completeAssessmentSession(session)
    expect(saveSession).toHaveBeenCalled()
  })
})