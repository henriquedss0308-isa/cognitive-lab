/**
 * AG-03 — Antecipações e SDT, replicado pelo FLUXO REAL:
 * classifyTrialResponse/buildTrialRecord (mesmo caminho do TestRunner)
 * → scoreSession de produção → tabela SDT → d′ → quality.
 *
 * Distinção central que a revisão do GPT-5.6 não explicita:
 *  (a) antecipação PÓS-onset (RT < limiar): correct=true em Go → CONTA como hit;
 *  (b) antecipação PRÉ-onset (beforeOnset): correct=false + resposta → não é
 *      hit nem miss em Go, mas É false alarm em No-Go.
 * Só (b) quebra a partição — e (b) exige tecla no intervalo entre a troca de
 * fase e o carimbo do onset (~2 rAF, TestRunner.tsx:521 `!onsetReady.current`).
 */
import { describe, expect, it } from 'vitest'
import { buildTrialRecord } from '../../src/engine/trialRecorder'
import { computeSDT } from '../../src/statistics/signalDetection'
import { testDefinition as gonogoDef } from '../../src/tests/gonogo'
import { testDefinition as sartDef } from '../../src/tests/sart'
import { testDefinition as nbackDef } from '../../src/tests/nback'
import type { DeviceInfo, TrialRecord } from '../../src/types'

const DEVICE: DeviceInfo = {
  deviceType: 'desktop', inputMethod: 'keyboard', screenWidth: 1920,
  screenHeight: 1080, browser: 'Chrome', userAgent: 'replication',
}

interface Spec {
  condition: string
  expected: string
  kind: 'hit' | 'miss' | 'cr' | 'preonset' | 'fastgo' | 'fa'
  meta?: Record<string, unknown>
}

/** Gera TrialRecord pela MESMA função que o runner usa. */
function build(specs: Spec[], testId: 'gonogo' | 'sart' | 'nback',
  cleaning: { anticipationThresholdMs: number; lapseThresholdMs: number }): TrialRecord[] {
  return specs.map((s, i) => {
    const onset = 10_000 + i * 3000
    const base = {
      trial: {
        blockIndex: 0, trialIndex: i, condition: s.condition,
        stimulus: 'x', expectedResponse: s.expected, metadata: s.meta,
      },
      sessionId: 'fx', testId, protocolVersion: 'fx', mode: 'assessment' as const,
      deviceInfo: DEVICE, inputMethod: 'keyboard',
      windowFocused: true, visibilityState: 'visible' as DocumentVisibilityState,
      cleaning,
    }
    switch (s.kind) {
      case 'hit':
        return buildTrialRecord({ ...base, stimulusOnsetTimestamp: onset,
          actualResponse: 'space', responseTimestamp: onset + 400 })
      case 'fastgo': // resposta PÓS-onset abaixo do limiar de antecipação
        return buildTrialRecord({ ...base, stimulusOnsetTimestamp: onset,
          actualResponse: 'space',
          responseTimestamp: onset + cleaning.anticipationThresholdMs / 2 })
      case 'miss':
        return buildTrialRecord({ ...base, stimulusOnsetTimestamp: onset,
          timedOut: true })
      case 'cr':
        return buildTrialRecord({ ...base, stimulusOnsetTimestamp: onset,
          timedOut: true })
      case 'fa':
        return buildTrialRecord({ ...base, stimulusOnsetTimestamp: onset,
          actualResponse: 'space', responseTimestamp: onset + 350 })
      case 'preonset': // tecla ANTES do carimbo do onset (beforeOnset)
        return buildTrialRecord({ ...base, stimulusOnsetTimestamp: 0,
          beforeOnset: true, actualResponse: 'space',
          responseTimestamp: onset - 5 })
    }
  })
}

