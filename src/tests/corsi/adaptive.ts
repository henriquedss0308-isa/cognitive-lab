import { randomInt, seededRandom } from '../../utils/random'
import type { GeneratedTrial } from '../types'

export const BLOCK_COUNT = 9
export const START_SPAN = 2
export const MAX_SPAN = 9
export const ERRORS_TO_END = 2
export const CORRECT_TO_ADVANCE = 2

export type CorsiEndReason =
  | 'max_errors_at_span'
  | 'practice_complete'
  | 'assessment_complete'
  | 'abandoned'

export interface CorsiAdaptiveState {
  seed: number
  currentSpan: number
  consecutiveCorrect: number
  errorsAtSpan: number
  trialCount: number
  maxSpanReached: number
  confirmedSpan: number
  totalCorrectSequences: number
  totalCorrectPositions: number
  ended: boolean
  endReason?: CorsiEndReason
}

export function createCorsiAdaptiveState(seed: number, startSpan = START_SPAN): CorsiAdaptiveState {
  return {
    seed,
    currentSpan: startSpan,
    consecutiveCorrect: 0,
    errorsAtSpan: 0,
    trialCount: 0,
    maxSpanReached: startSpan,
    confirmedSpan: 0,
    totalCorrectSequences: 0,
    totalCorrectPositions: 0,
    ended: false,
  }
}

export function generateCorsiSequence(span: number, seed: number, trialIndex: number): number[] {
  const random = seededRandom(seed + trialIndex * 997)
  const sequence: number[] = []
  let last = -1
  for (let i = 0; i < span; i++) {
    const available = Array.from({ length: BLOCK_COUNT }, (_, j) => j).filter((p) => p !== last)
    const pos = available[randomInt(0, available.length - 1, random)]
    sequence.push(pos)
    last = pos
  }
  return sequence
}

export function buildCorsiTrial(state: CorsiAdaptiveState, mode: 'assessment' | 'training'): GeneratedTrial {
  const span = mode === 'training' ? START_SPAN : state.currentSpan
  const sequence = generateCorsiSequence(span, state.seed, state.trialCount)
  return {
    blockIndex: 0,
    trialIndex: state.trialCount,
    condition: 'forward',
    stimulus: sequence.join(','),
    expectedResponse: sequence.join(','),
    metadata: {
      adaptive: true,
      span,
      sequence,
      blockCount: BLOCK_COUNT,
      seed: state.seed,
      trialIndex: state.trialCount,
      stateSnapshot: { ...state },
    },
  }
}

export interface CorsiTrialResult {
  correct: boolean
  partialPositionsCorrect: number
  userResponse: string
}

export function applyCorsiResult(
  state: CorsiAdaptiveState,
  result: CorsiTrialResult,
  mode: 'assessment' | 'training',
  practiceLimit: number
): CorsiAdaptiveState {
  const next = { ...state, trialCount: state.trialCount + 1 }

  if (result.correct) {
    next.totalCorrectSequences += 1
    next.totalCorrectPositions += result.partialPositionsCorrect
    next.consecutiveCorrect += 1
    next.errorsAtSpan = 0
    next.confirmedSpan = Math.max(next.confirmedSpan, next.currentSpan)
    if (mode === 'assessment' && next.consecutiveCorrect >= CORRECT_TO_ADVANCE) {
      next.currentSpan = Math.min(next.currentSpan + 1, MAX_SPAN)
      next.maxSpanReached = Math.max(next.maxSpanReached, next.currentSpan)
      next.consecutiveCorrect = 0
    }
  } else {
    next.consecutiveCorrect = 0
    next.errorsAtSpan += 1
    next.totalCorrectPositions += result.partialPositionsCorrect
    if (mode === 'assessment' && next.errorsAtSpan >= ERRORS_TO_END) {
      next.ended = true
      next.endReason = 'max_errors_at_span'
    }
  }

  if (mode === 'training' && next.trialCount >= practiceLimit) {
    next.ended = true
    next.endReason = 'practice_complete'
  }

  return next
}

export function serializeCorsiState(state: CorsiAdaptiveState): Record<string, unknown> {
  return { ...state }
}

export function deserializeCorsiState(data: Record<string, unknown>): CorsiAdaptiveState {
  return data as unknown as CorsiAdaptiveState
}

export function parseClickSequence(response: string): number[] {
  if (!response || response === 'none') return []
  return response
    .split(',')
    .map((v) => parseInt(v.trim(), 10))
    .filter((v) => !Number.isNaN(v))
}

export function longestCorrectPrefix(expected: number[], actual: number[]): number {
  let correct = 0
  for (let i = 0; i < Math.min(expected.length, actual.length); i++) {
    if (expected[i] !== actual[i]) break
    correct++
  }
  return correct
}

export interface CorsiReplayInput {
  trialIndex: number
  expectedResponse: string
  actualResponse: string
}

export interface CorsiReplayOutcome {
  finalState: CorsiAdaptiveState
  totalItems: number
}

/**
 * Reconstrói o estado adaptativo final aplicando applyCorsiResult sobre os
 * trials gravados — FONTE ÚNICA das regras (spec §13). O scoring nunca deve
 * reimplementar avanço/término/confirmação em paralelo: era exatamente essa
 * duplicação que fazia o resultado exibido divergir do protocolo executado.
 *
 * A correção de cada trial é DERIVADA de expected/actual (idêntica à regra
 * do engine no clique), tornando o replay puro e independente de flags
 * gravadas.
 */
export function replayCorsiTrials(
  trials: CorsiReplayInput[],
  mode: 'assessment' | 'training',
  practiceLimit: number,
  seed = 0
): CorsiReplayOutcome {
  const ordered = [...trials].sort((a, b) => a.trialIndex - b.trialIndex)
  let state = createCorsiAdaptiveState(seed)
  let totalItems = 0

  for (const trial of ordered) {
    if (state.ended) break
    const expected = parseClickSequence(trial.expectedResponse)
    const actual = parseClickSequence(trial.actualResponse)
    const prefix = longestCorrectPrefix(expected, actual)
    const correct = expected.length > 0 && actual.length === expected.length && prefix === expected.length
    totalItems += expected.length
    state = applyCorsiResult(
      state,
      {
        correct,
        partialPositionsCorrect: correct ? expected.length : prefix,
        userResponse: trial.actualResponse,
      },
      mode,
      practiceLimit
    )
  }

  return { finalState: state, totalItems }
}
