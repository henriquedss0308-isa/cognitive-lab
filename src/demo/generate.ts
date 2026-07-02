import type { SessionRecord, TestId, TrialRecord } from '../types'
import { ALL_TESTS } from '../tests/registry'
import {
  applyCorsiResult,
  buildCorsiTrial,
  createCorsiAdaptiveState,
} from '../tests/corsi/adaptive'
import { generateId } from '../utils/id'
import { seededRandom, randomInt } from '../utils/random'
import { detectDevice } from '../utils/device'

function generateTrialsForSession(
  testId: TestId,
  sessionId: string,
  mode: 'assessment',
  seed: number,
  dayOffset: number
): TrialRecord[] {
  const test = ALL_TESTS.find((t) => t.id === testId)!
  const random = seededRandom(seed)
  const device = detectDevice()

  if (test.isAdaptive) {
    let state = createCorsiAdaptiveState(seed)
    const trials: TrialRecord[] = []
    while (!state.ended && trials.length < 20) {
      const g = buildCorsiTrial(state, 'assessment')
      const isCorrect = random() > 0.2
      const expected = (g.metadata?.sequence as number[]) ?? []
      const actual = isCorrect
        ? expected.join(',')
        : expected.length > 0
          ? String((expected[0] + 1) % 9)
          : '0'
      const partial = isCorrect ? expected.length : 0
      trials.push({
        trialId: generateId(),
        sessionId,
        testId,
        protocolVersion: test.protocolVersion,
        mode,
        blockIndex: g.blockIndex,
        trialIndex: g.trialIndex,
        condition: g.condition,
        stimulus: g.stimulus,
        expectedResponse: g.expectedResponse,
        actualResponse: actual,
        correct: isCorrect,
        reactionTimeMs: isCorrect ? 800 + random() * 400 : null,
        stimulusOnsetTimestamp: performance.timeOrigin + random() * 1e6,
        responseTimestamp: isCorrect ? performance.timeOrigin + random() * 1e6 + 900 : null,
        windowFocused: true,
        visibilityState: 'visible',
        deviceType: device.deviceType,
        inputMethod: 'mouse',
        metadata: { ...g.metadata, span: state.currentSpan, partialPositionsCorrect: partial },
      })
      state = applyCorsiResult(
        state,
        { correct: isCorrect, partialPositionsCorrect: partial, userResponse: actual },
        'assessment',
        test.assessmentConfig.trialCount
      )
    }
    return trials
  }

  const generated = test.generateTrials(mode, seed)

  return generated.map((g) => {
    const baseRT = 300 + dayOffset * 5 + random() * 200
    const isCorrect = random() > 0.1
    const rt = isCorrect ? baseRT + (g.condition === 'incongruent' ? 80 : 0) : null

    return {
      trialId: generateId(),
      sessionId,
      testId,
      protocolVersion: test.protocolVersion,
      mode,
      blockIndex: g.blockIndex,
      trialIndex: g.trialIndex,
      condition: g.condition,
      stimulus: g.stimulus,
      expectedResponse: g.expectedResponse,
      actualResponse: isCorrect ? g.expectedResponse : 'error',
      correct: isCorrect,
      reactionTimeMs: rt,
      stimulusOnsetTimestamp: performance.timeOrigin + random() * 1e6,
      responseTimestamp: rt ? performance.timeOrigin + random() * 1e6 + rt : null,
      windowFocused: random() > 0.05,
      visibilityState: 'visible' as const,
      deviceType: device.deviceType,
      inputMethod: device.inputMethod,
      metadata: g.metadata,
    }
  })
}

export function generateDemoData(): SessionRecord[] {
  const sessions: SessionRecord[] = []
  const device = detectDevice()
  const testIds = ALL_TESTS.map((t) => t.id)

  for (let day = 0; day < 14; day++) {
    for (const testId of testIds) {
      if (randomInt(0, 10, seededRandom(day)) > 7) continue

      const sessionId = generateId()
      const seed = day * 1000 + testIds.indexOf(testId)
      const test = ALL_TESTS.find((t) => t.id === testId)!
      const trials = generateTrialsForSession(testId, sessionId, 'assessment', seed, day)
      const scored = test.scoreSession(trials, 'assessment', device, {})

      const date = new Date()
      date.setDate(date.getDate() - (14 - day))

      sessions.push({
        sessionId,
        testId,
        protocolVersion: test.protocolVersion,
        mode: 'assessment',
        status: 'completed',
        startedAt: date.toISOString(),
        completedAt: date.toISOString(),
        quality: scored.quality,
        flags: scored.flags,
        flagMessages: scored.flagMessages,
        trials,
        deviceInfo: device,
        isDemo: true,
        practiceCompleted: true,
        randomizationSeed: seed,
        checkIn: {
          sleep: {
            hours: 6 + (day % 4),
            quality: 2 + (day % 3),
          },
          currentState: {
            mood: 3 + (day % 2),
          },
          substances: {
            caffeine: day % 3 === 0,
            caffeineMg: day % 3 === 0 ? 200 : undefined,
          }
        },
        result: {
          ...scored,
          sessionId,
          startedAt: date.toISOString(),
          completedAt: date.toISOString(),
          isDemo: true,
        },
      })
    }
  }

  return sessions
}