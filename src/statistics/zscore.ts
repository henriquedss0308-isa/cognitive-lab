import type { BaselineStats } from '../types'
import type { CognitiveTestDefinition } from '../tests/types'
import { robustZScore } from './basic'

export type PrimaryZOutcome =
  | { kind: 'ok'; z: number; n: number }
  | { kind: 'not_monitoring' }
  | { kind: 'value_missing' }
  | { kind: 'no_baseline_metric' }
  | { kind: 'no_direction' }
  | { kind: 'zero_mad'; median: number | null; delta: number | null; n: number }

/**
 * z robusto da métrica primária de uma sessão contra o baseline.
 * Nunca inventa valor (proibido `?? 0`) nem direção (proibida heurística de nome).
 */
export function evaluatePrimaryZ(
  primaryValue: number | null | undefined,
  baseline: BaselineStats,
  test: CognitiveTestDefinition
): PrimaryZOutcome {
  if (baseline.phase !== 'monitoring') return { kind: 'not_monitoring' }

  const stats = baseline.metrics[test.primaryMetricKey]
  if (!stats) return { kind: 'no_baseline_metric' }

  const direction = test.metricDirections[test.primaryMetricKey]
  if (direction !== 1 && direction !== -1) return { kind: 'no_direction' }

  if (primaryValue === null || primaryValue === undefined || !Number.isFinite(primaryValue)) {
    return { kind: 'value_missing' }
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