function specs(nHit: number, nFastGo: number, nPreGo: number, nMiss: number,
  nCR: number, nFA: number, nPreNoGo: number,
  names = { go: 'go', nogo: 'nogo', goExp: 'space', nogoExp: 'none' },
  meta?: { go?: Record<string, unknown>; nogo?: Record<string, unknown> }): Spec[] {
  const out: Spec[] = []
  for (let k = 0; k < nHit; k++) out.push({ condition: names.go, expected: names.goExp, kind: 'hit', meta: meta?.go })
  for (let k = 0; k < nFastGo; k++) out.push({ condition: names.go, expected: names.goExp, kind: 'fastgo', meta: meta?.go })
  for (let k = 0; k < nPreGo; k++) out.push({ condition: names.go, expected: names.goExp, kind: 'preonset', meta: meta?.go })
  for (let k = 0; k < nMiss; k++) out.push({ condition: names.go, expected: names.goExp, kind: 'miss', meta: meta?.go })
  for (let k = 0; k < nCR; k++) out.push({ condition: names.nogo, expected: names.nogoExp, kind: 'cr', meta: meta?.nogo })
  for (let k = 0; k < nFA; k++) out.push({ condition: names.nogo, expected: names.nogoExp, kind: 'fa', meta: meta?.nogo })
  for (let k = 0; k < nPreNoGo; k++) out.push({ condition: names.nogo, expected: names.nogoExp, kind: 'preonset', meta: meta?.nogo })
  return out
}

const GN_CLEAN = { anticipationThresholdMs: 150, lapseThresholdMs: 2000 }

function gonogoSDT(s: Spec[]) {
  const r = gonogoDef.scoreSession(build(s, 'gonogo', GN_CLEAN), 'assessment', DEVICE, {})
  return { sdt: r.sdtMetrics!, quality: r.quality, flags: r.flags,
    dPrime: r.customMetrics.dPrime }
}

describe('AG-03 Go/No-Go — partição SDT sob antecipações', () => {
  it('caso 0: sem antecipações — partição exaustiva', () => {
    const { sdt } = gonogoSDT(specs(100, 0, 0, 20, 36, 4, 0))
    expect(sdt.hits + sdt.misses).toBe(120)
    expect(sdt.falseAlarms + sdt.correctRejections).toBe(40)
  })

  it('antecipação PÓS-onset em Go é HIT (correct=true) — não há buraco', () => {
    const trials = build(specs(0, 1, 0, 0, 0, 0, 0), 'gonogo', GN_CLEAN)
    expect(trials[0].correct).toBe(true)
    expect(trials[0].invalidReason).toBe('anticipation')
    expect(trials[0].reactionTimeMs).toBeNull()
    const { sdt } = gonogoSDT(specs(99, 1, 0, 20, 36, 4, 0))
    expect(sdt.hits).toBe(100) // fastgo contou como hit
    expect(sdt.hits + sdt.misses).toBe(120)
  })

  it('antecipação PRÉ-onset em Go some de H+M (assimetria confirmada)', () => {
    const trials = build(specs(0, 0, 1, 0, 0, 0, 0), 'gonogo', GN_CLEAN)
    expect(trials[0].correct).toBe(false)
    expect(trials[0].invalidReason).toBe('anticipation')
    expect(trials[0].actualResponse).toBe('space')
    const { sdt } = gonogoSDT(specs(91, 0, 9, 20, 36, 4, 0))
    expect(sdt.hits + sdt.misses).toBe(111) // 9 Go sumiram de N_sinal=120
  })

  it('antecipação PRÉ-onset em No-Go vira FALSE ALARM (lado ruído fechado)', () => {
    const { sdt } = gonogoSDT(specs(100, 0, 0, 20, 36, 2, 2))
    expect(sdt.falseAlarms).toBe(4) // 2 comissões + 2 pré-onset
    expect(sdt.falseAlarms + sdt.correctRejections).toBe(40)
  })

  it('simétricas em contagem ≠ simétricas em tratamento', () => {
    const { sdt } = gonogoSDT(specs(97, 0, 3, 20, 37, 0, 3))
    expect(sdt.hits + sdt.misses).toBe(117)                 // Go: excluídos
    expect(sdt.falseAlarms + sdt.correctRejections).toBe(40) // No-Go: mantidos
  })

  it('11,25% de pré-onset fica ABAIXO do limiar: sessão permanece valid', () => {
    // 18 pré-onset em 160 (perfil do GPT-5.6): 111 hit + 9 preGo + 12 miss
    // + 27 CR + 4 FA + 9 preNoGo? — manter 160: 102 hit, 9 preGo, 9 miss,
    // 27 CR, 4 FA, 9 preNoGo.
    const r = gonogoSDT(specs(102, 0, 9, 9, 27, 4, 9))
    expect(r.quality).toBe('valid')
    expect(r.flags.tooManyAnticipations).toBeUndefined()
  })

  it('acima de 15% dispara warning (não invalida)', () => {
    const r = gonogoSDT(specs(90, 0, 15, 6, 25, 4, 20)) // 35/160 = 21,9%
    expect(r.flags.tooManyAnticipations).toBe(true)
    expect(r.quality).toBe('valid_with_warnings')
  })

  it('magnitude do efeito em d′: realista (2 pré-onset) vs sintético (9+9)', () => {
    // Base sem antecipações
    const base = gonogoSDT(specs(100, 0, 0, 20, 36, 4, 0)).sdt
    // Realista: 2 pré-onset em Go
    const real = gonogoSDT(specs(98, 0, 2, 20, 36, 4, 0)).sdt
    // Política B (pré-onset Go = miss): H=98, M=22
    const realAsMiss = computeSDT({ hits: 98, misses: 22, falseAlarms: 4, correctRejections: 36 })
    const dReal = Math.abs(real.dPrime! - realAsMiss.dPrime!)
    // Sintético do GPT: 9 pré-onset Go
    const synth = gonogoSDT(specs(91, 0, 9, 20, 36, 4, 0)).sdt
    const synthAsMiss = computeSDT({ hits: 91, misses: 29, falseAlarms: 4, correctRejections: 36 })
    const dSynth = Math.abs(synth.dPrime! - synthAsMiss.dPrime!)
    // Exclusão simétrica (política C) coincide com o atual no lado Go:
    const symm = computeSDT({ hits: 98, misses: 20, falseAlarms: 4, correctRejections: 36 })
    expect(symm.dPrime).toBeCloseTo(real.dPrime!, 12)

    // Registrar magnitudes no relatório do teste:
    console.log(JSON.stringify({
      dPrimeBase: base.dPrime, dPrimeCurrent2: real.dPrime,
      dPrimeMissPolicy2: realAsMiss.dPrime, delta2: dReal,
      dPrimeCurrent9: synth.dPrime, dPrimeMissPolicy9: synthAsMiss.dPrime,
      delta9: dSynth,
    }))
    expect(dReal).toBeLessThan(0.1)      // cenário realista: efeito pequeno
    expect(dSynth).toBeGreaterThan(0.1)  // cenário do GPT: efeito material
  })
})

