/**
 * Resumo descritivo do contexto de uma sessão comparado ao contexto das
 * sessões que compõem a referência utilizada.
 *
 * O que este módulo faz: mostra números brutos lado a lado (valor da sessão,
 * mediana da referência, quantas sessões da referência tinham o dado).
 *
 * O que este módulo NÃO faz, por decisão explícita:
 *
 * - não pontua, não pondera e não combina campos num índice;
 * - não calcula similaridade entre contextos;
 * - não seleciona referência (só o estado medicamentoso faz isso);
 * - não afirma nem sugere causalidade — dormir menos e ir pior no mesmo dia é
 *   uma coincidência descrita, não uma explicação.
 *
 * Toda agregação opera apenas sobre valores presentes, e o `n` reportado é
 * sempre o número de sessões que de fato tinham o dado. Conjunto vazio devolve
 * `null` — nunca zero fingido, nunca divisão por zero, nunca NaN.
 */
import type { SessionRecord, TestConditions } from '../../types'
import { getEmotionById } from '../emotion-lab/emotionCatalog'
import type { EmotionQuadrant } from '../emotion-lab/types'
import { getSessionLisdexamfetamineStatus } from './medicationContext'
import { median } from '../../statistics/basic'
import type { ContextClassification, LisdexamfetamineStatus } from './types'

/** Distribuição de um campo de três estados nas sessões da referência. */
export interface StatusComposition {
  taken: number
  notTaken: number
  unknown: number
  total: number
}

/** Agregado de um campo numérico: mediana e quantas sessões tinham o dado. */
export interface NumericSummary {
  median: number | null
  n: number
  total: number
}

/** Distribuição de um campo booleano (ex.: cafeína). */
export interface BooleanComposition {
  yes: number
  no: number
  unknown: number
  total: number
}

function conditionsOf(session: SessionRecord): TestConditions | undefined {
  return session.checkIn
}

/**
 * Mediana de um campo numérico sobre as sessões que o possuem.
 * Valores não finitos são ignorados como ausentes.
 */
export function summarizeNumeric(
  sessions: SessionRecord[],
  extract: (conditions: TestConditions | undefined) => number | undefined | null
): NumericSummary {
  const values: number[] = []
  for (const session of sessions) {
    const value = extract(conditionsOf(session))
    if (typeof value === 'number' && Number.isFinite(value)) values.push(value)
  }
  return { median: median(values), n: values.length, total: sessions.length }
}

export function summarizeBoolean(
  sessions: SessionRecord[],
  extract: (conditions: TestConditions | undefined) => boolean | undefined | null
): BooleanComposition {
  let yes = 0
  let no = 0
  let unknown = 0
  for (const session of sessions) {
    const value = extract(conditionsOf(session))
    if (value === true) yes++
    else if (value === false) no++
    else unknown++
  }
  return { yes, no, unknown, total: sessions.length }
}

/** Composição medicamentosa de um conjunto de sessões. */
export function summarizeMedicationComposition(sessions: SessionRecord[]): StatusComposition {
  let taken = 0
  let notTaken = 0
  let unknown = 0
  for (const session of sessions) {
    const status = getSessionLisdexamfetamineStatus(session)
    if (status === 'taken') taken++
    else if (status === 'not_taken') notTaken++
    else unknown++
  }
  return { taken, notTaken, unknown, total: sessions.length }
}

/**
 * Fração dos registros documentados a partir da qual um conjunto é descrito
 * como "predominantemente" de um contexto. Limiar explícito e arbitrário — por
 * isso é um rótulo de leitura, nunca um insumo de cálculo.
 */
export const PREDOMINANCE_THRESHOLD = 0.7

/**
 * Classificação DESCRITIVA da composição. Serve para a pessoa entender do que
 * sua referência é feita; não altera scoring, elegibilidade nem z-score.
 */
export function classifyComposition(composition: StatusComposition): ContextClassification {
  const { taken, notTaken, total } = composition
  const documented = taken + notTaken

  // Metade ou mais sem registro: descrever "predominância" seria enganoso.
  if (total === 0 || documented * 2 < total) return 'insufficiently_documented'
  if (taken / documented >= PREDOMINANCE_THRESHOLD) return 'predominantly_taken'
  if (notTaken / documented >= PREDOMINANCE_THRESHOLD) return 'predominantly_not_taken'
  return 'mixed'
}

