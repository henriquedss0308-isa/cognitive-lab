import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TestRunner, type TestRunnerResumeState, type TestRunMeta } from '../TestRunner'
import { StimulusDisplay } from '../StimulusDisplay'
import type { DeviceInfo, SessionFlags, SessionResult, TestId, TestMode, TrialRecord } from '../../../types'
import type { CognitiveTestDefinition, GeneratedTrial, ProtocolConfig } from '../../../tests/types'
import { testDefinition as corsiDefinition } from '../../../tests/corsi'
import {
  buildCorsiTrial,
  createCorsiAdaptiveState,
  type CorsiAdaptiveState,
} from '../../../tests/corsi/adaptive'

const deviceInfo: DeviceInfo = {
  deviceType: 'desktop',
  inputMethod: 'keyboard',
  screenWidth: 1920,
  screenHeight: 1080,
  browser: 'test',
  userAgent: 'test',
}

const baseMetrics: SessionResult['rtMetrics'] = {
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
}

function emptyScore(
  testId: TestId,
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
    rtMetrics: baseMetrics,
    accuracyMetrics: {
      accuracy: 1,
      correctCount: 0,
      errorCount: 0,
      omissionCount: 0,
      totalTrials: 0,
    },
    conditionMetrics: {},
    blockMetrics: [],
    customMetrics: {},
    deviceInfo,
  }
}

function makeTest(
  id: TestId,
  trials: GeneratedTrial[],
  configOverrides: Partial<ProtocolConfig> = {}
): CognitiveTestDefinition {
  const config: ProtocolConfig = {
    version: `${id}.test.v1`,
    trialCount: trials.length,
    blocks: 1,
    cleaningRules: {
      anticipationThresholdMs: 0,
      lapseThresholdMs: 5000,
    },
    ...configOverrides,
  }

  return {
    id,
    name: id,
    shortName: id,
    domain: 'speed_alertness',
    domains: ['speed_alertness'],
    description: id,
    duration: 'test',
    protocolVersion: config.version,
    practiceConfig: config,
    assessmentConfig: config,
    instructions: {
      title: id,
      summary: id,
      steps: [],
      keys: [],
      tips: [],
    },
    generateTrials: () => trials,
    scoreSession: (_trials, mode) => emptyScore(id, config.version, mode),
    primaryMetricKey: 'medianCorrectRT',
    baselineMetricKeys: ['medianCorrectRT'],
    metricLabels: {},
    metricDirections: {},
  }
}

function renderRunner({
  test,
  mode = 'assessment',
  resumeState,
  strict = false,
  onTrialRecorded = vi.fn().mockResolvedValue(undefined),
  onComplete = vi.fn(),
  onAbort = vi.fn(),
  onInterrupted = vi.fn(),
}: {
  test: CognitiveTestDefinition
  mode?: TestMode
  resumeState?: TestRunnerResumeState
  strict?: boolean
  onTrialRecorded?: ReturnType<typeof vi.fn>
  onComplete?: ReturnType<typeof vi.fn>
  onAbort?: ReturnType<typeof vi.fn>
  onInterrupted?: ReturnType<typeof vi.fn>
}) {
  const element = (
    <TestRunner
      test={test}
      mode={mode}
      sessionId="session-1"
      deviceInfo={deviceInfo}
      refreshRateHz={60}
      resumeState={resumeState}
      onTrialRecorded={onTrialRecorded as (trial: TrialRecord) => void | Promise<void>}
      onComplete={onComplete as (trials: TrialRecord[], flags: SessionFlags, meta: TestRunMeta) => void | Promise<void>}
      onAbort={onAbort as () => void}
      onInterrupted={onInterrupted as () => void}
    />
  )

  const view = render(strict ? <StrictMode>{element}</StrictMode> : element)
  return { ...view, onTrialRecorded, onComplete, onAbort, onInterrupted }
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve()
  })
}

async function pressKey(key: string) {
  await act(async () => {
    fireEvent.keyDown(window, { key })
  })
  await flushMicrotasks()
}

async function startFixedTrial() {
  await advance(1500)
  await advance(32)
}

async function startStandardTrial() {
  await advance(1500)
  await advance(400)
  await advance(0)
  await advance(32)
}

function highlightedSquare(container: HTMLElement) {
  return container.querySelector('.scale-110')
}

