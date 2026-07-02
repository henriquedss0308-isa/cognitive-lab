import type { SessionFlags, SessionQuality, TrialRecord } from '../types'
import { isOmissionTrial } from '../statistics/rtProcessing'

export interface ValidationResult {
  quality: SessionQuality
  flags: SessionFlags
  messages: string[]
}

export function validateSession(
  trials: TrialRecord[],
  flags: SessionFlags,
  options: {
    minValidTrials?: number
    maxAnticipationRate?: number
    maxOmissionRate?: number
    minAccuracy?: number
    chanceAccuracy?: number
    incomplete?: boolean
    anticipationThresholdMs?: number
  } = {}
): ValidationResult {
  const {
    minValidTrials = 10,
    maxAnticipationRate = 0.15,
    maxOmissionRate = 0.3,
    minAccuracy = 0.5,
    chanceAccuracy = 0.25,
    incomplete = false,
    anticipationThresholdMs = 150,
  } = options

  const messages: string[] = []
  const resultFlags: SessionFlags = { ...flags }

  const total = trials.length
  const anticipations = trials.filter(
    (t) =>
      t.invalidReason === 'anticipation' ||
      (t.reactionTimeMs !== null && t.reactionTimeMs < anticipationThresholdMs)
  ).length
  const omissions = trials.filter(isOmissionTrial).length
  const correct = trials.filter((t) => t.correct).length
  const validRTs = trials.filter(
    (t) =>
      t.correct &&
      t.reactionTimeMs !== null &&
      t.reactionTimeMs >= anticipationThresholdMs &&
      t.invalidReason !== 'anticipation' &&
      t.invalidReason !== 'lapse' &&
      t.invalidReason !== 'unfocused'
  ).length

  const anticipationRate = total > 0 ? anticipations / total : 0
  const omissionRate = total > 0 ? omissions / total : 0
  const accuracy = total > 0 ? correct / total : 0

  if (anticipationRate > maxAnticipationRate) {
    resultFlags.tooManyAnticipations = true
    messages.push(`Taxa de antecipação elevada (${(anticipationRate * 100).toFixed(1)}%).`)
  }

  if (omissionRate > maxOmissionRate) {
    resultFlags.tooManyOmissions = true
    messages.push(`Muitas omissões (${(omissionRate * 100).toFixed(1)}%).`)
  }

  if (accuracy < chanceAccuracy) {
    resultFlags.chanceLevelAccuracy = true
    messages.push('Precisão próxima do acaso.')
  }

  if (validRTs < minValidTrials) {
    resultFlags.tooFewValidTrials = true
    messages.push(`Poucos ensaios válidos (${validRTs} de ${total}).`)
  }

  if (incomplete) {
    resultFlags.incomplete = true
    messages.push('Sessão incompleta.')
  }

  if (flags.windowLostFocus) {
    messages.push('A janela perdeu foco durante a sessão.')
  }

  if (flags.tabChanged) {
    messages.push('A aba foi alterada durante a sessão.')
  }

  if (flags.screenTooSmall) {
    messages.push('Tela muito pequena para avaliação confiável.')
  }

  let quality: SessionQuality = 'valid'
  const invalidFlags = [
    resultFlags.incomplete,
    resultFlags.tooFewValidTrials,
    resultFlags.chanceLevelAccuracy,
  ]
  const warningFlags = [
    resultFlags.tooManyAnticipations,
    resultFlags.tooManyOmissions,
    resultFlags.windowLostFocus,
    resultFlags.tabChanged,
    resultFlags.differentDevice,
    resultFlags.browserZoomChanged,
  ]

  if (invalidFlags.some(Boolean) || accuracy < minAccuracy * 0.5) {
    quality = 'invalid'
  } else if (warningFlags.some(Boolean)) {
    quality = 'valid_with_warnings'
  }

  return { quality, flags: resultFlags, messages }
}