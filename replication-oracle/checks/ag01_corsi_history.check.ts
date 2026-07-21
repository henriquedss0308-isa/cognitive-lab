/**
 * AG-01 — Replicação crítica da incompatibilidade histórica do Corsi.
 *
 * DIFERENÇA em relação ao review-oracle do GPT-5.6: aqui o scorer legado NÃO é
 * uma reimplementação — é o BLOB REAL de `478a8fb^:src/tests/corsi/index.ts`
 * (git blob 8d8a030bf149cf14f1930c04a25c808563b55ad1, byte-idêntico, verificado
 * por `git hash-object`), executado via shims de resolução em
 * ../legacy/mirror/. O scorer atual é o de produção congelada.
 */
import { describe, expect, it } from 'vitest'
import { testDefinition as legacyCorsi } from '../legacy/mirror/tests/corsi/index'
import { testDefinition as currentCorsi } from '../../src/tests/corsi/index'
import { applyCorsiResult, createCorsiAdaptiveState } from '../../src/tests/corsi/adaptive'
import { computeBaselineStats, getValidAssessmentSessions } from '../../src/statistics/baseline'
import { selectTrendSessions, buildTrendPoints } from '../../src/components/charts/chartSelectors'
import { evaluatePrimaryZ } from '../../src/statistics/zscore'
import type { DeviceInfo, SessionRecord, TrialRecord } from '../../src/types'

const DEVICE: DeviceInfo = {
  deviceType: 'desktop', inputMethod: 'mouse', screenWidth: 1920,
  screenHeight: 1080, browser: 'Chrome', userAgent: 'replication',
}

/** TrialRecord como o TestRunner grava (extraMeta.span era gravado nos DOIS períodos — verificado em 478a8fb^:TestRunner.tsx:624). */
function corsiTrial(i: number, span: number, expected: string, actual: string): TrialRecord {
  const correct = expected === actual
  return {
    trialId: `t${i}`, sessionId: 'fx', testId: 'corsi',
    protocolVersion: 'corsi.forward.v1.0', mode: 'assessment',
    blockIndex: 0, trialIndex: i, condition: 'forward',
    stimulus: expected, expectedResponse: expected, actualResponse: actual,
    correct, reactionTimeMs: 1500, stimulusOnsetTimestamp: 1000 + i * 5000,
    responseTimestamp: 2500 + i * 5000, windowFocused: true,
    visibilityState: 'visible', deviceType: 'desktop', inputMethod: 'mouse',
    metadata: { span },
  }
}

function score(def: typeof currentCorsi, trials: TrialRecord[]) {
  const r = def.scoreSession(trials, 'assessment', DEVICE, {})
  return {
    confirmedSpan: r.customMetrics.confirmedSpan,
    maxSpan: r.customMetrics.maxSpan,
    totalCorrectSequences: r.customMetrics.totalCorrectSequences,
    scoringVersion: (r as { scoringVersion?: string }).scoringVersion,
  }
}

/** confirmedSpan do ENGINE real (applyCorsiResult, idêntico nos dois períodos — diff de 478a8fb só ADICIONA replay). */
function engineConfirmedSpan(outcomes: boolean[]): number {
  let state = createCorsiAdaptiveState(0)
  for (const correct of outcomes) {
    if (state.ended) break
    state = applyCorsiResult(state, {
      correct,
      partialPositionsCorrect: correct ? state.currentSpan : 0,
      userResponse: '',
    }, 'assessment', 30)
  }
  return state.confirmedSpan
}

