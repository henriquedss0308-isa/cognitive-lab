import { describe, it, expect } from 'vitest'
import { median, mad, robustZScore } from '../basic'
import { computeSDT } from '../signalDetection'
import { stroopCostRT, switchCost, mixingCost } from '../costs'
import { computeRTMetrics, isOmissionTrial } from '../rtProcessing'
import { validateSession } from '../../scoring/sessionValidation'
import type { TrialRecord } from '../../types'

function makeTrial(overrides: Partial<TrialRecord>): TrialRecord {
  return {
    trialId: 't1',
    sessionId: 's1',
    testId: 'simple_rt',
    protocolVersion: 'reaction.simple.v1.0',
    mode: 'assessment',
    blockIndex: 0,
    trialIndex: 0,
    condition: 'simple',
    stimulus: 'go',
    expectedResponse: 'space',
    actualResponse: 'space',
    correct: true,
    reactionTimeMs: 300,
    stimulusOnsetTimestamp: 0,
    responseTimestamp: 300,
    windowFocused: true,
    visibilityState: 'visible',
    deviceType: 'desktop',
    inputMethod: 'keyboard',
    ...overrides,
  }
}

describe('median', () => {
  it('returns null for empty', () => expect(median([])).toBeNull())
  it('computes odd length', () => expect(median([1, 3, 2])).toBe(2))
  it('computes even length', () => expect(median([1, 2, 3, 4])).toBe(2.5))
})

describe('mad', () => {
  it('returns null for empty', () => expect(mad([])).toBeNull())
  it('returns zero for identical values', () => expect(mad([5, 5, 5])).toBe(0))
})

describe('robustZScore', () => {
  it('returns null when MAD is zero', () => {
    expect(robustZScore(10, 10, 0, -1)).toBeNull()
  })
  it('computes z-score', () => {
    const z = robustZScore(400, 300, 50, -1)
    expect(z).toBeCloseTo(-1.35, 1)
  })
})

describe('computeSDT (Hautus log-linear correction)', () => {
  it('handles 0 hits (zero hits)', () => {
    const r = computeSDT({ hits: 0, misses: 10, falseAlarms: 2, correctRejections: 18 })
    expect(r.hitRate).toBe(0) // raw hit rate
    expect(r.dPrime).toBeLessThan(0)
    expect(r.dPrime).not.toBeNull()
  })

  it('handles all hits', () => {
    const r = computeSDT({ hits: 10, misses: 0, falseAlarms: 2, correctRejections: 18 })
    expect(r.hitRate).toBe(1) // raw hit rate
    expect(r.dPrime).toBeGreaterThan(0)
    expect(r.dPrime).not.toBeNull()
  })

  it('handles zero false alarms', () => {
    const r = computeSDT({ hits: 8, misses: 2, falseAlarms: 0, correctRejections: 20 })
    expect(r.falseAlarmRate).toBe(0) // raw FA rate
    expect(r.dPrime).toBeGreaterThan(0)
    expect(r.dPrime).not.toBeNull()
  })

  it('handles all false alarms', () => {
    const r = computeSDT({ hits: 8, misses: 2, falseAlarms: 20, correctRejections: 0 })
    expect(r.falseAlarmRate).toBe(1) // raw FA rate
    expect(r.dPrime).toBeLessThan(0)
    expect(r.dPrime).not.toBeNull()
  })

  it('computes d-prime and criterion for normal rates', () => {
    const r = computeSDT({ hits: 18, misses: 2, falseAlarms: 3, correctRejections: 17 })
    expect(r.dPrime).not.toBeNull()
    expect(r.criterion).not.toBeNull()
    
    // hitRate = 18.5 / 21 ≈ 0.8809 -> z(0.8809) ≈ 1.18
    // faRate = 3.5 / 21 ≈ 0.1667 -> z(0.1667) ≈ -0.967
    // dPrime ≈ 1.18 - (-0.967) ≈ 2.14
    expect(r.dPrime).toBeCloseTo(2.14, 1)
  })

  it('handles unequal sizes', () => {
    const r = computeSDT({ hits: 5, misses: 5, falseAlarms: 10, correctRejections: 90 })
    // hitRate = 5.5 / 11 = 0.5 -> z = 0
    // faRate = 10.5 / 101 ≈ 0.1039 -> z ≈ -1.259
    // dPrime ≈ 1.259
    expect(r.dPrime).toBeCloseTo(1.259, 1)
  })

  it('returns null if signalTrials is 0', () => {
    const r = computeSDT({ hits: 0, misses: 0, falseAlarms: 5, correctRejections: 15 })
    expect(r.dPrime).toBeNull()
    expect(r.criterion).toBeNull()
  })

  it('returns null if noiseTrials is 0', () => {
    const r = computeSDT({ hits: 5, misses: 5, falseAlarms: 0, correctRejections: 0 })
    expect(r.dPrime).toBeNull()
    expect(r.criterion).toBeNull()
  })
})

