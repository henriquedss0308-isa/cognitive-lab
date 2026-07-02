import { describe, it, expect } from 'vitest'
import {
  applyCorsiResult,
  buildCorsiTrial,
  createCorsiAdaptiveState,
  generateCorsiSequence,
  ERRORS_TO_END,
  CORRECT_TO_ADVANCE,
} from '../adaptive'

describe('Corsi adaptativo', () => {
  it('seed reproduz a mesma sequência', () => {
    const a = generateCorsiSequence(3, 12345, 0)
    const b = generateCorsiSequence(3, 12345, 0)
    expect(a).toEqual(b)
    const c = generateCorsiSequence(3, 12345, 1)
    expect(c).not.toEqual(a)
  })

  it('avança span após critério de acertos consecutivos', () => {
    let state = createCorsiAdaptiveState(99)
    const startSpan = state.currentSpan
    for (let i = 0; i < CORRECT_TO_ADVANCE; i++) {
      state = applyCorsiResult(
        state,
        { correct: true, partialPositionsCorrect: 2, userResponse: '0,1' },
        'assessment',
        30
      )
    }
    expect(state.currentSpan).toBe(startSpan + 1)
    expect(state.consecutiveCorrect).toBe(0)
  })

  it('encerra após erros no mesmo nível', () => {
    let state = createCorsiAdaptiveState(7)
    for (let i = 0; i < ERRORS_TO_END; i++) {
      state = applyCorsiResult(
        state,
        { correct: false, partialPositionsCorrect: 0, userResponse: '9' },
        'assessment',
        30
      )
    }
    expect(state.ended).toBe(true)
    expect(state.endReason).toBe('max_errors_at_span')
  })

  it('buildCorsiTrial inclui estado serializável e sequência', () => {
    const state = createCorsiAdaptiveState(555)
    const trial = buildCorsiTrial(state, 'assessment')
    expect(trial.metadata?.sequence).toBeDefined()
    expect(trial.metadata?.stateSnapshot).toBeDefined()
    expect(trial.metadata?.adaptive).toBe(true)
    expect((trial.metadata?.sequence as number[]).length).toBe(state.currentSpan)
  })

  it('sessão reproduzível a partir do seed e decisões', () => {
    const seed = 2024
    let s1 = createCorsiAdaptiveState(seed)
    let s2 = createCorsiAdaptiveState(seed)
    const decisions = [true, false, true, true, true]

    for (const correct of decisions) {
      const t1 = buildCorsiTrial(s1, 'assessment')
      const t2 = buildCorsiTrial(s2, 'assessment')
      expect(t1.stimulus).toBe(t2.stimulus)
      s1 = applyCorsiResult(
        s1,
        {
          correct,
          partialPositionsCorrect: correct ? (t1.metadata?.sequence as number[]).length : 0,
          userResponse: correct ? t1.expectedResponse : '0',
        },
        'assessment',
        30
      )
      s2 = applyCorsiResult(
        s2,
        {
          correct,
          partialPositionsCorrect: correct ? (t2.metadata?.sequence as number[]).length : 0,
          userResponse: correct ? t2.expectedResponse : '0',
        },
        'assessment',
        30
      )
    }
    expect(s1).toEqual(s2)
  })
})