import type { DeviceInfo, TestMode, TrialRecord } from '../../types'
import { buildBaseResult, conditionRTAndAccuracy } from '../../scoring/common'
import {
  isEligibleForStimulusContingentScoring,
  PREONSET_EXCLUSION_SCORING_VERSION,
} from '../../scoring/stimulusEligibility'
import { computeSDT } from '../../statistics'
import { randomInt, seededRandom } from '../../utils/random'
import type { CognitiveTestDefinition, GeneratedTrial, ProtocolConfig } from '../types'

const PROTOCOL_VERSION = 'nback.spatial.v1.0'
const GRID_POSITIONS = 9
const TARGET_RATIO = 0.27
const MAX_CONSECUTIVE_TARGETS = 3
const MAX_CONSECUTIVE_NON_TARGETS = 4

const CLEANING = {
  anticipationThresholdMs: 150,
  lapseThresholdMs: 2000,
}

const PRACTICE_CONFIG: ProtocolConfig = {
  version: PROTOCOL_VERSION,
  trialCount: 12,
  blocks: 1,
  stimulusDurationMs: 500,
  isiMinMs: 2500,
  isiMaxMs: 2500,
  proportions: { target: TARGET_RATIO },
  keyMapping: { match: 'space', noMatch: 'none' },
  advancePolicy: 'fixed-duration',
  cleaningRules: CLEANING,
}

const ASSESSMENT_CONFIG: ProtocolConfig = {
  version: PROTOCOL_VERSION,
  trialCount: 180,
  blocks: 2,
  stimulusDurationMs: 500,
  isiMinMs: 2500,
  isiMaxMs: 2500,
  proportions: { target: TARGET_RATIO },
  keyMapping: { match: 'space', noMatch: 'none' },
  advancePolicy: 'fixed-duration',
  cleaningRules: CLEANING,
}

function pickNonMatchPosition(
  matchPosition: number,
  random: () => number
): number {
  const options = Array.from({ length: GRID_POSITIONS }, (_, i) => i).filter(
    (p) => p !== matchPosition
  )
  return options[randomInt(0, options.length - 1, random)]
}

function generateNBackBlock(
  n: number,
  trialCount: number,
  blockIndex: number,
  startTrialIndex: number,
  random: () => number,
  config: ProtocolConfig
): GeneratedTrial[] {
  const positions: number[] = []
  const trials: GeneratedTrial[] = []
  let consecutiveTargets = 0
  let consecutiveNonTargets = 0

  const targetBudget = Math.round(trialCount * TARGET_RATIO)
  let targetsPlaced = 0

  for (let i = 0; i < trialCount; i++) {
    const globalIndex = startTrialIndex + i
    let isTarget = false
    let position: number

    if (i < n) {
      position = randomInt(0, GRID_POSITIONS - 1, random)
      isTarget = false
    } else {
      const referencePosition = positions[i - n]
      const remainingTrials = trialCount - i
      const remainingTargets = targetBudget - targetsPlaced

      let wantTarget = random() < TARGET_RATIO
      if (wantTarget && consecutiveTargets >= MAX_CONSECUTIVE_TARGETS) wantTarget = false
      if (!wantTarget && consecutiveNonTargets >= MAX_CONSECUTIVE_NON_TARGETS) {
        wantTarget = true
      }
      if (remainingTargets >= remainingTrials) wantTarget = true
      if (remainingTargets <= 0) wantTarget = false

      isTarget = wantTarget
      position = isTarget
        ? referencePosition
        : pickNonMatchPosition(referencePosition, random)
    }

    positions.push(position)

    if (isTarget) {
      consecutiveTargets++
      consecutiveNonTargets = 0
      targetsPlaced++
    } else {
      consecutiveNonTargets++
      consecutiveTargets = 0
    }

    trials.push({
      blockIndex,
      trialIndex: globalIndex,
      condition: `${n}back`,
      stimulus: String(position),
      expectedResponse: isTarget ? 'space' : 'none',
      stimulusDurationMs: config.stimulusDurationMs,
      isiMs: config.isiMinMs,
      metadata: {
        nBack: n,
        gridPosition: position,
        isTarget,
        history: positions.slice(Math.max(0, i - n), i),
      },
    })
  }

  return trials
}