const CLASSIFICATION_LABELS: Record<ContextClassification, string> = {
  predominantly_taken: 'Contexto registrado predominantemente com lisdexanfetamina',
  predominantly_not_taken: 'Contexto registrado predominantemente sem lisdexanfetamina',
  mixed: 'Contexto misto',
  insufficiently_documented: 'Contexto insuficientemente documentado',
}

export function classificationLabel(classification: ContextClassification): string {
  return CLASSIFICATION_LABELS[classification]
}

/** Minutos desde a meia-noite local, ou `null` para data não parseável. */
export function minutesSinceMidnight(isoDate: string): number | null {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return null
  return date.getHours() * 60 + date.getMinutes()
}

export function formatMinutesOfDay(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes)) return null
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440
  const h = Math.floor(normalized / 60)
  const m = normalized % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Horário mediano das sessões da referência.
 *
 * Limitação conhecida e documentada: a mediana é calculada sobre minutos desde
 * a meia-noite local, ou seja, é uma mediana LINEAR sobre um dado circular. Um
 * conjunto que mistura sessões às 23h e às 01h produz um valor no meio da
 * tarde, que não descreve nenhuma das duas. Preferiu-se manter a conta simples
 * e explicar a limitação a introduzir estatística circular numa informação que
 * é apenas contextual.
 */
export function summarizeTimeOfDay(sessions: SessionRecord[]): NumericSummary {
  const values: number[] = []
  for (const session of sessions) {
    const minutes = minutesSinceMidnight(session.startedAt)
    if (minutes !== null) values.push(minutes)
  }
  return { median: median(values), n: values.length, total: sessions.length }
}

export type QuadrantComposition = Record<EmotionQuadrant | 'none', number>

/** Ordem de exibição dos quadrantes, com o "sem registro" sempre por último. */
export const QUADRANT_ORDER_WITH_NONE: (EmotionQuadrant | 'none')[] = [
  'yellow',
  'green',
  'blue',
  'red',
  'none',
]

/**
 * Distribuição dos quadrantes emocionais das sessões da referência.
 * Emoção não reconhecida por esta versão e ausência de registro contam como
 * `none` — nenhuma é inventada nem inferida.
 */
export function summarizeQuadrants(sessions: SessionRecord[]): QuadrantComposition {
  const composition: QuadrantComposition = { yellow: 0, green: 0, blue: 0, red: 0, none: 0 }
  for (const session of sessions) {
    const emotionId = session.checkIn?.emotionalContext?.primaryEmotion?.emotionId
    const quadrant = getEmotionById(emotionId)?.quadrant
    if (quadrant) composition[quadrant]++
    else composition.none++
  }
  return composition
}

/** Quantas sessões da referência registraram percepção da relação. */
export function countRelationshipPerceptions(sessions: SessionRecord[]): number {
  return sessions.filter(
    (s) => s.checkIn?.emotionalContext?.relationshipPerception !== undefined
  ).length
}

/** Sliders de estado atual comparados nesta V1. */
export const CURRENT_STATE_FIELDS = [
  'energy',
  'focus',
  'mood',
  'stress',
  'motivation',
  'sleepiness',
] as const

export type CurrentStateField = (typeof CURRENT_STATE_FIELDS)[number]

export const CURRENT_STATE_LABELS: Record<CurrentStateField, string> = {
  energy: 'Energia',
  focus: 'Foco',
  mood: 'Humor',
  stress: 'Estresse',
  motivation: 'Motivação',
  sleepiness: 'Sonolência',
}

/** Uma linha de comparação: valor atual × mediana da referência. */
export interface NumericComparison {
  label: string
  current: number | null
  reference: NumericSummary
}

