import type { BatteryDefinition, TestId } from '../types'

const ROTATIONS: TestId[][] = [
  ['sart', 'nback', 'gonogo', 'taskswitch'],
  ['nback', 'taskswitch', 'sart', 'gonogo'],
  ['taskswitch', 'gonogo', 'nback', 'sart'],
  ['gonogo', 'sart', 'taskswitch', 'nback'],
]

const SHORT_ROTATION: TestId[] = ['simple_rt', 'stroop', 'gonogo', 'sart', 'nback']

export const BATTERIES: BatteryDefinition[] = [
  {
    id: 'quick',
    name: 'Check-in Rápido',
    description: 'Avaliação breve de velocidade e um teste rotativo.',
    estimatedMinutes: '3–5 min',
    tests: ['simple_rt'],
  },
  {
    id: 'daily',
    name: 'Bateria Diária',
    description: 'Combinação equilibrada de atenção, executivo e memória.',
    estimatedMinutes: '12–20 min',
    tests: ['simple_rt', 'sart', 'stroop', 'nback'],
    rotationIndex: 0,
  },
  {
    id: 'standard',
    name: 'Bateria Padrão',
    description: 'Avaliação completa dos domínios principais.',
    estimatedMinutes: '30–45 min',
    tests: [
      'simple_rt',
      'choice_rt',
      'sart',
      'stroop',
      'gonogo',
      'nback',
      'taskswitch',
    ],
  },
  {
    id: 'custom',
    name: 'Bateria Personalizada',
    description: 'Escolha seus testes e ordem.',
    estimatedMinutes: 'Variável',
    tests: [],
  },
]

export function getDailyTests(rotationIndex: number): TestId[] {
  const rot = ROTATIONS[rotationIndex % ROTATIONS.length]
  return ['choice_rt', ...rot]
}

export function getQuickRotatingTest(sessionCount: number): TestId {
  return SHORT_ROTATION[sessionCount % SHORT_ROTATION.length]
}

export function getBattery(id: string): BatteryDefinition | undefined {
  return BATTERIES.find((b) => b.id === id)
}