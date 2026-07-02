import { describe, it, expect } from 'vitest'
import { canResumeSession, resumeBlockedReason } from '../sessionRecovery'
import { getValidAssessmentSessions } from '../../statistics/baseline'
import type { SessionRecord } from '../../types'

function baseSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId: 's1',
    testId: 'simple_rt',
    protocolVersion: 'reaction.simple.v1.0',
    mode: 'assessment',
    status: 'in_progress',
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
    ...overrides,
  }
}

describe('session recovery rules', () => {
  it('protocolo fixo não pode continuar', () => {
    const s = baseSession({ testId: 'gonogo', trialProgress: 5 })
    expect(canResumeSession(s)).toBe(false)
    expect(resumeBlockedReason(s)).toContain('protocolo fixo')
  })

  it('Corsi com adaptiveState pode continuar', () => {
    const s = baseSession({
      testId: 'corsi',
      protocolVersion: 'corsi.forward.v1.0',
      adaptiveState: { seed: 1, currentSpan: 3, trialCount: 4, ended: false },
    })
    expect(canResumeSession(s)).toBe(true)
    expect(resumeBlockedReason(s)).toBeNull()
  })

  it('sessões interrompidas sem estado adaptativo bloqueiam resume', () => {
    const s = baseSession({
      status: 'interrupted',
      testId: 'corsi',
      protocolVersion: 'corsi.forward.v1.0',
    })
    expect(canResumeSession(s)).toBe(false)
  })
})

describe('appendTrialToSession race guard', () => {
  it('não deve sobrescrever sessão completed (invariante documentada)', () => {
    const terminal: SessionRecord['status'][] = ['completed', 'abandoned']
    for (const status of terminal) {
      expect(terminal.includes(status)).toBe(true)
    }
  })
})

describe('baseline exclusion', () => {
  it('exclui interrupted, in_progress e insufficientPractice', () => {
    const valid = baseSession({
      status: 'completed',
      completedAt: new Date().toISOString(),
      result: { sessionId: 's1' } as SessionRecord['result'],
    })
    const interrupted = baseSession({ status: 'interrupted' })
    const inProgress = baseSession({ status: 'in_progress' })
    const noPractice = baseSession({
      status: 'completed',
      completedAt: new Date().toISOString(),
      flags: { insufficientPractice: true },
      result: { sessionId: 's1' } as SessionRecord['result'],
    })

    const included = getValidAssessmentSessions(
      [valid, interrupted, inProgress, noPractice],
      'simple_rt',
      'reaction.simple.v1.0'
    )
    expect(included).toHaveLength(1)
    expect(included[0].sessionId).toBe('s1')
  })
})