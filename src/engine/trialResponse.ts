/**
 * Lógica centralizada de Go/No-Go, omissão, timeout e comissão.
 * Única fonte de verdade — não duplicar comparações com "none" em outros módulos.
 */

export const INHIBITION_RESPONSE = 'none' as const
export const EMPTY_RESPONSE = '' as const
export const SPACE_RESPONSE = 'space' as const

export type TrialOutcomeKind =
  | 'hit'
  | 'miss'
  | 'correct_rejection'
  | 'false_alarm'
  | 'anticipation'
  | 'omission'
  | 'incorrect'

export interface ClassifiedResponse {
  actualResponse: string
  correct: boolean
  invalidReason?: string
  outcomeKind: TrialOutcomeKind
}

export function requiresResponse(expectedResponse: string): boolean {
  const norm = normalizeExpected(expectedResponse)
  return norm !== INHIBITION_RESPONSE
}

export function normalizeExpected(expectedResponse: string): string {
  if (expectedResponse === '' || expectedResponse === 'nogo' || expectedResponse === 'no_go') {
    return INHIBITION_RESPONSE
  }
  return expectedResponse
}

export function normalizeActual(actualResponse: string | null | undefined): string {
  if (actualResponse === null || actualResponse === undefined || actualResponse === '') {
    return EMPTY_RESPONSE
  }
  return actualResponse
}

export function isOmissionOutcome(
  expectedResponse: string,
  actualResponse: string,
  timedOut: boolean
): boolean {
  if (!requiresResponse(expectedResponse)) return false
  if (timedOut && (actualResponse === EMPTY_RESPONSE || actualResponse === INHIBITION_RESPONSE)) {
    return true
  }
  return actualResponse === EMPTY_RESPONSE ||
    (requiresResponse(expectedResponse) && actualResponse === INHIBITION_RESPONSE)
}

export function isCorrectRejection(
  expectedResponse: string,
  actualResponse: string,
  timedOut: boolean
): boolean {
  const expected = normalizeExpected(expectedResponse)
  if (requiresResponse(expected)) return false
  if (timedOut) {
    return actualResponse === EMPTY_RESPONSE || actualResponse === INHIBITION_RESPONSE
  }
  return actualResponse === INHIBITION_RESPONSE || actualResponse === EMPTY_RESPONSE
}

export function isFalseAlarm(expectedResponse: string, actualResponse: string): boolean {
  const expected = normalizeExpected(expectedResponse)
  if (requiresResponse(expected)) return false
  return actualResponse !== EMPTY_RESPONSE && actualResponse !== INHIBITION_RESPONSE
}

/**
 * Classifica resultado do ensaio.
 * A) Go + resposta correta
 * B) Go + timeout → omissão
 * C) No-Go + timeout → inibição correta
 * D) No-Go + resposta → comissão / false alarm
 */
export function classifyTrialResponse(params: {
  expectedResponse: string
  actualResponse?: string | null
  timedOut?: boolean
  beforeOnset?: boolean
}): ClassifiedResponse {
  const expected = normalizeExpected(params.expectedResponse)
  const timedOut = params.timedOut ?? false
  const beforeOnset = params.beforeOnset ?? false

  let actual = normalizeActual(params.actualResponse)

  if (beforeOnset) {
    return {
      actualResponse: actual === EMPTY_RESPONSE ? SPACE_RESPONSE : actual,
      correct: false,
      invalidReason: 'anticipation',
      outcomeKind: 'anticipation',
    }
  }

  if (timedOut && actual === EMPTY_RESPONSE) {
    actual = INHIBITION_RESPONSE
  }

  if (!requiresResponse(expected)) {
    if (isFalseAlarm(expected, actual)) {
      return {
        actualResponse: actual,
        correct: false,
        invalidReason: 'commission',
        outcomeKind: 'false_alarm',
      }
    }
    if (isCorrectRejection(expected, actual, timedOut)) {
      return {
        actualResponse: INHIBITION_RESPONSE,
        correct: true,
        outcomeKind: 'correct_rejection',
      }
    }
    return {
      actualResponse: actual,
      correct: false,
      outcomeKind: 'incorrect',
    }
  }

  // Go / resposta esperada
  if (isOmissionOutcome(expected, actual, timedOut)) {
    return {
      actualResponse: EMPTY_RESPONSE,
      correct: false,
      invalidReason: 'omission',
      outcomeKind: 'miss',
    }
  }

  if (actual === expected) {
    return {
      actualResponse: actual,
      correct: true,
      outcomeKind: 'hit',
    }
  }

  return {
    actualResponse: actual,
    correct: false,
    outcomeKind: 'incorrect',
  }
}

export function computeReactionTime(
  onsetTimestamp: number,
  responseTimestamp: number | null,
  _valid: boolean
): number | null {
  if (responseTimestamp === null || onsetTimestamp <= 0) return null
  const rt = responseTimestamp - onsetTimestamp
  return rt >= 0 ? rt : null
}