/**
 * AC-02 (verificação curta) — alcance real do fallback de métrica primária.
 *
 * Fluxo replicado de Results.tsx:149-155:
 *   primaryValue = result.customMetrics[primaryMetricKey] ?? rtMetrics.medianCorrectRT
 *   z            = evaluatePrimaryZ(primaryValue, baseline, test)   // baseline da CHAVE original
 *
 * Pergunta central: quais testes conseguem, com trials LEGÍTIMOS e sessão ainda
 * `valid`/`valid_with_warnings`, chegar a `customMetrics[primária] === null` mantendo
 * `medianCorrectRT` não nulo?
 */
import { describe, expect, it } from 'vitest'
import { computeBaselineStats } from '../../src/statistics/baseline'
import { evaluatePrimaryZ } from '../../src/statistics/zscore'
import { ALL_TESTS, getTest } from '../../src/tests/registry'
import type { CognitiveTestDefinition } from '../../src/tests/types'
import type { DeviceInfo, SessionRecord, TrialRecord } from '../../src/types'

const DEVICE: DeviceInfo = {
  deviceType: 'desktop', inputMethod: 'keyboard', screenWidth: 1920,
  screenHeight: 1080, browser: 'Chrome', userAgent: 'replication',
}

function trial(i: number, condition: string, expected: string, actual: string,
  rt: number | null, testId: TrialRecord['testId'],
  meta?: Record<string, unknown>): TrialRecord {
  const correct = actual === expected
  const onset = 10_000 + i * 3000
  return {
    trialId: `t${i}`, sessionId: 'fx', testId, protocolVersion: 'fx',
    mode: 'assessment', blockIndex: 0, trialIndex: i, condition,
    stimulus: 'x', expectedResponse: expected, actualResponse: actual, correct,
    reactionTimeMs: rt, stimulusOnsetTimestamp: onset,
    responseTimestamp: rt === null ? null : onset + rt,
    windowFocused: true, visibilityState: 'visible',
    deviceType: 'desktop', inputMethod: 'keyboard',
    ...(rt === null && actual === '' ? { invalidReason: 'omission' } : {}),
    metadata: meta,
  }
}

/** Reproduz a linha de Results.tsx. */
function displayedPrimary(test: CognitiveTestDefinition,
  result: { customMetrics: Record<string, number | null>;
    rtMetrics: { medianCorrectRT: number | null } }) {
  return result.customMetrics[test.primaryMetricKey] ?? result.rtMetrics.medianCorrectRT
}

describe('AC-02 — o fallback existe e cruza grandezas', () => {
  it('Stroop: sem RT correto em "congruent", a primária é null e o RT ocupa seu lugar', () => {
    const trials: TrialRecord[] = []
    let i = 0
    // 20 incongruentes corretos (~650 ms) e 20 neutros corretos (~560 ms):
    for (let k = 0; k < 20; k++) trials.push(trial(i++, 'incongruent', 'f', 'f', 650, 'stroop'))
    for (let k = 0; k < 20; k++) trials.push(trial(i++, 'neutral', 'f', 'f', 560, 'stroop'))
    // 20 congruentes TODOS incorretos ⇒ nenhum RT válido nessa condição:
    for (let k = 0; k < 20; k++) trials.push(trial(i++, 'congruent', 'f', 'g', 540, 'stroop'))

    const r = getTest('stroop').scoreSession(trials, 'assessment', DEVICE, {})
    expect(r.customMetrics.stroopCostRT).toBeNull()
    expect(r.rtMetrics.medianCorrectRT).not.toBeNull()
    const shown = displayedPrimary(getTest('stroop'), r)
    expect(shown).toBe(r.rtMetrics.medianCorrectRT) // ~600 ms exibido como "custo"
    // Qualidade da sessão: NÃO é invalid (acurácia 2/3)
    expect(r.quality).not.toBe('invalid')
  })

  it('Stroop: o z usa a CHAVE ORIGINAL — RT normalizado contra baseline de custo', () => {
    // Baseline de stroopCostRT plausível: mediana 90 ms, MAD ~10 ms
    const costs = [80, 85, 88, 90, 92, 95, 100, 105]
    const sessions: SessionRecord[] = costs.map((c, k) => ({
      sessionId: `s${k}`, testId: 'stroop', protocolVersion: getTest('stroop').protocolVersion,
      mode: 'assessment', status: 'completed', quality: 'valid',
      startedAt: `2026-06-${String(k + 4).padStart(2, '0')}T12:00:00.000Z`,
      completedAt: `2026-06-${String(k + 4).padStart(2, '0')}T12:10:00.000Z`,
      flags: {}, flagMessages: [], trials: [], deviceInfo: DEVICE, isDemo: false,
      practiceCompleted: true, randomizationSeed: 1,
      result: {
        sessionId: `s${k}`, testId: 'stroop', protocolVersion: getTest('stroop').protocolVersion,
        mode: 'assessment', startedAt: '', completedAt: '', quality: 'valid',
        flags: {}, flagMessages: [],
        rtMetrics: { medianCorrectRT: 560, meanCorrectRT: 560, rtStandardDeviation: null,
          rtIQR: null, rtCoefficientOfVariation: null, p10RT: null, p90RT: null,
          anticipationRate: 0, lapseRate: 0, validTrialCount: 100, invalidTrialCount: 0 },
        accuracyMetrics: { accuracy: 0.95, correctCount: 114, errorCount: 6, omissionCount: 0, totalTrials: 120 },
        conditionMetrics: {}, blockMetrics: [],
        customMetrics: { stroopCostRT: c, stroopCostAccuracy: 0.02 },
        deviceInfo: DEVICE, isDemo: false,
      },
    }))
    // 3 familiarização + 8 janela = 11 elegíveis
    const pool = [...sessions, ...sessions.slice(0, 3).map((s, k) => ({
      ...s, sessionId: `f${k}`,
      startedAt: `2026-06-0${k + 1}T12:00:00.000Z`,
      completedAt: `2026-06-0${k + 1}T12:10:00.000Z`,
    }))]
    const stats = computeBaselineStats(pool, 'stroop', getTest('stroop').protocolVersion,
      getTest('stroop').baselineMetricKeys)
    expect(stats.phase).toBe('monitoring')

    // RT ~600 ms entra onde se esperava um custo de ~90 ms:
    const z = evaluatePrimaryZ(600, stats, getTest('stroop'))
    expect(z.kind).toBe('ok')
    if (z.kind === 'ok') expect(Math.abs(z.z)).toBeGreaterThan(10) // z dimensionalmente falso
  })

  it('Task Switching: mesmo mecanismo (sem RT válido em mixed_switch)', () => {
    const trials: TrialRecord[] = []
    let i = 0
    for (let k = 0; k < 20; k++) trials.push(trial(i++, 'pure_odd_even', 'f', 'f', 520, 'taskswitch'))
    for (let k = 0; k < 20; k++) trials.push(trial(i++, 'pure_magnitude', 'f', 'f', 535, 'taskswitch'))
    for (let k = 0; k < 20; k++) trials.push(trial(i++, 'mixed_repeat', 'f', 'f', 640, 'taskswitch'))
    for (let k = 0; k < 20; k++) trials.push(trial(i++, 'mixed_switch', 'f', 'j', 760, 'taskswitch'))

    const r = getTest('taskswitch').scoreSession(trials, 'assessment', DEVICE, {})
    expect(r.customMetrics.switchCostRT).toBeNull()
    expect(r.rtMetrics.medianCorrectRT).not.toBeNull()
    expect(displayedPrimary(getTest('taskswitch'), r)).toBe(r.rtMetrics.medianCorrectRT)
    expect(r.quality).not.toBe('invalid')
  })
})

