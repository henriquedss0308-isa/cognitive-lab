import type { BaselineStats } from '../types'
import type { CognitiveTestDefinition } from '../tests/types'
import {
  getLongitudinalSeriesKey,
  type LongitudinalSeriesSource,
} from '../longitudinal/series'
import { robustZScore } from './basic'

/** Mínimo de valores no baseline para z interpretável (spec §3.2). */
export const MIN_BASELINE_N = 6

export type PrimaryZOutcome =
  | { kind: 'ok'; z: number; n: number }
  | { kind: 'not_monitoring' }
  | { kind: 'value_missing' }
  | { kind: 'no_baseline_metric' }
  | { kind: 'incompatible_series' }
  | { kind: 'no_direction' }
  | { kind: 'insufficient_n'; n: number }
  | { kind: 'zero_mad'; median: number | null; delta: number | null; n: number }

/**
 * z robusto da métrica primária de uma sessão contra o baseline.
 * Nunca inventa valor (proibido `?? 0`) nem direção (proibida heurística de nome).
 */
export function evaluatePrimaryZ(
  primaryValue: number | null | undefined,
  baseline: BaselineStats,
  test: CognitiveTestDefinition,
  session: LongitudinalSeriesSource = {
    testId: baseline.testId,
    protocolVersion: baseline.protocolVersion,
    result: { scoringVersion: baseline.scoringVersion },
  }
): PrimaryZOutcome {
  if (baseline.seriesKey !== getLongitudinalSeriesKey(session)) {
    return { kind: 'incompatible_series' }
  }
  if (baseline.phase !== 'monitoring') return { kind: 'not_monitoring' }

  const stats = baseline.metrics[test.primaryMetricKey]
  if (!stats) return { kind: 'no_baseline_metric' }

  const direction = test.metricDirections[test.primaryMetricKey]
  if (direction !== 1 && direction !== -1) return { kind: 'no_direction' }

  if (primaryValue === null || primaryValue === undefined || !Number.isFinite(primaryValue)) {
    return { kind: 'value_missing' }
  }

  if (stats.n < MIN_BASELINE_N) {
    return { kind: 'insufficient_n', n: stats.n }
  }

  if (stats.mad === 0 && stats.median !== null) {
    return {
      kind: 'zero_mad',
      median: stats.median,
      delta: primaryValue - stats.median,
      n: stats.n,
    }
  }

  const z = robustZScore(primaryValue, stats.median, stats.mad, direction)
  if (z === null) return { kind: 'value_missing' }
  return { kind: 'ok', z, n: stats.n }
}