describe('AG-03 SART — mesmo padrão', () => {
  const SART_CLEAN = { anticipationThresholdMs: 100, lapseThresholdMs: 900 }
  const names = { go: 'go', nogo: 'no-go', goExp: 'space', nogoExp: 'none' }

  it('pré-onset Go fora de H+M; pré-onset No-Go vira FA e INFLA a métrica primária', () => {
    const s = specs(200, 0, 4, 20, 24, 2, 2, names)
    const r = sartDef.scoreSession(build(s, 'sart', SART_CLEAN), 'assessment', DEVICE, {})
    const sdt = r.sdtMetrics!
    expect(sdt.hits + sdt.misses).toBe(220)                  // 4 Go sumiram (224)
    expect(sdt.falseAlarms + sdt.correctRejections).toBe(28)
    // métrica PRIMÁRIA do SART: commissionErrorRate inclui os 2 pré-onset
    expect(r.customMetrics.commissionErrorRate).toBeCloseTo(4 / 28, 12)
  })
})

describe('AG-03 n-back — d′ 2-back é a métrica primária', () => {
  const NB_CLEAN = { anticipationThresholdMs: 150, lapseThresholdMs: 2000 }
  const names = { go: '2back', nogo: '2back', goExp: 'space', nogoExp: 'none' }
  const meta = { go: { nBack: 2, isTarget: true }, nogo: { nBack: 2, isTarget: false } }

  it('pré-onset em alvo some de H+M; em não alvo vira FA — atinge dPrime2Back', () => {
    const s = specs(20, 0, 3, 4, 66, 5, 2, names, meta)
    const r = nbackDef.scoreSession(build(s, 'nback', NB_CLEAN), 'assessment', DEVICE, {})
    const sdt = r.sdtMetrics!
    expect(sdt.hits + sdt.misses).toBe(24)                   // 3 alvos sumiram (27)
    expect(sdt.falseAlarms + sdt.correctRejections).toBe(73)
    expect(r.customMetrics.dPrime2Back).not.toBeNull()
    // partição do nível 2-back idêntica à global neste fixture
    expect(r.customMetrics.dPrime2Back).toBeCloseTo(sdt.dPrime!, 12)
  })
})