// Cenários exigidos. Sequências seguem o engine real (span sobe após 2 acertos).
const S = {
  // [acerto, erro, erro] — tudo no span 2
  acerto_erro_erro: [
    corsiTrial(0, 2, '1,2', '1,2'),
    corsiTrial(1, 2, '3,4', '9,9'),
    corsiTrial(2, 2, '5,6', '9,9'),
  ],
  // dois acertos consecutivos (engine avança para span 3 e a sessão para aí)
  dois_acertos: [
    corsiTrial(0, 2, '1,2', '1,2'),
    corsiTrial(1, 2, '3,4', '3,4'),
  ],
  // acerto, erro, acerto no mesmo span
  acerto_erro_acerto: [
    corsiTrial(0, 2, '1,2', '1,2'),
    corsiTrial(1, 2, '3,4', '9,9'),
    corsiTrial(2, 2, '5,6', '5,6'),
  ],
  // dois erros consecutivos imediatos
  dois_erros: [
    corsiTrial(0, 2, '1,2', '9,9'),
    corsiTrial(1, 2, '3,4', '9,9'),
  ],
  // avanço por múltiplos spans, término no 4 com C,W,W (perfil realista)
  multi_span: [
    corsiTrial(0, 2, '1,2', '1,2'),
    corsiTrial(1, 2, '3,4', '3,4'),
    corsiTrial(2, 3, '1,2,3', '1,2,3'),
    corsiTrial(3, 3, '4,5,6', '4,5,6'),
    corsiTrial(4, 4, '1,2,3,4', '1,2,3,4'),
    corsiTrial(5, 4, '5,6,7,8', '9,9,9,9'),
    corsiTrial(6, 4, '1,3,5,7', '9,9,9,9'),
  ],
  // sessão interrompida após um único acerto
  interrompida: [corsiTrial(0, 2, '1,2', '1,2')],
}

describe('AG-01/1 — scorer legado REAL × scorer atual × engine', () => {
  const expected: Record<keyof typeof S, { legacy: number; current: number; engine: boolean[] }> = {
    acerto_erro_erro: { legacy: 1, current: 2, engine: [true, false, false] },
    dois_acertos: { legacy: 2, current: 2, engine: [true, true] },
    acerto_erro_acerto: { legacy: 1, current: 2, engine: [true, false, true] },
    dois_erros: { legacy: 1, current: 0, engine: [false, false] },
    multi_span: { legacy: 3, current: 4, engine: [true, true, true, true, true, false, false] },
    interrompida: { legacy: 1, current: 2, engine: [true] },
  }

  for (const name of Object.keys(S) as (keyof typeof S)[]) {
    it(name, () => {
      const legacy = score(legacyCorsi, S[name])
      const current = score(currentCorsi, S[name])
      expect(legacy.confirmedSpan).toBe(expected[name].legacy)
      expect(current.confirmedSpan).toBe(expected[name].current)
      // O engine real (regras inalteradas entre períodos) concorda com o ATUAL:
      expect(engineConfirmedSpan(expected[name].engine)).toBe(expected[name].current)
      // Ambos os períodos gravam scoringVersion — marcador de detecção existe:
      expect(legacy.scoringVersion).toBe('sdt-hautus-1')
      expect(current.scoringVersion).toBe('sdt-hautus-1;corsi-replay-1')
    })
  }

  it('maxSpan também diverge (dois_acertos: legado 2, atual 3)', () => {
    expect(score(legacyCorsi, S.dois_acertos).maxSpan).toBe(2)
    expect(score(currentCorsi, S.dois_acertos).maxSpan).toBe(3)
  })

  it('o MESMO conjunto de trials é persistível nos dois períodos (engine idêntico)', () => {
    // O diff de 478a8fb em adaptive.ts só adiciona funções de replay; o
    // formato do TrialRecord e o extraMeta.span do runner são iguais.
    // Logo qualquer fixture acima poderia existir gravada em ambos os períodos.
    const legacy = score(legacyCorsi, S.multi_span)
    const current = score(currentCorsi, S.multi_span)
    expect(legacy.totalCorrectSequences).toBe(current.totalCorrectSequences)
  })
})

function sessionWith(id: string, day: number, result: ReturnType<typeof score>,
  scoringVersion: string | undefined): SessionRecord {
  return {
    sessionId: id, testId: 'corsi', protocolVersion: 'corsi.forward.v1.0',
    mode: 'assessment', status: 'completed', quality: 'valid',
    startedAt: `2026-07-${String(day).padStart(2, '0')}T12:00:00.000Z`,
    completedAt: `2026-07-${String(day).padStart(2, '0')}T12:10:00.000Z`,
    flags: {}, flagMessages: [], trials: [], checkIn: undefined,
    deviceInfo: DEVICE, isDemo: false, practiceCompleted: true,
    randomizationSeed: 1,
    result: {
      sessionId: id, testId: 'corsi', protocolVersion: 'corsi.forward.v1.0',
      mode: 'assessment', startedAt: '', completedAt: '', quality: 'valid',
      flags: {}, flagMessages: [],
      rtMetrics: { medianCorrectRT: 1500, meanCorrectRT: 1500, rtStandardDeviation: null,
        rtIQR: null, rtCoefficientOfVariation: null, p10RT: null, p90RT: null,
        anticipationRate: 0, lapseRate: 0, validTrialCount: 5, invalidTrialCount: 0 },
      accuracyMetrics: { accuracy: 0.8, correctCount: 4, errorCount: 1, omissionCount: 0, totalTrials: 5 },
      conditionMetrics: {}, blockMetrics: [],
      customMetrics: {
        confirmedSpan: result.confirmedSpan, maxSpan: result.maxSpan,
        totalCorrectSequences: result.totalCorrectSequences, partialScoreRate: 0.8,
      },
      deviceInfo: DEVICE, isDemo: false, scoringVersion,
    },
  }
}

