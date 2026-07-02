import { describe, it, expect } from 'vitest'
import { buildTrialRecord } from '../trialRecorder'
import type { GeneratedTrial } from '../../tests/types'
import { detectDevice } from '../../utils/device'

const device = detectDevice()
const cleaning = { anticipationThresholdMs: 150, lapseThresholdMs: 2000 }

const baseTrial: GeneratedTrial = {
  blockIndex: 0,
  trialIndex: 0,
  condition: 'go',
  stimulus: 'green',
  expectedResponse: 'space',
}

function record(overrides: Partial<Parameters<typeof buildTrialRecord>[0]> = {}) {
  return buildTrialRecord({
    trial: baseTrial,
    sessionId: 's1',
    testId: 'gonogo',
    protocolVersion: 'gonogo.standard.v1.0',
    mode: 'assessment',
    deviceInfo: device,
    inputMethod: 'keyboard',
    stimulusOnsetTimestamp: 1000,
    windowFocused: true,
    visibilityState: 'visible',
    cleaning,
    ...overrides,
  })
}

describe('buildTrialRecord', () => {
  it('resposta antes do onset marca antecipação sem RT', () => {
    const r = record({
      actualResponse: 'space',
      responseTimestamp: 950,
      beforeOnset: true,
    })
    expect(r.correct).toBe(false)
    expect(r.invalidReason).toBe('anticipation')
    expect(r.reactionTimeMs).toBeNull()
  })

  it('timeout em Go produz omissão', () => {
    const r = record({ timedOut: true })
    expect(r.correct).toBe(false)
    expect(r.invalidReason).toBe('omission')
    expect(r.metadata?.outcomeKind).toBe('miss')
  })

  it('timeout em No-Go produz inibição correta', () => {
    const r = record({
      trial: { ...baseTrial, expectedResponse: 'none', condition: 'nogo' },
      timedOut: true,
    })
    expect(r.correct).toBe(true)
    expect(r.metadata?.outcomeKind).toBe('correct_rejection')
  })

  it('resposta No-Go com space é comissão', () => {
    const r = record({
      trial: { ...baseTrial, expectedResponse: 'none', condition: 'nogo' },
      actualResponse: 'space',
      responseTimestamp: 1200,
    })
    expect(r.correct).toBe(false)
    expect(r.invalidReason).toBe('commission')
  })

  it('registra droppedFramesEstimate quando fornecido', () => {
    const r = record({ droppedFramesEstimate: 4 })
    expect(r.droppedFramesEstimate).toBe(4)
  })

  it('RT válido apenas após onset aceito', () => {
    const r = record({
      actualResponse: 'space',
      responseTimestamp: 1280,
    })
    expect(r.reactionTimeMs).toBe(280)
  })
})