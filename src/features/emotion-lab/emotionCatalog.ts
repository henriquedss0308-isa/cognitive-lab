/**
 * Catálogo de emoções do Emotion Lab — fonte única, pensada para expansão.
 *
 * Para acrescentar uma emoção: adicione uma entrada com `id` novo e estável.
 * NUNCA reaproveite nem renomeie um `id` já publicado — sessões gravadas
 * referenciam o id, não o rótulo. Rótulos podem ser reescritos livremente.
 */
import type {
  EmotionDefinition,
  EmotionQuadrant,
  QuadrantDefinition,
} from './types'

/**
 * Os quatro quadrantes. As cores reutilizam tokens já existentes no tema —
 * a cor é uma classificação visual/analítica e nunca o único portador de
 * significado: nome e descrição acompanham sempre.
 */
export const QUADRANTS: Record<EmotionQuadrant, QuadrantDefinition> = {
  yellow: {
    id: 'yellow',
    colorName: 'Amarelo',
    description: 'Energia alta e agradável',
    pleasantness: 'pleasant',
    energy: 'high',
    cssVar: 'var(--color-lab-warning)',
  },
  green: {
    id: 'green',
    colorName: 'Verde',
    description: 'Energia baixa e agradável',
    pleasantness: 'pleasant',
    energy: 'low',
    cssVar: 'var(--color-lab-success)',
  },
  blue: {
    id: 'blue',
    colorName: 'Azul',
    description: 'Energia baixa e desagradável',
    pleasantness: 'unpleasant',
    energy: 'low',
    cssVar: 'var(--color-lab-accent)',
  },
  red: {
    id: 'red',
    colorName: 'Vermelho',
    description: 'Energia alta e desagradável',
    pleasantness: 'unpleasant',
    energy: 'high',
    cssVar: 'var(--color-lab-danger)',
  },
}

export const QUADRANT_ORDER: EmotionQuadrant[] = ['yellow', 'green', 'blue', 'red']

function build(
  quadrant: EmotionQuadrant,
  entries: [id: string, label: string][]
): EmotionDefinition[] {
  const { pleasantness, energy } = QUADRANTS[quadrant]
  return entries.map(([id, label]) => ({ id, label, quadrant, pleasantness, energy }))
}

export const EMOTION_CATALOG: EmotionDefinition[] = [
  ...build('yellow', [
    ['joyful', 'Alegre'],
    ['lively', 'Animado'],
    ['enthusiastic', 'Entusiasmado'],
    ['hopeful', 'Esperançoso'],
    ['excited', 'Empolgado'],
    ['energized', 'Energizado'],
  ]),
  ...build('green', [
    ['calm', 'Calmo'],
    ['peaceful', 'Tranquilo'],
    ['comfortable', 'Confortável'],
    ['content', 'Satisfeito'],
    ['secure', 'Seguro'],
    ['relaxed', 'Relaxado'],
  ]),
  ...build('blue', [
    ['sad', 'Triste'],
    ['discouraged', 'Desanimado'],
    ['tired', 'Cansado'],
    ['empty', 'Vazio'],
    ['lonely', 'Solitário'],
    ['disappointed', 'Decepcionado'],
  ]),
  ...build('red', [
    ['anxious', 'Ansioso'],
    ['irritated', 'Irritado'],
    ['stressed', 'Estressado'],
    ['frustrated', 'Frustrado'],
    ['worried', 'Preocupado'],
    ['restless', 'Agitado'],
  ]),
]

const BY_ID = new Map(EMOTION_CATALOG.map((e) => [e.id, e]))

/** Retorna a definição da emoção ou `undefined` para id desconhecido — nunca lança. */
export function getEmotionById(id: unknown): EmotionDefinition | undefined {
  if (typeof id !== 'string') return undefined
  return BY_ID.get(id)
}

export function isKnownEmotionId(id: unknown): boolean {
  return getEmotionById(id) !== undefined
}

export function getEmotionsByQuadrant(quadrant: EmotionQuadrant): EmotionDefinition[] {
  return EMOTION_CATALOG.filter((e) => e.quadrant === quadrant)
}

/** Descrição acessível do quadrante, ex.: "Vermelho · Energia alta e desagradável". */
export function describeQuadrant(quadrant: EmotionQuadrant): string {
  const q = QUADRANTS[quadrant]
  return `${q.colorName} · ${q.description}`
}
