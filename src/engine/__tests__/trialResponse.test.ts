import { describe, it, expect } from 'vitest'
import {
  classifyTrialResponse,
  requiresResponse,
  normalizeExpected,
  INHIBITION_RESPONSE,
} from '../trialResponse'
import { testDefinition as gonogo } from '../../tests/gonogo'
import { testDefinition as sart } from '../../tests/sart'
import { testDefinition as nback } from '../../tests/nback'

const SEED = 42

describe('requiresResponse / normalizeExpected', () => {
  it('treats none, nogo, no_go and empty as inhibition', () => {
    expect(normalizeExpected('none')).toBe(INHIBITION_RESPONSE)
    expect(normalizeExpected('nogo')).toBe(INHIBITION_RESPONSE)
    expect(normalizeExpected('no_go')).toBe(INHIBITION_RESPONSE)
    expect(normalizeExpected('')).toBe(INHIBITION_RESPONSE)
    expect(requiresResponse('none')).toBe(false)
    expect(requiresResponse('space')).toBe(true)
  })
})

describe('classifyTrialResponse A–D', () => {
  it('A: Go + resposta correta', () => {
    const r = classifyTrialResponse({
      expectedResponse: 'space',
      actualResponse: 'space',
    })
    expect(r.correct).toBe(true)
    expect(r.outcomeKind).toBe('hit')
  })

  it('B: Go + timeout = omissão', () => {
    const r = classifyTrialResponse({
      expectedResponse: 'space',
      timedOut: true,
    })
    expect(r.correct).toBe(false)
    expect(r.outcomeKind).toBe('miss')
    expect(r.invalidReason).toBe('omission')
    expect(r.actualResponse).toBe('')
  })

  it('C: No-Go + timeout = inibição correta', () => {
    const r = classifyTrialResponse({
      expectedResponse: 'none',
      timedOut: true,
    })
    expect(r.correct).toBe(true)
    expect(r.outcomeKind).toBe('correct_rejection')
    expect(r.actualResponse).toBe(INHIBITION_RESPONSE)
  })

  it('D: No-Go + resposta = comissão', () => {
    const r = classifyTrialResponse({
      expectedResponse: 'none',
      actualResponse: 'space',
    })
    expect(r.correct).toBe(false)
    expect(r.outcomeKind).toBe('false_alarm')
    expect(r.invalidReason).toBe('commission')
  })

  it('antecipação antes do onset', () => {
    const r = classifyTrialResponse({
      expectedResponse: 'space',
      actualResponse: 'space',
      beforeOnset: true,
    })
    expect(r.correct).toBe(false)
    expect(r.outcomeKind).toBe('anticipation')
  })
})

function inhibitionTrials(test: { generateTrials: (m: 'assessment', s: number) => { expectedResponse: string }[] }) {
  return test.generateTrials('assessment', SEED).filter((t) => !requiresResponse(t.expectedResponse))
}

function goTrials(test: { generateTrials: (m: 'assessment', s: number) => { expectedResponse: string }[] }) {
  return test.generateTrials('assessment', SEED).filter((t) => requiresResponse(t.expectedResponse))
}

describe('Go/No-Go gerador + classificação', () => {
  const nogo = inhibitionTrials(gonogo)[0]
  const go = goTrials(gonogo)[0]

  it('No-Go timeout é inibição correta', () => {
    const r = classifyTrialResponse({ expectedResponse: nogo.expectedResponse, timedOut: true })
    expect(r.correct).toBe(true)
  })

  it('No-Go com space é comissão', () => {
    const r = classifyTrialResponse({ expectedResponse: nogo.expectedResponse, actualResponse: 'space' })
    expect(r.outcomeKind).toBe('false_alarm')
  })

  it('Go timeout é omissão', () => {
    const r = classifyTrialResponse({ expectedResponse: go.expectedResponse, timedOut: true })
    expect(r.outcomeKind).toBe('miss')
  })
})

describe('SART gerador + classificação', () => {
  const nogo = inhibitionTrials(sart)[0]
  const go = goTrials(sart)[0]

  it('dígito 3 (no-go) timeout correto', () => {
    expect(nogo.expectedResponse).toBe('none')
    const r = classifyTrialResponse({ expectedResponse: nogo.expectedResponse, timedOut: true })
    expect(r.correct).toBe(true)
  })

  it('go timeout é omissão', () => {
    expect(go.expectedResponse).toBe('space')
    const r = classifyTrialResponse({ expectedResponse: go.expectedResponse, timedOut: true })
    expect(r.outcomeKind).toBe('miss')
  })
})

describe('N-back gerador + classificação', () => {
  const nogo = inhibitionTrials(nback)[0]
  const go = goTrials(nback)[0]

  it('non-match timeout é inibição', () => {
    const r = classifyTrialResponse({ expectedResponse: nogo.expectedResponse, timedOut: true })
    expect(r.correct).toBe(true)
  })

  it('match com space é hit', () => {
    const r = classifyTrialResponse({
      expectedResponse: go.expectedResponse,
      actualResponse: 'space',
    })
    expect(r.correct).toBe(true)
    expect(r.outcomeKind).toBe('hit')
  })
})

import { computeReactionTime } from '../trialResponse'

describe('computeReactionTime', () => {
  it('returns valid RT for valid response (hit)', () => {
    const rt = computeReactionTime(100, 400, true)
    expect(rt).toBe(300)
  })

  it('returns valid RT for invalid response (false alarm / incorrect)', () => {
    const rt = computeReactionTime(100, 450, false)
    expect(rt).toBe(350)
  })

  it('returns null when responseTimestamp is null (omission / correct rejection)', () => {
    const rt = computeReactionTime(100, null, false)
    expect(rt).toBeNull()
    const rt2 = computeReactionTime(100, null, true)
    expect(rt2).toBeNull()
  })

  it('returns null when onset is <= 0 (anticipation or pre-render)', () => {
    const rt = computeReactionTime(0, 400, false)
    expect(rt).toBeNull()
  })

  it('handles extremely fast (but >0) responses', () => {
    const rt = computeReactionTime(100, 105, false)
    expect(rt).toBe(5) // Will be caught by anticipationThresholdMs later
  })
})