describe('costs', () => {
  it('stroop cost', () => {
    expect(stroopCostRT([300, 310], [400, 420])).toBe(105)
  })
  it('switch cost', () => {
    expect(switchCost([500, 520], [400, 410])).toBe(105)
  })
  it('mixing cost', () => {
    expect(mixingCost([450, 460], [380, 390])).toBe(70)
  })
})

describe('RT processing', () => {
  it('detects anticipations', () => {
    const trials = [makeTrial({ reactionTimeMs: 100 })]
    const m = computeRTMetrics(trials)
    expect(m.anticipationRate).toBe(1)
    expect(m.validTrialCount).toBe(0)
  })
  it('detects lapses', () => {
    const trials = [makeTrial({ reactionTimeMs: 3000 })]
    const m = computeRTMetrics(trials, { anticipationThresholdMs: 150, lapseThresholdMs: 2000 })
    expect(m.lapseRate).toBe(1)
  })
  it('all correct responses', () => {
    const trials = Array.from({ length: 10 }, (_, i) =>
      makeTrial({ trialIndex: i, reactionTimeMs: 250 + i * 10 })
    )
    const m = computeRTMetrics(trials)
    expect(m.validTrialCount).toBe(10)
    expect(m.medianCorrectRT).not.toBeNull()
  })
  it('no responses', () => {
    const trials = [makeTrial({ actualResponse: '', correct: false, reactionTimeMs: null })]
    const m = computeRTMetrics(trials)
    expect(m.validTrialCount).toBe(0)
  })
  it('raw RT for incorrect trials does not affect correct RT metrics', () => {
    const correctTrials = [
      makeTrial({ reactionTimeMs: 300, correct: true }),
      makeTrial({ reactionTimeMs: 400, correct: true }),
      makeTrial({ reactionTimeMs: 500, correct: true })
    ] // median is 400

    const incorrectTrials = [
      makeTrial({ reactionTimeMs: 150, correct: false, actualResponse: 'f' }), // extremely fast error
      makeTrial({ reactionTimeMs: 1900, correct: false, actualResponse: 'f' }) // extremely slow error
    ]

    const allTrials = [...correctTrials, ...incorrectTrials]
    const m = computeRTMetrics(allTrials)
    
    expect(m.medianCorrectRT).toBe(400) // median of [300, 400, 500]
    expect(m.validTrialCount).toBe(3) // only the 3 correct ones
    expect(m.invalidTrialCount).toBe(0) // wait, invalidTrialCount is for null RT on correct trials
  })
})

describe('isOmissionTrial', () => {
  it('does not count correct no-go as omission', () => {
    const t = makeTrial({ expectedResponse: 'none', actualResponse: 'none', correct: true })
    expect(isOmissionTrial(t)).toBe(false)
  })
  it('counts missed go as omission', () => {
    const t = makeTrial({ expectedResponse: 'space', actualResponse: 'none', correct: false })
    expect(isOmissionTrial(t)).toBe(true)
  })
})

describe('session validation', () => {
  it('marks incomplete', () => {
    const r = validateSession([], { incomplete: true })
    expect(r.quality).toBe('invalid')
  })
  it('warns on focus loss', () => {
    const trials = Array.from({ length: 20 }, (_, i) =>
      makeTrial({ trialIndex: i, reactionTimeMs: 300 })
    )
    const r = validateSession(trials, { windowLostFocus: true })
    expect(r.quality).toBe('valid_with_warnings')
  })
})

describe('balanced conditions', () => {
  it('stroop has balanced conditions', async () => {
    const { testDefinition } = await import('../../tests/stroop')
    const trials = testDefinition.generateTrials('assessment', 42)
    const counts = { congruent: 0, incongruent: 0, neutral: 0 }
    trials.forEach((t) => counts[t.condition as keyof typeof counts]++)
    expect(counts.congruent).toBe(40)
    expect(counts.incongruent).toBe(40)
    expect(counts.neutral).toBe(40)
  })

  it('gonogo has correct go ratio', async () => {
    const { testDefinition } = await import('../../tests/gonogo')
    const trials = testDefinition.generateTrials('assessment', 123)
    const goCount = trials.filter((t) => t.condition === 'go').length
    expect(goCount).toBe(120)
  })
})