function generateNBackTrials(
  mode: TestMode,
  seed: number,
  config: ProtocolConfig
): GeneratedTrial[] {
  const random = seededRandom(seed)

  if (mode === 'assessment') {
    const oneBack = generateNBackBlock(1, 80, 0, 0, random, config)
    const twoBack = generateNBackBlock(2, 100, 1, 80, random, config)
    return [...oneBack, ...twoBack]
  }

  return generateNBackBlock(1, config.trialCount, 0, 0, random, config)
}

function scoreNBackByLevel(
  trials: TrialRecord[],
  n: number,
  cleaning: typeof CLEANING
) {
  const levelTrials = trials.filter((t) => t.metadata?.nBack === n)
  const eligibleLevelTrials = levelTrials.filter(isEligibleForStimulusContingentScoring)
  const targetTrials = eligibleLevelTrials.filter((t) => t.metadata?.isTarget === true)
  const nonTargetTrials = eligibleLevelTrials.filter((t) => t.metadata?.isTarget === false)

  const hits = targetTrials.filter((t) => t.correct).length
  const misses = targetTrials.length - hits
  const falseAlarms = nonTargetTrials.filter(
    (t) => t.actualResponse !== '' && t.actualResponse !== 'none'
  ).length
  const correctRejections = nonTargetTrials.length - falseAlarms

  const sdt = computeSDT({ hits, misses, falseAlarms, correctRejections })
  const targetMetrics = conditionRTAndAccuracy(targetTrials, `${n}back`, cleaning)
  const targetAccuracy = targetTrials.length > 0 ? targetMetrics.accuracy : null

  return { sdt, targetMetrics, targetAccuracy, levelTrials, targetTrials, nonTargetTrials }
}

function scoreNBackSession(
  trials: TrialRecord[],
  mode: TestMode,
  deviceInfo: DeviceInfo,
  flags: Record<string, boolean>
) {
  const config = mode === 'assessment' ? ASSESSMENT_CONFIG : PRACTICE_CONFIG
  const base = buildBaseResult(
    trials,
    'nback',
    PROTOCOL_VERSION,
    mode,
    config.cleaningRules,
    deviceInfo,
    flags,
    {
      minValidTrials: mode === 'assessment' ? 40 : 3,
      chanceAccuracy: 0.4,
    }
  )

  const oneBack = scoreNBackByLevel(trials, 1, config.cleaningRules)
  const twoBack =
    mode === 'assessment' ? scoreNBackByLevel(trials, 2, config.cleaningRules) : null

  const eligibleTrials = trials.filter(isEligibleForStimulusContingentScoring)
  const overallTargets = eligibleTrials.filter((t) => t.metadata?.isTarget === true)
  const overallNonTargets = eligibleTrials.filter((t) => t.metadata?.isTarget === false)

  const overallHits = overallTargets.filter((t) => t.correct).length
  const overallFalseAlarms = overallNonTargets.filter(
    (t) => t.actualResponse !== '' && t.actualResponse !== 'none'
  ).length
  const sdtMetrics = computeSDT({
    hits: overallHits,
    misses: overallTargets.length - overallHits,
    falseAlarms: overallFalseAlarms,
    correctRejections: overallNonTargets.length - overallFalseAlarms,
  })

  const conditionMetrics: Record<string, Record<string, number | null>> = {
    '1back': {
      medianRT: oneBack.targetMetrics.medianRT,
      accuracy: oneBack.targetAccuracy,
      dPrime: oneBack.sdt.dPrime,
      hitRate: oneBack.sdt.hitRate,
      falseAlarmRate: oneBack.sdt.falseAlarmRate,
    },
  }

  const customMetrics: Record<string, number | null> = {
    ...base.customMetrics,
    dPrime: sdtMetrics.dPrime,
    criterion: sdtMetrics.criterion,
    hitRate: sdtMetrics.hitRate,
    falseAlarmRate: sdtMetrics.falseAlarmRate,
    dPrime1Back: oneBack.sdt.dPrime,
    dPrime2Back: twoBack?.sdt.dPrime ?? null,
    medianRT1Back: oneBack.targetMetrics.medianRT,
    medianRT2Back: twoBack?.targetMetrics.medianRT ?? null,
    accuracy1Back: oneBack.targetAccuracy,
    accuracy2Back: twoBack?.targetAccuracy ?? null,
  }

  if (twoBack) {
    conditionMetrics['2back'] = {
      medianRT: twoBack.targetMetrics.medianRT,
      accuracy: twoBack.targetAccuracy,
      dPrime: twoBack.sdt.dPrime,
      hitRate: twoBack.sdt.hitRate,
      falseAlarmRate: twoBack.sdt.falseAlarmRate,
    }
  }

  return {
    ...base,
    scoringVersion: PREONSET_EXCLUSION_SCORING_VERSION,
    sdtMetrics,
    conditionMetrics,
    customMetrics,
  }
}

