import type { DeviceInfo, TestMode, TrialRecord } from '../../types'
import { buildBaseResult, conditionRTAndAccuracy, postErrorSlowing } from '../../scoring/common'
import { computeRTMetrics, mixingCost, switchCost } from '../../statistics'
import { balancedSequence, seededRandom, shuffle } from '../../utils/random'
import type { CognitiveTestDefinition, GeneratedTrial, ProtocolConfig } from '../types'

const PROTOCOL_VERSION = 'taskswitch.standard.v1.0'
const STIMULI = [1, 2, 3, 4, 6, 7, 8, 9]

const CLEANING = {
  anticipationThresholdMs: 150,
  lapseThresholdMs: 2000,
}

const PRACTICE_CONFIG: ProtocolConfig = {
  version: PROTOCOL_VERSION,
  trialCount: 12,
  blocks: 1,
  stimulusDurationMs: 0,
  isiMinMs: 1500,
  isiMaxMs: 1500,
  keyMapping: { left: 'f', right: 'j' },
  cleaningRules: CLEANING,
}

const ASSESSMENT_CONFIG: ProtocolConfig = {
  version: PROTOCOL_VERSION,
  trialCount: 160,
  blocks: 4,
  stimulusDurationMs: 0,
  isiMinMs: 1500,
  isiMaxMs: 1500,
  keyMapping: { left: 'f', right: 'j' },
  cleaningRules: CLEANING,
}

type TaskRule = 'odd_even' | 'magnitude'

function expectedResponseFor(number: number, task: TaskRule): string {
  if (task === 'odd_even') {
    return number % 2 === 0 ? 'f' : 'j'
  }
  return number < 5 ? 'f' : 'j'
}

function generateBlockTrials(
  blockIndex: number,
  trialCount: number,
  startTrialIndex: number,
  task: TaskRule,
  condition: 'pure_odd_even' | 'pure_magnitude' | 'mixed',
  random: () => number,
  config: ProtocolConfig,
  previousTask?: TaskRule
): { trials: GeneratedTrial[]; lastTask: TaskRule } {
  const trials: GeneratedTrial[] = []
  const numbers = balancedSequence(
    STIMULI,
    Math.ceil(trialCount / STIMULI.length),
    random
  ).slice(0, trialCount)

  let lastTask = previousTask ?? task

  if (condition === 'mixed') {
    const switchCount = Math.floor(trialCount / 2)
    const switchFlags = shuffle(
      [...Array(switchCount).fill(true), ...Array(trialCount - switchCount).fill(false)],
      random
    )

    for (let i = 0; i < trialCount; i++) {
      const currentTask: TaskRule = switchFlags[i]
        ? lastTask === 'odd_even'
          ? 'magnitude'
          : 'odd_even'
        : lastTask

      const number = numbers[i]
      const isSwitch = i > 0 && currentTask !== lastTask
      const trialCondition = isSwitch ? 'mixed_switch' : 'mixed_repeat'

      trials.push({
        blockIndex,
        trialIndex: startTrialIndex + i,
        condition: trialCondition,
        stimulus: String(number),
        expectedResponse: expectedResponseFor(number, currentTask),
        isiMs: config.isiMinMs,
        metadata: {
          task: currentTask,
          cue: currentTask === 'odd_even' ? 'blue' : 'green',
          isSwitch,
          number,
        },
      })

      lastTask = currentTask
    }
  } else {
    for (let i = 0; i < trialCount; i++) {
      const number = numbers[i]
      trials.push({
        blockIndex,
        trialIndex: startTrialIndex + i,
        condition,
        stimulus: String(number),
        expectedResponse: expectedResponseFor(number, task),
        isiMs: config.isiMinMs,
        metadata: {
          task,
          cue: task === 'odd_even' ? 'blue' : 'green',
          isSwitch: false,
          number,
        },
      })
    }
    lastTask = task
  }

  return { trials, lastTask }
}

function generateTaskSwitchTrials(
  mode: TestMode,
  seed: number,
  config: ProtocolConfig
): GeneratedTrial[] {
  const random = seededRandom(seed)

  if (mode === 'training') {
    const task: TaskRule = random() < 0.5 ? 'odd_even' : 'magnitude'
    return generateBlockTrials(
      0,
      config.trialCount,
      0,
      task,
      task === 'odd_even' ? 'pure_odd_even' : 'pure_magnitude',
      random,
      config
    ).trials
  }

  const pureOdd = generateBlockTrials(
    0,
    40,
    0,
    'odd_even',
    'pure_odd_even',
    random,
    config
  )
  const pureMag = generateBlockTrials(
    1,
    40,
    40,
    'magnitude',
    'pure_magnitude',
    random,
    config
  )
  const mixed1 = generateBlockTrials(
    2,
    40,
    80,
    'odd_even',
    'mixed',
    random,
    config,
    'magnitude'
  )
  const mixed2 = generateBlockTrials(
    3,
    40,
    120,
    mixed1.lastTask === 'odd_even' ? 'magnitude' : 'odd_even',
    'mixed',
    random,
    config,
    mixed1.lastTask
  )

  return [...pureOdd.trials, ...pureMag.trials, ...mixed1.trials, ...mixed2.trials]
}

function collectValidRTs(
  trials: TrialRecord[],
  cleaning: typeof CLEANING
): number[] {
  return computeRTMetrics(trials, cleaning).validRTs
}

