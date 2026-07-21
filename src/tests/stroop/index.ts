import type { DeviceInfo, TestMode, TrialRecord } from '../../types'
import { buildBaseResult, conditionRTAndAccuracy } from '../../scoring/common'
import { stroopCostRT, stroopCostAccuracy } from '../../statistics/costs'
import { seededRandom, shuffle, randomInt } from '../../utils/random'
import type { CognitiveTestDefinition, GeneratedTrial, ProtocolConfig } from '../types'

const PROTOCOL_VERSION = 'stroop.standard.v1.0'

const COLORS = ['vermelho', 'azul', 'verde', 'amarelo'] as const
type ColorName = (typeof COLORS)[number]

const KEY_BY_COLOR: Record<ColorName, string> = {
  vermelho: 'f',
  azul: 'g',
  verde: 'h',
  amarelo: 'j',
}

const NEUTRAL_WORD = '++++'

const CLEANING = {
  anticipationThresholdMs: 150,
  lapseThresholdMs: 2000,
}

const PRACTICE_CONFIG: ProtocolConfig = {
  version: PROTOCOL_VERSION,
  trialCount: 12,
  blocks: 1,
  isiMinMs: 500,
  isiMaxMs: 1500,
  keyMapping: KEY_BY_COLOR,
  cleaningRules: CLEANING,
}

const ASSESSMENT_CONFIG: ProtocolConfig = {
  version: PROTOCOL_VERSION,
  trialCount: 120,
  blocks: 4,
  isiMinMs: 500,
  isiMaxMs: 1500,
  keyMapping: KEY_BY_COLOR,
  cleaningRules: CLEANING,
}

function blockSizes(totalTrials: number, blocks: number): number[] {
  const base = Math.floor(totalTrials / blocks)
  const remainder = totalTrials % blocks
  return Array.from({ length: blocks }, (_, i) => base + (i < remainder ? 1 : 0))
}

function pickOtherColor(color: ColorName, random: () => number): ColorName {
  const others = COLORS.filter((c) => c !== color)
  return others[Math.floor(random() * others.length)]
}

interface StroopTrialSpec {
  condition: 'congruent' | 'incongruent' | 'neutral'
  word: string
  inkColor: ColorName
}

function buildStroopSpecs(trialCount: number, random: () => number): StroopTrialSpec[] {
  const perCondition = Math.floor(trialCount / 3)
  const remainder = trialCount % 3
  const counts = {
    congruent: perCondition + (remainder > 0 ? 1 : 0),
    incongruent: perCondition + (remainder > 1 ? 1 : 0),
    neutral: perCondition,
  }

  const specs: StroopTrialSpec[] = []

  for (let i = 0; i < counts.congruent; i++) {
    const inkColor = COLORS[Math.floor(random() * COLORS.length)]
    specs.push({ condition: 'congruent', word: inkColor, inkColor })
  }

  for (let i = 0; i < counts.incongruent; i++) {
    const wordColor = COLORS[Math.floor(random() * COLORS.length)]
    const inkColor = pickOtherColor(wordColor, random)
    specs.push({ condition: 'incongruent', word: wordColor, inkColor })
  }

  for (let i = 0; i < counts.neutral; i++) {
    const inkColor = COLORS[Math.floor(random() * COLORS.length)]
    specs.push({ condition: 'neutral', word: NEUTRAL_WORD, inkColor })
  }

  return shuffle(specs, random)
}

