import type {
  SessionQuality,
  SessionRecord,
  SessionResult,
  TestConditions,
} from '../../../types'
import type { LisdexamfetamineStatus } from '../types'

export const TEST_ID = 'simple_rt' as const
export const PROTOCOL = 'reaction.simple.v1.0'

export const DEVICE: SessionRecord['deviceInfo'] = {
  deviceType: 'desktop',
  inputMethod: 'keyboard',
  screenWidth: 1920,
  screenHeight: 1080,
  browser: 'test',
  userAgent: 'test',
}

export function medicationCheckIn(
  status: LisdexamfetamineStatus | 'absent',
  extra: TestConditions = {}
): TestConditions {
  if (status === 'absent') return { ...extra }
  return { ...extra, medications: { lisdexamfetamine: { status } } }
}

function makeResult(sessionId: string, medianRT: number): SessionResult {
  return {
    sessionId,
    testId: TEST_ID,
    protocolVersion: PROTOCOL,
    mode: 'assessment',
    startedAt: '',
    completedAt: '',
    quality: 'valid',
    flags: {},
    flagMessages: [],
    rtMetrics: {
      medianCorrectRT: medianRT,
      meanCorrectRT: medianRT + 2,
      rtStandardDeviation: 10,
      rtIQR: 12,
      rtCoefficientOfVariation: 0.03,
      p10RT: medianRT - 20,
      p90RT: medianRT + 30,
      anticipationRate: 0,
      lapseRate: 0,
      validTrialCount: 40,
      invalidTrialCount: 0,
    },
    accuracyMetrics: {
      accuracy: 1,
      correctCount: 40,
      errorCount: 0,
      omissionCount: 0,
      totalTrials: 40,
    },
    conditionMetrics: {},
    blockMetrics: [],
    customMetrics: { meanRT: medianRT + 2 },
    isDemo: false,
    deviceInfo: DEVICE,
  }
}

export interface SessionSpec {
  id: string
  /** Dia do mês em 2026-06; usado para ordenar cronologicamente. */
  day: number
  status?: LisdexamfetamineStatus | 'absent'
  medianRT?: number
  quality?: SessionQuality
  isDemo?: boolean
  mode?: SessionRecord['mode']
  sessionStatus?: SessionRecord['status']
  protocolVersion?: string
  insufficientPractice?: boolean
  withoutResult?: boolean
  withoutCompletedAt?: boolean
  checkIn?: TestConditions
  startedAt?: string
}

export function makeSession(spec: SessionSpec): SessionRecord {
  const startedAt =
    spec.startedAt ?? `2026-06-${String(spec.day).padStart(2, '0')}T10:00:00.000Z`
  const completedAt =
    spec.startedAt ?? `2026-06-${String(spec.day).padStart(2, '0')}T10:06:00.000Z`
  const medianRT = spec.medianRT ?? 300

  const session: SessionRecord = {
    sessionId: spec.id,
    testId: TEST_ID,
    protocolVersion: spec.protocolVersion ?? PROTOCOL,
    mode: spec.mode ?? 'assessment',
    status: spec.sessionStatus ?? 'completed',
    startedAt,
    completedAt,
    quality: spec.quality ?? 'valid',
    flags: spec.insufficientPractice ? { insufficientPractice: true } : {},
    flagMessages: [],
    result: makeResult(spec.id, medianRT),
    trials: [],
    checkIn: spec.checkIn ?? medicationCheckIn(spec.status ?? 'absent'),
    deviceInfo: DEVICE,
    isDemo: spec.isDemo ?? false,
    practiceCompleted: true,
    randomizationSeed: spec.day,
  }

  if (spec.withoutResult) delete session.result
  if (spec.withoutCompletedAt) delete session.completedAt
  return session
}

export function makeSessions(specs: SessionSpec[]): SessionRecord[] {
  return specs.map(makeSession)
}

/**
 * Sequência conveniente: N sessões válidas em dias consecutivos, com os
 * estados medicamentosos informados em ordem.
 */
export function sequence(
  statuses: (LisdexamfetamineStatus | 'absent')[],
  options: { startDay?: number; medianRTs?: number[] } = {}
): SessionRecord[] {
  const startDay = options.startDay ?? 1
  return statuses.map((status, i) =>
    makeSession({
      id: `s${i + 1}`,
      day: startDay + i,
      status,
      medianRT: options.medianRTs?.[i],
    })
  )
}

export const METRIC_KEYS = ['medianCorrectRT', 'accuracy', 'rtCV']
