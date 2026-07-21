import { describe, expect, it } from 'vitest'
import type { DeviceInfo, SDTMetrics, TestId, TrialRecord } from '../../types'
import { computeSDT } from '../../statistics/signalDetection'
import { testDefinition as gonogo } from '../../tests/gonogo'
import { testDefinition as nback } from '../../tests/nback'
import { testDefinition as sart } from '../../tests/sart'

const DEVICE: DeviceInfo = {
  deviceType: 'desktop',
  inputMethod: 'keyboard',
  screenWidth: 1920,
  screenHeight: 1080,
  browser: 'test',
  userAgent: 'anonymous-test',
}

type ResponseKind = 'response' | 'no-response' | 'pre-onset' | 'rapid-post-onset'

interface TrialSpec {
  signal: boolean
  response: ResponseKind
  nBack?: 1 | 2
}

const DEFINITIONS = { gonogo, nback, sart } as const

function makeTrials(testId: keyof typeof DEFINITIONS, specs: TrialSpec[]): TrialRecord[] {
  const definition = DEFINITIONS[testId]
  return specs.map((spec, index) => {
    const hasResponse = spec.response !== 'no-response'
    const preOnset = spec.response === 'pre-onset'
    const rapid = spec.response === 'rapid-post-onset'
    const condition =
      testId === 'gonogo'
        ? spec.signal
          ? 'go'
          : 'nogo'
        : testId === 'sart'
          ? spec.signal
            ? 'go'
            : 'no-go'
          : `${spec.nBack ?? 1}back`
    const outcomeKind = preOnset
      ? 'anticipation'
      : spec.signal
        ? hasResponse
          ? 'hit'
          : 'miss'
        : hasResponse
          ? 'false_alarm'
          : 'correct_rejection'

    return {
      trialId: `${testId}-${index}`,
      sessionId: `${testId}-session`,
      testId: testId as TestId,
      protocolVersion: definition.protocolVersion,
      mode: 'assessment',
      blockIndex: (spec.nBack ?? 1) - 1,
      trialIndex: index,
      condition,
      stimulus: spec.signal ? 'signal' : 'noise',
      expectedResponse: spec.signal ? 'space' : 'none',
      actualResponse: hasResponse ? 'space' : '',
      correct: preOnset ? false : spec.signal ? hasResponse : !hasResponse,
      reactionTimeMs: hasResponse && !preOnset && !rapid ? 300 : null,
      stimulusOnsetTimestamp: 1_000 + index * 1_000,
      responseTimestamp: hasResponse
        ? 1_000 + index * 1_000 + (preOnset ? -1 : rapid ? 50 : 300)
        : null,
      windowFocused: true,
      visibilityState: 'visible',
      deviceType: 'desktop',
      inputMethod: 'keyboard',
      invalidReason: preOnset || rapid ? 'anticipation' : spec.signal && !hasResponse ? 'omission' : undefined,
      metadata: {
        outcomeKind,
        ...(testId === 'nback'
          ? { nBack: spec.nBack ?? 1, isTarget: spec.signal }
          : testId === 'sart'
            ? { isNoGo: !spec.signal }
            : {}),
      },
    }
  })
}

function score(testId: keyof typeof DEFINITIONS, specs: TrialSpec[], flags = {}) {
  return DEFINITIONS[testId].scoreSession(makeTrials(testId, specs), 'assessment', DEVICE, flags)
}

function expectSdt(actual: SDTMetrics | undefined, expected: [number, number, number, number]) {
  expect(actual).toBeDefined()
  expect([
    actual!.hits,
    actual!.misses,
    actual!.falseAlarms,
    actual!.correctRejections,
  ]).toEqual(expected)
}

const STANDARD: TrialSpec[] = [
  { signal: true, response: 'response' },
  { signal: true, response: 'no-response' },
  { signal: false, response: 'response' },
  { signal: false, response: 'no-response' },
]

