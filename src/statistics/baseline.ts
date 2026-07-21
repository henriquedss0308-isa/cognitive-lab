import type { BaselinePhase, BaselineStats, SessionRecord, TestId } from '../types'
import {
  getLongitudinalSeriesIdentity,
  getLongitudinalSeriesKey,
  type LongitudinalSeriesSource,
} from '../longitudinal/series'
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
  protocolVersion: string,
  scoringVersion?: unknown
): SessionRecord[] {
  const target: LongitudinalSeriesSource = {
    testId,
    protocolVersion,
    result: { scoringVersion },
  }
  const seriesKey = getLongitudinalSeriesKey(target)
  return sessions
    .filter(
      (s) =>
        s.testId === testId &&
        s.protocolVersion === protocolVersion &&
        getLongitudinalSeriesKey(s) === seriesKey &&
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
  metricKeys: string[],
  scoringVersion?: unknown
): BaselineStats {
  const target: LongitudinalSeriesSource = {
    testId,
    protocolVersion,
    result: { scoringVersion },
  }
  const identity = getLongitudinalSeriesIdentity(target)
  const valid = getValidAssessmentSessions(sessions, testId, protocolVersion, scoringVersion)
  const allScoringVersions = sessions.filter(
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
  const phase = getBaselinePhase(valid.length)

  const baselineSessions =
    phase === 'monitoring'
      ? valid.slice(FAMILIARIZATION_SESSIONS, FAMILIARIZATION_SESSIONS + BASELINE_SESSIONS)
      : valid.slice(FAMILIARIZATION_SESSIONS)

  const metrics = computeMetricStats(baselineSessions, metricKeys)

  return {
    testId,
    protocolVersion,
    scoringVersion: identity.scoringVersion,
    seriesKey: getLongitudinalSeriesKey(target),
    phase,
    sessionCount: valid.length,
    familiarizationCount: Math.min(valid.length, FAMILIARIZATION_SESSIONS),
    baselineCount: Math.max(0, Math.min(valid.length - FAMILIARIZATION_SESSIONS, BASELINE_SESSIONS)),
    warningCount: baselineSessions.filter((s) => s.quality === 'valid_with_warnings').length,
    incompatibleScoringCount: allScoringVersions.length - valid.length,
    metrics,
  }
}

/**
 * Mediana/MAD/n por métrica sobre um conjunto arbitrário de sessões.
 *
 * Extraído de `computeBaselineStats` para que a referência GERAL e as
 * referências CONTEXTUAIS usem exatamente o mesmo código numérico — a única
 * diferença entre elas é quais sessões entram, nunca como a conta é feita.
 * `n` é sempre a contagem de valores não nulos de fato usados.
 */
export function computeMetricStats(
  sessions: SessionRecord[],
  metricKeys: string[]
): BaselineStats['metrics'] {
  const metrics: BaselineStats['metrics'] = {}
  for (const key of metricKeys) {
    const values: number[] = []
    for (const session of sessions) {
      const val = getMetricValue(session, key)
      if (val !== null && !isNaN(val)) values.push(val)
    }
    metrics[key] = {
      median: median(values),
      mad: mad(values),
      n: values.length,
    }
  }
  return metrics
}

export function getMetricValue(session: SessionRecord, key: string): number | null {
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

/**
 * Rótulo de fase de UMA sessão = fase dada pela contagem de sessões
 * elegíveis estritamente ANTERIORES a ela (a própria sessão nunca conta).
 * Ordem determinística: (startedAt, sessionId).
 *
 * Usada na gravação (TestFlow) e na migração v3 que corrige rótulos
 * gravados com off-by-one (a 3ª válida saía 'baseline_building' e a 11ª
 * saía 'monitoring').
 */
export function recomputeStoredBaselinePhases(
  sessions: SessionRecord[]
): Map<string, BaselinePhase> {
  const byKey = (s: SessionRecord) => `${s.testId}::${s.protocolVersion}`
  const order = (a: SessionRecord, b: SessionRecord) => {
    const t = new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
    return t !== 0 ? t : a.sessionId.localeCompare(b.sessionId)
  }

  const groups = new Map<string, SessionRecord[]>()
  for (const s of sessions) {
    const key = byKey(s)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(s)
  }

  const phases = new Map<string, BaselinePhase>()
  for (const group of groups.values()) {
    // Migração histórica v3 preservada exatamente como foi executada. Ela
    // não é reaberta para reclassificar resultados já gravados por scoring;
    // a separação nova vale para seleções derivadas e novas conclusões.
    const eligible = group
      .filter(
        (s) =>
          s.mode === 'assessment' &&
          s.quality !== 'invalid' &&
          !s.isDemo &&
          (!s.status || s.status === 'completed') &&
          s.completedAt &&
          s.result &&
          !s.flags.insufficientPractice
      )
      .sort(order)
    for (const s of group) {
      if (!s.result) continue
      const priorCount = eligible.filter(
        (e) => e.sessionId !== s.sessionId && order(e, s) < 0
      ).length
      phases.set(s.sessionId, getBaselinePhase(priorCount))
    }
  }
  return phases
}

export { FAMILIARIZATION_SESSIONS, BASELINE_SESSIONS }
