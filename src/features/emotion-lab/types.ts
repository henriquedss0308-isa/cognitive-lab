/**
 * Emotion Lab — tipos do contexto emocional e relacional de uma sessão.
 *
 * Estes dados são EXCLUSIVAMENTE contextuais: nunca alteram trials, scoring,
 * métricas, qualidade, validade ou composição do baseline. Ficam pendurados em
 * `TestConditions.emotionalContext` (o `checkIn` da sessão), que nenhum caminho
 * de pontuação lê.
 */

/** Quadrante afetivo (energia × agradabilidade). A cor é classificação, não significado isolado. */
export type EmotionQuadrant = 'yellow' | 'green' | 'blue' | 'red'

export type EmotionEnergy = 'low' | 'high'
export type EmotionPleasantness = 'pleasant' | 'unpleasant'

export type EmotionIntensity = 1 | 2 | 3 | 4 | 5
export type PerceptionConfidence = 1 | 2 | 3 | 4 | 5

export interface EmotionDefinition {
  /** Identificador estável, desacoplado do rótulo visível (rótulo pode mudar sem migrar dados). */
  id: string
  label: string
  quadrant: EmotionQuadrant
  pleasantness: EmotionPleasantness
  energy: EmotionEnergy
}

export interface QuadrantDefinition {
  id: EmotionQuadrant
  /** Nome da cor em português — a interface nunca comunica só pela cor. */
  colorName: string
  /** Descrição textual do eixo, ex.: "Energia alta e desagradável". */
  description: string
  pleasantness: EmotionPleasantness
  energy: EmotionEnergy
  /** Token de cor já existente no tema do Cognitive Lab. */
  cssVar: string
}

export interface EmotionSelection {
  emotionId: string
  intensity: EmotionIntensity
}

export interface RelationshipPerception {
  /** Escala contínua 0–100. O rótulo qualitativo é derivado, nunca armazenado. */
  rating: number
  confidence?: PerceptionConfidence
}

export const EMOTIONAL_CONTEXT_VERSION = 1

/**
 * Registro do que a pessoa relata sentir e de como percebe a relação NAQUELE
 * momento. Todos os campos são opcionais; ausência é um estado válido.
 */
export interface EmotionalContext {
  version: typeof EMOTIONAL_CONTEXT_VERSION
  primaryEmotion?: EmotionSelection
  secondaryEmotion?: EmotionSelection
  /** "Não consigo identificar agora" — mutuamente exclusivo com `primaryEmotion`. */
  unidentifiedEmotion?: boolean
  relationshipPerception?: RelationshipPerception
  updatedAt?: string
}