function generateTrials(mode: TestMode, seed: number): GeneratedTrial[] {
  const config = mode === 'assessment' ? ASSESSMENT_CONFIG : PRACTICE_CONFIG
  const random = seededRandom(seed)
  const specs = buildStroopSpecs(config.trialCount, random)
  const sizes = blockSizes(config.trialCount, config.blocks)
  const trials: GeneratedTrial[] = []
  let trialIndex = 0
  let specIndex = 0

  for (let blockIndex = 0; blockIndex < config.blocks; blockIndex++) {
    for (let i = 0; i < sizes[blockIndex]; i++) {
      const spec = specs[specIndex++]
      trials.push({
        blockIndex,
        trialIndex,
        condition: spec.condition,
        stimulus: JSON.stringify({ word: spec.word, inkColor: spec.inkColor }),
        expectedResponse: KEY_BY_COLOR[spec.inkColor],
        isiMs: randomInt(config.isiMinMs!, config.isiMaxMs!, random),
        metadata: {
          word: spec.word,
          inkColor: spec.inkColor,
        },
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
    'stroop',
    PROTOCOL_VERSION,
    mode,
    CLEANING,
    deviceInfo,
    flags,
    {
      minValidTrials: mode === 'assessment' ? 40 : 6,
      chanceAccuracy: 0.2,
    }
  )

  const congruent = conditionRTAndAccuracy(trials, 'congruent', CLEANING)
  const incongruent = conditionRTAndAccuracy(trials, 'incongruent', CLEANING)
  const neutral = conditionRTAndAccuracy(trials, 'neutral', CLEANING)

  base.conditionMetrics = {
    congruent: {
      medianRT: congruent.medianRT,
      accuracy: congruent.accuracy,
      errorCount: congruent.errorCount,
      omissionCount: congruent.omissionCount,
    },
    incongruent: {
      medianRT: incongruent.medianRT,
      accuracy: incongruent.accuracy,
      errorCount: incongruent.errorCount,
      omissionCount: incongruent.omissionCount,
    },
    neutral: {
      medianRT: neutral.medianRT,
      accuracy: neutral.accuracy,
      errorCount: neutral.errorCount,
      omissionCount: neutral.omissionCount,
    },
  }

  base.customMetrics = {
    ...base.customMetrics,
    stroopCostRT: stroopCostRT(congruent.validRTs, incongruent.validRTs),
    stroopCostAccuracy: stroopCostAccuracy(congruent.accuracy, incongruent.accuracy),
    incongruentNeutralCostRT: stroopCostRT(neutral.validRTs, incongruent.validRTs),
  }

  return base
}

export const testDefinition: CognitiveTestDefinition = {
  id: 'stroop',
  name: 'Teste de Stroop',
  shortName: 'Stroop',
  domain: 'interference_control',
  domains: ['interference_control', 'selective_attention', 'speed_alertness'],
  description:
    'Mede o controle de interferência ao nomear a cor da tinta enquanto palavras de cores competem pela atenção.',
  duration: '~8 min',
  protocolVersion: PROTOCOL_VERSION,
  scoringVersion: 'sdt-hautus-1',
  practiceConfig: PRACTICE_CONFIG,
  assessmentConfig: ASSESSMENT_CONFIG,
  instructions: {
    title: 'Teste de Stroop',
    summary: 'Identifique a cor da palavra ignorando o significado do texto.',
    steps: [
      'Mantenha os dedos sobre F, G, H e J.',
      'Uma palavra colorida aparecerá no centro da tela.',
      'Responda com a tecla correspondente à cor da tinta, não ao significado da palavra.',
      'Em estímulos neutros (++++), responda pela cor dos símbolos.',
      'Responda o mais rápido possível, mantendo a precisão.',
    ],
    keys: [
      { key: 'F', action: 'Vermelho' },
      { key: 'G', action: 'Azul' },
      { key: 'H', action: 'Verde' },
      { key: 'J', action: 'Amarelo' },
    ],
    tips: [
      'Foque na cor visual, não no que a palavra significa.',
      'Ensaios incongruentes são mais difíceis — isso é esperado.',
      'Mantenha ritmo constante; não pare após erros.',
    ],
  },
  generateTrials,
  scoreSession,
  primaryMetricKey: 'stroopCostRT',
  baselineMetricKeys: [
    'stroopCostRT',
    'stroopCostAccuracy',
    'congruent.medianRT',
    'incongruent.medianRT',
    'accuracy',
  ],
  metricLabels: {
    isiEarlyPresses: 'Teclas fora da janela (fixação/ISI)',
    stroopCostRT: 'Custo Stroop (TR)',
    stroopCostAccuracy: 'Custo Stroop (precisão)',
    incongruentNeutralCostRT: 'Custo incongruente vs neutro (TR)',
    accuracy: 'Precisão global',
    'congruent.medianRT': 'TR mediano (congruente)',
    'incongruent.medianRT': 'TR mediano (incongruente)',
    'neutral.medianRT': 'TR mediano (neutro)',
    'congruent.accuracy': 'Precisão (congruente)',
    'incongruent.accuracy': 'Precisão (incongruente)',
    'neutral.accuracy': 'Precisão (neutro)',
  },
  metricDirections: {
    isiEarlyPresses: -1,
    stroopCostRT: -1,
    stroopCostAccuracy: -1,
    incongruentNeutralCostRT: -1,
    accuracy: 1,
    'congruent.medianRT': -1,
    'incongruent.medianRT': -1,
    'neutral.medianRT': -1,
    'congruent.accuracy': 1,
    'incongruent.accuracy': 1,
    'neutral.accuracy': 1,
  },
}
