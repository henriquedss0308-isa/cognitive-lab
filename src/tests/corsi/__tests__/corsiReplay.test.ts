import { describe, it, expect } from 'vitest'
import {
  applyCorsiResult,
  buildCorsiTrial,
  createCorsiAdaptiveState,
  replayCorsiTrials,
  type CorsiAdaptiveState,
  type CorsiReplayInput,
} from '../adaptive'
import { testDefinition as corsi } from '../index'
import type { DeviceInfo, TrialRecord } from '../../../types'

const device: DeviceInfo = {
  deviceType: 'desktop',
  inputMethod: 'mouse',
  screenWidth: 1920,
  screenHeight: 1080,
  browser: 'test',
  userAgent: 'test',
}

/**
 * Simula uma sessão real: usa buildCorsiTrial + applyCorsiResult (o engine)
 * e grava trials como o TestRunner faz. Retorna trials + estado final do
 * engine, para comparar com o scoring.
 */
function simulateSession(seed: number, decisions: boolean[]): {
  trials: TrialRecord[]
  engineState: CorsiAdaptiveState
} {
  let state = createCorsiAdaptiveState(seed)
  const trials: TrialRecord[] = []

  for (const correct of decisions) {
    if (state.ended) break
    const g = buildCorsiTrial(state, 'assessment')
    const expected = (g.metadata?.sequence as number[]) ?? []
    // Resposta errada: erra o PRIMEIRO clique (prefixo 0), como um usuário
    // que clica no bloco vizinho.
    const actual = correct ? expected.join(',') : String((expected[0] + 1) % 9)
    const partial = correct ? expected.length : 0

    trials.push({
      trialId: `t-${g.trialIndex}`,
      sessionId: 'sess-replay',
      testId: 'corsi',
      protocolVersion: corsi.protocolVersion,
      mode: 'assessment',
      blockIndex: 0,
      trialIndex: g.trialIndex,
      condition: 'forward',
      stimulus: g.stimulus,
      expectedResponse: g.expectedResponse,
      actualResponse: actual,
      correct,
      reactionTimeMs: 1200,
      stimulusOnsetTimestamp: 1000,
      responseTimestamp: 2200,
      windowFocused: true,
      visibilityState: 'visible',
      deviceType: device.deviceType,
      inputMethod: 'mouse',
      metadata: { ...g.metadata, span: state.currentSpan, partialPositionsCorrect: partial },
    })

    state = applyCorsiResult(
      state,
      { correct, partialPositionsCorrect: partial, userResponse: actual },
      'assessment',
      corsi.assessmentConfig.trialCount
    )
  }

  return { trials, engineState: state }
}

/**
 * O seed não participa das regras de avanço/término (só da geração de
 * sequências, que o replay lê dos trials gravados) — comparamos tudo menos ele.
 */
function behavioralState(state: CorsiAdaptiveState) {
  const { seed: _seed, ...rest } = state
  return rest
}

describe('replayCorsiTrials ≡ engine (spec §13)', () => {
  it.each([
    ['sessão curta com término', [true, true, false, false]],
    ['erro-acerto-erro no mesmo span não termina', [false, true, false, true, true, false, false]],
    ['avanço múltiplo', [true, true, true, true, true, true, false, false]],
    ['nenhum acerto', [false, false]],
  ])('%s', (_label, decisions) => {
    const { trials, engineState } = simulateSession(4242, decisions as boolean[])
    const replay = replayCorsiTrials(trials, 'assessment', corsi.assessmentConfig.trialCount)
    expect(behavioralState(replay.finalState)).toEqual(behavioralState(engineState))
  })

  it('scoring da sessão espelha o estado final do engine', () => {
    const { trials, engineState } = simulateSession(777, [true, false, true, true, false, false])
    const scored = corsi.scoreSession(trials, 'assessment', device, {})
    expect(scored.customMetrics.confirmedSpan).toBe(engineState.confirmedSpan)
    expect(scored.customMetrics.maxSpan).toBe(engineState.maxSpanReached)
    expect(scored.customMetrics.totalCorrectSequences).toBe(engineState.totalCorrectSequences)
    expect(scored.customMetrics.partialScore).toBe(engineState.totalCorrectPositions)
    expect(scored.scoringVersion).toBe('sdt-hautus-1;corsi-replay-1')
  })

  it('caso que o scoring antigo divergia: 1 acerto no span + 2 erros', () => {
    // Engine: acerto único no span 2 confirma span 2 (spec §13); o scoring
    // antigo exigia 2 consecutivos e reportava 1.
    const { trials, engineState } = simulateSession(99, [true, false, false])
    expect(engineState.confirmedSpan).toBe(2)
    const scored = corsi.scoreSession(trials, 'assessment', device, {})
    expect(scored.customMetrics.confirmedSpan).toBe(2)
  })

  it('caso que o scoring antigo divergia: erro, acerto, erro no mesmo span', () => {
    // Engine: acerto zera errorsAtSpan — a sessão continua; o scoring
    // antigo quebrava com 2 erros totais no span e ignorava o resto.
    const { trials, engineState } = simulateSession(55, [false, true, false, true, true, true, false, false])
    expect(engineState.ended).toBe(true)
    const replay = replayCorsiTrials(trials, 'assessment', corsi.assessmentConfig.trialCount)
    expect(replay.finalState.totalCorrectSequences).toBe(engineState.totalCorrectSequences)
    expect(replay.finalState.confirmedSpan).toBe(engineState.confirmedSpan)
  })

  it('replay ordena por trialIndex (robusto a listas fora de ordem)', () => {
    const { trials, engineState } = simulateSession(11, [true, true, false, false])
    const shuffled: CorsiReplayInput[] = [...trials].reverse()
    const replay = replayCorsiTrials(shuffled, 'assessment', corsi.assessmentConfig.trialCount)
    expect(behavioralState(replay.finalState)).toEqual(behavioralState(engineState))
  })
})