export const testDefinition: CognitiveTestDefinition = {
  id: 'nback',
  name: 'N-Back Espacial',
  shortName: 'N-Back',
  domain: 'working_memory',
  domains: ['working_memory', 'sustained_attention', 'speed_alertness'],
  description:
    'Tarefa de memória de trabalho espacial. Indique quando a posição atual coincide com a de N ensaios atrás.',
  duration: '~8 min',
  protocolVersion: PROTOCOL_VERSION,
  scoringVersion: PREONSET_EXCLUSION_SCORING_VERSION,
  practiceConfig: PRACTICE_CONFIG,
  assessmentConfig: ASSESSMENT_CONFIG,
  instructions: {
    title: 'N-Back Espacial',
    summary:
      'Um quadrado aparece numa grelha 3×3. Pressione Espaço quando a posição coincidir com a de N ensaios anteriores.',
    steps: [
      'Observe a grelha 3×3 no centro da tela.',
      'Em cada ensaio, um quadrado acende numa das 9 posições.',
      'No bloco 1-back: pressione Espaço se a posição for igual à do ensaio imediatamente anterior.',
      'No bloco 2-back: pressione Espaço se a posição for igual à de dois ensaios atrás.',
      'Se não houver correspondência, não responda.',
      'Responda apenas aos alvos (correspondências), não a todos os estímulos.',
    ],
    keys: [
      { key: 'Espaço', action: 'Correspondência (match) com N ensaios atrás' },
      { key: '—', action: 'Sem correspondência — não responder' },
    ],
    tips: [
      'Mantenha em mente as últimas posições visitadas.',
      'Evite responder por impulso — apenas aos alvos reais.',
      'A prática usa apenas 1-back; a avaliação inclui 1-back e 2-back.',
    ],
  },
  generateTrials: (mode, seed) =>
    generateNBackTrials(
      mode,
      seed,
      mode === 'assessment' ? ASSESSMENT_CONFIG : PRACTICE_CONFIG
    ),
  scoreSession: scoreNBackSession,
  primaryMetricKey: 'dPrime2Back',
  baselineMetricKeys: [
    'dPrime2Back',
    'dPrime1Back',
    'medianRT2Back',
    'accuracy2Back',
    'falseAlarmRate',
  ],
  metricLabels: {
    isiEarlyPresses: 'Teclas fora da janela (fixação/ISI)',
    dPrime: "d' global",
    criterion: 'Critério (c)',
    hitRate: 'Taxa de acertos (alvos)',
    falseAlarmRate: 'Taxa de falsos alarmes',
    dPrime1Back: "d' 1-back",
    dPrime2Back: "d' 2-back",
    medianRT1Back: 'TR mediano 1-back',
    medianRT2Back: 'TR mediano 2-back',
    accuracy1Back: 'Precisão 1-back',
    accuracy2Back: 'Precisão 2-back',
  },
  metricDirections: {
    isiEarlyPresses: -1,
    dPrime: 1,
    hitRate: 1,
    falseAlarmRate: -1,
    dPrime1Back: 1,
    dPrime2Back: 1,
    medianRT1Back: -1,
    medianRT2Back: -1,
    accuracy1Back: 1,
    accuracy2Back: 1,
  },
}