describe('Go/No-Go — exclusão simétrica e respostas rápidas', () => {
  it.each([
    ['sem antecipação', STANDARD, [1, 1, 1, 1]],
    [
      'pré-onset apenas em Go',
      [{ signal: true, response: 'pre-onset' }, ...STANDARD],
      [1, 1, 1, 1],
    ],
    [
      'pré-onset apenas em No-Go',
      [{ signal: false, response: 'pre-onset' }, ...STANDARD],
      [1, 1, 1, 1],
    ],
    [
      'pré-onset simétrico',
      [
        { signal: true, response: 'pre-onset' },
        { signal: false, response: 'pre-onset' },
        ...STANDARD,
      ],
      [1, 1, 1, 1],
    ],
    [
      'pós-onset rápido apenas em Go',
      [{ signal: true, response: 'rapid-post-onset' }, ...STANDARD],
      [2, 1, 1, 1],
    ],
    [
      'pós-onset rápido apenas em No-Go',
      [{ signal: false, response: 'rapid-post-onset' }, ...STANDARD],
      [1, 1, 2, 1],
    ],
    [
      'mistura pré-onset e pós-onset rápido',
      [
        { signal: true, response: 'pre-onset' },
        { signal: false, response: 'pre-onset' },
        { signal: true, response: 'rapid-post-onset' },
        { signal: false, response: 'rapid-post-onset' },
        { signal: true, response: 'no-response' },
        { signal: false, response: 'no-response' },
      ],
      [1, 1, 1, 1],
    ],
  ] as const)('%s', (_label, specs, expected) => {
    const result = score('gonogo', [...specs])
    expectSdt(result.sdtMetrics, [...expected])
  })

  it('mantém invariantes e qualidade no fixture de 160 trials abaixo do warning', () => {
    const specs: TrialSpec[] = [
      ...Array.from({ length: 100 }, () => ({ signal: true, response: 'response' as const })),
      ...Array.from({ length: 16 }, () => ({ signal: true, response: 'no-response' as const })),
      ...Array.from({ length: 4 }, () => ({ signal: true, response: 'pre-onset' as const })),
      ...Array.from({ length: 5 }, () => ({ signal: false, response: 'response' as const })),
      ...Array.from({ length: 32 }, () => ({ signal: false, response: 'no-response' as const })),
      ...Array.from({ length: 3 }, () => ({ signal: false, response: 'pre-onset' as const })),
    ]
    const result = score('gonogo', specs)
    const oldAsymmetric = computeSDT({ hits: 100, misses: 16, falseAlarms: 8, correctRejections: 32 })

    expect(result.quality).toBe('valid')
    expect(result.flags.tooManyAnticipations).toBeUndefined()
    expect(result.rtMetrics.anticipationRate).toBeCloseTo(7 / 160)
    expect(result.accuracyMetrics.accuracy).toBeCloseTo(132 / 160)
    expect(result.accuracyMetrics.omissionCount).toBe(16)
    expectSdt(result.sdtMetrics, [100, 16, 5, 32])
    expect(result.sdtMetrics!.hits + result.sdtMetrics!.misses).toBe(116)
    expect(result.sdtMetrics!.falseAlarms + result.sdtMetrics!.correctRejections).toBe(37)
    expect(result.customMetrics.commissionErrorRate).toBeCloseTo(5 / 37)
    expect(oldAsymmetric.dPrime).toBeCloseTo(1.8915, 4)
    expect(result.sdtMetrics!.dPrime).toBeCloseTo(2.135, 4)
    expect(result.sdtMetrics!.dPrime! - oldAsymmetric.dPrime!).toBeCloseTo(0.2435, 4)
    expect(result.sdtMetrics!.dPrime).toBeGreaterThan(oldAsymmetric.dPrime!)
    expect(result.conditionMetrics.go.accuracy).toBeCloseTo(100 / 116)
    expect(result.conditionMetrics.nogo.accuracy).toBeCloseTo(32 / 37)
  })

  it('preserva warning de antecipação acima do limiar e invalidação independente', () => {
    const warningSpecs: TrialSpec[] = [
      ...Array.from({ length: 95 }, () => ({ signal: true, response: 'response' as const })),
      ...Array.from({ length: 25 }, () => ({ signal: true, response: 'pre-onset' as const })),
      ...Array.from({ length: 5 }, () => ({ signal: false, response: 'response' as const })),
      ...Array.from({ length: 35 }, () => ({ signal: false, response: 'no-response' as const })),
    ]
    expect(score('gonogo', warningSpecs).quality).toBe('valid_with_warnings')
    expect(score('gonogo', STANDARD, { incomplete: true }).quality).toBe('invalid')
  })

  it('retorna indisponível para denominador sinal ou ruído vazio', () => {
    const noSignal = score('gonogo', [
      { signal: true, response: 'pre-onset' },
      { signal: false, response: 'response' },
      { signal: false, response: 'no-response' },
    ])
    expect(noSignal.sdtMetrics?.hitRate).toBeNull()
    expect(noSignal.sdtMetrics?.falseAlarmRate).toBe(0.5)
    expect(noSignal.sdtMetrics?.dPrime).toBeNull()

    const noNoise = score('gonogo', [
      { signal: true, response: 'response' },
      { signal: true, response: 'no-response' },
      { signal: false, response: 'pre-onset' },
    ])
    expect(noNoise.sdtMetrics?.falseAlarmRate).toBeNull()
    expect(noNoise.customMetrics.commissionErrorRate).toBeNull()
    expect(noNoise.sdtMetrics?.criterion).toBeNull()
    expect(noNoise.conditionMetrics.nogo.accuracy).toBeNull()
  })

  it('mantém taxas extremas brutas e d′ finito pela correção de Hautus', () => {
    const result = score('gonogo', [
      ...Array.from({ length: 10 }, () => ({ signal: true, response: 'response' as const })),
      ...Array.from({ length: 10 }, () => ({ signal: false, response: 'no-response' as const })),
    ])
    expect(result.sdtMetrics?.hitRate).toBe(1)
    expect(result.sdtMetrics?.falseAlarmRate).toBe(0)
    expect(result.sdtMetrics?.dPrime).toSatisfy(Number.isFinite)
    expect(result.sdtMetrics?.criterion).toSatisfy(Number.isFinite)
  })
})

