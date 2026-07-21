/**
 * Escala de percepção momentânea da relação.
 *
 * O valor interno é contínuo (0–100) e é o que se persiste; a interface
 * prioriza o rótulo qualitativo derivado, para não sugerir precisão científica
 * onde existe apenas uma percepção relatada.
 */
import type { PerceptionConfidence } from './types'

export const RELATIONSHIP_RATING_MIN = 0
export const RELATIONSHIP_RATING_MAX = 100

/** Âncoras da escala, igualmente espaçadas a cada 20 pontos. */
export const RELATIONSHIP_ANCHORS = [
  { value: 0, label: 'Ruim' },
  { value: 20, label: 'Paia' },
  { value: 40, label: 'Meh' },
  { value: 60, label: 'Ok' },
  { value: 80, label: 'Boa' },
  { value: 100, label: 'Muito boa' },
] as const

const ANCHOR_STEP = 20

/**
 * Rating válido para PERSISTIR: número finito dentro de [0, 100].
 * Valores fora da faixa não são "consertados" na persistência — inventar um
 * valor equivaleria a fabricar um autorrelato que a pessoa nunca deu.
 */
export function isValidRelationshipRating(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= RELATIONSHIP_RATING_MIN &&
    value <= RELATIONSHIP_RATING_MAX
  )
}

export function clampRelationshipRating(value: number): number {
  if (!Number.isFinite(value)) return RELATIONSHIP_RATING_MIN
  return Math.min(RELATIONSHIP_RATING_MAX, Math.max(RELATIONSHIP_RATING_MIN, value))
}

/**
 * Converte o valor numérico no rótulo qualitativo. Função pura e determinística.
 *
 * - valor exatamente em uma âncora ⇒ rótulo da âncora ("Ok");
 * - valor entre duas âncoras ⇒ rótulo composto ("Ok–Boa").
 *
 * Diferente da persistência, a EXIBIÇÃO é tolerante: valores fora da faixa são
 * limitados às extremidades para que nenhuma tela quebre com dado importado
 * malformado. Entrada não numérica devolve `null` (nada a exibir).
 */
export function relationshipRatingLabel(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null

  const clamped = clampRelationshipRating(value)
  const lastIndex = RELATIONSHIP_ANCHORS.length - 1
  const index = Math.floor(clamped / ANCHOR_STEP)

  if (index >= lastIndex) return RELATIONSHIP_ANCHORS[lastIndex].label
  if (clamped % ANCHOR_STEP === 0) return RELATIONSHIP_ANCHORS[index].label
  return `${RELATIONSHIP_ANCHORS[index].label}–${RELATIONSHIP_ANCHORS[index + 1].label}`
}

export const CONFIDENCE_LEVELS: { value: PerceptionConfidence; label: string }[] = [
  { value: 1, label: 'Muito pouco' },
  { value: 2, label: 'Pouco' },
  { value: 3, label: 'Médio' },
  { value: 4, label: 'Bastante' },
  { value: 5, label: 'Muito' },
]

export function isValidConfidence(value: unknown): value is PerceptionConfidence {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  )
}

export function confidenceLabel(value: unknown): string | null {
  if (!isValidConfidence(value)) return null
  return CONFIDENCE_LEVELS.find((l) => l.value === value)?.label ?? null
}

/**
 * Pergunta da seção. Personaliza discretamente quando há um rótulo de relação
 * configurado localmente; sem ele, a linguagem permanece genérica.
 */
export function relationshipQuestion(relationshipLabel?: string): string {
  const trimmed = relationshipLabel?.trim()
  if (!trimmed) return 'Neste momento, como sinto que nossa relação está?'
  return `Neste momento, como sinto que minha relação com ${trimmed} está?`
}
