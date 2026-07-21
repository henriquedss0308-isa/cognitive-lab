/**
 * Comparação oráculo (Python, independente) × código de produção.
 *
 * Os valores esperados foram pré-computados pelo oráculo e gravados em
 * comparisons/expected/*.json por make_fixtures.py (seed fixa 2026).
 * Este arquivo NÃO reimplementa fórmula nenhuma: só executa as funções REAIS
 * de src/ sobre as mesmas fixtures e compara número a número.
 *
 * Divergências CONHECIDAS e documentadas na auditoria são verificadas como
 * tais (ex.: sinal de mixingCostAccuracy) — se um dia deixarem de divergir,
 * o teste falha e o achado deve ser revisto.
 */
import { describe, expect, it, afterAll } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import {
  median, mean, standardDeviation, iqr, mad, coefficientOfVariation,
  percentile, robustZScore,
} from '../../src/statistics/basic'
import { computeSDT } from '../../src/statistics/signalDetection'
import { computeRTMetrics, computeAccuracyMetrics } from '../../src/statistics/rtProcessing'
import { postErrorSlowing } from '../../src/scoring/common'
import { stroopCostRT, stroopCostAccuracy, switchCost, mixingCost } from '../../src/statistics/costs'
import { replayCorsiTrials } from '../../src/tests/corsi/adaptive'
import { computeBaselineStats, getValidAssessmentSessions, getBaselinePhase } from '../../src/statistics/baseline'
import { evaluatePrimaryZ } from '../../src/statistics/zscore'
import { getEligibleSessions, getContextualWindow } from '../../src/features/context-aware-baseline/contextualEligibility'
import { seededRandom, randomInt } from '../../src/utils/random'
import { testDefinition as gonogoDef } from '../../src/tests/gonogo'
import { testDefinition as stroopDef } from '../../src/tests/stroop'
import { testDefinition as taskswitchDef } from '../../src/tests/taskswitch'
import type { SessionRecord, TrialRecord, DeviceInfo } from '../../src/types'

const HERE = join(__dirname)
const fixture = (name: string) =>
  JSON.parse(readFileSync(join(HERE, '..', 'fixtures', name), 'utf-8'))
const expected = (name: string) =>
  JSON.parse(readFileSync(join(HERE, 'expected', name), 'utf-8'))

const TOL = 1e-9
const TOL_SDT = 5e-4 // produção usa aproximação de Acklam para Φ⁻¹

const report: Record<string, unknown>[] = []
function note(area: string, detail: string, status: 'match' | 'divergence') {
  report.push({ area, detail, status })
}

function close(a: number | null | undefined, b: number | null | undefined, tol = TOL) {
  if (a === null || a === undefined || b === null || b === undefined) {
    expect(a ?? null).toBe(b ?? null)
    return
  }
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol)
}

const DEVICE: DeviceInfo = {
  deviceType: 'desktop', inputMethod: 'keyboard', screenWidth: 1920,
  screenHeight: 1080, browser: 'Chrome', userAgent: 'audit',
}

describe('estatística básica', () => {
  const arrays = fixture('basic_stats.json') as Record<string, number[]>
  const exp = expected('basic_stats.json')
  for (const [name, values] of Object.entries(arrays)) {
    it(name, () => {
      close(median(values), exp[name].median)
      close(mean(values), exp[name].mean)
      close(standardDeviation(values), exp[name].sd)
      close(iqr(values), exp[name].iqr)
      close(mad(values), exp[name].mad)
      close(coefficientOfVariation(values), exp[name].cv)
      close(percentile(values, 10), exp[name].p10)
      close(percentile(values, 90), exp[name].p90)
    })
  }
  it('robustZScore com direção', () => {
    close(robustZScore(120, 100, 10, -1), -(20 / (1.4826 * 10)))
    close(robustZScore(120, 100, 10, 1), 20 / (1.4826 * 10))
    expect(robustZScore(120, 100, 0, 1)).toBeNull()
    expect(robustZScore(120, null, 10, 1)).toBeNull()
  })
})

describe('SDT (d′, critério, Hautus)', () => {
  const cases = fixture('sdt_cases.json')
  const exp = expected('sdt_cases.json')
  cases.forEach((c: any, i: number) => {
    it(`caso ${i}: H${c.hits} M${c.misses} FA${c.falseAlarms} CR${c.correctRejections}`, () => {
      const r = computeSDT(c)
      close(r.hitRate, exp[i].hitRate)
      close(r.falseAlarmRate, exp[i].falseAlarmRate)
      close(r.dPrime, exp[i].dPrime, TOL_SDT)
      close(r.criterion, exp[i].criterion, TOL_SDT)
    })
  })
})

