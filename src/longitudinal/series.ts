import type { TestId } from '../types'

/**
 * Identificador reservado para sessões históricas que não registraram a
 * versão do algoritmo de scoring. Ausência nunca é promovida para a versão
 * atual: essas sessões formam uma série própria e estável.
 */
export const LEGACY_UNVERSIONED_SCORING_VERSION = 'legacy-unversioned' as const

export type NormalizedScoringVersion = string
export type LongitudinalSeriesKey = string & { readonly __longitudinalSeriesKey: unique symbol }

/** Forma mínima aceita, incluindo dados históricos lidos em tempo de execução. */
export interface LongitudinalSeriesSource {
  testId: TestId
  protocolVersion: string
  result?: { scoringVersion?: unknown } | null
}

export interface LongitudinalSeriesIdentity {
  testId: TestId
  protocolVersion: string
  scoringVersion: NormalizedScoringVersion
}

/**
 * Normaliza somente representação, nunca significado: remove espaços nas
 * bordas e classifica ausência, tipo inválido ou string vazia como legado sem
 * versão. Strings compostas e espaços internos permanecem intactos.
 */
export function normalizeScoringVersion(value: unknown): NormalizedScoringVersion {
  if (typeof value !== 'string') return LEGACY_UNVERSIONED_SCORING_VERSION
  const normalized = value.trim()
  return normalized || LEGACY_UNVERSIONED_SCORING_VERSION
}

export function formatScoringVersionLabel(scoringVersion: NormalizedScoringVersion): string {
  return scoringVersion === LEGACY_UNVERSIONED_SCORING_VERSION
    ? 'Legado sem versão registrada'
    : scoringVersion
}

export function getLongitudinalSeriesIdentity(
  session: LongitudinalSeriesSource
): LongitudinalSeriesIdentity {
  return {
    testId: session.testId,
    protocolVersion: session.protocolVersion,
    scoringVersion: normalizeScoringVersion(session.result?.scoringVersion),
  }
}

/**
 * Identidade canônica usada em toda comparação matemática longitudinal.
 * JSON de uma tupla evita colisões por delimitadores presentes nas versões.
 */
export function getLongitudinalSeriesKey(
  session: LongitudinalSeriesSource
): LongitudinalSeriesKey {
  const identity = getLongitudinalSeriesIdentity(session)
  return JSON.stringify([
    identity.testId,
    identity.protocolVersion,
    identity.scoringVersion,
  ]) as LongitudinalSeriesKey
}

export function isSameLongitudinalSeries(
  left: LongitudinalSeriesSource,
  right: LongitudinalSeriesSource
): boolean {
  return getLongitudinalSeriesKey(left) === getLongitudinalSeriesKey(right)
}

/** Alvo tipado para telas que representam a regra de scoring atual do teste. */
export function currentLongitudinalSeries(
  testId: TestId,
  protocolVersion: string,
  scoringVersion: string
): LongitudinalSeriesSource {
  return { testId, protocolVersion, result: { scoringVersion } }
}
