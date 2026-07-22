import type { DeviceInfo, TestMode, TrialRecord } from '../../types'
import { buildBaseResult } from '../../scoring/common'
import { replayCorsiTrials } from './adaptive'
import type { CognitiveTestDefinition, ProtocolConfig } from '../types'

const PROTOCOL_VERSION = 'corsi.forward.v1.0'

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

  // Regras de avanço/término/confirmação vêm EXCLUSIVAMENTE do replay do
  // engine adaptativo (spec §13) — nada é reimplementado aqui.
  const { finalState, totalItems } = replayCorsiTrials(
    trials,
    mode === 'assessment' ? 'assessment' : 'training',
    config.trialCount
  )

  const maxSpan = finalState.maxSpanReached
  const confirmedSpan = finalState.confirmedSpan
  const totalCorrectSequences = finalState.totalCorrectSequences
  const partialScore = finalState.totalCorrectPositions
  const partialScoreRate = totalItems > 0 ? partialScore / totalItems : null

  return {
    ...base,
    scoringVersion: 'sdt-hautus-1;corsi-replay-1',
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
  scoringVersion: 'sdt-hautus-1;corsi-replay-1',
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
      'A tarefa termina após 2 erros seguidos (sem acerto entre eles) no mesmo nível.',
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
