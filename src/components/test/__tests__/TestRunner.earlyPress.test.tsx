import { cleanup, fireEvent, render, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TestRunner } from '../TestRunner'
import { countIsiEarlyPresses } from '../../../scoring/common'
import type { DeviceInfo, SessionResult, TestMode, TrialRecord } from '../../../types'
import type { CognitiveTestDefinition, GeneratedTrial, ProtocolConfig } from '../../../tests/types'

const deviceInfo: DeviceInfo = {
  deviceType: 'desktop',
  inputMethod: 'keyboard',
  screenWidth: 1920,
  screenHeight: 1080,
  browser: 'test',
  userAgent: 'test',
}

function emptyScore(
  testId: CognitiveTestDefinition['id'],
  protocolVersion: string,
  mode: TestMode
): Omit<SessionResult, 'sessionId' | 'startedAt' | 'completedAt' | 'isDemo' | 'checkIn' | 'batteryId' | 'batteryPosition'> {
  return {
    testId,
    protocolVersion,
    mode,
    quality: 'valid',
    flags: {},
    flagMessages: [],
    rtMetrics: {
      medianCorrectRT: null,
      meanCorrectRT: null,
      rtStandardDeviation: null,
      rtIQR: null,
      rtCoefficientOfVariation: null,
      p10RT: null,
      p90RT: null,
      anticipationRate: 0,
      lapseRate: 0,
      validTrialCount: 0,
      invalidTrialCount: 0,
    },
    accuracyMetrics: { accuracy: 1, correctCount: 0, errorCount: 0, omissionCount: 0, totalTrials: 0 },
    conditionMetrics: {},
    blockMetrics: [],
    customMetrics: {},
    deviceInfo,
  }
}

function makeSimpleTest(trials: GeneratedTrial[]): CognitiveTestDefinition {
  const config: ProtocolConfig = {
    version: 'simple.test.v1',
    trialCount: trials.length,
    blocks: 1,
    cleaningRules: { anticipationThresholdMs: 0, lapseThresholdMs: 5000 },
  }
  return {
    id: 'simple_rt',
    name: 'simple',
    shortName: 'simple',
    domain: 'speed_alertness',
    domains: ['speed_alertness'],
    description: '',
    duration: '',
    protocolVersion: config.version,
    practiceConfig: config,
    assessmentConfig: config,
    instructions: { title: '', summary: '', steps: [], keys: [], tips: [] },
    generateTrials: () => trials,
    scoreSession: (_t, mode) => emptyScore('simple_rt', config.version, mode),
    primaryMetricKey: 'medianCorrectRT',
    baselineMetricKeys: ['medianCorrectRT'],
    metricLabels: {},
    metricDirections: { medianCorrectRT: -1 },
  }
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('TestRunner — antecipações em fixação/ISI (spec §14)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(performance.now()), 16) as unknown as number
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      clearTimeout(id as unknown as ReturnType<typeof setTimeout>)
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('espaço durante fixação/ISI vira earlyPressCount no trial, sem criar trial extra', async () => {
    const test = makeSimpleTest([
      { blockIndex: 0, trialIndex: 0, condition: 'simple', stimulus: 'green_circle', expectedResponse: 'space', isiMs: 300 },
    ])
    const recorded: TrialRecord[] = []
    const onTrialRecorded = vi.fn((t: TrialRecord) => {
      recorded.push(t)
      return Promise.resolve()
    })

    render(
      <TestRunner
        test={test}
        mode="assessment"
        sessionId="sess-early"
        deviceInfo={deviceInfo}
        refreshRateHz={60}
        onTrialRecorded={onTrialRecorded}
        onComplete={vi.fn()}
        onAbort={vi.fn()}
        onInterrupted={vi.fn()}
      />
    )

    // ready(1500) → dentro da fixação(400): 2 pressionamentos precoces
    await advance(1500)
    await advance(100)
    await act(async () => {
      fireEvent.keyDown(window, { key: ' ' })
      fireEvent.keyDown(window, { key: ' ' })
    })
    // ainda no ISI(300): mais 1
    await advance(400)
    await act(async () => {
      fireEvent.keyDown(window, { key: ' ' })
    })
    // conclui ISI + duplo rAF → estímulo; resposta válida
    await advance(300)
    await advance(48)
    await act(async () => {
      fireEvent.keyDown(window, { key: ' ' })
    })
    await flushMicrotasks()

    expect(onTrialRecorded).toHaveBeenCalledOnce()
    expect(recorded[0].metadata?.earlyPressCount).toBe(3)
    expect(countIsiEarlyPresses(recorded)).toBe(3)
  })

  it('teclas que não são de resposta não contam', async () => {
    const test = makeSimpleTest([
      { blockIndex: 0, trialIndex: 0, condition: 'simple', stimulus: 'green_circle', expectedResponse: 'space', isiMs: 200 },
    ])
    const recorded: TrialRecord[] = []

    render(
      <TestRunner
        test={test}
        mode="assessment"
        sessionId="sess-early2"
        deviceInfo={deviceInfo}
        refreshRateHz={60}
        onTrialRecorded={vi.fn((t: TrialRecord) => {
          recorded.push(t)
          return Promise.resolve()
        })}
        onComplete={vi.fn()}
        onAbort={vi.fn()}
        onInterrupted={vi.fn()}
      />
    )

    await advance(1500)
    await advance(100)
    await act(async () => {
      fireEvent.keyDown(window, { key: 'a' })
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    await advance(500)
    await advance(48)
    await act(async () => {
      fireEvent.keyDown(window, { key: ' ' })
    })
    await flushMicrotasks()

    expect(recorded[0]?.metadata?.earlyPressCount).toBeUndefined()
    expect(countIsiEarlyPresses(recorded)).toBe(0)
  })
})

describe('countIsiEarlyPresses — agregador puro', () => {
  const base: Omit<TrialRecord, 'metadata'> = {
    trialId: 't',
    sessionId: 's',
    testId: 'simple_rt',
    protocolVersion: 'v',
    mode: 'assessment',
    blockIndex: 0,
    trialIndex: 0,
    condition: 'simple',
    stimulus: 'x',
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
  }

  it('soma contagens e ignora ausentes/invalidas', () => {
    const trials: TrialRecord[] = [
      { ...base, trialId: 'a', metadata: { earlyPressCount: 2 } },
      { ...base, trialId: 'b' },
      { ...base, trialId: 'c', metadata: { earlyPressCount: 1 } },
      { ...base, trialId: 'd', metadata: { earlyPressCount: 'x' as unknown as number } },
    ]
    expect(countIsiEarlyPresses(trials)).toBe(3)
  })

  it('sessões antigas (sem metadata) resultam em 0, não em erro', () => {
    expect(countIsiEarlyPresses([{ ...base, trialId: 'a' }])).toBe(0)
  })
})
