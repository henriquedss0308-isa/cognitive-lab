import type { DeviceInfo, SessionFlags, SessionQuality, TrialRecord } from '../types'
import { computeRTMetrics, computeAccuracyMetrics } from '../statistics/rtProcessing'
import type { RTCleaningConfig } from '../statistics/rtProcessing'
import { validateSession } from './sessionValidation'
import { median } from '../statistics/basic'

/**
 * Total de teclas de resposta pressionadas durante fixação/ISI (spec §14).
 * Métrica separada de anticipationRate — não altera a comparabilidade com
 * sessões antigas (que simplesmente não a possuem).
 */
export function countIsiEarlyPresses(trials: TrialRecord[]): number {
  return trials.reduce((sum, t) => {
    const count = t.metadata?.earlyPressCount
    return sum + (typeof count === 'number' && Number.isFinite(count) ? count : 0)
  }, 0)
}

export function buildBaseResult(
  trials: TrialRecord[],
  testId: TrialRecord['testId'],
  protocolVersion: string,
  mode: TrialRecord['mode'],
  cleaning: RTCleaningConfig,
  deviceInfo: DeviceInfo,
  extraFlags: SessionFlags = {},
  validationOpts?: Parameters<typeof validateSession>[2]
) {
  const rtMetrics = computeRTMetrics(trials, cleaning)
  const accuracyMetrics = computeAccuracyMetrics(trials)
  const validation = validateSession(trials, extraFlags, {
    ...validationOpts,
    anticipationThresholdMs: cleaning.anticipationThresholdMs,
  })

  return {
    testId,
    protocolVersion,
    mode,
    quality: validation.quality as SessionQuality,
    flags: validation.flags,
    flagMessages: validation.messages,
    rtMetrics: {
      medianCorrectRT: rtMetrics.medianCorrectRT,
      meanCorrectRT: rtMetrics.meanCorrectRT,
      rtStandardDeviation: rtMetrics.rtStandardDeviation,
      rtIQR: rtMetrics.rtIQR,
      rtCoefficientOfVariation: rtMetrics.rtCoefficientOfVariation,
      p10RT: rtMetrics.p10RT,
      p90RT: rtMetrics.p90RT,
      anticipationRate: rtMetrics.anticipationRate,
      lapseRate: rtMetrics.lapseRate,
      validTrialCount: rtMetrics.validTrialCount,
      invalidTrialCount: rtMetrics.invalidTrialCount,
    },
    accuracyMetrics,
    conditionMetrics: {} as Record<string, Record<string, number | null>>,
    blockMetrics: computeBlockMetrics(trials, cleaning),
    customMetrics: {
      isiEarlyPresses: countIsiEarlyPresses(trials),
    } as Record<string, number | null>,
    deviceInfo,
    processedTrials: rtMetrics.processedTrials,
    scoringVersion: 'sdt-hautus-1',
  }
}

function computeBlockMetrics(trials: TrialRecord[], cleaning: RTCleaningConfig) {
  const blocks = [...new Set(trials.map((t) => t.blockIndex))].sort((a, b) => a - b)
  return blocks.map((blockIndex) => {
    const blockTrials = trials.filter((t) => t.blockIndex === blockIndex)
    const rt = computeRTMetrics(blockTrials, cleaning)
    const acc = computeAccuracyMetrics(blockTrials)
    return {
      blockIndex,
      medianRT: rt.medianCorrectRT,
      accuracy: acc.accuracy,
      validTrials: rt.validTrialCount,
      errorCount: acc.errorCount,
    }
  })
}

export function conditionRTAndAccuracy(
  trials: TrialRecord[],
  condition: string,
  cleaning: RTCleaningConfig
) {
  const subset = trials.filter((t) => t.condition === condition)
  const rt = computeRTMetrics(subset, cleaning)
  const acc = computeAccuracyMetrics(subset)
  return {
    medianRT: rt.medianCorrectRT,
    accuracy: acc.accuracy,
    validRTs: rt.validRTs,
    errorCount: acc.errorCount,
    omissionCount: acc.omissionCount,
  }
}

export function postErrorSlowing(trials: TrialRecord[]): number | null {
  const rtsAfterError: number[] = []
  const rtsAfterCorrect: number[] = []

  for (let i = 1; i < trials.length; i++) {
    const prev = trials[i - 1]
    const curr = trials[i]
    if (!curr.correct || curr.reactionTimeMs === null || curr.reactionTimeMs < 150) continue
    if (!prev.correct) rtsAfterError.push(curr.reactionTimeMs)
    else rtsAfterCorrect.push(curr.reactionTimeMs)
  }

  const medAfterError = median(rtsAfterError)
  const medAfterCorrect = median(rtsAfterCorrect)
  if (medAfterError === null || medAfterCorrect === null) return null
  return medAfterError - medAfterCorrect
}