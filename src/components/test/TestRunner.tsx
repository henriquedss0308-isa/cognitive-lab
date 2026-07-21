import { useCallback, useEffect, useRef, useState } from 'react'
import type { DeviceInfo, SessionFlags, TestMode, TrialRecord } from '../../types'
import type { CognitiveTestDefinition, GeneratedTrial } from '../../tests/types'
import { StimulusDisplay } from './StimulusDisplay'
import { buildTrialRecord } from '../../engine/trialRecorder'
import {
  applyCorsiResult,
  buildCorsiTrial,
  createCorsiAdaptiveState,
  deserializeCorsiState,
  serializeCorsiState,
  type CorsiAdaptiveState,
} from '../../tests/corsi/adaptive'
import { FrameMonitor, registerStimulusOnset } from '../../utils/frameMonitor'
import { highResTimestamp, waitCancellable, createFocusTracker, updateFocusTracker } from '../../utils/timing'

type Phase =
  | 'ready'
  | 'fixation'
  | 'isi'
  | 'stimulus'
  | 'response'
  | 'feedback'
  | 'block_break'
  | 'done'

export interface TestRunMeta {
  randomizationSeed: number
  startedAt: string
}

export interface TestRunnerResumeState {
  randomizationSeed: number
  startedAt: string
  recordedTrials: TrialRecord[]
  adaptiveState?: Record<string, unknown>
}

interface Props {
  test: CognitiveTestDefinition
  mode: TestMode
  sessionId: string
  deviceInfo: DeviceInfo
  refreshRateHz?: number
  resumeState?: TestRunnerResumeState
  onComplete: (trials: TrialRecord[], flags: SessionFlags, meta: TestRunMeta) => void | Promise<void>
  onAbort: () => void
  onInterrupted?: () => void
  onTrialRecorded?: (trial: TrialRecord) => void | Promise<void>
  onSessionStart?: (meta: TestRunMeta) => void
}

function responseWindowMs(testId: string, trial?: GeneratedTrial): number {
  if (trial?.metadata?.responseWindowMs != null) {
    return trial.metadata.responseWindowMs as number
  }
  if (testId === 'sart') return trial?.isiMs ?? 900
  if (testId === 'simple_rt') return 1500
  if (testId === 'nback') return 2500
  return 2000
}