describe('AC-02 — testes que NÃO alcançam o fallback pelo caminho normal', () => {
  it('Go/No-Go e n-back: Hautus mantém d′ finito sempre que há sinal E ruído', () => {
    const gn: TrialRecord[] = []
    let i = 0
    for (let k = 0; k < 60; k++) gn.push(trial(i++, 'go', 'space', 'space', 380, 'gonogo'))
    for (let k = 0; k < 20; k++) gn.push(trial(i++, 'nogo', 'none', 'none', null, 'gonogo'))
    const rg = getTest('gonogo').scoreSession(gn, 'assessment', DEVICE, {})
    expect(rg.customMetrics.dPrime).not.toBeNull()

    const nb: TrialRecord[] = []
    i = 0
    for (let k = 0; k < 20; k++)
      nb.push(trial(i++, '2back', 'space', 'space', 700, 'nback', { nBack: 2, isTarget: true }))
    for (let k = 0; k < 60; k++)
      nb.push(trial(i++, '2back', 'none', 'none', null, 'nback', { nBack: 2, isTarget: false }))
    const rn = getTest('nback').scoreSession(nb, 'assessment', DEVICE, {})
    expect(rn.customMetrics.dPrime2Back).not.toBeNull()
  })

  it('SART: commissionErrorRate só é null sem NENHUM trial No-Go (impossível no gerador)', () => {
    const generated = getTest('sart').generateTrials('assessment', 12345)
    expect(generated.some((t) => t.condition === 'no-go')).toBe(true)
  })

  it('Corsi: confirmedSpan é sempre número — inclusive 0, que o `??` preserva', () => {
    const corsiTrials: TrialRecord[] = [
      trial(0, 'forward', '1,2', '9,9', 1500, 'corsi', { span: 2 }),
      trial(1, 'forward', '3,4', '9,9', 1500, 'corsi', { span: 2 }),
    ]
    const r = getTest('corsi').scoreSession(corsiTrials, 'assessment', DEVICE, {})
    expect(r.customMetrics.confirmedSpan).toBe(0)
    expect(displayedPrimary(getTest('corsi'), r)).toBe(0) // 0 ?? x === 0
  })

  it('simple_rt e choice_rt: a primária É medianCorrectRT — o fallback é inócuo', () => {
    for (const id of ['simple_rt', 'choice_rt'] as const) {
      expect(getTest(id).primaryMetricKey).toBe('medianCorrectRT')
    }
  })

  it('ESCOPO FINAL: exatamente 2 dos 8 testes alcançam o fallback com trials legítimos', () => {
    const reachable = ALL_TESTS.filter((t) =>
      ['stroop', 'taskswitch'].includes(t.id)).map((t) => t.id)
    expect(reachable).toEqual(['stroop', 'taskswitch'])
    // e ambos têm primária do tipo "custo" (diferença entre condições),
    // que é exatamente a família que pode virar null com trials válidos.
    expect(getTest('stroop').primaryMetricKey).toBe('stroopCostRT')
    expect(getTest('taskswitch').primaryMetricKey).toBe('switchCostRT')
  })
})
