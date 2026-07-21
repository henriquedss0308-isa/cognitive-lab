import type { DeviceInfo, TestMode, TrialRecord } from '../../types'
import { buildBaseResult, conditionRTAndAccuracy } from '../../scoring/common'
import { computeSDT } from '../../statistics/signalDetection'
import { seededRandom, randomInt } from '../../utils/random'
import type { CognitiveTestDefinition, GeneratedTrial, ProtocolConfig } from '../types'

const PROTOCOL_VERSION = 'gonogo.standard.v1.0'

const GO_RATIO = 0.75
const MAX_CONSECUTIVE_GO = 4
const GAP_RANDOMIZATION_STEPS_PER_NO_GO = 6
const BALANCED_ROTATION_ATTEMPTS = 2000

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

function randomUnit(random: () => number): number {
  return Math.min(random(), 1 - Number.EPSILON)
}

function randomIndex(length: number, random: () => number): number {
  return Math.floor(randomUnit(random) * length)
}

function shuffledIndexes(length: number, random: () => number): number[] {
  const indexes = Array.from({ length }, (_, index) => index)
  for (let i = indexes.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, random)
    ;[indexes[i], indexes[j]] = [indexes[j], indexes[i]]
  }
  return indexes
}

function rotateSequence(sequence: boolean[], offset: number): boolean[] {
  return [...sequence.slice(offset), ...sequence.slice(0, offset)]
}

function maxConsecutiveGo(sequence: boolean[]): number {
  let current = 0
  let max = 0
  for (const isGo of sequence) {
    current = isGo ? current + 1 : 0
    max = Math.max(max, current)
  }
  return max
}

function expectedNoGoCount(size: number): number {
  return Math.round((1 - GO_RATIO) * size)
}

function circularGoGaps(goCount: number, noGoCount: number, random: () => number): number[] {
  const baseGap = Math.floor(goCount / noGoCount)
  const gaps = Array.from({ length: noGoCount }, () => baseGap)
  let remainingGo = goCount - baseGap * noGoCount

  while (remainingGo > 0) {
    const receivers = gaps
      .map((gap, index) => (gap < MAX_CONSECUTIVE_GO ? index : -1))
      .filter((index) => index >= 0)
    if (receivers.length === 0) {
      throw new Error('Go/No-Go ratio cannot satisfy the maximum Go streak')
    }
    gaps[receivers[randomIndex(receivers.length, random)]]++
    remainingGo--
  }

  const steps = noGoCount * GAP_RANDOMIZATION_STEPS_PER_NO_GO
  for (let step = 0; step < steps; step++) {
    const donors = gaps
      .map((gap, index) => (gap > 0 ? index : -1))
      .filter((index) => index >= 0)
    const receivers = gaps
      .map((gap, index) => (gap < MAX_CONSECUTIVE_GO ? index : -1))
      .filter((index) => index >= 0)

    const donor = donors[randomIndex(donors.length, random)]
    let receiver = receivers[randomIndex(receivers.length, random)]
    if (receiver === donor && receivers.length > 1) {
      const currentIndex = receivers.indexOf(receiver)
      const offset = 1 + randomIndex(receivers.length - 1, random)
      receiver = receivers[(currentIndex + offset) % receivers.length]
    }

    if (receiver !== donor) {
      gaps[donor]--
      gaps[receiver]++
    }
  }

  return gaps
}

function circularSequenceFromGaps(gaps: number[]): boolean[] {
  const sequence: boolean[] = []
  for (const gap of gaps) {
    sequence.push(false)
    for (let i = 0; i < gap; i++) sequence.push(true)
  }
  return sequence
}

function hasExpectedBlockCounts(sequence: boolean[], sizes: number[]): boolean {
  let start = 0
  for (const size of sizes) {
    const block = sequence.slice(start, start + size)
    const noGoCount = block.filter((isGo) => !isGo).length
    if (noGoCount !== expectedNoGoCount(size)) {
      return false
    }
    start += size
  }
  return true
}

function splitBlocks(sequence: boolean[], sizes: number[]): boolean[][] {
  const blocks: boolean[][] = []
  let start = 0
  for (const size of sizes) {
    blocks.push(sequence.slice(start, start + size))
    start += size
  }
  return blocks
}

function blockConditionSequences(sizes: number[], random: () => number): boolean[][] {
  const totalTrials = sizes.reduce((sum, size) => sum + size, 0)
  const totalNoGo = sizes.reduce((sum, size) => sum + expectedNoGoCount(size), 0)
  const totalGo = totalTrials - totalNoGo

  for (let attempt = 0; attempt < BALANCED_ROTATION_ATTEMPTS; attempt++) {
    const gaps = circularGoGaps(totalGo, totalNoGo, random)
    const circularSequence = circularSequenceFromGaps(gaps)

    for (const rotation of shuffledIndexes(totalTrials, random)) {
      const sequence = rotateSequence(circularSequence, rotation)
      if (hasExpectedBlockCounts(sequence, sizes)) {
        if (maxConsecutiveGo(sequence) > MAX_CONSECUTIVE_GO) {
          throw new Error('Go/No-Go balanced sequence exceeded the maximum Go streak')
        }
        return splitBlocks(sequence, sizes)
      }
    }
  }

  throw new Error('Unable to generate balanced Go/No-Go sequence')
}

function generateTrials(mode: TestMode, seed: number): GeneratedTrial[] {
  const config = mode === 'assessment' ? ASSESSMENT_CONFIG : PRACTICE_CONFIG
  const random = seededRandom(seed)
  const sizes = blockSizes(config.trialCount, config.blocks)
  const blockSequences = blockConditionSequences(sizes, random)
  const trials: GeneratedTrial[] = []
  let trialIndex = 0

  for (let blockIndex = 0; blockIndex < config.blocks; blockIndex++) {
    const goSequence = blockSequences[blockIndex]

    for (let i = 0; i < sizes[blockIndex]; i++) {
      const isGo = goSequence[i]
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
    ...base.customMetrics,
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
  scoringVersion: 'sdt-hautus-1',
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
    isiEarlyPresses: 'Teclas fora da janela (fixação/ISI)',
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
  metricDirections: {
    isiEarlyPresses: -1,
    dPrime: 1,
    hitRate: 1,
    falseAlarmRate: -1,
    commissionErrorRate: -1,
    commissionErrors: -1,
    'go.medianRT': -1,
    'go.accuracy': 1,
    'nogo.accuracy': 1,
  },
}
