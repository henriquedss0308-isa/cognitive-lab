import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { MetricCard } from '../src/components/common/MetricTooltip'
import { selectTrendSessions } from '../src/components/charts/chartSelectors'
import { computeSDT } from '../src/statistics/signalDetection'
import { computeBaselineStats } from '../src/statistics/baseline'
import { evaluatePrimaryZ } from '../src/statistics/zscore'
import { validateImportedSession } from '../src/storage/export'
import { getTest } from '../src/tests/registry'
import type { CognitiveTestDefinition, GeneratedTrial } from '../src/tests/types'
import type { DeviceInfo, SessionRecord, TestId, TrialRecord } from '../src/types'
import {
  engineCorsiConfirmedSpan,
  legacyCorsiConfirmedSpan,
  positiveAccuracyMixingCost,
  resultsPrimaryFallback,
} from './reference'

const DEVICE: DeviceInfo = {
  deviceType: 'desktop',
  inputMethod: 'keyboard',
  screenWidth: 1920,
  screenHeight: 1080,
  browser: 'Chrome',
  userAgent: 'synthetic-adversarial-review',
}

function expectsResponse(expected: string): boolean {
  return expected !== '' && expected !== 'none' && expected !== 'nogo' && expected !== 'no_go'
}

function asRecord(
  test: CognitiveTestDefinition,
  generated: GeneratedTrial,
  correct = true,
  reactionTimeMs: number | null = 500
): TrialRecord {
  const responseRequired = expectsResponse(generated.expectedResponse)
  const actualResponse = correct
    ? responseRequired ? generated.expectedResponse : 'none'
    : responseRequired ? '__wrong__' : 'space'
  return {
    trialId: `trial-${generated.trialIndex}`,
    sessionId: 'synthetic-session',
    testId: test.id,
    protocolVersion: test.protocolVersion,
    mode: 'assessment',
    blockIndex: generated.blockIndex,
    trialIndex: generated.trialIndex,
    condition: generated.condition,
    stimulus: generated.stimulus,
    expectedResponse: generated.expectedResponse,
    actualResponse,
    correct,
    reactionTimeMs: correct && responseRequired ? reactionTimeMs : correct ? null : reactionTimeMs,
    stimulusOnsetTimestamp: 1_000,
    responseTimestamp: reactionTimeMs === null ? null : 1_000 + reactionTimeMs,
    windowFocused: true,
    visibilityState: 'visible',
    deviceType: 'desktop',
    inputMethod: test.id === 'corsi' ? 'mouse' : 'keyboard',
    metadata: generated.metadata,
  }
}

function standardRecords(
  testId: Exclude<TestId, 'corsi'>,
  mutate?: (generated: GeneratedTrial) => { correct: boolean; rt?: number | null }
): TrialRecord[] {
  const test = getTest(testId)
  return test.generateTrials('assessment', 20260721).map((generated) => {
    const override = mutate?.(generated)
    return asRecord(test, generated, override?.correct ?? true, override?.rt ?? 500)
  })
}

function manualTaskSwitchTrials(spec: {
  pureOdd: boolean[]
  pureMagnitude: boolean[]
  mixedRepeat: boolean[]
  mixedSwitch?: boolean[]
  repeatRT?: number | null
}): TrialRecord[] {
  const test = getTest('taskswitch')
  let i = 0
  const group = (condition: string, correctness: boolean[], rt = 500) =>
    correctness.map((correct) => asRecord(test, {
      blockIndex: 0,
      trialIndex: i++,
      condition,
      stimulus: '2',
      expectedResponse: 'f',
    }, correct, rt))
  return [
    ...group('pure_odd_even', spec.pureOdd),
    ...group('pure_magnitude', spec.pureMagnitude),
    ...group('mixed_repeat', spec.mixedRepeat, spec.repeatRT ?? 500),
    ...group('mixed_switch', spec.mixedSwitch ?? [true, true]),
  ]
}

