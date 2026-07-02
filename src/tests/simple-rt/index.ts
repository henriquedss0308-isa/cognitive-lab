import type { DeviceInfo, TestMode, TrialRecord } from '../../types'
import { buildBaseResult, conditionRTAndAccuracy, postErrorSlowing } from '../../scoring/common'
import { seededRandom, randomInt } from '../../utils/random'
import type { CognitiveTestDefinition, GeneratedTrial, ProtocolConfig } from '../types'

const PROTOCOL_VERSION = 'reaction.simple.v1.0'

const CLEANING = {
  anticipationThresholdMs: 150,
  lapseThresholdMs: 1500,
}

const PRACTICE_CONFIG: ProtocolConfig = {
  version: PROTOCOL_VERSION,
  trialCount: 8,
  blocks: 1,
  isiMinMs: 1000,
  isiMaxMs: 3000,
  cleaningRules: CLEANING,
}

const ASSESSMENT_CONFIG: ProtocolConfig = {
  version: PROTOCOL_VERSION,
  trialCount: 45,
  blocks: 4,
  isiMinMs: 1000,
  isiMaxMs: 3000,
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
  const sizes = blockSizes(config.trialCount, config.blocks)
  const trials: GeneratedTrial[] = []
  let trialIndex = 0

  for (let blockIndex = 0; blockIndex < config.blocks; blockIndex++) {
    for (let i = 0; i < sizes[blockIndex]; i++) {
      trials.push({
        blockIndex,
        trialIndex,
        condition: 'simple',
        stimulus: 'green_circle',
        expectedResponse: 'space',
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
    'simple_rt',
    PROTOCOL_VERSION,
    mode,
    CLEANING,
    deviceInfo,
    flags,
    {
      minValidTrials: mode === 'assessment' ? 20 : 4,
      maxOmissionRate: 0.4,
    }
  )

  const simple = conditionRTAndAccuracy(trials, 'simple', CLEANING)

  base.conditionMetrics = {
    simple: {
      medianRT: simple.medianRT,
      accuracy: simple.accuracy,
      errorCount: simple.errorCount,
      omissionCount: simple.omissionCount,
    },
  }

  base.customMetrics = {
    postErrorSlowing: postErrorSlowing(trials),
  }

  return base
}

export const testDefinition: CognitiveTestDefinition = {
  id: 'simple_rt',
  name: 'Tempo de Reação Simples',
  shortName: 'TR Simples',
  domain: 'speed_alertness',
  domains: ['speed_alertness', 'sustained_attention', 'intraindividual_variability'],
  description:
    'Mede a velocidade de resposta motora a um estímulo visual simples, indicador básico de alerta e velocidade de processamento.',
  duration: '~4 min',
  protocolVersion: PROTOCOL_VERSION,
  practiceConfig: PRACTICE_CONFIG,
  assessmentConfig: ASSESSMENT_CONFIG,
  instructions: {
    title: 'Tempo de Reação Simples',
    summary: 'Responda o mais rápido possível quando o círculo verde aparecer.',
    steps: [
      'Mantenha os dedos sobre a barra de espaço, prontos para responder.',
      'Fixe o ponto central na tela entre os ensaios.',
      'Quando o círculo verde aparecer, pressione a barra de espaço imediatamente.',
      'Responda apenas ao círculo verde; ignore outros estímulos.',
      'Tente manter ritmo e atenção constantes durante toda a sessão.',
    ],
    keys: [{ key: 'Espaço', action: 'Responder ao círculo verde' }],
    tips: [
      'Evite antecipar a resposta antes do estímulo aparecer.',
      'Mantenha a postura estável e o foco na tela.',
      'Pausas breves entre blocos ajudam a manter a atenção.',
    ],
  },
  generateTrials,
  scoreSession,
  primaryMetricKey: 'medianCorrectRT',
  baselineMetricKeys: ['medianCorrectRT', 'rtCV', 'lapseRate', 'anticipationRate', 'postErrorSlowing'],
  metricLabels: {
    medianCorrectRT: 'TR mediano (corretos)',
    rtCV: 'Coeficiente de variação do TR',
    lapseRate: 'Taxa de lapsos',
    anticipationRate: 'Taxa de antecipação',
    postErrorSlowing: 'Abrandamento pós-erro',
    'simple.medianRT': 'TR mediano',
    'simple.accuracy': 'Precisão',
  },
}