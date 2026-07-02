import type { DeviceInfo, TestMode, TrialRecord } from '../../types'
import { buildBaseResult, conditionRTAndAccuracy, postErrorSlowing } from '../../scoring/common'
import { computeSDT } from '../../statistics'
import { pseudoRandomSequence, randomInt, seededRandom } from '../../utils/random'
import type { CognitiveTestDefinition, GeneratedTrial, ProtocolConfig } from '../types'

const PROTOCOL_VERSION = 'sart.standard.v1.0'
const NO_GO_DIGIT = '3'
const GO_DIGITS = ['1', '2', '4', '5', '6', '7', '8', '9']
const NO_GO_RATIO = 0.11

const CLEANING = {
  anticipationThresholdMs: 100,
  lapseThresholdMs: 900,
}

const PRACTICE_CONFIG: ProtocolConfig = {
  version: PROTOCOL_VERSION,
  trialCount: 18,
  blocks: 1,
  stimulusDurationMs: 250,
  isiMinMs: 900,
  isiMaxMs: 900,
  proportions: { noGo: NO_GO_RATIO },
  keyMapping: { go: 'space', noGo: 'none' },
  advancePolicy: 'fixed-duration',
  cleaningRules: CLEANING,
}

const ASSESSMENT_CONFIG: ProtocolConfig = {
  version: PROTOCOL_VERSION,
  trialCount: 252,
  blocks: 6,
  stimulusDurationMs: 250,
  isiMinMs: 900,
  isiMaxMs: 900,
  proportions: { noGo: NO_GO_RATIO },
  keyMapping: { go: 'space', noGo: 'none' },
  advancePolicy: 'fixed-duration',
  cleaningRules: CLEANING,
}

function generateSartTrials(
  mode: TestMode,
  seed: number,
  config: ProtocolConfig
): GeneratedTrial[] {
  const random = seededRandom(seed)
  const { trialCount, blocks, stimulusDurationMs, isiMinMs } = config
  const trialsPerBlock = Math.floor(trialCount / blocks)
  const isGoSequence = pseudoRandomSequence(1 - NO_GO_RATIO, trialCount, random, 6)

  const trials: GeneratedTrial[] = []
  let trialIndex = 0

  for (let blockIndex = 0; blockIndex < blocks; blockIndex++) {
    const blockSize =
      blockIndex === blocks - 1 ? trialCount - trialIndex : trialsPerBlock

    for (let i = 0; i < blockSize; i++) {
      const isGo = isGoSequence[trialIndex]
      const stimulus = isGo
        ? GO_DIGITS[randomInt(0, GO_DIGITS.length - 1, random)]
        : NO_GO_DIGIT

      trials.push({
        blockIndex,
        trialIndex,
        condition: isGo ? 'go' : 'no-go',
        stimulus,
        expectedResponse: isGo ? 'space' : 'none',
        stimulusDurationMs,
        isiMs: isiMinMs,
        metadata: {
          isNoGo: !isGo,
          mode,
        },
      })
      trialIndex++
    }
  }

  return trials
}