describe('N-back — invariantes gerais e por nível', () => {
  it('exclui alvo e não alvo pré-onset por nível, sem dupla contagem', () => {
    const specs: TrialSpec[] = [
      { signal: true, response: 'response', nBack: 1 },
      { signal: true, response: 'no-response', nBack: 1 },
      { signal: true, response: 'pre-onset', nBack: 1 },
      { signal: false, response: 'response', nBack: 1 },
      { signal: false, response: 'no-response', nBack: 1 },
      { signal: false, response: 'pre-onset', nBack: 1 },
      { signal: true, response: 'rapid-post-onset', nBack: 2 },
      { signal: true, response: 'no-response', nBack: 2 },
      { signal: false, response: 'rapid-post-onset', nBack: 2 },
      { signal: false, response: 'no-response', nBack: 2 },
    ]
    const result = score('nback', specs)

    expectSdt(result.sdtMetrics, [2, 2, 2, 2])
    expect(result.conditionMetrics['1back']).toMatchObject({
      accuracy: 0.5,
      hitRate: 0.5,
      falseAlarmRate: 0.5,
    })
    expect(result.conditionMetrics['2back']).toMatchObject({
      accuracy: 0.5,
      hitRate: 0.5,
      falseAlarmRate: 0.5,
    })
    expect(result.customMetrics.accuracy1Back).toBe(0.5)
    expect(result.customMetrics.accuracy2Back).toBe(0.5)
  })

  it('três antecipações entre poucos alvos não entram no d′ do nível', () => {
    const result = score('nback', [
      ...Array.from({ length: 3 }, () => ({ signal: true, response: 'pre-onset' as const, nBack: 2 as const })),
      { signal: true, response: 'response', nBack: 2 },
      { signal: true, response: 'no-response', nBack: 2 },
      { signal: false, response: 'response', nBack: 2 },
      { signal: false, response: 'no-response', nBack: 2 },
    ])
    expect(result.conditionMetrics['2back']).toMatchObject({ hitRate: 0.5, falseAlarmRate: 0.5 })
    expect(result.customMetrics.dPrime2Back).toBeCloseTo(0)
  })

  it('nível sem alvos elegíveis não fabrica hit rate, accuracy ou d′', () => {
    const result = score('nback', [
      { signal: true, response: 'pre-onset', nBack: 2 },
      { signal: true, response: 'pre-onset', nBack: 2 },
      { signal: false, response: 'response', nBack: 2 },
      { signal: false, response: 'no-response', nBack: 2 },
    ])
    expect(result.conditionMetrics['2back'].hitRate).toBeNull()
    expect(result.conditionMetrics['2back'].accuracy).toBeNull()
    expect(result.customMetrics.accuracy2Back).toBeNull()
    expect(result.customMetrics.dPrime2Back).toBeNull()
  })
})

describe('SART — comissão, omissão e RT', () => {
  it('exclui pré-onset em Go/No-Go e mantém pós-onset rápido nos dois lados', () => {
    const result = score('sart', [
      { signal: true, response: 'pre-onset' },
      { signal: false, response: 'pre-onset' },
      { signal: true, response: 'rapid-post-onset' },
      { signal: false, response: 'rapid-post-onset' },
      { signal: true, response: 'no-response' },
      { signal: false, response: 'no-response' },
      { signal: true, response: 'response' },
    ])
    expectSdt(result.sdtMetrics, [2, 1, 1, 1])
    expect(result.customMetrics.commissionErrorRate).toBe(0.5)
    expect(result.conditionMetrics.go.omissionCount).toBe(1)
    expect(result.rtMetrics.medianCorrectRT).toBe(300)
  })

  it('retorna null quando todo No-Go é pré-onset', () => {
    const result = score('sart', [
      { signal: true, response: 'response' },
      { signal: false, response: 'pre-onset' },
    ])
    expect(result.customMetrics.commissionErrorRate).toBeNull()
    expect(result.sdtMetrics?.falseAlarmRate).toBeNull()
    expect(result.conditionMetrics['no-go'].accuracy).toBeNull()
  })

  it.each([
    ['taxa 0', 'no-response', 0],
    ['taxa 1', 'response', 1],
  ] as const)('%s permanece definida', (_label, response, expected) => {
    const result = score('sart', [
      { signal: true, response: 'response' },
      { signal: false, response },
    ])
    expect(result.customMetrics.commissionErrorRate).toBe(expected)
  })

  it('preserva decisão de qualidade válida e inválida', () => {
    const valid = score('sart', [
      ...Array.from({ length: 220 }, () => ({ signal: true, response: 'response' as const })),
      ...Array.from({ length: 28 }, () => ({ signal: false, response: 'no-response' as const })),
      ...Array.from({ length: 4 }, () => ({ signal: false, response: 'pre-onset' as const })),
    ])
    expect(valid.quality).toBe('valid')
    expect(valid.rtMetrics.anticipationRate).toBeCloseTo(4 / 252)
    expect(score('sart', STANDARD, { incomplete: true }).quality).toBe('invalid')
  })
})