describe('AC-01 — mixingCostAccuracy', () => {
  const cases = [
    { name: 'repeat pior que puro', pure: [true, true], repeat: [true, false], production: -0.5, positiveCost: 0.5 },
    { name: 'repeat melhor que puro', pure: [true, false], repeat: [true, true], production: 0.5, positiveCost: -0.5 },
    { name: 'precisões iguais', pure: [true, false], repeat: [true, false], production: 0, positiveCost: 0 },
    { name: 'denominador unitário', pure: [true], repeat: [false], production: -1, positiveCost: 1 },
  ]

  for (const c of cases) {
    it(c.name, () => {
      const trials = manualTaskSwitchTrials({
        pureOdd: c.pure,
        pureMagnitude: c.pure,
        mixedRepeat: c.repeat,
      })
      const scored = getTest('taskswitch').scoreSession(trials, 'assessment', DEVICE, {})
      expect(scored.customMetrics.mixingCostAccuracy).toBe(c.production)
      const pureAccuracy = c.pure.filter(Boolean).length / c.pure.length
      const repeatAccuracy = c.repeat.filter(Boolean).length / c.repeat.length
      expect(positiveAccuracyMixingCost(pureAccuracy, repeatAccuracy)).toBe(c.positiveCost)
    })
  }

  it('continua definido quando repeat não tem RT válido, pois é métrica de acurácia', () => {
    const trials = manualTaskSwitchTrials({
      pureOdd: [true, true],
      pureMagnitude: [true, true],
      mixedRepeat: [true, true],
      repeatRT: 100,
    })
    const scored = getTest('taskswitch').scoreSession(trials, 'assessment', DEVICE, {})
    expect(scored.conditionMetrics.mixed_repeat.medianRT).toBeNull()
    expect(scored.customMetrics.mixingCostAccuracy).toBe(0)
  })

  it('direção está cadastrada, mas a métrica não é primária nem entra no baseline', () => {
    const test = getTest('taskswitch')
    expect(test.metricDirections.mixingCostAccuracy).toBe(-1)
    expect(test.primaryMetricKey).not.toBe('mixingCostAccuracy')
    expect(test.baselineMetricKeys).not.toContain('mixingCostAccuracy')
  })
})

describe('AC-02 — alcance real do fallback por teste', () => {
  const scenarios: Array<{ testId: TestId; trials: TrialRecord[]; fallbackExpected: boolean }> = [
    {
      testId: 'stroop',
      trials: standardRecords('stroop', (g) => ({ correct: g.condition !== 'incongruent' })),
      fallbackExpected: true,
    },
    { testId: 'gonogo', trials: standardRecords('gonogo'), fallbackExpected: false },
    { testId: 'sart', trials: standardRecords('sart'), fallbackExpected: false },
    { testId: 'nback', trials: standardRecords('nback'), fallbackExpected: false },
    {
      testId: 'taskswitch',
      trials: standardRecords('taskswitch', (g) => ({ correct: g.condition !== 'mixed_switch' })),
      fallbackExpected: true,
    },
    {
      testId: 'corsi',
      trials: [{
        trialId: 'corsi-0', sessionId: 'synthetic-session', testId: 'corsi',
        protocolVersion: getTest('corsi').protocolVersion, mode: 'assessment', blockIndex: 0,
        trialIndex: 0, condition: 'forward', stimulus: '0,1', expectedResponse: '0,1',
        actualResponse: '0,1', correct: true, reactionTimeMs: 900,
        stimulusOnsetTimestamp: 1_000, responseTimestamp: 1_900, windowFocused: true,
        visibilityState: 'visible', deviceType: 'desktop', inputMethod: 'mouse',
        metadata: { span: 2 },
      }],
      fallbackExpected: false,
    },
  ]

  for (const scenario of scenarios) {
    it(scenario.testId, () => {
      const test = getTest(scenario.testId)
      const scored = test.scoreSession(scenario.trials, 'assessment', DEVICE, {})
      const primary = scored.customMetrics[test.primaryMetricKey]
      const median = scored.rtMetrics.medianCorrectRT
      const displayed = resultsPrimaryFallback(scored.customMetrics, test.primaryMetricKey, median)
      const usedFallback = (primary === null || primary === undefined) && displayed === median

      expect(usedFallback).toBe(scenario.fallbackExpected)
      if (scenario.fallbackExpected) {
        expect(scored.quality).toBe('valid')
        expect(primary).toBeNull()
        expect(median).not.toBeNull()
        expect(displayed).toBe(median)

        const baseline = {
          testId: scenario.testId,
          protocolVersion: test.protocolVersion,
          phase: 'monitoring' as const,
          sessionCount: 12,
          familiarizationCount: 3,
          baselineCount: 8,
          warningCount: 0,
          metrics: { [test.primaryMetricKey]: { median: 100, mad: 10, n: 8 } },
        }
        const z = evaluatePrimaryZ(displayed, baseline, test)
        expect(z.kind).toBe('ok')
        if (z.kind === 'ok') expect(Math.abs(z.z)).toBeGreaterThan(10)

        const card = renderToStaticMarkup(createElement(MetricCard, {
          metric: test.primaryMetricKey,
          label: 'Métrica principal',
          value: displayed,
          unit: ' ms',
        }))
        expect(card).toContain('500')
        expect(card).toContain('ms')
      } else {
        expect(primary).not.toBeNull()
        expect(primary).not.toBeUndefined()
        expect(displayed).toBe(primary)
      }
    })
  }
})

