import type { TrialRecord } from '../types'

export const PREONSET_EXCLUSION_POLICY_VERSION = 'preonset-exclusion-1' as const
export const PREONSET_EXCLUSION_SCORING_VERSION =
  `sdt-hautus-1;${PREONSET_EXCLUSION_POLICY_VERSION}` as const

function isValidRecordedTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * Identifica somente respostas com evidência persistida de terem ocorrido antes
 * do onset. `invalidReason === "anticipation"` não basta: o mesmo rótulo também
 * é usado para respostas pós-onset abaixo do limiar de RT.
 *
 * O comparador de timestamps é a fonte preferencial. Durante os dois frames em
 * que o estímulo já foi solicitado, mas o onset ainda não foi registrado, o
 * engine persiste onset 0 e `outcomeKind: "anticipation"`; esse marcador direto
 * é o fallback necessário. Registros históricos incompletos sem uma dessas
 * evidências não são classificados retroativamente como pré-onset.
 */
export function isTruePreOnsetResponse(trial: TrialRecord): boolean {
  if (!isValidRecordedTimestamp(trial.responseTimestamp)) return false

  if (isValidRecordedTimestamp(trial.stimulusOnsetTimestamp)) {
    return trial.responseTimestamp < trial.stimulusOnsetTimestamp
  }

  return trial.metadata?.outcomeKind === 'anticipation'
}

/** Elegibilidade para tabelas e proporções condicionadas ao estímulo exibido. */
export function isEligibleForStimulusContingentScoring(trial: TrialRecord): boolean {
  return !isTruePreOnsetResponse(trial)
}
