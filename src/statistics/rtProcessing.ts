import type { TrialRecord } from '../types'
import { requiresResponse, EMPTY_RESPONSE, INHIBITION_RESPONSE } from '../engine/trialResponse'
import {
  median,
  mean,
  standardDeviation,
  iqr,
  coefficientOfVariation,
  percentile,
} from './basic'

export interface RTCleaningConfig {
  anticipationThresholdMs: number
  lapseThresholdMs: number
  useMADOutlierRemoval?: boolean
  madOutlierThreshold?: number
}

export const DEFAULT_RT_CONFIG: RTCleaningConfig = {
  anticipationThresholdMs: 150,
  lapseThresholdMs: 2000,
  useMADOutlierRemoval: false,
  madOutlierThreshold: 3,
}

export interface ProcessedTrial extends TrialRecord {
  rtStatus: 'valid' | 'anticipation' | 'lapse' | 'no_response' | 'incorrect' | 'unfocused' | 'outlier'
  cleanedRT: number | null
}

export function processTrials(
  trials: TrialRecord[],
  config: RTCleaningConfig = DEFAULT_RT_CONFIG
): ProcessedTrial[] {
  return trials.map((trial) => {
    let rtStatus: ProcessedTrial['rtStatus'] = 'valid'
    let cleanedRT: number | null = trial.reactionTimeMs

    if (trial.invalidReason === 'anticipation') {
      rtStatus = 'anticipation'
      cleanedRT = null
    } else if (trial.invalidReason === 'omission') {
      rtStatus = 'no_response'
      cleanedRT = null
    } else if (trial.invalidReason === 'lapse') {
      rtStatus = 'lapse'
      cleanedRT = null
    } else if (trial.invalidReason === 'unfocused') {
      rtStatus = 'unfocused'
      cleanedRT = null
    } else if (!trial.correct) {
      rtStatus = 'incorrect'
      cleanedRT = null
    } else if (trial.reactionTimeMs === null) {
      rtStatus = 'no_response'
      cleanedRT = null
    } else if (!trial.windowFocused || trial.visibilityState === 'hidden') {
      rtStatus = 'unfocused'
      cleanedRT = null
    } else if (trial.reactionTimeMs < config.anticipationThresholdMs) {
      rtStatus = 'anticipation'
      cleanedRT = null
    } else if (trial.reactionTimeMs > config.lapseThresholdMs) {
      rtStatus = 'lapse'
      cleanedRT = null
    }

    return { ...trial, rtStatus, cleanedRT }
  })
}

export function computeRTMetrics(
  trials: TrialRecord[],
  config: RTCleaningConfig = DEFAULT_RT_CONFIG
) {
  const processed = processTrials(trials, config)
  let validRTs = processed
    .filter((t) => t.rtStatus === 'valid' && t.cleanedRT !== null)
    .map((t) => t.cleanedRT!)

  if (config.useMADOutlierRemoval && validRTs.length >= 5) {
    const med = median(validRTs)!
    const deviations = validRTs.map((v) => Math.abs(v - med))
    const madVal = median(deviations)!
    const threshold = (config.madOutlierThreshold ?? 3) * 1.4826 * madVal
    if (madVal > 0) {
      validRTs = validRTs.filter((v) => Math.abs(v - med) <= threshold)
    }
  }

  const total = processed.length
  const anticipations = processed.filter((t) => t.rtStatus === 'anticipation').length
  const lapses = processed.filter((t) => t.rtStatus === 'lapse').length
  const invalid = processed.filter((t) => t.cleanedRT === null && t.correct).length

  return {
    medianCorrectRT: median(validRTs),
    meanCorrectRT: mean(validRTs),
    rtStandardDeviation: standardDeviation(validRTs),
    rtIQR: iqr(validRTs),
    rtCoefficientOfVariation: coefficientOfVariation(validRTs),
    p10RT: percentile(validRTs, 10),
    p90RT: percentile(validRTs, 90),
    anticipationRate: total > 0 ? anticipations / total : 0,
    lapseRate: total > 0 ? lapses / total : 0,
    validTrialCount: validRTs.length,
    invalidTrialCount: invalid,
    processedTrials: processed,
    validRTs,
  }
}

/** Ensaio exige resposta e não recebeu resposta válida. */
export function isOmissionTrial(t: TrialRecord): boolean {
  if (!requiresResponse(t.expectedResponse)) return false
  return t.actualResponse === EMPTY_RESPONSE || t.actualResponse === INHIBITION_RESPONSE
}

export function computeAccuracyMetrics(trials: TrialRecord[]) {
  const total = trials.length
  const correct = trials.filter((t) => t.correct).length
  const omissions = trials.filter(isOmissionTrial).length
  const errors = total - correct - omissions

  return {
    accuracy: total > 0 ? correct / total : 0,
    correctCount: correct,
    errorCount: errors,
    omissionCount: omissions,
    totalTrials: total,
  }
}