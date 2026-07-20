import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getTest } from '../tests/registry'
import type { TestId, TestMode, SessionFlags, SessionRecord, SessionQuality } from '../types'
import { TestRunner, type TestRunMeta, type TestRunnerResumeState } from '../components/test/TestRunner'
import { detectDevice } from '../utils/device'
import { generateId } from '../utils/id'
import { useApp } from '../context/AppContext'
import type { TestConditions } from '../types'
import { TestConditionsForm } from '../components/test/TestConditionsForm'
import { getBaselinePhase, getValidAssessmentSessions } from '../statistics/baseline'
import {
  evaluatePractice,
  DEFAULT_PRACTICE_CRITERIA,
  type PracticeEvaluation,
} from '../engine/practiceGate'
import {
  appendTrialToSession,
  getSession,
  saveSession,
  updateSessionStatus,
} from '../storage/repository'
import {
  completeAssessmentSession,
  SessionPersistenceError,
} from '../storage/sessionCompletion'
import { canResumeSession } from '../storage/sessionRecovery'


type Step =
  | 'conditions'
  | 'instructions'
  | 'practice'
  | 'practice_failed'
  | 'practice_done'
  | 'assessment'
  | 'done'

export function TestFlow() {
  const { testId } = useParams<{ testId: TestId }>()
  const navigate = useNavigate()
  const { sessions, settings, refresh } = useApp()
  const [persistError, setPersistError] = useState<string | null>(null)
  const [searchParams] = useSearchParams()
  const resumeId = searchParams.get('resume')

  const test = testId ? getTest(testId) : null
  const [step, setStep] = useState<Step>('conditions')
  const [pendingConditions, setPendingConditions] = useState<TestConditions | null>(null)
  const [practiceCompleted, setPracticeCompleted] = useState(false)
  const [practiceEval, setPracticeEval] = useState<PracticeEvaluation | null>(null)
  const [sessionId, setSessionId] = useState(generateId())
  const [resumeState, setResumeState] = useState<TestRunnerResumeState | undefined>()
  const [resumeLoading, setResumeLoading] = useState(!!resumeId)
  const deviceInfo = detectDevice()

  useEffect(() => {
    if (!resumeId || !testId) {
      setResumeLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      const existing = await getSession(resumeId)
      if (cancelled) return
      if (!existing || !canResumeSession(existing)) {
        setResumeLoading(false)
        return
      }
      setSessionId(existing.sessionId)
      setPracticeCompleted(existing.practiceCompleted)
      setResumeState({
        randomizationSeed: existing.randomizationSeed,
        startedAt: existing.startedAt,
        recordedTrials: existing.trials,
        adaptiveState: existing.adaptiveState,
      })
      setStep('assessment')
      setResumeLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [resumeId, testId])

  if (!test) {
    return <div className="p-8">Teste não encontrado.</div>
  }

  if (resumeLoading) {
    return <div className="p-8 text-lab-muted">Carregando sessão...</div>
  }

  const practiceCriteria = test.practiceConfig.practiceCriteria ?? DEFAULT_PRACTICE_CRITERIA

  const initAssessmentSession = async (meta: TestRunMeta) => {
    const session: SessionRecord = {
      sessionId,
      testId: test.id,
      protocolVersion: test.protocolVersion,
      mode: 'assessment',
      status: 'in_progress',
      startedAt: meta.startedAt,
      quality: 'valid',
      flags: {},
      flagMessages: [],
      trials: [],
      checkIn: pendingConditions ?? undefined,
      deviceInfo,
      isDemo: false,
      practiceCompleted,
      randomizationSeed: meta.randomizationSeed,
      trialProgress: 0,
    }
    await saveSession(session)
  }

  const handleTrialRecorded = async (trial: SessionRecord['trials'][0]) => {
    const adaptiveState =
      test.isAdaptive && trial.metadata?.adaptiveState
        ? (trial.metadata.adaptiveState as Record<string, unknown>)
        : undefined
    await appendTrialToSession(sessionId, trial, adaptiveState)
  }

  const handleInterrupted = async () => {
    await updateSessionStatus(sessionId, 'interrupted', {
      flagMessages: ['Sessão interrompida antes da conclusão.'],
      flags: { incomplete: true },
      quality: 'invalid' as SessionQuality,
    })
  }

  const handleAbort = async () => {
    if (step === 'assessment') {
      await updateSessionStatus(sessionId, 'abandoned', {
        flags: { incomplete: true },
        quality: 'invalid',
        flagMessages: ['Sessão abandonada pelo usuário.'],
      })
    }
    navigate('/catalog')
  }

  const handleComplete = async (
    trials: SessionRecord['trials'],
    flags: SessionFlags,
    meta: TestRunMeta,
    mode: TestMode
  ) => {
    if (mode === 'training') {
      const evaluation = evaluatePractice(trials, practiceCriteria)
      setPracticeEval(evaluation)
      if (evaluation.passed) {
        setPracticeCompleted(true)
        setStep('practice_done')
      } else {
        setStep('practice_failed')
      }
      return
    }

    const scored = test.scoreSession(trials, mode, deviceInfo, flags as Record<string, boolean>)
    // Fase da sessão corrente = contagem de sessões elegíveis ANTERIORES
    // (mesma régua do baseline; a própria sessão nunca conta — spec §1.1).
    const phase = getBaselinePhase(
      getValidAssessmentSessions(sessions, test.id, test.protocolVersion).length
    )

    const sessionFlags = { ...scored.flags, ...flags }
    const skipPractice = settings.developerMode && !practiceCompleted
    if (skipPractice) {
      sessionFlags.insufficientPractice = true
    }

    const completedAt = new Date().toISOString()
    const flagMessages = [
      ...scored.flagMessages,
      ...(sessionFlags.insufficientPractice
        ? ['Avaliação sem treino válido (modo desenvolvedor). Excluída do baseline.']
        : []),
    ]

    if (!sessionId) {
      setPersistError('ID da sessão indefinido — resultados não salvos.')
      return
    }

    const lastTrial = trials[trials.length - 1]
    if (lastTrial && lastTrial.sessionId !== sessionId) {
      setPersistError(
        `ID inconsistente nos ensaios: esperado ${sessionId}, recebido ${lastTrial.sessionId}`
      )
      return
    }

    const session: SessionRecord = {
      sessionId,
      testId: test.id,
      protocolVersion: test.protocolVersion,
      mode,
      status: 'completed',
      startedAt: meta.startedAt,
      completedAt,
      quality: scored.quality,
      flags: sessionFlags,
      flagMessages,
      trials,
      checkIn: pendingConditions ?? undefined,
      deviceInfo,
      isDemo: false,
      practiceCompleted: practiceCompleted || skipPractice,
      randomizationSeed: meta.randomizationSeed,
      trialProgress: trials.length,
      adaptiveState: test.isAdaptive
        ? (trials.at(-1)?.metadata?.adaptiveState as Record<string, unknown>)
        : undefined,
      result: {
        ...scored,
        sessionId,
        startedAt: meta.startedAt,
        completedAt,
        isDemo: false,
        baselinePhase: phase,
        flags: sessionFlags,
        flagMessages,
      },
    }

    try {
      await completeAssessmentSession(session)
      await refresh()
      navigate(`/results/${sessionId}`)
    } catch (err) {
      const message =
        err instanceof SessionPersistenceError
          ? err.message
          : 'Falha ao salvar resultados. Tente novamente ou exporte os dados.'
      if (import.meta.env.DEV) {
        console.error('[handleComplete]', err)
      }
      setPersistError(message)
    }
  }

  const startAssessment = () => {
    if (!practiceCompleted && !settings.developerMode) return
    setStep('assessment')
  }

  if (step === 'conditions') {
    return (
      <TestConditionsForm
        onConfirm={(cond) => {
          setPendingConditions(cond)
          setStep('instructions')
        }}
        onSkip={() => {
          setPendingConditions(null)
          setStep('instructions')
        }}
      />
    )
  }

  if (step === 'instructions') {
    const instr = test.instructions
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-2">{instr.title}</h1>
        <p className="text-lab-muted mb-6">{instr.summary}</p>
        <div className="card p-5 mb-6">
          <h3 className="text-sm font-medium mb-3">Instruções</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            {instr.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>
        <div className="card p-5 mb-6">
          <h3 className="text-sm font-medium mb-3">Teclas</h3>
          <div className="flex flex-wrap gap-3">
            {instr.keys.map((k) => (
              <span key={k.key} className="text-sm">
                <kbd className="kbd">{k.key.toUpperCase()}</kbd> {k.action}
              </span>
            ))}
          </div>
        </div>
        <p className="text-xs text-lab-muted mb-6">{instr.tips.join(' ')}</p>
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary" onClick={() => setStep('practice')}>
            Iniciar treino (obrigatório)
          </button>
          {settings.developerMode && (
            <button
              className="btn-secondary"
              onClick={() => {
                setPracticeCompleted(false)
                setStep('assessment')
              }}
            >
              Pular treino (dev)
            </button>
          )}
        </div>
      </div>
    )
  }

  if (step === 'practice_failed' && practiceEval) {
    return (
      <div className="p-8 max-w-lg mx-auto">
        <h2 className="text-xl font-medium mb-2">Treino não atingiu o critério</h2>
        <p className="text-lab-muted mb-4">
          Precisão: {(practiceEval.accuracy * 100).toFixed(0)}% (mínimo{' '}
          {(practiceCriteria.minAccuracy * 100).toFixed(0)}%)
        </p>
        {practiceEval.errors.length > 0 && (
          <ul className="text-sm text-lab-muted mb-6 space-y-1">
            {practiceEval.errors.map((e) => (
              <li key={e.kind}>· {e.label}: {e.count}</li>
            ))}
          </ul>
        )}
        <button className="btn-primary" onClick={() => setStep('practice')}>
          Repetir treino
        </button>
      </div>
    )
  }

  if (step === 'practice_done') {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <h2 className="text-xl font-medium mb-4">Treino concluído</h2>
        <p className="text-lab-muted mb-6">
          Critério atingido. Os dados do treino não entram nas estatísticas longitudinais.
        </p>
        <button className="btn-primary" onClick={startAssessment}>
          Iniciar avaliação
        </button>
      </div>
    )
  }

  const mode: TestMode = step === 'practice' ? 'training' : 'assessment'

  if (persistError) {
    return (
      <div className="p-8 max-w-lg mx-auto">
        <h2 className="text-xl font-medium mb-2">Erro ao salvar resultados</h2>
        <p className="text-lab-muted mb-4">{persistError}</p>
        <button className="btn-secondary" onClick={() => navigate('/catalog')}>
          Voltar ao catálogo
        </button>
      </div>
    )
  }

  return (
    <TestRunner
      test={test}
      mode={mode}
      sessionId={sessionId}
      deviceInfo={deviceInfo}
      refreshRateHz={deviceInfo.refreshRateEstimate ?? 60}
      resumeState={mode === 'assessment' ? resumeState : undefined}
      onSessionStart={mode === 'assessment' && !resumeState ? initAssessmentSession : undefined}
      onTrialRecorded={mode === 'assessment' ? handleTrialRecorded : undefined}
      onInterrupted={mode === 'assessment' ? handleInterrupted : undefined}
      onComplete={(trials, flags, meta) => handleComplete(trials, flags, meta, mode)}
      onAbort={handleAbort}
    />
  )
}