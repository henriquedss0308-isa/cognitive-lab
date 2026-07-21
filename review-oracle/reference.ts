/**
 * Regras de referência da revisão adversarial.
 *
 * Este módulo não importa produção nem validation-oracle. As funções são
 * deliberadamente pequenas para que os valores esperados não sejam gerados
 * pelo mesmo caminho que está sob teste.
 */

/** Convenção "custo positivo = perda de precisão". */
export function positiveAccuracyMixingCost(pureAccuracy: number, repeatAccuracy: number): number {
  return pureAccuracy - repeatAccuracy
}

/** Extração implementada pela tela Results na versão congelada. */
export function resultsPrimaryFallback(
  customMetrics: Record<string, number | null>,
  primaryMetricKey: string,
  medianCorrectRT: number | null
): number | null {
  return customMetrics[primaryMetricKey] ?? medianCorrectRT
}

export interface CorsiReferenceTrial {
  span: number
  correct: boolean
}

/**
 * Regra do scoring anterior a 478a8fb: o span só era confirmado após dois
 * acertos consecutivos, embora o engine já o considerasse confirmado após um.
 */
export function legacyCorsiConfirmedSpan(trials: CorsiReferenceTrial[]): number {
  let confirmed = 1
  let consecutiveCorrect = 0
  let errorsAtSpan = 0

  for (const trial of trials) {
    if (trial.correct) {
      consecutiveCorrect += 1
      if (consecutiveCorrect >= 2) confirmed = trial.span
    } else {
      consecutiveCorrect = 0
      errorsAtSpan += 1
      if (errorsAtSpan >= 2) break
    }
  }
  return confirmed
}

/** Regra declarada pelo engine atual: um acerto já confirma o span. */
export function engineCorsiConfirmedSpan(trials: CorsiReferenceTrial[]): number {
  let confirmed = 0
  let consecutiveErrors = 0
  for (const trial of trials) {
    if (trial.correct) {
      confirmed = Math.max(confirmed, trial.span)
      consecutiveErrors = 0
    } else {
      consecutiveErrors += 1
      if (consecutiveErrors >= 2) break
    }
  }
  return confirmed
}