describe('AG-01/3 — mistura longitudinal sem guarda', () => {
  // Mesmo perfil de trials (multi_span) em todas as sessões: períodos diferem
  // SÓ pelo scorer usado na gravação. Legado grava 3; atual grava 4.
  const legacyResult = score(legacyCorsi, S.multi_span)
  const currentResult = score(currentCorsi, S.multi_span)

  // 3 familiarização (legadas) + 5 legadas + 4 atuais = 12 elegíveis.
  const sessions: SessionRecord[] = [
    ...Array.from({ length: 8 }, (_, i) =>
      sessionWith(`old${i}`, i + 1, legacyResult, 'sdt-hautus-1')),
    ...Array.from({ length: 4 }, (_, i) =>
      sessionWith(`new${i}`, i + 9, currentResult, 'sdt-hautus-1;corsi-replay-1')),
  ]

  it('sessões dos dois períodos entram na MESMA janela de baseline', () => {
    const elig = getValidAssessmentSessions(sessions, 'corsi', 'corsi.forward.v1.0')
    expect(elig.length).toBe(12) // nenhuma guarda por scoringVersion
    const stats = computeBaselineStats(sessions, 'corsi', 'corsi.forward.v1.0',
      currentCorsi.baselineMetricKeys)
    expect(stats.phase).toBe('monitoring')
    // Janela = posições 4..11: 5 legadas (3) + 3 atuais (4) para o MESMO desempenho
    expect(stats.metrics.confirmedSpan.n).toBe(8)
    expect(stats.metrics.confirmedSpan.median).toBe(3) // mediana de [3,3,3,3,3,4,4,4]
    expect(stats.metrics.confirmedSpan.mad).toBe(0)    // e MAD 0 — regra instável
  })

  it('sessão SEM scoringVersion também é elegível (não há filtro algum)', () => {
    const noVersion = [
      ...sessions.slice(0, 11),
      sessionWith('nv', 30, currentResult, undefined),
    ]
    expect(getValidAssessmentSessions(noVersion, 'corsi', 'corsi.forward.v1.0').length).toBe(12)
  })

  it('a sessão atual é comparada contra referência contaminada', () => {
    const probe = sessionWith('probe', 20, currentResult, 'sdt-hautus-1;corsi-replay-1')
    const pool = sessions // exclui a probe, como Results faz
    const stats = computeBaselineStats(pool, 'corsi', 'corsi.forward.v1.0',
      currentCorsi.baselineMetricKeys)
    const z = evaluatePrimaryZ(
      probe.result!.customMetrics.confirmedSpan, stats, currentCorsi)
    // Mesmo desempenho real das legadas (multi_span), mas o baseline misto
    // dispara o caminho zero_mad/z — aqui: zero_mad com delta +1 "melhora"
    // que é puro artefato da fronteira de scoring.
    expect(z.kind).toBe('zero_mad')
    if (z.kind === 'zero_mad') expect(z.delta).toBe(1)
  })

  it('o gráfico longitudinal mistura as duas regras sem aviso', () => {
    const sel = selectTrendSessions(sessions)
    expect(sel.sessions.length).toBe(12)      // todas na mesma série
    expect(sel.hiddenOtherVersions).toBe(0)   // protocolVersion idêntica
    const points = buildTrendPoints(sel.sessions, 'confirmedSpan')
    const values = points.map((p) => p.value)
    // Degrau 3→4 SEM mudança de desempenho — artefato invisível na UI:
    expect(values.slice(0, 8).every((v) => v === 3)).toBe(true)
    expect(values.slice(8).every((v) => v === 4)).toBe(true)
  })
})