export interface ContextComparison {
  sleepHours: NumericComparison
  sleepQuality: NumericComparison
  currentState: NumericComparison[]
  hunger: NumericComparison
  hydration: NumericComparison
  timeOfDay: { currentMinutes: number | null; reference: NumericSummary }
  caffeine: { current: boolean | undefined; reference: BooleanComposition }
  medication: { current: LisdexamfetamineStatus; reference: StatusComposition }
  emotion: {
    currentEmotionId: string | undefined
    currentQuadrant: EmotionQuadrant | undefined
    reference: QuadrantComposition
  }
  relationship: {
    currentRating: number | undefined
    referenceCount: number
    referenceTotal: number
  }
  /** Há alguma linha com dado suficiente para exibir? */
  hasAnyData: boolean
}

function numeric(
  label: string,
  current: number | undefined | null,
  sessions: SessionRecord[],
  extract: (c: TestConditions | undefined) => number | undefined | null
): NumericComparison {
  return {
    label,
    current: typeof current === 'number' && Number.isFinite(current) ? current : null,
    reference: summarizeNumeric(sessions, extract),
  }
}

/**
 * Monta a comparação completa entre o contexto de uma sessão e o das sessões
 * da referência. Função pura: recebe sessões, devolve números.
 */
export function buildContextComparison(
  session: SessionRecord,
  referenceSessions: SessionRecord[]
): ContextComparison {
  const checkIn = session.checkIn
  const primaryEmotionId = checkIn?.emotionalContext?.primaryEmotion?.emotionId

  const partial: Omit<ContextComparison, 'hasAnyData'> = {
    sleepHours: numeric('Horas dormidas', checkIn?.sleep?.hours, referenceSessions, (c) => c?.sleep?.hours),
    sleepQuality: numeric('Qualidade do sono', checkIn?.sleep?.quality, referenceSessions, (c) => c?.sleep?.quality),
    currentState: CURRENT_STATE_FIELDS.map((field) =>
      numeric(
        CURRENT_STATE_LABELS[field],
        checkIn?.currentState?.[field],
        referenceSessions,
        (c) => c?.currentState?.[field]
      )
    ),
    hunger: numeric('Fome', checkIn?.nutrition?.hunger, referenceSessions, (c) => c?.nutrition?.hunger),
    hydration: numeric('Hidratação', checkIn?.nutrition?.hydration, referenceSessions, (c) => c?.nutrition?.hydration),
    timeOfDay: {
      currentMinutes: minutesSinceMidnight(session.startedAt),
      reference: summarizeTimeOfDay(referenceSessions),
    },
    caffeine: {
      current: checkIn?.substances?.caffeine,
      reference: summarizeBoolean(referenceSessions, (c) => c?.substances?.caffeine),
    },
    medication: {
      current: getSessionLisdexamfetamineStatus(session),
      reference: summarizeMedicationComposition(referenceSessions),
    },
    emotion: {
      currentEmotionId: primaryEmotionId,
      currentQuadrant: getEmotionById(primaryEmotionId)?.quadrant,
      reference: summarizeQuadrants(referenceSessions),
    },
    relationship: {
      currentRating: checkIn?.emotionalContext?.relationshipPerception?.rating,
      referenceCount: countRelationshipPerceptions(referenceSessions),
      referenceTotal: referenceSessions.length,
    },
  }

  const numericRows = [
    partial.sleepHours,
    partial.sleepQuality,
    partial.hunger,
    partial.hydration,
    ...partial.currentState,
  ]

  const hasAnyData =
    numericRows.some((row) => row.current !== null || row.reference.n > 0) ||
    partial.caffeine.current !== undefined ||
    partial.caffeine.reference.yes + partial.caffeine.reference.no > 0 ||
    partial.medication.current !== 'unknown' ||
    partial.medication.reference.taken + partial.medication.reference.notTaken > 0 ||
    partial.emotion.currentQuadrant !== undefined ||
    partial.timeOfDay.reference.n > 0

  return { ...partial, hasAnyData }
}

/** "5h40" a partir de 5.67 horas. Entrada inválida devolve `null`. */
export function formatSleepHours(hours: number | null): string | null {
  if (hours === null || !Number.isFinite(hours) || hours < 0) return null
  const whole = Math.floor(hours)
  const minutes = Math.round((hours - whole) * 60)
  if (minutes === 60) return `${whole + 1}h00`
  return `${whole}h${String(minutes).padStart(2, '0')}`
}