function scoreSartSession(
  trials: TrialRecord[],
  mode: TestMode,
  deviceInfo: DeviceInfo,
  flags: Record<string, boolean>
) {
  const config = mode === 'assessment' ? ASSESSMENT_CONFIG : PRACTICE_CONFIG
  const base = buildBaseResult(
    trials,
    'sart',
    PROTOCOL_VERSION,
    mode,
    config.cleaningRules,
    deviceInfo,
    flags,
    {
      minValidTrials: mode === 'assessment' ? 100 : 5,
      chanceAccuracy: 0.45,
    }
  )

  const goTrials = trials.filter((t) => t.condition === 'go')
  const noGoTrials = trials.filter((t) => t.condition === 'no-go')

  const hits = goTrials.filter(
    (t) => t.correct && t.actualResponse === 'space'
  ).length
  const misses = goTrials.filter(
    (t) => t.actualResponse === '' || t.actualResponse === 'none'
  ).length
  const falseAlarms = noGoTrials.filter(
    (t) => t.actualResponse !== '' && t.actualResponse !== 'none'
  ).length
  const correctRejections = noGoTrials.filter(
    (t) => t.actualResponse === '' || t.actualResponse === 'none'
  ).length

  const sdtMetrics = computeSDT({ hits, misses, falseAlarms, correctRejections })

  const goMetrics = conditionRTAndAccuracy(goTrials, 'go', config.cleaningRules)
  const noGoMetrics = conditionRTAndAccuracy(noGoTrials, 'no-go', config.cleaningRules)

  const commissionErrorRate =
    noGoTrials.length > 0 ? falseAlarms / noGoTrials.length : null

  return {
    ...base,
    sdtMetrics,
    conditionMetrics: {
      go: {
        medianRT: goMetrics.medianRT,
        accuracy: goMetrics.accuracy,
        omissionCount: goMetrics.omissionCount,
      },
      'no-go': {
        accuracy: noGoMetrics.accuracy,
        commissionErrors: falseAlarms,
      },
    },
    customMetrics: {
      commissionErrorRate,
      dPrime: sdtMetrics.dPrime,
      criterion: sdtMetrics.criterion,
      hitRate: sdtMetrics.hitRate,
      falseAlarmRate: sdtMetrics.falseAlarmRate,
      postErrorSlowing: postErrorSlowing(trials),
    },
  }
}

export const testDefinition: CognitiveTestDefinition = {
  id: 'sart',
  name: 'SART — Atenção Sustentada',
  shortName: 'SART',
  domain: 'sustained_attention',
  domains: ['sustained_attention', 'motor_inhibition', 'speed_alertness'],
  description:
    'Tarefa de atenção sustentada com ritmo acelerado. Responda aos dígitos exceto ao alvo de inibição (3).',
  duration: '~5 min',
  protocolVersion: PROTOCOL_VERSION,
  practiceConfig: PRACTICE_CONFIG,
  assessmentConfig: ASSESSMENT_CONFIG,
  instructions: {
    title: 'SART — Atenção Sustentada',
    summary:
      'Números aparecem rapidamente no centro da tela. Pressione Espaço para todos, exceto quando aparecer o número 3.',
    steps: [
      'Mantenha os olhos fixos no centro da tela.',
      'Quando aparecer um número de 1 a 9 (exceto 3), pressione Espaço o mais rápido possível.',
      'Quando aparecer o número 3, não responda — iniba a resposta.',
      'O ritmo é rápido: cada número fica visível por apenas 250 ms.',
      'Tente manter a atenção durante toda a tarefa, mesmo quando parecer monótona.',
    ],
    keys: [
      { key: 'Espaço', action: 'Responder (todos os números exceto 3)' },
      { key: '—', action: 'Não responder quando aparecer o 3' },
    ],
    tips: [
      'Erros de comissão (responder ao 3) são o indicador principal de desatenção.',
      'Não antecipe a resposta antes do estímulo aparecer.',
      'Mantenha os dedos prontos sobre a tecla Espaço.',
    ],
  },
  generateTrials: (mode, seed) =>
    generateSartTrials(
      mode,
      seed,
      mode === 'assessment' ? ASSESSMENT_CONFIG : PRACTICE_CONFIG
    ),
  scoreSession: scoreSartSession,
  primaryMetricKey: 'commissionErrorRate',
  baselineMetricKeys: [
    'commissionErrorRate',
    'medianCorrectRT',
    'dPrime',
    'postErrorSlowing',
    'accuracy',
  ],
  metricLabels: {
    commissionErrorRate: 'Erros de comissão (%)',
    medianCorrectRT: 'TR mediano (corretos)',
    dPrime: "d' (sensibilidade)",
    criterion: 'Critério (c)',
    hitRate: 'Taxa de acertos (go)',
    falseAlarmRate: 'Taxa de falsos alarmes',
    postErrorSlowing: 'Abrandamento pós-erro (ms)',
    accuracy: 'Precisão global',
  },
}