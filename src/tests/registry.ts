import type { TestId } from '../types'
import type { CognitiveTestDefinition } from './types'
import { testDefinition as simpleRt } from './simple-rt'
import { testDefinition as choiceRt } from './choice-rt'
import { testDefinition as stroop } from './stroop'
import { testDefinition as gonogo } from './gonogo'
import { testDefinition as sart } from './sart'
import { testDefinition as nback } from './nback'
import { testDefinition as corsi } from './corsi'
import { testDefinition as taskswitch } from './taskswitch'

export const ALL_TESTS: CognitiveTestDefinition[] = [
  simpleRt,
  choiceRt,
  stroop,
  gonogo,
  sart,
  nback,
  corsi,
  taskswitch,
]

export const TEST_MAP: Record<TestId, CognitiveTestDefinition> = Object.fromEntries(
  ALL_TESTS.map((t) => [t.id, t])
) as Record<TestId, CognitiveTestDefinition>

export const DOMAIN_LABELS: Record<string, string> = {
  speed_alertness: 'Velocidade e Alerta',
  sustained_attention: 'Atenção Sustentada',
  selective_attention: 'Atenção Seletiva',
  interference_control: 'Controle de Interferência',
  motor_inhibition: 'Inibição Motora',
  working_memory: 'Memória de Trabalho',
  cognitive_flexibility: 'Flexibilidade Cognitiva',
  intraindividual_variability: 'Variabilidade Intraindividual',
}

export function getTest(id: TestId): CognitiveTestDefinition {
  return TEST_MAP[id]
}