function corsiButtons(container: HTMLElement) {
  return Array.from(container.querySelectorAll('button.absolute')) as HTMLButtonElement[]
}

function activeSartStimuli(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[data-sart-active-stimulus="true"]'))
}

function makeSartTest(stimuli: string[]) {
  return makeTest(
    'sart',
    stimuli.map((stimulus, trialIndex) => ({
      blockIndex: 0,
      trialIndex,
      condition: stimulus === '3' ? 'no-go' : 'go',
      stimulus,
      expectedResponse: stimulus === '3' ? 'none' : 'space',
      stimulusDurationMs: 250,
      isiMs: 900,
    })),
    { advancePolicy: 'fixed-duration' }
  )
}

describe('TestRunner stability', () => {
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

  it('SART keeps fixed visual timing after a 100ms response', async () => {
    const test = makeSartTest(['1', '2'])
    const { onTrialRecorded, onComplete } = renderRunner({ test })

    await startFixedTrial()
    expect(screen.getByText('1')).toBeInTheDocument()

    await advance(100)
    await pressKey(' ')
    await advance(150)
    expect(screen.queryByText('1')).not.toBeInTheDocument()

    await advance(899)
    expect(screen.queryByText('2')).not.toBeInTheDocument()
    expect(onComplete).not.toHaveBeenCalled()

    await advance(1)
    await advance(40)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(onTrialRecorded).toHaveBeenCalledTimes(1)
  })

  it('SART advances by timeout without overlapping active stimuli', async () => {
    const test = makeSartTest(['1', '2'])
    const { container, onTrialRecorded, onComplete } = renderRunner({ test })

    await startFixedTrial()
    expect(screen.getByTestId('sart-digit')).toHaveTextContent('1')
    expect(activeSartStimuli(container)).toHaveLength(1)

    await advance(250)
    expect(screen.queryByText('1')).not.toBeInTheDocument()
    expect(screen.getByTestId('sart-mask')).toBeInTheDocument()
    expect(activeSartStimuli(container)).toHaveLength(1)

    await advance(899)
    expect(screen.queryByText('2')).not.toBeInTheDocument()
    expect(onComplete).not.toHaveBeenCalled()

    await advance(1)
    await advance(40)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(activeSartStimuli(container)).toHaveLength(1)
    expect(onTrialRecorded).toHaveBeenCalledTimes(1)

    const record = onTrialRecorded.mock.calls[0][0] as TrialRecord
    expect(record.trialIndex).toBe(0)
    expect(record.actualResponse).toBe('')
    expect(record.invalidReason).toBe('omission')
  })

  it('SART records one response immediately before timeout and does not skip a trial', async () => {
    const test = makeSartTest(['1', '2'])
    const { container, onTrialRecorded } = renderRunner({ test })

    await startFixedTrial()
    await advance(250)
    await advance(899)
    await pressKey(' ')
    await advance(1)
    await advance(40)

    expect(onTrialRecorded).toHaveBeenCalledTimes(1)
    const record = onTrialRecorded.mock.calls[0][0] as TrialRecord
    expect(record.trialIndex).toBe(0)
    expect(record.actualResponse).toBe('space')
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(activeSartStimuli(container)).toHaveLength(1)
  })

  it('SART records once when response and timeout fire in the same tick', async () => {
    const test = makeSartTest(['1', '2'])
    const { container, onTrialRecorded } = renderRunner({ test })

    await startFixedTrial()
    setTimeout(() => {
      fireEvent.keyDown(window, { key: ' ' })
    }, 1150)

    await advance(1150)
    await flushMicrotasks()
    await advance(40)

    expect(onTrialRecorded).toHaveBeenCalledTimes(1)
    const record = onTrialRecorded.mock.calls[0][0] as TrialRecord
    expect(record.trialIndex).toBe(0)
    expect(record.actualResponse).toBe('space')
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(activeSartStimuli(container)).toHaveLength(1)
  })

  it('SART StrictMode remount does not duplicate timers or skip trials', async () => {
    const test = makeSartTest(['1', '2', '4'])
    const { container, onTrialRecorded } = renderRunner({ test, strict: true })

    await startFixedTrial()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(activeSartStimuli(container)).toHaveLength(1)

    await advance(1150)
    await advance(40)

    expect(onTrialRecorded).toHaveBeenCalledTimes(1)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(activeSartStimuli(container)).toHaveLength(1)
  })

  it('SART training feedback does not re-display the completed digit', async () => {
    const test = makeSartTest(['1'])
    const { container } = renderRunner({ test, mode: 'training' })

    await startFixedTrial()
    expect(screen.getByText('1')).toBeInTheDocument()

    await pressKey(' ')
    await advance(1150)

    expect(screen.queryByText('1')).not.toBeInTheDocument()
    expect(activeSartStimuli(container)).toHaveLength(0)
  })

  it('N-Back hides the square at 500ms after an early response and waits for the full cycle', async () => {
    const test = makeTest(
      'nback',
      [
        {
          blockIndex: 0,
          trialIndex: 0,
          condition: '1back',
          stimulus: '0',
          expectedResponse: 'space',
          stimulusDurationMs: 500,
          isiMs: 2500,
          metadata: { nBack: 1, isTarget: true },
        },
        {
          blockIndex: 0,
          trialIndex: 1,
          condition: '1back',
          stimulus: '1',
          expectedResponse: 'space',
          stimulusDurationMs: 500,
          isiMs: 2500,
          metadata: { nBack: 1, isTarget: true },
        },
      ],
      { advancePolicy: 'fixed-duration' }
    )
    const { container, onTrialRecorded, onComplete } = renderRunner({ test })

    await startFixedTrial()
    expect(highlightedSquare(container)).not.toBeNull()

    await advance(100)
    await pressKey(' ')
    await advance(400)
    expect(highlightedSquare(container)).toBeNull()

    await advance(2499)
    expect(highlightedSquare(container)).toBeNull()
    expect(onComplete).not.toHaveBeenCalled()

    await advance(1)
    await advance(40)
    expect(highlightedSquare(container)).not.toBeNull()
    expect(onTrialRecorded).toHaveBeenCalledTimes(1)
  })

  it('N-Back training feedback does not re-display the square', async () => {
    const test = makeTest(
      'nback',
      [
        {
          blockIndex: 0,
          trialIndex: 0,
          condition: '1back',
          stimulus: '0',
          expectedResponse: 'space',
          stimulusDurationMs: 500,
          isiMs: 2500,
          metadata: { nBack: 1, isTarget: true },
        },
      ],
      { advancePolicy: 'fixed-duration' }
    )
    const { container } = renderRunner({ test, mode: 'training' })

    await startFixedTrial()
    await advance(100)
    await pressKey(' ')
    await advance(2900)
    expect(highlightedSquare(container)).toBeNull()
  })

  it('does not duplicate when response arrives immediately before timeout', async () => {
    const test = makeTest('simple_rt', [
      {
        blockIndex: 0,
        trialIndex: 0,
        condition: 'simple',
        stimulus: 'green_circle',
        expectedResponse: 'space',
        isiMs: 0,
        metadata: { responseWindowMs: 200 },
      },
    ])
    const { onTrialRecorded, onComplete } = renderRunner({ test })

    await startStandardTrial()
    await advance(190)
    await pressKey(' ')
    await advance(500)

    expect(onTrialRecorded).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledTimes(1)
    const record = onTrialRecorded.mock.calls[0][0] as TrialRecord
    expect(record.actualResponse).toBe('space')
  })

  it('does not duplicate when response and timeout are scheduled for the same tick', async () => {
    const test = makeTest('simple_rt', [
      {
        blockIndex: 0,
        trialIndex: 0,
        condition: 'simple',
        stimulus: 'green_circle',
        expectedResponse: 'space',
        isiMs: 0,
        metadata: { responseWindowMs: 200 },
      },
    ])
    const { onTrialRecorded, onComplete } = renderRunner({ test })

    await startStandardTrial()
    setTimeout(() => {
      fireEvent.keyDown(window, { key: ' ' })
    }, 200)
    await advance(200)
    await advance(500)

    expect(onTrialRecorded).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('records a single timeout when no response is made', async () => {
    const test = makeTest('simple_rt', [
      {
        blockIndex: 0,
        trialIndex: 0,
        condition: 'simple',
        stimulus: 'green_circle',
        expectedResponse: 'space',
        isiMs: 0,
        metadata: { responseWindowMs: 200 },
      },
    ])
    const { onTrialRecorded, onComplete } = renderRunner({ test })

    await startStandardTrial()
    await advance(200)
    await advance(500)

    expect(onTrialRecorded).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledTimes(1)
    const record = onTrialRecorded.mock.calls[0][0] as TrialRecord
    expect(record.invalidReason).toBe('omission')
  })

  it('Go/No-Go response and timeout preserve the pre-generated trial order', async () => {
    const test = makeTest('gonogo', [
      {
        blockIndex: 0,
        trialIndex: 0,
        condition: 'go',
        stimulus: 'green_circle',
        expectedResponse: 'space',
        isiMs: 0,
        metadata: { responseWindowMs: 200 },
      },
      {
        blockIndex: 0,
        trialIndex: 1,
        condition: 'nogo',
        stimulus: 'red_circle',
        expectedResponse: 'none',
        isiMs: 0,
        metadata: { responseWindowMs: 200 },
      },
      {
        blockIndex: 0,
        trialIndex: 2,
        condition: 'go',
        stimulus: 'green_circle',
        expectedResponse: 'space',
        isiMs: 0,
        metadata: { responseWindowMs: 200 },
      },
    ])
    const { onTrialRecorded, onComplete } = renderRunner({ test })

    await startStandardTrial()
    await pressKey(' ')
    await advance(400)

    await advance(400)
    await advance(200)
    await advance(400)

    await pressKey(' ')
    await advance(400)

    expect(onTrialRecorded).toHaveBeenCalledTimes(3)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onTrialRecorded.mock.calls.map(([record]) => (record as TrialRecord).trialIndex)).toEqual([0, 1, 2])
    expect(onTrialRecorded.mock.calls.map(([record]) => (record as TrialRecord).condition)).toEqual(['go', 'nogo', 'go'])
    expect(onTrialRecorded.mock.calls.map(([record]) => (record as TrialRecord).stimulus)).toEqual([
      'green_circle',
      'red_circle',
      'green_circle',
    ])
    expect((onTrialRecorded.mock.calls[1][0] as TrialRecord).actualResponse).toBe('none')
  })

  it('Corsi saves adaptive state after a correct response', async () => {
    const seed = 123
    const state = createCorsiAdaptiveState(seed)
    const trial = buildCorsiTrial(state, 'assessment')
    const sequence = trial.metadata?.sequence as number[]
    const { container, onTrialRecorded } = renderRunner({
      test: corsiDefinition,
      resumeState: {
        randomizationSeed: seed,
        startedAt: '2026-01-01T00:00:00.000Z',
        recordedTrials: [],
        adaptiveState: { ...state },
      },
    })

    await advance(500)
    await advance(sequence.length * 900)
    await advance(40)
    const buttons = corsiButtons(container)
    for (const pos of sequence) {
      await act(async () => {
        fireEvent.click(buttons[pos])
      })
    }
    await flushMicrotasks()

    expect(onTrialRecorded).toHaveBeenCalledTimes(1)
    const record = onTrialRecorded.mock.calls[0][0] as TrialRecord
    const saved = record.metadata?.adaptiveState as CorsiAdaptiveState
    expect(saved.trialCount).toBe(1)
    expect(saved.consecutiveCorrect).toBe(1)
    expect(saved.errorsAtSpan).toBe(0)
  })

  it('Corsi saves adaptive state after an error', async () => {
    const seed = 456
    const state = createCorsiAdaptiveState(seed)
    const trial = buildCorsiTrial(state, 'assessment')
    const sequence = trial.metadata?.sequence as number[]
    const wrong = (sequence[0] + 1) % 9
    const { container, onTrialRecorded } = renderRunner({
      test: corsiDefinition,
      resumeState: {
        randomizationSeed: seed,
        startedAt: '2026-01-01T00:00:00.000Z',
        recordedTrials: [],
        adaptiveState: { ...state },
      },
    })

    await advance(500)
    await advance(sequence.length * 900)
    await advance(40)
    await act(async () => {
      fireEvent.click(corsiButtons(container)[wrong])
    })
    await flushMicrotasks()

    expect(onTrialRecorded).toHaveBeenCalledTimes(1)
    const record = onTrialRecorded.mock.calls[0][0] as TrialRecord
    const saved = record.metadata?.adaptiveState as CorsiAdaptiveState
    expect(saved.trialCount).toBe(1)
    expect(saved.errorsAtSpan).toBe(1)
  })

  it('Corsi resume uses the post-result adaptive state', async () => {
    const seed = 789
    const state = createCorsiAdaptiveState(seed)
    const firstTrial = buildCorsiTrial(state, 'assessment')
    const firstSequence = firstTrial.metadata?.sequence as number[]
    const firstRun = renderRunner({
      test: corsiDefinition,
      resumeState: {
        randomizationSeed: seed,
        startedAt: '2026-01-01T00:00:00.000Z',
        recordedTrials: [],
        adaptiveState: { ...state },
      },
    })

    await advance(500)
    await advance(firstSequence.length * 900)
    await advance(40)
    for (const pos of firstSequence) {
      await act(async () => {
        fireEvent.click(corsiButtons(firstRun.container)[pos])
      })
    }
    await flushMicrotasks()
    const firstRecord = firstRun.onTrialRecorded.mock.calls[0][0] as TrialRecord
    const saved = firstRecord.metadata?.adaptiveState as CorsiAdaptiveState

    cleanup()

    const expectedResumeTrial = buildCorsiTrial(saved, 'assessment')
    const resumeSequence = expectedResumeTrial.metadata?.sequence as number[]
    const resumed = renderRunner({
      test: corsiDefinition,
      resumeState: {
        randomizationSeed: seed,
        startedAt: '2026-01-01T00:00:00.000Z',
        recordedTrials: [firstRecord],
        adaptiveState: { ...saved },
      },
    })

    await advance(500)
    await advance(resumeSequence.length * 900)
    await advance(40)
    for (const pos of resumeSequence) {
      await act(async () => {
        fireEvent.click(corsiButtons(resumed.container)[pos])
      })
    }
    await flushMicrotasks()

    const resumedRecord = resumed.onTrialRecorded.mock.calls[0][0] as TrialRecord
    expect(resumedRecord.expectedResponse).toBe(expectedResumeTrial.expectedResponse)
    expect(resumedRecord.trialIndex).toBe(saved.trialCount)
  })

  it('StrictMode development remount does not call onInterrupted', async () => {
    const test = makeTest('simple_rt', [
      {
        blockIndex: 0,
        trialIndex: 0,
        condition: 'simple',
        stimulus: 'green_circle',
        expectedResponse: 'space',
      },
    ])
    const { onInterrupted } = renderRunner({ test, strict: true })

    await advance(0)
    expect(onInterrupted).not.toHaveBeenCalled()
  })

  it('real unmount still calls onInterrupted for an incomplete assessment', async () => {
    const test = makeTest('simple_rt', [
      {
        blockIndex: 0,
        trialIndex: 0,
        condition: 'simple',
        stimulus: 'green_circle',
        expectedResponse: 'space',
      },
    ])
    const view = renderRunner({ test })

    view.unmount()
    await advance(0)
    expect(view.onInterrupted).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['fixation', async () => { await advance(1500) }],
    ['isi', async () => { await advance(1500); await advance(400) }],
    ['stimulus', async () => { await startStandardTrial() }],
    ['response', async () => { await startStandardTrial(); await advance(100) }],
  ])('Escape aborts during %s without recording a trial', async (_phase, reachPhase) => {
    const test = makeTest('simple_rt', [
      {
        blockIndex: 0,
        trialIndex: 0,
        condition: 'simple',
        stimulus: 'green_circle',
        expectedResponse: 'space',
        isiMs: 1000,
        stimulusDurationMs: 100,
      },
    ])
    const { onAbort, onTrialRecorded } = renderRunner({ test })

    await reachPhase()
    await pressKey('Escape')
    await advance(1000)

    expect(onAbort).toHaveBeenCalledTimes(1)
    expect(onTrialRecorded).not.toHaveBeenCalled()
  })

  it('Task Switching renders the magnitude rule in green', () => {
    render(
      <StimulusDisplay
        testId="taskswitch"
        stimulus="4"
        metadata={{ task: 'magnitude' }}
        phase="stimulus"
      />
    )

    expect(screen.getByText('Maior ou menor que 5 (verde)')).toBeInTheDocument()
    const numberBox = screen.getByText('4')
    expect(numberBox).toHaveStyle({ borderColor: '#22c55e' })
  })
})
