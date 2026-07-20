import { cleanup, fireEvent, render, screen, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TestRunner } from '../TestRunner'
import type { DeviceInfo, SessionResult, TestMode } from '../../../types'
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

describe('TestRunner — falha de persistência (P1-6)', () => {
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

  it('rejeição de onTrialRecorded mostra estado de erro em vez de congelar', async () => {
    const test = makeSimpleTest([
      { blockIndex: 0, trialIndex: 0, condition: 'simple', stimulus: 'green_circle', expectedResponse: 'space', isiMs: 100 },
      { blockIndex: 0, trialIndex: 1, condition: 'simple', stimulus: 'green_circle', expectedResponse: 'space', isiMs: 100 },
    ])
    const onTrialRecorded = vi.fn().mockRejectedValue(new Error('quota exceeded'))
    const onAbort = vi.fn()
    const onComplete = vi.fn()

    render(
      <TestRunner
        test={test}
        mode="assessment"
        sessionId="sess-err"
        deviceInfo={deviceInfo}
        refreshRateHz={60}
        onTrialRecorded={onTrialRecorded}
        onComplete={onComplete}
        onAbort={onAbort}
        onInterrupted={vi.fn()}
      />
    )

    // ready(1500) → fixation(400) → isi(100) → duplo rAF
    await advance(1500)
    await advance(400)
    await advance(100)
    await advance(48)

    await act(async () => {
      fireEvent.keyDown(window, { key: ' ' })
    })
    await flushMicrotasks()

    expect(onTrialRecorded).toHaveBeenCalledOnce()
    expect(screen.getByText(/Falha ao gravar o ensaio/)).toBeInTheDocument()

    // Botão de saída funciona e não há progresso fantasma
    await act(async () => {
      fireEvent.click(screen.getByText('Sair do teste'))
    })
    expect(onAbort).toHaveBeenCalledOnce()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('sessão sem falha continua fluindo normalmente (regressão)', async () => {
    const test = makeSimpleTest([
      { blockIndex: 0, trialIndex: 0, condition: 'simple', stimulus: 'green_circle', expectedResponse: 'space', isiMs: 100 },
    ])
    const onComplete = vi.fn()

    render(
      <TestRunner
        test={test}
        mode="assessment"
        sessionId="sess-ok"
        deviceInfo={deviceInfo}
        refreshRateHz={60}
        onTrialRecorded={vi.fn().mockResolvedValue(undefined)}
        onComplete={onComplete}
        onAbort={vi.fn()}
        onInterrupted={vi.fn()}
      />
    )

    await advance(1500)
    await advance(400)
    await advance(100)
    await advance(48)

    await act(async () => {
      fireEvent.keyDown(window, { key: ' ' })
    })
    await flushMicrotasks()
    await advance(50)

    expect(onComplete).toHaveBeenCalledOnce()
    expect(screen.queryByText(/Falha ao gravar/)).not.toBeInTheDocument()
  })
})