describe('AC-12 — apresentação executada', () => {
  it('SART exibe proporção primária como número cru e unidade ms', () => {
    const html = renderToStaticMarkup(createElement(MetricCard, {
      metric: 'commissionErrorRate',
      label: 'Métrica principal',
      value: 0.11,
      unit: ' ms',
    }))
    expect(html).toContain('0.11')
    expect(html).toContain('ms')
    expect(html).not.toContain('11%')
  })

  it("d' é arredondado a inteiro e recebe unidade ms", () => {
    const html = renderToStaticMarkup(createElement(MetricCard, {
      metric: 'dPrime',
      label: 'Métrica principal',
      value: 2.4,
      unit: ' ms',
    }))
    expect(html).toContain('>2<')
    expect(html).toContain('ms')
    expect(html).not.toContain('2.4')
  })
})

function corsiTrial(index: number, expected: string, actual: string, correct: boolean): TrialRecord {
  return {
    trialId: `corsi-${index}`, sessionId: 'legacy-corsi', testId: 'corsi',
    protocolVersion: 'corsi.forward.v1.0', mode: 'assessment', blockIndex: 0,
    trialIndex: index, condition: 'forward', stimulus: expected, expectedResponse: expected,
    actualResponse: actual, correct, reactionTimeMs: correct ? 900 : 700,
    stimulusOnsetTimestamp: 1_000, responseTimestamp: correct ? 1_900 : 1_700,
    windowFocused: true, visibilityState: 'visible', deviceType: 'desktop', inputMethod: 'mouse',
    metadata: { span: 2 },
  }
}

function minimalCorsiSession(id: string, value: number, scoringVersion?: string): SessionRecord {
  const startedAt = `2026-07-${String(Number(id.replace(/\D/g, '')) + 1).padStart(2, '0')}T10:00:00.000Z`
  return {
    sessionId: id, testId: 'corsi', protocolVersion: 'corsi.forward.v1.0', mode: 'assessment',
    status: 'completed', startedAt, completedAt: startedAt, quality: 'valid', flags: {},
    flagMessages: [], trials: [], deviceInfo: DEVICE, isDemo: false, practiceCompleted: true,
    randomizationSeed: 1,
    result: {
      sessionId: id, testId: 'corsi', protocolVersion: 'corsi.forward.v1.0', mode: 'assessment',
      startedAt, completedAt: startedAt, quality: 'valid', flags: {}, flagMessages: [],
      rtMetrics: { medianCorrectRT: 900, meanCorrectRT: 900, rtStandardDeviation: null,
        rtIQR: 0, rtCoefficientOfVariation: null, p10RT: 900, p90RT: 900,
        anticipationRate: 0, lapseRate: 0, validTrialCount: 1, invalidTrialCount: 0 },
      accuracyMetrics: { accuracy: 1, correctCount: 1, errorCount: 0, omissionCount: 0, totalTrials: 1 },
      conditionMetrics: {}, blockMetrics: [], customMetrics: {
        confirmedSpan: value, maxSpan: value, totalCorrectSequences: 1, partialScoreRate: 1,
      },
      isDemo: false, deviceInfo: DEVICE, scoringVersion,
    },
  }
}

