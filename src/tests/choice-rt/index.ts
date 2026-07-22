import type { DeviceInfo, TestMode, TrialRecord } from '../../types'
import { buildBaseResult, conditionRTAndAccuracy, postErrorSlowing } from '../../scoring/common'
import { seededRandom, balancedSequence, randomInt } from '../../utils/random'
import type { CognitiveTestDefinition, GeneratedTrial, ProtocolConfig } from '../types'

const PROTOCOL_VERSION = 'reaction.choice.v1.0'

const CLEANING = {
  anticipationThresholdMs: 150,
  lapseThresholdMs: 2000,
}

const KEY_MAPPING: Record<string, string> = {
  f: 'left',
  j: 'right',
}

const PRACTICE_CONFIG: ProtocolConfig = {
  version: PROTOCOL_VERSION,
  trialCount: 10,
  blocks: 1,
  isiMinMs: 800,
  isiMaxMs: 2000,
  keyMapping: KEY_MAPPING,
  cleaningRules: CLEANING,
}

const ASSESSMENT_CONFIG: ProtocolConfig = {
  version: PROTOCOL_VERSION,
  trialCount: 60,
  blocks: 3,
  isiMinMs: 800,
  isiMaxMs: 2000,
  keyMapping: KEY_MAPPING,
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
  const conditions = balancedSequence(
    ['left', 'right'] as const,
    Math.ceil(config.trialCount / 2),
    random
  ).slice(0, config.trialCount)

  const sizes = blockSizes(config.trialCount, config.blocks)
  const trials: GeneratedTrial[] = []
  let trialIndex = 0
  let seqIndex = 0

  for (let blockIndex = 0; blockIndex < config.blocks; blockIndex++) {
    for (let i = 0; i < sizes[blockIndex]; i++) {
      const condition = conditions[seqIndex++]
      trials.push({
        blockIndex,
        trialIndex,
        condition,
        stimulus: condition === 'left' ? 'arrow_left' : 'arrow_right',
        expectedResponse: condition === 'left' ? 'f' : 'j',
        isiMs: randomInt(config.isiMinMs!, config.isiMaxMs!, random),
      })
      trialIndex++
    }
  }

  return trials
}

function scoreSession(
  trials: TrialRecord[],
  mode: TestMode,
  deviceInfo: DeviceInfo,
  flags: Record<string, boolean>
) {
  const base = buildBaseResult(
    trials,
    'choice_rt',
    PROTOCOL_VERSION,
    mode,
    CLEANING,
    deviceInfo,
    flags,
    {
      minValidTrials: mode === 'assessment' ? 25 : 5,
      chanceAccuracy: 0.45,
    }
  )

  const left = conditionRTAndAccuracy(trials, 'left', CLEANING)
  const right = conditionRTAndAccuracy(trials, 'right', CLEANING)

  base.conditionMetrics = {
    left: {
      medianRT: left.medianRT,
      accuracy: left.accuracy,
      errorCount: left.errorCount,
      omissionCount: left.omissionCount,
    },
    right: {
      medianRT: right.medianRT,
      accuracy: right.accuracy,
      errorCount: right.errorCount,
      omissionCount: right.omissionCount,
    },
  }

  const leftRT = left.medianRT
  const rightRT = right.medianRT
  const asymmetry =
    leftRT !== null && rightRT !== null ? Math.abs(leftRT - rightRT) : null

  base.customMetrics = {
    ...base.customMetrics,
    postErrorSlowing: postErrorSlowing(trials),
    leftRightAsymmetry: asymmetry,
  }

  return base
}

export const testDefinition: CognitiveTestDefinition = {
  id: 'choice_rt',
  name: 'Tempo de Reação de Escolha',
  shortName: 'TR Escolha',
  domain: 'speed_alertness',
  domains: ['speed_alertness', 'selective_attention'],
  description:
    'Avalia a velocidade de decisão e resposta motora diante de estímulos que exigem escolha entre duas alternativas.',
  duration: '~5 min',
  protocolVersion: PROTOCOL_VERSION,
  scoringVersion: 'sdt-hautus-1',
  practiceConfig: PRACTICE_CONFIG,
  assessmentConfig: ASSESSMENT_CONFIG,
  instructions: {
    title: 'Tempo de Reação de Escolha',
    summary: 'Responda à direção da seta o mais rápido e corretamente possível.',
    steps: [
      'Mantenha os dedos sobre as teclas F e J.',
      'Fixe o ponto central entre os ensaios.',
      'Quando a seta aparecer, pressione F se apontar para a esquerda ou J se apontar para a direita.',
      'Responda apenas após o estímulo aparecer na tela.',
      'Priorize precisão; a velocidade será medida nos ensaios corretos.',
    ],
    keys: [
      { key: 'F', action: 'Seta para a esquerda' },
      { key: 'J', action: 'Seta para a direita' },
    ],
    tips: [
      'Use sempre a mesma mão para cada tecla durante toda a sessão.',
      'Evite olhar para o teclado durante o teste.',
      'Não antecipe a direção antes da seta aparecer.',
    ],
  },
  generateTrials,
  scoreSession,
  primaryMetricKey: 'medianCorrectRT',
  baselineMetricKeys: ['medianCorrectRT', 'accuracy', 'rtCV', 'leftRightAsymmetry', 'postErrorSlowing'],
  metricLabels: {
    isiEarlyPresses: 'Teclas fora da janela (fixação/ISI)',
    medianCorrectRT: 'TR mediano (corretos)',
    accuracy: 'Precisão global',
    rtCV: 'Coeficiente de variação do TR',
    leftRightAsymmetry: 'Assimetria esquerda-direita',
    postErrorSlowing: 'Abrandamento pós-erro',
    'left.medianRT': 'TR mediano (esquerda)',
    'right.medianRT': 'TR mediano (direita)',
    'left.accuracy': 'Precisão (esquerda)',
    'right.accuracy': 'Precisão (direita)',
  },
  metricDirections: {
    isiEarlyPresses: -1,
    medianCorrectRT: -1,
    accuracy: 1,
    rtCV: -1,
    leftRightAsymmetry: -1,
    postErrorSlowing: -1,
    'left.medianRT': -1,
    'right.medianRT': -1,
    'left.accuracy': 1,
    'right.accuracy': 1,
  },
}