describe('limpeza de RT e acurácia', () => {
  const sets = fixture('rt_trials.json')
  const exp = expected('rt_trials.json')
  for (const [name, s] of Object.entries<any>(sets)) {
    it(name, () => {
      const m = computeRTMetrics(s.trials as TrialRecord[], s.cleaning)
      const e = exp[name].rt
      close(m.medianCorrectRT, e.medianCorrectRT)
      close(m.meanCorrectRT, e.meanCorrectRT)
      close(m.rtStandardDeviation, e.rtStandardDeviation)
      close(m.rtIQR, e.rtIQR)
      close(m.rtCoefficientOfVariation, e.rtCoefficientOfVariation)
      close(m.p10RT, e.p10RT)
      close(m.p90RT, e.p90RT)
      close(m.anticipationRate, e.anticipationRate)
      close(m.lapseRate, e.lapseRate)
      expect(m.validTrialCount).toBe(e.validTrialCount)

      const a = computeAccuracyMetrics(s.trials as TrialRecord[])
      const ea = exp[name].accuracy
      close(a.accuracy, ea.accuracy)
      expect(a.correctCount).toBe(ea.correctCount)
      expect(a.errorCount).toBe(ea.errorCount)
      expect(a.omissionCount).toBe(ea.omissionCount)

      close(postErrorSlowing(s.trials as TrialRecord[]), exp[name].postErrorSlowing)
    })
  }
})

describe('custos entre condições', () => {
  const c = fixture('costs.json')
  const e = expected('costs.json')
  it('stroop / switch / mixing', () => {
    close(stroopCostRT(c.stroop.congruent, c.stroop.incongruent), e.stroopCostRT)
    close(stroopCostRT(c.stroop.neutral, c.stroop.incongruent), e.incongruentNeutralCostRT)
    close(switchCost(c.taskswitch.switch, c.taskswitch.repeat), e.switchCostRT)
    close(mixingCost(c.taskswitch.repeat, c.taskswitch.pure), e.mixingCostRT)
    expect(stroopCostRT(c.degenerate.congruent, c.degenerate.incongruent)).toBeNull()
  })
})

describe('Corsi — replay adaptativo', () => {
  const cases = fixture('corsi_replay.json')
  const exp = expected('corsi_replay.json')
  for (const [name, trials] of Object.entries<any>(cases)) {
    it(name, () => {
      const { finalState, totalItems } = replayCorsiTrials(trials, 'assessment', 30)
      const e = exp[name]
      expect(finalState.maxSpanReached).toBe(e.maxSpan)
      expect(finalState.confirmedSpan).toBe(e.confirmedSpan)
      expect(finalState.totalCorrectSequences).toBe(e.totalCorrectSequences)
      expect(finalState.totalCorrectPositions).toBe(e.partialScore)
      expect(totalItems).toBe(e.totalItems)
    })
  }
})

describe('baseline, janelas e z primário', () => {
  const scenarios = fixture('baseline_sessions.json')
  const exp = expected('baseline_sessions.json')
  const fakeTest = {
    primaryMetricKey: 'm',
    metricDirections: { m: -1 },
  } as any

  for (const [name, sessions] of Object.entries<any>(scenarios)) {
    it(name, () => {
      const ss = sessions as SessionRecord[]
      const e = exp[name]
      const elig = getValidAssessmentSessions(ss, 'fx' as any, 'fx.v1')
      expect(elig.length).toBe(e.eligibleCount)
      expect(getBaselinePhase(elig.length)).toBe(e.phase)

      const stats = computeBaselineStats(ss, 'fx' as any, 'fx.v1', ['m'])
      close(stats.metrics.m.median, e.metric.median)
      close(stats.metrics.m.mad, e.metric.mad)
      expect(stats.metrics.m.n).toBe(e.metric.n)

      const zMinus = evaluatePrimaryZ(480.0, stats, fakeTest)
      expect(zMinus.kind).toBe(e.zProbeDirectionMinus.kind)
      if (zMinus.kind === 'ok') close(zMinus.z, e.zProbeDirectionMinus.z)
      if (zMinus.kind === 'zero_mad') {
        close(zMinus.median, e.zProbeDirectionMinus.median)
        close(zMinus.delta, e.zProbeDirectionMinus.delta)
      }
      const zPlus = evaluatePrimaryZ(480.0, stats,
        { primaryMetricKey: 'm', metricDirections: { m: 1 } } as any)
      expect(zPlus.kind).toBe(e.zProbeDirectionPlus.kind)
      if (zPlus.kind === 'ok') close(zPlus.z, e.zProbeDirectionPlus.z)

      const ctxElig = getEligibleSessions(ss, 'fx' as any, 'fx.v1')
      expect(getContextualWindow(ctxElig, 'taken').map((s) => s.sessionId))
        .toEqual(e.contextualTaken)
      expect(getContextualWindow(ctxElig, 'not_taken').map((s) => s.sessionId))
        .toEqual(e.contextualNotTaken)
    })
  }
})

