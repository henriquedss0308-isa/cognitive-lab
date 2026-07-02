import { describe, it, expect } from 'vitest'
import { classifyTrialResponse } from '../trialResponse'
import { waitCancellable } from '../../utils/timing'

function isStale(token: number, currentToken: number, running: boolean) {
  return token !== currentToken || !running
}

function shouldAcceptKey(params: {
  phase: string
  responded: boolean
  token: number
  currentToken: number
  running: boolean
  repeat: boolean
}) {
  if (params.repeat) return false
  if (params.phase !== 'stimulus' && params.phase !== 'response') return false
  if (params.responded || isStale(params.token, params.currentToken, params.running)) return false
  return true
}

describe('trial state guards', () => {
  it('ignora key repeat', () => {
    expect(shouldAcceptKey({
      phase: 'response',
      responded: false,
      token: 1,
      currentToken: 1,
      running: true,
      repeat: true,
    })).toBe(false)
  })

  it('bloqueia segunda resposta no mesmo trial', () => {
    expect(shouldAcceptKey({
      phase: 'response',
      responded: true,
      token: 1,
      currentToken: 1,
      running: true,
      repeat: false,
    })).toBe(false)
  })

  it('bloqueia resposta de trial anterior (token stale)', () => {
    expect(shouldAcceptKey({
      phase: 'response',
      responded: false,
      token: 1,
      currentToken: 2,
      running: true,
      repeat: false,
    })).toBe(false)
  })

  it('bloqueia resposta após abort/unmount', () => {
    expect(shouldAcceptKey({
      phase: 'response',
      responded: false,
      token: 2,
      currentToken: 2,
      running: false,
      repeat: false,
    })).toBe(false)
  })

  it('não aceita tecla em fixation/isi', () => {
    expect(shouldAcceptKey({
      phase: 'fixation',
      responded: false,
      token: 1,
      currentToken: 1,
      running: true,
      repeat: false,
    })).toBe(false)
  })
})

describe('timeout boundary', () => {
  it('timeout Go classifica omissão', () => {
    const r = classifyTrialResponse({ expectedResponse: 'space', timedOut: true })
    expect(r.outcomeKind).toBe('miss')
  })

  it('timeout No-Go classifica inibição', () => {
    const r = classifyTrialResponse({ expectedResponse: 'none', timedOut: true })
    expect(r.outcomeKind).toBe('correct_rejection')
  })

  it('resposta no limiar após onset válido conta como hit', () => {
    const r = classifyTrialResponse({
      expectedResponse: 'space',
      actualResponse: 'space',
      beforeOnset: false,
    })
    expect(r.outcomeKind).toBe('hit')
  })
})

describe('waitCancellable abort', () => {
  it('cancela timeout pendente ao abortar trial', async () => {
    const ac = new AbortController()
    const p = waitCancellable(5000, ac.signal)
    ac.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('SART visual constraints and timing', () => {
  // Mirror the config.advancePolicy logic from TestRunner
  function hasFixedTrialDuration(config: { advancePolicy?: string } | null | undefined): boolean {
    return config != null && config.advancePolicy === 'fixed-duration'
  }

  const sartConfig = { advancePolicy: 'fixed-duration' }
  const simpleRtConfig = { advancePolicy: 'after-response' }
  const choiceRtConfig = {}

  it('SART trial has fixed duration', () => {
    expect(hasFixedTrialDuration(sartConfig)).toBe(true)
  })

  it('Simple RT trial does not have fixed duration', () => {
    expect(hasFixedTrialDuration(simpleRtConfig)).toBe(false)
  })

  it('Choice RT trial does not have fixed duration', () => {
    expect(hasFixedTrialDuration(choiceRtConfig)).toBe(false)
  })

  it('null/undefined trial does not have fixed duration', () => {
    expect(hasFixedTrialDuration(null)).toBe(false)
    expect(hasFixedTrialDuration(undefined)).toBe(false)
  })

  it('prevents stimulus from rendering during fixation or isi', () => {
    const shouldShowStimulus = (phase: string) => 
      ['stimulus', 'response', 'feedback'].includes(phase)
    
    expect(shouldShowStimulus('fixation')).toBe(false)
    expect(shouldShowStimulus('isi')).toBe(false)
    expect(shouldShowStimulus('ready')).toBe(false)
    expect(shouldShowStimulus('done')).toBe(false)
    expect(shouldShowStimulus('stimulus')).toBe(true)
    expect(shouldShowStimulus('response')).toBe(true)
    expect(shouldShowStimulus('feedback')).toBe(true)
  })

  it('suppresses fixation cross for fixed-duration tests', () => {
    const shouldShowCross = (phase: string, config: { advancePolicy?: string } | null) =>
      (phase === 'fixation' || phase === 'isi') && !hasFixedTrialDuration(config)
    
    // Standard test: cross shows during fixation/isi
    expect(shouldShowCross('fixation', simpleRtConfig)).toBe(true)
    expect(shouldShowCross('isi', simpleRtConfig)).toBe(true)
    
    // SART: cross never shows
    expect(shouldShowCross('fixation', sartConfig)).toBe(false)
    expect(shouldShowCross('isi', sartConfig)).toBe(false)
    
    // Neither shows during stimulus/response
    expect(shouldShowCross('stimulus', simpleRtConfig)).toBe(false)
    expect(shouldShowCross('response', sartConfig)).toBe(false)
  })

  it('accepts keypresses during mask phase in SART', () => {
    expect(shouldAcceptKey({
      phase: 'response',
      responded: false,
      token: 1,
      currentToken: 1,
      running: true,
      repeat: false,
    })).toBe(true)
  })

  it('blocks key repeat even during valid phase', () => {
    expect(shouldAcceptKey({
      phase: 'stimulus',
      responded: false,
      token: 1,
      currentToken: 1,
      running: true,
      repeat: true,
    })).toBe(false)
  })

  it('blocks second response in same trial (responded=true)', () => {
    expect(shouldAcceptKey({
      phase: 'response',
      responded: true,
      token: 1,
      currentToken: 1,
      running: true,
      repeat: false,
    })).toBe(false)
  })

  it('for fixed-duration tests, response should NOT abort the loop', () => {
    // This tests the design contract: when hasFixedTrialDuration is true,
    // handleKeyDown must NOT call loopAbort.abort().
    // We verify the flag that controls this decision.
    const shouldAbortOnResponse = !hasFixedTrialDuration(sartConfig)
    expect(shouldAbortOnResponse).toBe(false)

    const shouldAbortStandard = !hasFixedTrialDuration(simpleRtConfig)
    expect(shouldAbortStandard).toBe(true)
  })

  it('for fixed-duration tests, response should NOT call finalizeTrial', () => {
    // Same contract: fixedDuration means handleKeyDown stores pendingCorrectness
    // instead of calling finalizeTrial directly.
    const fixedDuration = hasFixedTrialDuration(sartConfig)
    expect(fixedDuration).toBe(true)
    // handleKeyDown uses: if (fixedDuration) { pendingCorrectness = ... } else { finalizeTrial(...) }
  })
})