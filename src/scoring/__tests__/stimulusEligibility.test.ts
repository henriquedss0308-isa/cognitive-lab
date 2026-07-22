import { describe, expect, it } from 'vitest'
import type { TrialRecord } from '../../types'
import {
  isEligibleForStimulusContingentScoring,
  isTruePreOnsetResponse,
} from '../stimulusEligibility'

function trial(overrides: Partial<TrialRecord> = {}): TrialRecord {
  return {
    trialId: 'trial-1',
    sessionId: 'session-1',
    testId: 'gonogo',
    protocolVersion: 'gonogo.standard.v1.0',
    mode: 'assessment',
    blockIndex: 0,
    trialIndex: 0,
    condition: 'go',
    stimulus: 'green_circle',
    expectedResponse: 'space',
    actualResponse: 'space',
    correct: true,
    reactionTimeMs: 250,
    stimulusOnsetTimestamp: 1_000,
    responseTimestamp: 1_250,
    windowFocused: true,
    visibilityState: 'visible',
    deviceType: 'desktop',
    inputMethod: 'keyboard',
    metadata: { outcomeKind: 'hit' },
    ...overrides,
  }
}

describe('elegibilidade para scoring condicionado ao estímulo', () => {
  it('exclui timestamp estritamente anterior ao onset', () => {
    const value = trial({ responseTimestamp: 999.999, reactionTimeMs: null })
    expect(isTruePreOnsetResponse(value)).toBe(true)
    expect(isEligibleForStimulusContingentScoring(value)).toBe(false)
  })

  it.each([
    ['igual ao onset', 1_000],
    ['posterior ao onset', 1_001],
  ])('considera resposta %s como pós-onset', (_label, responseTimestamp) => {
    expect(isTruePreOnsetResponse(trial({ responseTimestamp }))).toBe(false)
  })

  it('não confunde RT pós-onset abaixo do limiar com pré-onset', () => {
    const rapid = trial({
      responseTimestamp: 1_050,
      reactionTimeMs: null,
      invalidReason: 'anticipation',
      metadata: { outcomeKind: 'hit' },
    })
    expect(isTruePreOnsetResponse(rapid)).toBe(false)
    expect(isEligibleForStimulusContingentScoring(rapid)).toBe(true)
  })

  it('usa o outcome explícito no intervalo em que o onset persistido ainda é zero', () => {
    const renderWindowPress = trial({
      stimulusOnsetTimestamp: 0,
      responseTimestamp: 1_050,
      reactionTimeMs: null,
      correct: false,
      invalidReason: 'anticipation',
      metadata: { outcomeKind: 'anticipation' },
    })
    expect(isTruePreOnsetResponse(renderWindowPress)).toBe(true)
  })

  it('não infere pré-onset de registro histórico incompleto nem do invalidReason isolado', () => {
    const incomplete = trial({
      stimulusOnsetTimestamp: 0,
      responseTimestamp: 1_050,
      reactionTimeMs: null,
      invalidReason: 'anticipation',
      metadata: undefined,
    })
    expect(isTruePreOnsetResponse(incomplete)).toBe(false)
  })

  it('trata onset ausente de forma conservadora, salvo marcador direto do engine', () => {
    const missingOnset = undefined as unknown as number
    expect(
      isTruePreOnsetResponse(
        trial({ stimulusOnsetTimestamp: missingOnset, metadata: { outcomeKind: 'hit' } })
      )
    ).toBe(false)
    expect(
      isTruePreOnsetResponse(
        trial({
          stimulusOnsetTimestamp: missingOnset,
          reactionTimeMs: null,
          invalidReason: 'anticipation',
          metadata: { outcomeKind: 'anticipation' },
        })
      )
    ).toBe(true)
  })

  it.each([
    ['resposta ausente', null],
    ['timestamp de resposta zero', 0],
    ['timestamp de resposta NaN', Number.NaN],
    ['timestamp de resposta +Infinity', Number.POSITIVE_INFINITY],
    ['timestamp de resposta -Infinity', Number.NEGATIVE_INFINITY],
  ])('não fabrica pré-onset para %s', (_label, responseTimestamp) => {
    expect(
      isTruePreOnsetResponse(
        trial({
          responseTimestamp,
          actualResponse: responseTimestamp === null ? '' : 'space',
          metadata: { outcomeKind: 'anticipation' },
        })
      )
    ).toBe(false)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'não compara onset inválido %s sem marcador explícito',
    (stimulusOnsetTimestamp) => {
      expect(
        isTruePreOnsetResponse(
          trial({ stimulusOnsetTimestamp, metadata: { outcomeKind: 'hit' } })
        )
      ).toBe(false)
    }
  )

  it('não altera elegibilidade por foco perdido ou RT inválido', () => {
    const irregular = trial({
      reactionTimeMs: Number.NaN,
      windowFocused: false,
      visibilityState: 'hidden',
      invalidReason: 'unfocused',
    })
    expect(isEligibleForStimulusContingentScoring(irregular)).toBe(true)
  })

  it('é pura e independente da ordem dos trials sintéticos', () => {
    const values = [
      trial({ trialId: 'post', trialIndex: 2, responseTimestamp: 1_200 }),
      trial({ trialId: 'pre', trialIndex: 0, responseTimestamp: 900 }),
      trial({ trialId: 'equal', trialIndex: 1, responseTimestamp: 1_000 }),
    ]
    expect(values.filter(isEligibleForStimulusContingentScoring).map((t) => t.trialId)).toEqual([
      'post',
      'equal',
    ])
    expect(values.map((t) => t.trialIndex)).toEqual([2, 0, 1])
  })
})
