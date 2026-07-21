import type { CognitiveTestDefinition } from '../tests/types'
import type { SessionResult } from '../types'

type PrimaryMetricDefinition = Pick<CognitiveTestDefinition, 'primaryMetricKey'>
type PrimaryMetricResult = Pick<SessionResult, 'rtMetrics' | 'customMetrics'>

/**
 * Resolve a métrica primária exclusivamente da fonte definida para sua chave.
 * Valores ausentes ou não finitos permanecem indisponíveis; zero é válido.
 */
export function resolvePrimaryMetricValue(
  test: PrimaryMetricDefinition,
  result: PrimaryMetricResult
): number | null {
  const value = test.primaryMetricKey === 'medianCorrectRT'
    ? result.rtMetrics.medianCorrectRT
    : result.customMetrics[test.primaryMetricKey]

  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