describe('fronteira do gerador aleatório (achado documentado)', () => {
  it('seededRandom pode retornar exatamente 1.0 → randomInt sai do intervalo', () => {
    const { seed } = fixture('lcg_boundary.json')
    const rng = seededRandom(seed)
    const value = rng()
    expect(value).toBe(1) // demonstração do caso limite (prob. 2^-32 por sorteio)
    const rng2 = seededRandom(seed)
    expect(randomInt(0, 3, rng2)).toBe(4) // fora do intervalo [0, 3]
    note('random', 'seededRandom devolve 1.0 no estado 0xffffffff; randomInt(0,3) → 4', 'divergence')
  })
})

describe('scoreSession completo — Go/No-Go', () => {
  const trials = fixture('session_gonogo.json') as TrialRecord[]
  const e = expected('session_gonogo.json')
  const r = gonogoDef.scoreSession(trials, 'assessment', DEVICE, {})
  it('contagens SDT e d′', () => {
    expect(r.sdtMetrics!.hits).toBe(e.counts.hits)
    expect(r.sdtMetrics!.misses).toBe(e.counts.misses)
    expect(r.sdtMetrics!.falseAlarms).toBe(e.counts.falseAlarms)
    expect(r.sdtMetrics!.correctRejections).toBe(e.counts.correctRejections)
    close(r.customMetrics.dPrime, e.sdt.dPrime, TOL_SDT)
    close(r.customMetrics.criterion, e.sdt.criterion, TOL_SDT)
    close(r.customMetrics.hitRate, e.sdt.hitRate)
    close(r.customMetrics.falseAlarmRate, e.sdt.falseAlarmRate)
  })
  it('métricas de comissão e RT', () => {
    close(r.customMetrics.commissionErrorRate, e.commissionErrorRate)
    expect(r.customMetrics.commissionErrors).toBe(e.commissionErrors)
    close(r.rtMetrics.medianCorrectRT, e.medianCorrectRT)
    close(r.accuracyMetrics.accuracy, e.accuracy)
  })
})

describe('scoreSession completo — Stroop', () => {
  const trials = fixture('session_stroop.json') as TrialRecord[]
  const e = expected('session_stroop.json')
  const r = stroopDef.scoreSession(trials, 'assessment', DEVICE, {})
  it('custos', () => {
    close(r.customMetrics.stroopCostRT, e.stroopCostRT)
    close(r.customMetrics.stroopCostAccuracy, e.stroopCostAccuracy)
    close(r.customMetrics.incongruentNeutralCostRT, e.incongruentNeutralCostRT)
  })
})

describe('scoreSession completo — Task Switching', () => {
  const trials = fixture('session_taskswitch.json') as TrialRecord[]
  const e = expected('session_taskswitch.json')
  const r = taskswitchDef.scoreSession(trials, 'assessment', DEVICE, {})
  it('custos de RT', () => {
    close(r.customMetrics.switchCostRT, e.switchCostRT)
    close(r.customMetrics.mixingCostRT, e.mixingCostRT)
  })
  it('custo de acurácia de alternância (convenção positivo = pior)', () => {
    close(r.customMetrics.switchCostAccuracy, e.switchCostAccuracy)
  })
  it('DIVERGÊNCIA DOCUMENTADA: mixingCostAccuracy com sinal invertido', () => {
    // Produção calcula repeat − pure; a definição consistente com
    // switchCostAccuracy seria pure − repeat. O valor da produção deve ser
    // exatamente o negativo do oráculo. Se este teste falhar, a produção
    // mudou e o achado AS-02 deve ser revisto.
    close(r.customMetrics.mixingCostAccuracy, e.mixingCostAccuracyAsProduction)
    close(r.customMetrics.mixingCostAccuracy,
      e.mixingCostAccuracyConsistent === null ? null : -e.mixingCostAccuracyConsistent)
    note('taskswitch', 'mixingCostAccuracy = repeat − pure (sinal oposto à convenção do switchCostAccuracy); direção -1 registrada fica invertida', 'divergence')
  })
})

afterAll(() => {
  const dir = join(HERE, '..', 'reports')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'comparison_report.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    auditedCommit: '05ef727b4826ea92193ec0e2add40cd662eb1906',
    fixtureSeed: 2026,
    tolerances: { descriptive: TOL, sdt: TOL_SDT },
    notes: report,
  }, null, 1))
})
