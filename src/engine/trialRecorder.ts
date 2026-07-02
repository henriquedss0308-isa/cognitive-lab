import type { DeviceInfo, TestId, TestMode, TrialRecord } from '../types'
import type { GeneratedTrial } from '../tests/types'
import { classifyTrialResponse, computeReactionTime } from './trialResponse'
import { generateId } from '../utils/id'

export interface RecordTrialInput {
  trial: GeneratedTrial
  sessionId: string
  testId: TestId
  protocolVersion: string
  mode: TestMode
  deviceInfo: DeviceInfo
  inputMethod: string
  stimulusOnsetTimestamp: number
  actualResponse?: string | null
  responseTimestamp?: number | null
  timedOut?: boolean
  beforeOnset?: boolean
  droppedFramesEstimate?: number
  windowFocused: boolean
  visibilityState: DocumentVisibilityState
  extraMeta?: Record<string, unknown>
  cleaning: { anticipationThresholdMs: number; lapseThresholdMs: number }
}

export function buildTrialRecord(input: RecordTrialInput): TrialRecord {
  const classified = classifyTrialResponse({
    expectedResponse: input.trial.expectedResponse,
    actualResponse: input.actualResponse,
    timedOut: input.timedOut,
    beforeOnset: input.beforeOnset,
  })

  const onsetReady = !input.beforeOnset && input.stimulusOnsetTimestamp > 0
  const rt = computeReactionTime(
    input.stimulusOnsetTimestamp,
    input.responseTimestamp ?? null,
    onsetReady && classified.correct && !input.timedOut && !input.beforeOnset
  )

  let invalidReason = classified.invalidReason
  if (!invalidReason && rt !== null && rt < input.cleaning.anticipationThresholdMs) {
    invalidReason = 'anticipation'
  }
  if (!invalidReason && rt !== null && rt > input.cleaning.lapseThresholdMs) {
    invalidReason = 'lapse'
  }
  if (!invalidReason && !input.windowFocused) {
    invalidReason = 'unfocused'
  }

  return {
    trialId: generateId(),
    sessionId: input.sessionId,
    testId: input.testId,
    protocolVersion: input.protocolVersion,
    mode: input.mode,
    blockIndex: input.trial.blockIndex,
    trialIndex: input.trial.trialIndex,
    condition: input.trial.condition,
    stimulus: input.trial.stimulus,
    expectedResponse: input.trial.expectedResponse,
    actualResponse: classified.actualResponse,
    correct: classified.correct,
    reactionTimeMs: invalidReason === 'anticipation' || invalidReason === 'omission' ? null : rt,
    stimulusOnsetTimestamp: input.stimulusOnsetTimestamp,
    responseTimestamp: input.responseTimestamp ?? null,
    windowFocused: input.windowFocused,
    visibilityState: input.visibilityState,
    droppedFramesEstimate: input.droppedFramesEstimate,
    deviceType: input.deviceInfo.deviceType,
    inputMethod: input.inputMethod,
    invalidReason,
    metadata: {
      ...input.trial.metadata,
      ...input.extraMeta,
      outcomeKind: classified.outcomeKind,
    },
  }
}