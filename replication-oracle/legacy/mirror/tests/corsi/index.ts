import type { DeviceInfo, TestMode, TrialRecord } from '../../types'
import { buildBaseResult } from '../../scoring/common'
import type { CognitiveTestDefinition, ProtocolConfig } from '../types'

const PROTOCOL_VERSION = 'corsi.forward.v1.0'
const START_SPAN = 2
const MAX_SPAN = 9

const CLEANING = {
  anticipationThresholdMs: 0,
  lapseThresholdMs: 60000,
}

const PRACTICE_CONFIG: ProtocolConfig = {
  version: PROTOCOL_VERSION,
  trialCount: 2,
  blocks: 1,
  practiceCriteria: { minAccuracy: 0.5, minValidTrials: 2 },
  stimulusDurationMs: 1000,
  isiMinMs: 250,
  isiMaxMs: 250,
  keyMapping: { response: 'click' },
  cleaningRules: CLEANING,
}

const ASSESSMENT_CONFIG: ProtocolConfig = {
  version: PROTOCOL_VERSION,
  trialCount: 30,
  blocks: 1,
  stimulusDurationMs: 1000,
  isiMinMs: 250,
  isiMaxMs: 250,
  keyMapping: { response: 'click' },
  cleaningRules: CLEANING,
}

function parseClickSequence(response: string): number[] {
  if (!response || response === 'none') return []
  return response
    .split(',')
    .map((v) => parseInt(v.trim(), 10))
    .filter((v) => !Number.isNaN(v))
}

function longestCorrectPrefix(expected: number[], actual: number[]): number {
  let correct = 0
  for (let i = 0; i < Math.min(expected.length, actual.length); i++) {
    if (expected[i] !== actual[i]) break
    correct++
  }
  return correct
}

function scoreCorsiSession(
  trials: TrialRecord[],
  mode: TestMode,
  deviceInfo: DeviceInfo,
  flags: Record<string, boolean>
) {
  const config = mode === 'assessment' ? ASSESSMENT_CONFIG : PRACTICE_CONFIG
  const base = buildBaseResult(
    trials,
    'corsi',
    PROTOCOL_VERSION,
    mode,
    config.cleaningRules,
    deviceInfo,
    flags,
    {
      minValidTrials: 1,
      maxOmissionRate: 1,
      chanceAccuracy: 0.05,
    }
  )

  let maxSpan = START_SPAN
  let confirmedSpan = START_SPAN - 1
  let totalCorrectSequences = 0
  let partialScore = 0

  const trialsBySpan = new Map<number, TrialRecord[]>()
  for (const trial of trials) {
    const span = (trial.metadata?.span as number) ?? START_SPAN
    maxSpan = Math.max(maxSpan, span)
    if (!trialsBySpan.has(span)) trialsBySpan.set(span, [])
    trialsBySpan.get(span)!.push(trial)
  }

  const spans = [...trialsBySpan.keys()].sort((a, b) => a - b)
  let consecutiveCorrect = 0

  for (const span of spans) {
    const spanTrials = trialsBySpan.get(span)!
    let errorsAtSpan = 0
    let passedSpan = false

    for (const trial of spanTrials) {
      const expected = parseClickSequence(trial.expectedResponse)
      const actual = parseClickSequence(trial.actualResponse)
      const prefix = longestCorrectPrefix(expected, actual)

      partialScore += prefix

      if (trial.correct && expected.length === actual.length && prefix === expected.length) {
        totalCorrectSequences++
        consecutiveCorrect++
        if (consecutiveCorrect >= 2) {
          confirmedSpan = span
          passedSpan = true
        }
      } else {
        consecutiveCorrect = 0
        errorsAtSpan++
      }
    }

    if (errorsAtSpan >= 2 && mode === 'assessment') break
    if (passedSpan && span < MAX_SPAN) {
      consecutiveCorrect = 0
    }
  }

  if (totalCorrectSequences === 0 && trials.length > 0) {
    confirmedSpan = START_SPAN - 1
  }

  const totalItems = trials.reduce((sum, t) => {
    const expected = parseClickSequence(t.expectedResponse)
    return sum + expected.length
  }, 0)

  const partialScoreRate = totalItems > 0 ? partialScore / totalItems : null

  return {
    ...base,
    conditionMetrics: {
      forward: {
        maxSpan,
        confirmedSpan,
        totalCorrectSequences,
        partialScore,
        partialScoreRate,
      },
    },
    customMetrics: {
      maxSpan,
      confirmedSpan,
      totalCorrectSequences,
      partialScore,
      partialScoreRate,
    },
  }
}

export const testDefinition: CognitiveTestDefinition = {
  id: 'corsi',
  name: 'Corsi — Blocos',
  shortName: 'Corsi',
  domain: 'working_memory',
  domains: ['working_memory', 'sustained_attention'],
  description:
    'Tarefa de memória visuoespacial. Reproduza a sequência de blocos iluminados na ordem correta.',
  duration: '~5 min',
  protocolVersion: PROTOCOL_VERSION,
  practiceConfig: PRACTICE_CONFIG,
  assessmentConfig: ASSESSMENT_CONFIG,
  instructions: {
    title: 'Corsi — Blocos (Direto)',
    summary:
      'Observe a sequência de blocos que se acendem e reproduza-a clicando nos mesmos blocos, na mesma ordem.',
    steps: [
      'Nove blocos estão dispostos de forma irregular no ecrã.',
      'Os blocos acendem um de cada vez — memorize a sequência e a ordem.',
      'Após a apresentação, clique nos blocos na mesma ordem.',
      'A tarefa começa com sequências de 2 blocos e aumenta de dificuldade.',
      'O nível sobe após 2 sequências corretas consecutivas no mesmo nível.',
      'A tarefa termina após 2 erros no mesmo nível de dificuldade.',
    ],
    keys: [{ key: 'Rato / Toque', action: 'Clicar nos blocos na ordem memorizada' }],
    tips: [
      'Use estratégias visuoespaciais — imagine o caminho entre os blocos.',
      'Aguarde o fim da apresentação antes de clicar.',
      'A prática inclui 2 sequências de amplitude 2.',
    ],
  },
  isAdaptive: true,
  generateTrials: () => [],
  scoreSession: scoreCorsiSession,
  primaryMetricKey: 'confirmedSpan',
  baselineMetricKeys: [
    'confirmedSpan',
    'maxSpan',
    'totalCorrectSequences',
    'partialScoreRate',
  ],
  metricLabels: {
    maxSpan: 'Amplitude máxima',
    confirmedSpan: 'Amplitude confirmada',
    totalCorrectSequences: 'Sequências corretas',
    partialScore: 'Pontuação parcial (itens)',
    partialScoreRate: 'Pontuação parcial (%)',
  },
  metricDirections: {
    confirmedSpan: 1,
    maxSpan: 1,
    totalCorrectSequences: 1,
    partialScore: 1,
    partialScoreRate: 1,
  },
}