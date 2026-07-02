import type { DeviceInfo, TestMode, TrialRecord } from '../../types'
import { buildBaseResult, conditionRTAndAccuracy } from '../../scoring/common'
import { computeSDT } from '../../statistics/signalDetection'
import { seededRandom, pseudoRandomSequence, randomInt } from '../../utils/random'
import type { CognitiveTestDefinition, GeneratedTrial, ProtocolConfig } from '../types'

const PROTOCOL_VERSION = 'gonogo.standard.v1.0'

const GO_RATIO = 0.75

const CLEANING = {
  anticipationThresholdMs: 150,
  lapseThresholdMs: 2000,
}

const PRACTICE_CONFIG: ProtocolConfig = {
  version: PROTOCOL_VERSION,
  trialCount: 16,
  blocks: 1,
  isiMinMs: 800,
  isiMaxMs: 2000,
  proportions: { go: GO_RATIO, nogo: 1 - GO_RATIO },
  cleaningRules: CLEANING,
}

const ASSESSMENT_CONFIG: ProtocolConfig = {
  version: PROTOCOL_VERSION,
  trialCount: 160,
  blocks: 4,
  isiMinMs: 800,
  isiMaxMs: 2000,
  proportions: { go: GO_RATIO, nogo: 1 - GO_RATIO },
  cleaningRules: CLEANING,
}

function blockSizes(totalTrials: number, blocks: number): number[] {
  const base = Math.floor(totalTrials / blocks)
  const remainder = totalTrials % blocks
  return Array.from({ length: blocks }, (_, i) => base + (i < remainder ? 1 : 0))
}

function generateTrials(mode: TestMode, seed: number): GeneratedTrial[] {
  const config = mode === 'assessment' ? ASSESSMENT_CONFIG : PRACTICE_CONFIG
  const random = seededRandom(seed)
  const goSequence = pseudoRandomSequence(GO_RATIO, config.trialCount, random)
  const sizes = blockSizes(config.trialCount, config.blocks)
  const trials: GeneratedTrial[] = []
  let trialIndex = 0
  let seqIndex = 0

  for (let blockIndex = 0; blockIndex < config.blocks; blockIndex++) {
    for (let i = 0; i < sizes[blockIndex]; i++) {
      const isGo = goSequence[seqIndex++]
      trials.push({
        blockIndex,
        trialIndex,
        condition: isGo ? 'go' : 'nogo',
        stimulus: isGo ? 'green_circle' : 'red_circle',
        expectedResponse: isGo ? 'space' : 'none',
        isiMs: randomInt(config.isiMinMs!, config.isiMaxMs!, random),
      })
      trialIndex++
    }
  }

  return trials
}

function isNoResponse(response: string): boolean {
  return response === '' || response === 'none'
}

function scoreSession(
  trials: TrialRecord[],
  mode: TestMode,
  deviceInfo: DeviceInfo,
  flags: Record<string, boolean>
) {
  const base = buildBaseResult(
    trials,
    'gonogo',
    PROTOCOL_VERSION,
    mode,
    CLEANING,
    deviceInfo,
    flags,
    {
      minValidTrials: mode === 'assessment' ? 50 : 6,
      maxOmissionRate: 0.35,
    }
  )

  const goTrials = trials.filter((t) => t.condition === 'go')
  const nogoTrials = trials.filter((t) => t.condition === 'nogo')

  const go = conditionRTAndAccuracy(goTrials, 'go', CLEANING)
  const nogo = conditionRTAndAccuracy(nogoTrials, 'nogo', CLEANING)

  const hits = goTrials.filter((t) => t.correct && !isNoResponse(t.actualResponse)).length
  const misses = goTrials.filter((t) => isNoResponse(t.actualResponse)).length
  const falseAlarms = nogoTrials.filter((t) => !isNoResponse(t.actualResponse)).length
  const correctRejections = nogoTrials.filter(
    (t) => isNoResponse(t.actualResponse) && t.correct
  ).length

  const sdt = computeSDT({ hits, misses, falseAlarms, correctRejections })

  base.conditionMetrics = {
    go: {
      medianRT: go.medianRT,
      accuracy: go.accuracy,
      errorCount: go.errorCount,
      omissionCount: go.omissionCount,
      hitRate: sdt.hitRate,
    },
    nogo: {
      medianRT: nogo.medianRT,
      accuracy: nogo.accuracy,
      errorCount: nogo.errorCount,
      omissionCount: nogo.omissionCount,
      falseAlarmRate: sdt.falseAlarmRate,
    },
  }

  const commissionErrors = falseAlarms
  const commissionErrorRate = nogoTrials.length > 0 ? commissionErrors / nogoTrials.length : null

  base.customMetrics = {
    dPrime: sdt.dPrime,
    criterion: sdt.criterion,
    hitRate: sdt.hitRate,
    falseAlarmRate: sdt.falseAlarmRate,
    commissionErrorRate,
    commissionErrors,
  }

  return {
    ...base,
    sdtMetrics: sdt,
  }
}

export const testDefinition: CognitiveTestDefinition = {
  id: 'gonogo',
  name: 'Tarefa Go/No-Go',
  shortName: 'Go/No-Go',
  domain: 'motor_inhibition',
  domains: ['motor_inhibition', 'sustained_attention', 'selective_attention'],
  description:
    'Avalia a capacidade de inibir respostas prepotentes diante de estímulos que exigem não responder.',
  duration: '~10 min',
  protocolVersion: PROTOCOL_VERSION,
  practiceConfig: PRACTICE_CONFIG,
  assessmentConfig: ASSESSMENT_CONFIG,
  instructions: {
    title: 'Tarefa Go/No-Go',
    summary: 'Responda ao círculo verde e iniba a resposta ao círculo vermelho.',
    steps: [
      'Mantenha o dedo sobre a barra de espaço.',
      'Quando o círculo verde aparecer (Go), pressione a barra de espaço rapidamente.',
      'Quando o círculo vermelho aparecer (No-Go), não pressione nenhuma tecla.',
      'Mantenha atenção sustentada durante todos os blocos.',
      'A inibição correta é tão importante quanto a velocidade nos ensaios Go.',
    ],
    keys: [
      { key: 'Espaço', action: 'Responder ao círculo verde (Go)' },
      { key: '—', action: 'Não responder ao círculo vermelho (No-Go)' },
    ],
    tips: [
      'Não antecipe a resposta antes de identificar a cor.',
      'Erros de comissão (responder no vermelho) são o indicador principal de inibição.',
      'Mantenha postura estável para evitar pressionamentos acidentais.',
    ],
  },
  generateTrials,
  scoreSession,
  primaryMetricKey: 'dPrime',
  baselineMetricKeys: ['dPrime', 'falseAlarmRate', 'hitRate', 'commissionErrorRate', 'go.medianRT'],
  metricLabels: {
    dPrime: "d' (sensibilidade)",
    criterion: 'Critério de resposta',
    hitRate: 'Taxa de acertos (Go)',
    falseAlarmRate: 'Taxa de falsos alarmes (No-Go)',
    commissionErrorRate: 'Taxa de erros de comissão',
    commissionErrors: 'Erros de comissão (total)',
    'go.medianRT': 'TR mediano (Go)',
    'go.accuracy': 'Precisão (Go)',
    'nogo.accuracy': 'Precisão (No-Go)',
  },
}