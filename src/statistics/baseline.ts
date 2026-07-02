import type { BaselinePhase, BaselineStats, SessionRecord, TestId } from '../types'
import { mad, median } from './basic'

const FAMILIARIZATION_SESSIONS = 3
const BASELINE_SESSIONS = 8

export function getBaselinePhase(
  validSessionCount: number
): BaselinePhase {
  if (validSessionCount < FAMILIARIZATION_SESSIONS) return 'familiarization'
  if (validSessionCount < FAMILIARIZATION_SESSIONS + BASELINE_SESSIONS) return 'baseline_building'
  if (validSessionCount >= FAMILIARIZATION_SESSIONS + BASELINE_SESSIONS) return 'monitoring'
  return 'insufficient_data'
}

export function getValidAssessmentSessions(
  sessions: SessionRecord[],
  testId: TestId,
  protocolVersion: string
): SessionRecord[] {
  return sessions
    .filter(
      (s) =>
        s.testId === testId &&
        s.protocolVersion === protocolVersion &&
        s.mode === 'assessment' &&
        s.quality !== 'invalid' &&
        !s.isDemo &&
        (!s.status || s.status === 'completed') &&
        s.completedAt &&
        s.result &&
        !s.flags.insufficientPractice
    )
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
}

export function computeBaselineStats(
  sessions: SessionRecord[],
  testId: TestId,
  protocolVersion: string,
  metricKeys: string[]
): BaselineStats {
  const valid = getValidAssessmentSessions(sessions, testId, protocolVersion)
  const phase = getBaselinePhase(valid.length)

  const baselineSessions =
    phase === 'monitoring'
      ? valid.slice(FAMILIARIZATION_SESSIONS, FAMILIARIZATION_SESSIONS + BASELINE_SESSIONS)
      : valid.slice(FAMILIARIZATION_SESSIONS)

  const metrics: BaselineStats['metrics'] = {}

  for (const key of metricKeys) {
    const values: number[] = []
    for (const session of baselineSessions) {
      const val = getMetricValue(session, key)
      if (val !== null && !isNaN(val)) values.push(val)
    }
    metrics[key] = {
      median: median(values),
      mad: mad(values),
      n: values.length,
    }
  }

  return {
    testId,
    protocolVersion,
    phase,
    sessionCount: valid.length,
    familiarizationCount: Math.min(valid.length, FAMILIARIZATION_SESSIONS),
    baselineCount: Math.max(0, Math.min(valid.length - FAMILIARIZATION_SESSIONS, BASELINE_SESSIONS)),
    metrics,
  }
}

function getMetricValue(session: SessionRecord, key: string): number | null {
  const result = session.result
  if (!result) return null

  if (key in result.customMetrics) return result.customMetrics[key]
  if (key === 'medianCorrectRT') return result.rtMetrics.medianCorrectRT
  if (key === 'accuracy') return result.accuracyMetrics.accuracy
  if (key === 'rtCV') return result.rtMetrics.rtCoefficientOfVariation
  if (key === 'anticipationRate') return result.rtMetrics.anticipationRate
  if (key === 'lapseRate') return result.rtMetrics.lapseRate

  const parts = key.split('.')
  if (parts.length === 2 && result.conditionMetrics[parts[0]]) {
    const v = result.conditionMetrics[parts[0]][parts[1]]
    return typeof v === 'number' ? v : null
  }

  return null
}

export { FAMILIARIZATION_SESSIONS, BASELINE_SESSIONS }