export function TestRunner({
  test,
  mode,
  sessionId,
  deviceInfo,
  refreshRateHz = 60,
  onComplete,
  onAbort,
  onInterrupted,
  onTrialRecorded,
  onSessionStart,
  resumeState,
}: Props) {
  const config = mode === 'assessment' ? test.assessmentConfig : test.practiceConfig
  const seed = useRef(resumeState?.randomizationSeed ?? Math.floor(Math.random() * 1e9))
  const startedAt = useRef(resumeState?.startedAt ?? new Date().toISOString())
  const trialsRef = useRef<GeneratedTrial[]>(
    test.isAdaptive ? [] : test.generateTrials(mode, seed.current)
  )
  const recordedTrials = useRef<TrialRecord[]>(resumeState?.recordedTrials ?? [])
  const focusTracker = useRef(createFocusTracker())
  const stimulusOnset = useRef(0)
  const onsetReady = useRef(false)
  const responded = useRef(false)
  const running = useRef(true)
  const completedRef = useRef(false)
  const intentionalAbort = useRef(false)
  const tabHidden = useRef(false)
  const trialToken = useRef(0)
  const trialClaimed = useRef(false)
  const trialFinalized = useRef(false)
  // Teclas de resposta pressionadas durante fixação/ISI do trial corrente
  // (spec §14) — contadas sem criar trial nem RT.
  const earlyPresses = useRef(0)
  const pendingRecordPromise = useRef<Promise<TrialRecord> | null>(null)
  const interruptionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loopAbort = useRef<AbortController | null>(null)
  const frameMonitor = useRef<FrameMonitor | null>(null)
  const corsiState = useRef<CorsiAdaptiveState>(
    resumeState?.adaptiveState
      ? deserializeCorsiState(resumeState.adaptiveState)
      : createCorsiAdaptiveState(seed.current)
  )
  // Stores the correctness result when a response is recorded mid-trial
  // in a fixed-duration test, so finalization can show training feedback.
  const pendingCorrectness = useRef<boolean | null>(null)

  const [phase, setPhase] = useState<Phase>('ready')
  const [trialIdx, setTrialIdx] = useState(0)
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null)
  const [focusWarning, setFocusWarning] = useState(false)
  const [corsiHighlight, setCorsiHighlight] = useState(-1)
  const [corsiTrialMeta, setCorsiTrialMeta] = useState<GeneratedTrial | null>(null)
  const [droppedFramesWarning, setDroppedFramesWarning] = useState(false)
  const [fatalError, setFatalError] = useState<string | null>(null)

  const inputMethod = test.id === 'corsi' ? 'mouse' : 'keyboard'
  const currentTrial = test.isAdaptive ? corsiTrialMeta : trialsRef.current[trialIdx]

  const beginTrialLoop = useCallback(() => {
    loopAbort.current?.abort()
    loopAbort.current = new AbortController()
    trialToken.current += 1
    responded.current = false
    trialClaimed.current = false
    trialFinalized.current = false
    onsetReady.current = false
    stimulusOnset.current = 0
    pendingCorrectness.current = null
    pendingRecordPromise.current = null
    earlyPresses.current = 0
    return { token: trialToken.current, signal: loopAbort.current.signal }
  }, [])

  const isStale = useCallback((token: number) => token !== trialToken.current || !running.current, [])

  const claimTrial = useCallback(
    (token: number) => {
      if (isStale(token) || trialClaimed.current) return false
      trialClaimed.current = true
      responded.current = true
      return true
    },
    [isStale]
  )

  const persistTrial = useCallback(
    async (trial: TrialRecord) => {
      recordedTrials.current.push(trial)
      try {
        await onTrialRecorded?.(trial)
      } catch (err) {
        // Falha de armazenamento não pode congelar a sessão em silêncio:
        // para o loop e mostra estado de erro recuperável (spec/P1-6).
        if (import.meta.env.DEV) {
          console.error('[persistTrial] falha ao gravar ensaio', err)
        }
        running.current = false
        loopAbort.current?.abort()
        setFatalError(
          'Falha ao gravar o ensaio no armazenamento local. A sessão foi interrompida; os ensaios já gravados foram preservados.'
        )
        throw new DOMException('Aborted', 'AbortError')
      }
    },
    [onTrialRecorded]
  )

  const recordAndPersist = useCallback(
    async (params: Parameters<typeof buildTrialRecord>[0]) => {
      const record = buildTrialRecord(params)
      await persistTrial(record)
      return record
    },
    [persistTrial]
  )

  const advanceTrial = useCallback(() => {
    if (test.isAdaptive) {
      if (corsiState.current.ended) {
        setPhase('done')
        return
      }
      setPhase('fixation')
      return
    }

    const next = trialIdx + 1
    if (next >= trialsRef.current.length) {
      setPhase('done')
      return
    }

    const prevBlock = trialsRef.current[trialIdx]?.blockIndex
    const nextBlock = trialsRef.current[next]?.blockIndex
    if (prevBlock !== undefined && nextBlock !== undefined && prevBlock !== nextBlock) {
      setTrialIdx(next)
      setPhase('block_break')
      return
    }

    setTrialIdx(next)
    setPhase('fixation')
  }, [trialIdx, test.isAdaptive])

  const finalizeTrial = useCallback(
    (wasCorrect: boolean | null) => {
      if (mode === 'training' && wasCorrect !== null) {
        setFeedback(wasCorrect ? 'correct' : 'incorrect')
        setPhase('feedback')
      } else {
        advanceTrial()
      }
    },
    [mode, advanceTrial]
  )

  const finalizeTrialOnce = useCallback(
    (token: number, wasCorrect: boolean | null) => {
      if (isStale(token) || trialFinalized.current) return
      trialFinalized.current = true
      finalizeTrial(wasCorrect)
    },
    [finalizeTrial, isStale]
  )

  const abortRun = useCallback(() => {
    intentionalAbort.current = true
    loopAbort.current?.abort()
    onAbort()
  }, [onAbort])

  const runCorsiSequence = useCallback(
    async (token: number, signal: AbortSignal) => {
      const trial = buildCorsiTrial(corsiState.current, mode === 'training' ? 'training' : 'assessment')
      setCorsiTrialMeta(trial)
      corsiSequence_reset()
      setPhase('stimulus')

      const sequence = (trial.metadata?.sequence as number[]) ?? []
      for (const pos of sequence) {
        if (isStale(token)) return
        setCorsiHighlight(pos)
        await waitCancellable(600, signal)
        setCorsiHighlight(-1)
        await waitCancellable(300, signal)
      }

      frameMonitor.current = new FrameMonitor(refreshRateHz)
      frameMonitor.current.start()

      const onset = await registerStimulusOnset(() => setPhase('response'))
      if (isStale(token)) return
      stimulusOnset.current = onset
      onsetReady.current = true
    },
    [mode, refreshRateHz, isStale]
  )

  const corsiSequence_reset = () => {
    corsiUserClicks.current = []
  }
  const corsiUserClicks = useRef<number[]>([])
  const corsiSequence = useRef<number[]>([])

  useEffect(() => {
    if (corsiTrialMeta?.metadata?.sequence) {
      corsiSequence.current = corsiTrialMeta.metadata.sequence as number[]
    }
  }, [corsiTrialMeta])

  const runFixedTrial = useCallback(
    async (token: number, signal: AbortSignal) => {
      const trial = trialsRef.current[trialIdx]
      if (!trial) return

      setFeedback(null)

      const fixedDuration = config.advancePolicy === 'fixed-duration'

      if (!fixedDuration) {
        // Standard tests: show fixation cross, then ISI, then stimulus
        setPhase('fixation')
        await waitCancellable(400, signal)
        if (isStale(token)) return

        setPhase('isi')
        await waitCancellable(trial.isiMs ?? 1000, signal)
        if (isStale(token)) return
      }

      frameMonitor.current = new FrameMonitor(refreshRateHz)
      frameMonitor.current.start()

      const onset = await registerStimulusOnset(() => setPhase('stimulus'))
      if (isStale(token)) return
      stimulusOnset.current = onset
      onsetReady.current = true

      const stimDuration = trial.stimulusDurationMs ?? 0
      if (stimDuration > 0) {
        await waitCancellable(stimDuration, signal)
        if (isStale(token)) return
        setPhase('response')
      } else {
        setPhase('response')
      }

      const window = responseWindowMs(test.id, trial)
      try {
        await waitCancellable(window, signal)
      } catch {
        // Signal aborted (unmount or escape) — bail out
        return
      }

      if (isStale(token)) return

      if (!responded.current) {
        if (!claimTrial(token)) return
        // Timeout path: participant did not respond within the window
        const frameSnap = frameMonitor.current?.stop() ?? { droppedFramesEstimate: 0, excessiveJitter: false }
        if (frameSnap.excessiveJitter) setDroppedFramesWarning(true)

        const recordPromise = recordAndPersist({
          trial,
          sessionId,
          testId: test.id,
          protocolVersion: test.protocolVersion,
          mode,
          deviceInfo,
          inputMethod,
          stimulusOnsetTimestamp: stimulusOnset.current,
          timedOut: true,
          droppedFramesEstimate: frameSnap.droppedFramesEstimate,
          windowFocused: focusTracker.current.isFocused,
          visibilityState: document.visibilityState,
          cleaning: config.cleaningRules,
          extraMeta:
            earlyPresses.current > 0 ? { earlyPressCount: earlyPresses.current } : undefined,
        })
        pendingRecordPromise.current = recordPromise
        const record = await recordPromise
        if (pendingRecordPromise.current === recordPromise) pendingRecordPromise.current = null
        if (isStale(token)) return

        finalizeTrialOnce(token, mode === 'training' ? record.correct : null)
      } else {
        // Response was already recorded mid-trial by handleKeyDown.
        // The full visual cycle (stimulus + mask) has now completed.
        // Stop the frame monitor and advance.
        let correctness = pendingCorrectness.current
        const pending = pendingRecordPromise.current
        if (pending) {
          const record = await pending
          if (pendingRecordPromise.current === pending) pendingRecordPromise.current = null
          if (isStale(token)) return
          correctness = record.correct
          pendingCorrectness.current = record.correct
        }
        frameMonitor.current?.stop()
        finalizeTrialOnce(token, mode === 'training' ? (correctness ?? null) : null)
      }
    },
    [
      trialIdx,
      test,
      mode,
      sessionId,
      deviceInfo,
      inputMethod,
      config,
      refreshRateHz,
      isStale,
      claimTrial,
      recordAndPersist,
      finalizeTrialOnce,
    ]
  )

  const runTrialLoop = useCallback(async () => {
    const { token, signal } = beginTrialLoop()
    try {
      if (test.isAdaptive) {
        await runCorsiSequence(token, signal)
      } else {
        await runFixedTrial(token, signal)
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        if (import.meta.env.DEV) console.error('[runTrialLoop]', e)
        running.current = false
        setFatalError('Erro inesperado durante o ensaio. A sessão foi interrompida.')
      }
    }
  }, [beginTrialLoop, test.isAdaptive, runCorsiSequence, runFixedTrial])

  useEffect(() => {
    if (phase === 'fixation') runTrialLoop()
  }, [phase, trialIdx, runTrialLoop])

  useEffect(() => {
    if (interruptionTimer.current) {
      clearTimeout(interruptionTimer.current)
      interruptionTimer.current = null
    }
    running.current = true
    completedRef.current = false
    intentionalAbort.current = false

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') tabHidden.current = true
      updateFocusTracker(focusTracker.current)
      if (!focusTracker.current.isFocused) setFocusWarning(true)
    }
    window.addEventListener('blur', handleVisibility)
    window.addEventListener('focus', handleVisibility)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      running.current = false
      loopAbort.current?.abort()
      frameMonitor.current?.stop()
      window.removeEventListener('blur', handleVisibility)
      window.removeEventListener('focus', handleVisibility)
      document.removeEventListener('visibilitychange', handleVisibility)
      if (!completedRef.current && mode === 'assessment' && !intentionalAbort.current) {
        interruptionTimer.current = setTimeout(() => {
          if (!running.current && !completedRef.current && !intentionalAbort.current) {
            onInterrupted?.()
          }
        }, 0)
      }
    }
  }, [mode, onInterrupted])

  useEffect(() => {
    if (phase === 'ready') {
      if (!resumeState) {
        startedAt.current = new Date().toISOString()
        seed.current = Math.floor(Math.random() * 1e9)
      }
      const meta = { randomizationSeed: seed.current, startedAt: startedAt.current }
      onSessionStart?.(meta)
      if (test.isAdaptive) {
        if (!resumeState?.adaptiveState) {
          corsiState.current = createCorsiAdaptiveState(seed.current)
        }
      } else if (!resumeState) {
        trialsRef.current = test.generateTrials(mode, seed.current)
      }
      const t = setTimeout(() => setPhase('fixation'), resumeState ? 500 : 1500)
      return () => clearTimeout(t)
    }
  }, [phase, mode, test, onSessionStart, resumeState])

  useEffect(() => {
    if (phase === 'done' && !completedRef.current) {
      completedRef.current = true
      const flags: SessionFlags = {
        windowLostFocus: focusTracker.current.lostFocusCount > 0,
        tabChanged: tabHidden.current,
        droppedFrames: droppedFramesWarning,
      }
      void onComplete(recordedTrials.current, flags, {
        randomizationSeed: seed.current,
        startedAt: startedAt.current,
      })
    }
  }, [phase, onComplete, droppedFramesWarning])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (key === 'escape') {
        // Após 'done' a sessão já está sendo concluída — ESC tardio não pode
        // rebaixá-la para abandonada (spec §8).
        if (phase === 'done' || completedRef.current) return
        e.preventDefault()
        abortRun()
        return
      }

      if (e.repeat) return
      if (test.id === 'corsi') return

      const isSpaceTest = ['simple_rt', 'gonogo', 'sart', 'nback'].includes(test.id)
      const isKeyTest = ['choice_rt', 'stroop', 'taskswitch'].includes(test.id)
      const isResponseKey =
        (isSpaceTest && key === ' ') || (isKeyTest && ['f', 'g', 'h', 'j'].includes(key))

      // Antecipação fora da janela: tecla de resposta durante fixação/ISI é
      // contada no trial corrente (spec §14) — sem trial, sem RT.
      if (phase === 'fixation' || phase === 'isi') {
        if (isResponseKey) {
          if (key === ' ') e.preventDefault()
          earlyPresses.current += 1
        }
        return
      }

      if (phase !== 'stimulus' && phase !== 'response') return

      const token = trialToken.current
      const trial = test.isAdaptive ? corsiTrialMeta : trialsRef.current[trialIdx]
      if (!trial || responded.current || isStale(token)) return

      let response: string | null = null
      if (isSpaceTest && key === ' ') {
        e.preventDefault()
        response = 'space'
      } else if (isKeyTest && ['f', 'g', 'h', 'j'].includes(key)) {
        response = key
      }
      if (!response) return

      const beforeOnset = !onsetReady.current
      const responseTs = highResTimestamp()
      const fixedDuration = config.advancePolicy === 'fixed-duration'
      if (!claimTrial(token)) return

      // For fixed-duration tests, don't stop the frame monitor yet —
      // the trial timer must continue running.
      const frameSnap = fixedDuration
        ? { droppedFramesEstimate: 0, excessiveJitter: false }
        : (frameMonitor.current?.stop() ?? { droppedFramesEstimate: 0, excessiveJitter: false })
      if (frameSnap.excessiveJitter) setDroppedFramesWarning(true)

      // For fixed-duration tests: do NOT abort the loop and do NOT finalize.
      // The trial timer in runFixedTrial will continue counting down and
      // will finalize the trial when the full visual cycle completes.
      if (!fixedDuration) {
        loopAbort.current?.abort()
      }

      void (async () => {
        const recordPromise = recordAndPersist({
          trial,
          sessionId,
          testId: test.id,
          protocolVersion: test.protocolVersion,
          mode,
          deviceInfo,
          inputMethod,
          stimulusOnsetTimestamp: stimulusOnset.current,
          actualResponse: response,
          responseTimestamp: responseTs,
          beforeOnset,
          droppedFramesEstimate: frameSnap.droppedFramesEstimate,
          windowFocused: focusTracker.current.isFocused,
          visibilityState: document.visibilityState,
          cleaning: config.cleaningRules,
          extraMeta:
            earlyPresses.current > 0 ? { earlyPressCount: earlyPresses.current } : undefined,
        })
        pendingRecordPromise.current = recordPromise
        const record = await recordPromise
        if (pendingRecordPromise.current === recordPromise) pendingRecordPromise.current = null
        if (isStale(token)) return
        if (fixedDuration) {
          // Store correctness for later finalization by runFixedTrial
          pendingCorrectness.current = record.correct
        } else {
          finalizeTrialOnce(token, mode === 'training' ? record.correct : null)
        }
      })().catch((e) => {
        if ((e as Error).name !== 'AbortError') {
          running.current = false
          setFatalError('Erro ao registrar a resposta. A sessão foi interrompida.')
        }
      })
    },
    [
      phase,
      test,
      trialIdx,
      corsiTrialMeta,
      mode,
      sessionId,
      deviceInfo,
      inputMethod,
      config,
      isStale,
      claimTrial,
      recordAndPersist,
      finalizeTrialOnce,
      abortRun,
    ]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    if (phase === 'feedback') {
      const t = setTimeout(() => advanceTrial(), 500)
      return () => clearTimeout(t)
    }
  }, [phase, advanceTrial])

  const handleCorsiClick = (pos: number) => {
    if (test.id !== 'corsi' || phase !== 'response' || !corsiTrialMeta || responded.current) return
    if (!onsetReady.current) return

    corsiUserClicks.current.push(pos)
    const expected = corsiSequence.current
    const idx = corsiUserClicks.current.length - 1
    const responseTs = highResTimestamp()

    if (corsiUserClicks.current[idx] !== expected[idx]) {
      const token = trialToken.current
      if (!claimTrial(token)) return
      loopAbort.current?.abort()
      const frameSnap = frameMonitor.current?.stop() ?? { droppedFramesEstimate: 0, excessiveJitter: false }
      const partial = idx
      const nextState = applyCorsiResult(
        corsiState.current,
        { correct: false, partialPositionsCorrect: partial, userResponse: corsiUserClicks.current.join(',') },
        mode === 'training' ? 'training' : 'assessment',
        config.trialCount
      )
      void (async () => {
      await recordAndPersist({
        trial: corsiTrialMeta,
        sessionId,
        testId: test.id,
        protocolVersion: test.protocolVersion,
        mode,
        deviceInfo,
        inputMethod,
        stimulusOnsetTimestamp: stimulusOnset.current,
        actualResponse: corsiUserClicks.current.join(','),
        responseTimestamp: responseTs,
        droppedFramesEstimate: frameSnap.droppedFramesEstimate,
        windowFocused: focusTracker.current.isFocused,
        visibilityState: document.visibilityState,
        cleaning: config.cleaningRules,
        extraMeta: {
          span: corsiState.current.currentSpan,
          partialPositionsCorrect: partial,
          endReason: nextState.endReason,
          adaptiveState: serializeCorsiState(nextState),
        },
      })
      if (isStale(token)) return

      corsiState.current = nextState

      finalizeTrialOnce(token, mode === 'training' ? false : null)
      })().catch((e) => {
        if ((e as Error).name !== 'AbortError') {
          running.current = false
          setFatalError('Erro ao registrar a resposta. A sessão foi interrompida.')
        }
      })
      return
    }

    if (corsiUserClicks.current.length === expected.length) {
      const token = trialToken.current
      if (!claimTrial(token)) return
      loopAbort.current?.abort()
      const frameSnap = frameMonitor.current?.stop() ?? { droppedFramesEstimate: 0, excessiveJitter: false }
      const nextState = applyCorsiResult(
        corsiState.current,
        { correct: true, partialPositionsCorrect: expected.length, userResponse: expected.join(',') },
        mode === 'training' ? 'training' : 'assessment',
        config.trialCount
      )
      void (async () => {
      await recordAndPersist({
        trial: corsiTrialMeta,
        sessionId,
        testId: test.id,
        protocolVersion: test.protocolVersion,
        mode,
        deviceInfo,
        inputMethod,
        stimulusOnsetTimestamp: stimulusOnset.current,
        actualResponse: expected.join(','),
        responseTimestamp: responseTs,
        droppedFramesEstimate: frameSnap.droppedFramesEstimate,
        windowFocused: focusTracker.current.isFocused,
        visibilityState: document.visibilityState,
        cleaning: config.cleaningRules,
        extraMeta: {
          span: corsiState.current.currentSpan,
          partialPositionsCorrect: expected.length,
          adaptiveState: serializeCorsiState(nextState),
        },
      })
      if (isStale(token)) return

      corsiState.current = nextState

      finalizeTrialOnce(token, mode === 'training' ? true : null)
      })().catch((e) => {
        if ((e as Error).name !== 'AbortError') {
          running.current = false
          setFatalError('Erro ao registrar a resposta. A sessão foi interrompida.')
        }
      })
    }
  }

  const trial = currentTrial
  const progress = test.isAdaptive
    ? `${corsiState.current.trialCount} sequências · span ${corsiState.current.currentSpan}`
    : `Ensaio ${trialIdx + 1} / ${trialsRef.current.length}`

  // Determine what to show: only one visual element at a time.
  const showStimulus = phase === 'stimulus' || phase === 'response' || phase === 'feedback'
  // Fixation cross only for tests that use it (not SART, which has no inter-trial gap)
  const showFixationCross = (phase === 'isi' || phase === 'fixation') && config.advancePolicy !== 'fixed-duration'

  if (fatalError) {
    return (
      <div className="stimulus-surface fixed inset-0 bg-lab-bg flex flex-col items-center justify-center z-50 p-8">
        <h2 className="text-xl font-medium mb-2 text-lab-danger">Sessão interrompida</h2>
        <p className="text-lab-muted mb-6 max-w-md text-center">{fatalError}</p>
        <button className="btn-primary" onClick={abortRun}>Sair do teste</button>
      </div>
    )
  }

  if (phase === 'block_break') {
    return (
      <div className="stimulus-surface fixed inset-0 bg-lab-bg flex flex-col items-center justify-center z-50">
        <h2 className="text-xl font-medium mb-2">Pausa entre blocos</h2>
        <p className="text-lab-muted mb-6">Bloco {(trial?.blockIndex ?? 0) + 1} concluído</p>
        <button className="btn-primary" onClick={() => setPhase('fixation')}>Continuar</button>
      </div>
    )
  }

  if (phase === 'ready') {
    return (
      <div className="stimulus-surface fixed inset-0 bg-lab-bg flex flex-col items-center justify-center z-50">
        <p className="text-lab-muted mb-2">{mode === 'training' ? 'Treino' : 'Avaliação'}</p>
        <h2 className="text-2xl font-medium mb-4">Prepare-se</h2>
        <p className="text-lab-muted">O teste começará em instantes...</p>
      </div>
    )
  }

  return (
    /*
      `stimulus-surface` congela a paleta desta tela: a apresentação do estímulo
      é variável experimental e não pode mudar com o tema da interface, senão
      sessões feitas no claro deixariam de ser comparáveis às feitas no escuro
      e ao histórico já gravado.
    */
    <div className="stimulus-surface fixed inset-0 bg-lab-bg flex flex-col z-50">
      <div className="flex items-center justify-between px-6 py-3 border-b border-lab-border">
        <span className="text-sm text-lab-muted">{test.shortName}</span>
        <span className="text-sm text-lab-muted">{progress}</span>
        <button
          onClick={abortRun}
          className="text-sm text-lab-muted hover:text-lab-danger"
        >
          ESC · Sair
        </button>
      </div>

      {(focusWarning || droppedFramesWarning) && (
        <div className="bg-lab-warning/20 text-lab-warning text-center py-2 text-sm">
          {focusWarning && 'A janela perdeu foco — registrado na qualidade da sessão. '}
          {droppedFramesWarning && 'Estimativa de frames atrasados elevada nesta sessão.'}
        </div>
      )}

      <div className="flex-1 relative">
        {showStimulus && (
          <StimulusDisplay
            testId={test.id}
            stimulus={trial?.stimulus ?? ''}
            metadata={{
              ...trial?.metadata,
              highlight: test.id === 'corsi' ? corsiHighlight : undefined,
            }}
            feedback={mode === 'training' ? feedback : null}
            showMapping={mode === 'training'}
            phase={phase}
            onCorsiBlockClick={handleCorsiClick}
          />
        )}
      </div>

      {showFixationCross && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-lab-muted text-sm">+</span>
        </div>
      )}
    </div>
  )
}
