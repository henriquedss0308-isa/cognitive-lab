/**
 * Construção das referências (geral e contextuais).
 *
 * Nenhuma regra estatística é reimplementada aqui: mediana, MAD e contagem de
 * valores não nulos vêm de `computeMetricStats`, o mesmo código que o baseline
 * geral usa. A única diferença entre uma referência e outra é QUAIS sessões
 * entram na janela.
 */
import type { BaselineStats, SessionRecord, TestId } from '../../types'
import {
  getLongitudinalSeriesIdentity,
  getLongitudinalSeriesKey,
  type LongitudinalSeriesSource,
} from '../../longitudinal/series'
import {
  BASELINE_SESSIONS,
  FAMILIARIZATION_SESSIONS,
  computeBaselineStats,
  computeMetricStats,
} from '../../statistics/baseline'
import {
  CONTEXTUAL_REFERENCE_SESSIONS,
  getContextualWindow,
  getEligibleSessions,
} from './contextualEligibility'
import type {
  CompositionStatus,
  ContextualReference,
  LisdexamfetamineStatus,
  ReferenceKind,
} from './types'

const KIND_BY_STATUS: Record<Exclude<LisdexamfetamineStatus, 'unknown'>, ReferenceKind> = {
  taken: 'lisdexamfetamine_taken',
  not_taken: 'lisdexamfetamine_not_taken',
}

export function referenceKindForStatus(
  status: Exclude<LisdexamfetamineStatus, 'unknown'>
): ReferenceKind {
  return KIND_BY_STATUS[status]
}

/** Nome de cada referência na interface. */
export const REFERENCE_LABELS: Record<ReferenceKind, string> = {
  general: 'referência geral',
  lisdexamfetamine_taken: 'referência com lisdexanfetamina',
  lisdexamfetamine_not_taken: 'referência sem lisdexanfetamina',
}

function dateRangeOf(sessions: SessionRecord[]): { first: string; last: string } | null {
  if (sessions.length === 0) return null
  return {
    first: sessions[0].startedAt,
    last: sessions[sessions.length - 1].startedAt,
  }
}

/**
 * Referência GERAL — exatamente o baseline que já existia.
 *
 * Delegada inteira a `computeBaselineStats`: esta funcionalidade não pode
 * alterar silenciosamente o conjunto de sessões nem os valores da referência
 * geral, então ela não é recalculada aqui de outro jeito.
 */
export function buildGeneralReference(
  sessions: SessionRecord[],
  testId: TestId,
  protocolVersion: string,
  metricKeys: string[],
  scoringVersion?: unknown
): ContextualReference {
  const stats = computeBaselineStats(sessions, testId, protocolVersion, metricKeys, scoringVersion)
  const eligible = getEligibleSessions(sessions, testId, protocolVersion, scoringVersion)

  // Mesma janela posicional de `computeBaselineStats`, para que a composição
  // exibida seja a das sessões realmente usadas no cálculo.
  const window =
    stats.phase === 'monitoring'
      ? eligible.slice(FAMILIARIZATION_SESSIONS, FAMILIARIZATION_SESSIONS + BASELINE_SESSIONS)
      : eligible.slice(FAMILIARIZATION_SESSIONS)

  return {
    metadata: {
      kind: 'general',
      testId,
      protocolVersion,
      scoringVersion: stats.scoringVersion,
      seriesKey: stats.seriesKey,
      sessionIds: window.map((s) => s.sessionId),
      sessionCount: window.length,
      composition: stats.phase === 'monitoring' ? 'complete' : window.length > 0 ? 'building' : 'empty',
      requiredCount: null,
      dateRange: dateRangeOf(window),
      fallback: false,
    },
    stats,
    sessions: window,
  }
}

function compositionOf(count: number): CompositionStatus {
  if (count >= CONTEXTUAL_REFERENCE_SESSIONS) return 'complete'
  return count > 0 ? 'building' : 'empty'
}

/**
 * Referência CONTEXTUAL de um estado medicamentoso explícito.
 *
 * `stats.phase` recebe `monitoring` somente quando a janela tem as oito
 * sessões. É isso que permite passar esta referência para `evaluatePrimaryZ`
 * sem duplicar nenhuma regra: n mínimo por métrica, MAD zero e direção
 * continuam sendo decididos lá, do mesmo jeito que na referência geral.
 */
export function buildContextualReference(
  sessions: SessionRecord[],
  testId: TestId,
  protocolVersion: string,
  metricKeys: string[],
  status: Exclude<LisdexamfetamineStatus, 'unknown'>,
  scoringVersion?: unknown
): ContextualReference {
  const target: LongitudinalSeriesSource = {
    testId,
    protocolVersion,
    result: { scoringVersion },
  }
  const identity = getLongitudinalSeriesIdentity(target)
  const eligible = getEligibleSessions(sessions, testId, protocolVersion, scoringVersion)
  const general = computeBaselineStats(sessions, testId, protocolVersion, metricKeys, scoringVersion)
  const window = getContextualWindow(eligible, status)
  const composition = compositionOf(window.length)

  const stats: BaselineStats = {
    testId,
    protocolVersion,
    scoringVersion: identity.scoringVersion,
    seriesKey: getLongitudinalSeriesKey(target),
    phase: composition === 'complete' ? 'monitoring' : 'baseline_building',
    sessionCount: window.length,
    familiarizationCount: Math.min(eligible.length, FAMILIARIZATION_SESSIONS),
    baselineCount: window.length,
    warningCount: window.filter((s) => s.quality === 'valid_with_warnings').length,
    incompatibleScoringCount: general.incompatibleScoringCount,
    metrics: computeMetricStats(window, metricKeys),
  }

  return {
    metadata: {
      kind: referenceKindForStatus(status),
      testId,
      protocolVersion,
      scoringVersion: identity.scoringVersion,
      seriesKey: getLongitudinalSeriesKey(target),
      sessionIds: window.map((s) => s.sessionId),
      sessionCount: window.length,
      composition,
      requiredCount: CONTEXTUAL_REFERENCE_SESSIONS,
      dateRange: dateRangeOf(window),
      fallback: false,
    },
    stats,
    sessions: window,
  }
}
