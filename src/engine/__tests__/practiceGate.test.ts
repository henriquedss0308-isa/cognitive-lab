import { describe, it, expect } from 'vitest'
import { evaluatePractice, DEFAULT_PRACTICE_CRITERIA } from '../practiceGate'
import type { TrialRecord } from '../../types'

function trial(correct: boolean, invalidReason?: string): TrialRecord {
  return {
    trialId: 't',
    sessionId: 's',
    testId: 'gonogo',
    protocolVersion: 'gonogo.standard.v1.0',
    mode: 'training',
    blockIndex: 0,
    trialIndex: 0,
    condition: 'go',
    stimulus: 'g',
    expectedResponse: 'space',
    actualResponse: correct ? 'space' : 'none',
    correct,
    reactionTimeMs: correct ? 400 : null,
    stimulusOnsetTimestamp: 0,
    responseTimestamp: correct ? 400 : null,
    windowFocused: true,
    visibilityState: 'visible',
    deviceType: 'desktop',
    inputMethod: 'keyboard',
    invalidReason,
  }
}

describe('evaluatePractice', () => {
  it('reprova precisão abaixo do mínimo', () => {
    const trials = [trial(true), trial(false), trial(false), trial(true)]
    const r = evaluatePractice(trials, DEFAULT_PRACTICE_CRITERIA)
    expect(r.passed).toBe(false)
    expect(r.accuracy).toBe(0.5)
    expect(r.errors.length).toBeGreaterThan(0)
  })

  it('aprova quando critério atingido', () => {
    const trials = Array.from({ length: 4 }, () => trial(true))
    const r = evaluatePractice(trials, DEFAULT_PRACTICE_CRITERIA)
    expect(r.passed).toBe(true)
  })

  it('lista tipos de erro para repetição do treino', () => {
    const trials = [
      trial(false, 'omission'),
      trial(false, 'commission'),
      trial(true),
      trial(true),
    ]
    const r = evaluatePractice(trials, { minAccuracy: 0.9, minValidTrials: 4 })
    expect(r.passed).toBe(false)
    expect(r.errors.some((e) => e.kind === 'omission')).toBe(true)
    expect(r.errors.some((e) => e.kind === 'commission')).toBe(true)
  })
})