function scoreTaskSwitchSession(
  trials: TrialRecord[],
  mode: TestMode,
  deviceInfo: DeviceInfo,
  flags: Record<string, boolean>
) {
  const config = mode === 'assessment' ? ASSESSMENT_CONFIG : PRACTICE_CONFIG
  const base = buildBaseResult(
    trials,
    'taskswitch',
    PROTOCOL_VERSION,
    mode,
    config.cleaningRules,
    deviceInfo,
    flags,
    {
      minValidTrials: mode === 'assessment' ? 60 : 5,
      chanceAccuracy: 0.4,
    }
  )

  const pureOdd = trials.filter((t) => t.condition === 'pure_odd_even')
  const pureMag = trials.filter((t) => t.condition === 'pure_magnitude')
  const mixedSwitch = trials.filter((t) => t.condition === 'mixed_switch')
  const mixedRepeat = trials.filter((t) => t.condition === 'mixed_repeat')
  const pureAll = [...pureOdd, ...pureMag]

  const pureOddMetrics = conditionRTAndAccuracy(pureOdd, 'pure_odd_even', config.cleaningRules)
  const pureMagMetrics = conditionRTAndAccuracy(pureMag, 'pure_magnitude', config.cleaningRules)
  const switchMetrics = conditionRTAndAccuracy(mixedSwitch, 'mixed_switch', config.cleaningRules)
  const repeatMetrics = conditionRTAndAccuracy(mixedRepeat, 'mixed_repeat', config.cleaningRules)

  const switchCostRT = switchCost(
    collectValidRTs(mixedSwitch, config.cleaningRules),
    collectValidRTs(mixedRepeat, config.cleaningRules)
  )
  const mixingCostRT = mixingCost(
    collectValidRTs(mixedRepeat, config.cleaningRules),
    collectValidRTs(pureAll, config.cleaningRules)
  )

  const switchCostAccuracy =
    switchMetrics.accuracy !== null && repeatMetrics.accuracy !== null
      ? repeatMetrics.accuracy - switchMetrics.accuracy
      : null

  const mixingCostAccuracy =
    repeatMetrics.accuracy !== null && pureOddMetrics.accuracy !== null && pureMagMetrics.accuracy !== null
      ? repeatMetrics.accuracy - (pureOddMetrics.accuracy + pureMagMetrics.accuracy) / 2
      : null

  return {
    ...base,
    conditionMetrics: {
      pure_odd_even: {
        medianRT: pureOddMetrics.medianRT,
        accuracy: pureOddMetrics.accuracy,
      },
      pure_magnitude: {
        medianRT: pureMagMetrics.medianRT,
        accuracy: pureMagMetrics.accuracy,
      },
      mixed_switch: {
        medianRT: switchMetrics.medianRT,
        accuracy: switchMetrics.accuracy,
      },
      mixed_repeat: {
        medianRT: repeatMetrics.medianRT,
        accuracy: repeatMetrics.accuracy,
      },
    },
    customMetrics: {
      switchCostRT,
      mixingCostRT,
      switchCostAccuracy,
      mixingCostAccuracy,
      postErrorSlowing: postErrorSlowing(trials),
    },
  }
}

export const testDefinition: CognitiveTestDefinition = {
  id: 'taskswitch',
  name: 'Alternância de Tarefas',
  shortName: 'Task Switch',
  domain: 'cognitive_flexibility',
  domains: ['cognitive_flexibility', 'interference_control', 'speed_alertness'],
  description:
    'Tarefa de flexibilidade cognitiva com blocos puros e mistos. A regra muda conforme a indicação visual.',
  duration: '~6 min',
  protocolVersion: PROTOCOL_VERSION,
  practiceConfig: PRACTICE_CONFIG,
  assessmentConfig: ASSESSMENT_CONFIG,
  instructions: {
    title: 'Alternância de Tarefas',
    summary:
      'Responda a números com base na regra indicada pela cor da borda: paridade (azul) ou magnitude (verde).',
    steps: [
      'Um número (1–4 ou 6–9) aparece no centro da tela.',
      'Borda azul — regra de paridade: F se par, J se ímpar.',
      'Borda verde — regra de magnitude: F se menor que 5, J se maior que 5.',
      'Nos blocos mistos, a regra pode mudar de ensaio para ensaio — preste atenção à borda.',
      'Responda o mais rápido e precisamente possível.',
    ],
    keys: [
      { key: 'F', action: 'Par (borda azul) ou menor que 5 (borda verde)' },
      { key: 'J', action: 'Ímpar (borda azul) ou maior que 5 (borda verde)' },
    ],
    tips: [
      'A borda colorida indica qual regra usar — não assuma que é sempre a mesma.',
      'Nos blocos mistos, prepare-se para alternar entre regras.',
      'O número 5 nunca aparece nesta tarefa.',
    ],
  },
  generateTrials: (mode, seed) =>
    generateTaskSwitchTrials(
      mode,
      seed,
      mode === 'assessment' ? ASSESSMENT_CONFIG : PRACTICE_CONFIG
    ),
  scoreSession: scoreTaskSwitchSession,
  primaryMetricKey: 'switchCostRT',
  baselineMetricKeys: [
    'switchCostRT',
    'mixingCostRT',
    'medianCorrectRT',
    'accuracy',
    'postErrorSlowing',
  ],
  metricLabels: {
    switchCostRT: 'Custo de alternância TR (ms)',
    mixingCostRT: 'Custo de mistura TR (ms)',
    switchCostAccuracy: 'Custo de alternância (precisão)',
    mixingCostAccuracy: 'Custo de mistura (precisão)',
    postErrorSlowing: 'Abrandamento pós-erro (ms)',
    medianCorrectRT: 'TR mediano (corretos)',
    accuracy: 'Precisão global',
  },
  metricDirections: {
    switchCostRT: -1,
    mixingCostRT: -1,
    switchCostAccuracy: -1,
    mixingCostAccuracy: -1,
    postErrorSlowing: -1,
    medianCorrectRT: -1,
    accuracy: 1,
  },
}