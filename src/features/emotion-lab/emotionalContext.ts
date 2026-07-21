/**
 * Saneamento e comparação do contexto emocional.
 *
 * Princípio: dado malformado é DESCARTADO campo a campo, nunca "corrigido" para
 * um valor plausível — um autorrelato inventado seria pior que a ausência do
 * dado. O restante da sessão (trials, métricas, demais condições) permanece
 * intacto qualquer que seja o lixo recebido, e nenhuma função aqui lança.
 */
import { isKnownEmotionId } from './emotionCatalog'
import {
  isValidConfidence,
  isValidRelationshipRating,
} from './relationshipScale'
import {
  EMOTIONAL_CONTEXT_VERSION,
  type EmotionalContext,
  type EmotionIntensity,
  type EmotionSelection,
  type RelationshipPerception,
} from './types'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isValidIntensity(value: unknown): value is EmotionIntensity {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
}

/** Emoção válida = id conhecido no catálogo + intensidade inteira de 1 a 5. */
function sanitizeSelection(value: unknown): EmotionSelection | undefined {
  if (!isPlainObject(value)) return undefined
  if (!isKnownEmotionId(value.emotionId)) return undefined
  if (!isValidIntensity(value.intensity)) return undefined
  return { emotionId: value.emotionId as string, intensity: value.intensity }
}

function sanitizePerception(value: unknown): RelationshipPerception | undefined {
  if (!isPlainObject(value)) return undefined
  if (!isValidRelationshipRating(value.rating)) return undefined
  const perception: RelationshipPerception = { rating: value.rating }
  // Confiança inválida não invalida a percepção — só some.
  if (isValidConfidence(value.confidence)) perception.confidence = value.confidence
  return perception
}

function sanitizeTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  return Number.isNaN(new Date(value).getTime()) ? undefined : value
}

/** Há alguma resposta de fato registrada? Contexto "vazio" não deve ser persistido. */
export function hasEmotionalContent(context: EmotionalContext | undefined): boolean {
  if (!context) return false
  return (
    context.primaryEmotion !== undefined ||
    context.secondaryEmotion !== undefined ||
    context.unidentifiedEmotion === true ||
    context.relationshipPerception !== undefined
  )
}

/**
 * Normaliza qualquer entrada em um `EmotionalContext` seguro, ou `undefined`
 * quando nada aproveitável sobra. Campos desconhecidos são descartados
 * (lista branca). Invariantes aplicadas:
 *
 * - emoção secundária igual à principal ⇒ secundária descartada;
 * - secundária sem principal válida ⇒ descartada (estado incoerente: a
 *   interface só oferece a secundária depois da principal);
 * - "não consigo identificar" com emoção principal ⇒ a flag cede, pois a
 *   emoção nomeada é a informação mais específica das duas.
 */
export function sanitizeEmotionalContext(value: unknown): EmotionalContext | undefined {
  if (!isPlainObject(value)) return undefined

  const primaryEmotion = sanitizeSelection(value.primaryEmotion)

  let secondaryEmotion = sanitizeSelection(value.secondaryEmotion)
  if (secondaryEmotion && (!primaryEmotion || secondaryEmotion.emotionId === primaryEmotion.emotionId)) {
    secondaryEmotion = undefined
  }

  const unidentifiedEmotion = value.unidentifiedEmotion === true && !primaryEmotion
  const relationshipPerception = sanitizePerception(value.relationshipPerception)
  const updatedAt = sanitizeTimestamp(value.updatedAt)

  const context: EmotionalContext = { version: EMOTIONAL_CONTEXT_VERSION }
  if (primaryEmotion) context.primaryEmotion = primaryEmotion
  if (secondaryEmotion) context.secondaryEmotion = secondaryEmotion
  if (unidentifiedEmotion) context.unidentifiedEmotion = true
  if (relationshipPerception) context.relationshipPerception = relationshipPerception

  if (!hasEmotionalContent(context)) return undefined
  if (updatedAt) context.updatedAt = updatedAt
  return context
}

/**
 * Aplica o saneamento ao campo `emotionalContext` de um objeto de condições,
 * sem tocar em nenhum outro campo. Tipagem estrutural de propósito: evita que
 * o módulo do Emotion Lab dependa dos tipos de sessão da aplicação.
 */
export function withSanitizedEmotionalContext<T extends object>(conditions: T): T {
  const source = conditions as { emotionalContext?: unknown }
  if (source.emotionalContext === undefined) return conditions

  const sanitized = sanitizeEmotionalContext(source.emotionalContext)
  const next = { ...conditions } as T & { emotionalContext?: EmotionalContext }
  if (sanitized) next.emotionalContext = sanitized
  else delete next.emotionalContext
  return next
}

/**
 * Remove o contexto emocional de um objeto de condições.
 *
 * Usado ao reaproveitar as condições de uma sessão anterior: sono, ambiente e
 * substâncias costumam se repetir, mas emoção e percepção da relação são
 * momentâneas — copiá-las faria a tela afirmar um relato que a pessoa não deu
 * agora.
 */
export function withoutEmotionalContext<T extends object>(conditions: T): T {
  if ((conditions as { emotionalContext?: unknown }).emotionalContext === undefined) {
    return conditions
  }
  const next = { ...conditions } as T & { emotionalContext?: EmotionalContext }
  delete next.emotionalContext
  return next
}

function contentKey(context: EmotionalContext | undefined): string {
  if (!hasEmotionalContent(context)) return ''
  const c = context as EmotionalContext
  const sel = (s?: EmotionSelection) => (s ? `${s.emotionId}:${s.intensity}` : '-')
  const perception = c.relationshipPerception
    ? `${c.relationshipPerception.rating}:${c.relationshipPerception.confidence ?? '-'}`
    : '-'
  return [
    sel(c.primaryEmotion),
    sel(c.secondaryEmotion),
    c.unidentifiedEmotion === true ? 'u' : '-',
    perception,
  ].join('|')
}

/** Compara apenas o conteúdo relatado — `updatedAt` é ignorado de propósito. */
export function emotionalContextChanged(
  previous: EmotionalContext | undefined,
  next: EmotionalContext | undefined
): boolean {
  return contentKey(previous) !== contentKey(next)
}

/**
 * Carimba `updatedAt` somente quando o conteúdo emocional/relacional mudou.
 * Reabrir o formulário e salvar sem alterar nada preserva o carimbo anterior.
 */
export function touchEmotionalContext(
  previous: EmotionalContext | undefined,
  next: EmotionalContext | undefined,
  now: string = new Date().toISOString()
): EmotionalContext | undefined {
  const sanitized = sanitizeEmotionalContext(next)
  if (!sanitized) return undefined
  if (!emotionalContextChanged(previous, sanitized)) {
    const keptAt = previous?.updatedAt
    return keptAt ? { ...sanitized, updatedAt: keptAt } : sanitized
  }
  return { ...sanitized, updatedAt: now }
}