describe('AG-01 — incompatibilidade histórica do Corsi', () => {
  it('o mesmo replay produz primária 1 no scoring legado e 2 na regra do engine', () => {
    const trials = [
      corsiTrial(0, '0,1', '0,1', true),
      corsiTrial(1, '1,2', '9', false),
      corsiTrial(2, '2,3', '9', false),
    ]
    const abstract = [
      { span: 2, correct: true },
      { span: 2, correct: false },
      { span: 2, correct: false },
    ]
    expect(legacyCorsiConfirmedSpan(abstract)).toBe(1)
    expect(engineCorsiConfirmedSpan(abstract)).toBe(2)
    const current = getTest('corsi').scoreSession(trials, 'assessment', DEVICE, {})
    expect(current.customMetrics.confirmedSpan).toBe(2)
    expect(current.scoringVersion).toContain('corsi-replay-1')
  })

  it('baseline e gráfico misturam scoringVersion sob a mesma protocolVersion', () => {
    const sessions = [
      minimalCorsiSession('s00', 2, 'sdt-hautus-1;corsi-replay-1'),
      minimalCorsiSession('s01', 2, 'sdt-hautus-1;corsi-replay-1'),
      minimalCorsiSession('s02', 2, 'sdt-hautus-1;corsi-replay-1'),
      minimalCorsiSession('s03', 1, 'sdt-hautus-1'),
      minimalCorsiSession('s04', 1, 'sdt-hautus-1'),
      minimalCorsiSession('s05', 1, 'sdt-hautus-1'),
      minimalCorsiSession('s06', 1, 'sdt-hautus-1'),
      minimalCorsiSession('s07', 2, 'sdt-hautus-1;corsi-replay-1'),
      minimalCorsiSession('s08', 2, 'sdt-hautus-1;corsi-replay-1'),
      minimalCorsiSession('s09', 2, 'sdt-hautus-1;corsi-replay-1'),
      minimalCorsiSession('s10', 2, 'sdt-hautus-1;corsi-replay-1'),
    ]
    const baseline = computeBaselineStats(sessions, 'corsi', 'corsi.forward.v1.0', ['confirmedSpan'])
    expect(baseline.metrics.confirmedSpan.n).toBe(8)
    expect(baseline.metrics.confirmedSpan.median).toBe(1.5)
    expect(selectTrendSessions(sessions).sessions).toHaveLength(11)
  })
})

describe('AG-03 — tabela SDT não exaustiva em respostas pré-onset', () => {
  it('Go/No-Go válido perde antecipações Go do denominador, mas conta No-Go como FA', () => {
    const test = getTest('gonogo')
    const trials = standardRecords('gonogo')
    let earlyGo = 0
    let earlyNoGo = 0
    for (const t of trials) {
      const shouldMutate =
        (t.condition === 'go' && earlyGo < 9) || (t.condition === 'nogo' && earlyNoGo < 9)
      if (!shouldMutate) continue
      if (t.condition === 'go') earlyGo += 1
      else earlyNoGo += 1
      t.actualResponse = 'space'
      t.correct = false
      t.reactionTimeMs = null
      t.responseTimestamp = null
      t.invalidReason = 'anticipation'
    }

    const scored = test.scoreSession(trials, 'assessment', DEVICE, {})
    const sdt = scored.sdtMetrics!
    const goCount = trials.filter((t) => t.condition === 'go').length
    const noGoCount = trials.filter((t) => t.condition === 'nogo').length
    expect(scored.quality).toBe('valid')
    expect(sdt.hits + sdt.misses).toBe(goCount - earlyGo)
    expect(sdt.falseAlarms + sdt.correctRejections).toBe(noGoCount)

    const exhaustive = computeSDT({
      hits: sdt.hits,
      misses: sdt.misses + earlyGo,
      falseAlarms: sdt.falseAlarms,
      correctRejections: sdt.correctRejections,
    })
    expect(Math.abs(scored.customMetrics.dPrime! - exhaustive.dPrime!)).toBeGreaterThan(0.1)
  })
})

describe('AG-04 — validação de importação não valida result', () => {
  it('aceita result vazio e ele quebra o baseline após a familiarização', () => {
    const malformed = (i: number) => ({
      ...minimalCorsiSession(`s${i}`, 2),
      result: {},
    })
    expect(validateImportedSession(malformed(0))).toBeNull()
    expect(() => computeBaselineStats(
      [malformed(0), malformed(1), malformed(2), malformed(3)] as SessionRecord[],
      'corsi',
      'corsi.forward.v1.0',
      ['confirmedSpan']
    )).toThrow()
  })
})
