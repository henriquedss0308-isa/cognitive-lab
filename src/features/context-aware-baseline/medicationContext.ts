/**
 * Classificação medicamentosa — leitura, saneamento e comparação.
 *
 * Duas regras governam este módulo inteiro:
 *
 * 1. **Campo ausente é `unknown`, nunca "não tomou".** Ausência de registro e
 *    registro de ausência são fatos diferentes, e confundi-los colocaria
 *    sessões não classificadas dentro de uma referência contextual.
 *
 * 2. **Nenhuma inferência a partir de texto livre.** Os campos antigos
 *    (`substances.medicationName`, `medicationDose`, `medicationTime`) são
 *    preservados integralmente e NUNCA lidos para classificar: "Venvanse",
 *    "lisdex", "30 mg" ou "estimulante" continuam sendo apenas texto que a
 *    pessoa escreveu. Classificar por substring reescreveria silenciosamente o
 *    passado com base em um palpite.
 */
import type { SessionRecord, TestConditions } from '../../types'
import {
  LISDEXAMFETAMINE_ID,
  type LisdexamfetamineStatus,
  type MedicationContext,
  type MedicationRecord,
} from './types'

const VALID_STATUSES: readonly LisdexamfetamineStatus[] = ['taken', 'not_taken', 'unknown']

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isLisdexamfetamineStatus(value: unknown): value is LisdexamfetamineStatus {
  return typeof value === 'string' && (VALID_STATUSES as readonly string[]).includes(value)
}

/**
 * Normaliza qualquer entrada em um status válido.
 * Valor desconhecido, ausente ou malformado ⇒ `unknown` (fallback seguro).
 */
export function toLisdexamfetamineStatus(value: unknown): LisdexamfetamineStatus {
  return isLisdexamfetamineStatus(value) ? value : 'unknown'
}

/** Texto descritivo opcional (dose/horário): preservado como está, sem interpretação. */
function sanitizeDescriptiveText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function sanitizeTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  return Number.isNaN(new Date(value).getTime()) ? undefined : value
}

/**
 * Sanea o registro de um medicamento.
 *
 * Diferente do contexto emocional (que DESCARTA o dado malformado), aqui o
 * status inválido cai para `unknown` em vez de sumir: `unknown` já é o
 * significado exato de "não sabemos", então preservar dose e horário que a
 * pessoa escreveu é melhor que apagá-los. Um objeto que não é objeto, esse sim,
 * não gera registro nenhum.
 */
export function sanitizeMedicationRecord(value: unknown): MedicationRecord | undefined {
  if (!isPlainObject(value)) return undefined

  const record: MedicationRecord = { status: toLisdexamfetamineStatus(value.status) }
  const dose = sanitizeDescriptiveText(value.dose)
  const time = sanitizeDescriptiveText(value.time)
  const updatedAt = sanitizeTimestamp(value.updatedAt)
  if (dose) record.dose = dose
  if (time) record.time = time
  if (updatedAt) record.updatedAt = updatedAt

  // Registro sem nenhuma informação é equivalente à ausência do campo.
  if (record.status === 'unknown' && !dose && !time) return undefined
  return record
}

export function sanitizeMedicationContext(value: unknown): MedicationContext | undefined {
  if (!isPlainObject(value)) return undefined
  const lisdexamfetamine = sanitizeMedicationRecord(value[LISDEXAMFETAMINE_ID])
  if (!lisdexamfetamine) return undefined
  return { [LISDEXAMFETAMINE_ID]: lisdexamfetamine }
}

/**
 * Aplica o saneamento ao campo `medications` de um objeto de condições, sem
 * tocar em nenhum outro campo — em particular, sem tocar nos campos de
 * medicamento em texto livre, que seguem intactos.
 */
export function withSanitizedMedicationContext<T extends object>(conditions: T): T {
  const source = conditions as { medications?: unknown }
  if (source.medications === undefined) return conditions

  const sanitized = sanitizeMedicationContext(source.medications)
  const next = { ...conditions } as T & { medications?: MedicationContext }
  if (sanitized) next.medications = sanitized
  else delete next.medications
  return next
}

/**
 * Remove o registro medicamentoso de um objeto de condições.
 *
 * Usado ao reaproveitar as condições de uma sessão anterior: sono e ambiente
 * costumam se repetir, mas o estado medicamentoso é um fato do DIA. Copiá-lo
 * registraria como "de hoje" um dado que a pessoa não deu hoje — e, pior,
 * colocaria a sessão em uma referência contextual sem confirmação. Mesmo
 * princípio já aplicado ao contexto emocional.
 */
export function withoutMedicationContext<T extends object>(conditions: T): T {
  if ((conditions as { medications?: unknown }).medications === undefined) return conditions
  const next = { ...conditions } as T & { medications?: MedicationContext }
  delete next.medications
  return next
}

/** Status registrado em um objeto de condições. Ausente ⇒ `unknown`. */
export function getConditionsLisdexamfetamineStatus(
  conditions: TestConditions | undefined
): LisdexamfetamineStatus {
  const medications = (conditions as { medications?: unknown } | undefined)?.medications
  if (!isPlainObject(medications)) return 'unknown'
  const record = medications[LISDEXAMFETAMINE_ID]
  if (!isPlainObject(record)) return 'unknown'
  return toLisdexamfetamineStatus(record.status)
}

/**
 * Status registrado em uma sessão. Fonte única de verdade para toda a
 * funcionalidade: elegibilidade contextual, seleção de referência e composição
 * usam exclusivamente esta função.
 *
 * Sessões gravadas antes desta funcionalidade não têm o campo e portanto são
 * `unknown` — continuam abrindo, aparecendo no histórico e entrando na
 * referência geral, e ficam fora das duas referências contextuais até serem
 * classificadas explicitamente.
 */
export function getSessionLisdexamfetamineStatus(
  session: Pick<SessionRecord, 'checkIn'>
): LisdexamfetamineStatus {
  return getConditionsLisdexamfetamineStatus(session.checkIn)
}

/** Registro completo (status + dose + horário), quando existe. */
export function getSessionMedicationRecord(
  session: Pick<SessionRecord, 'checkIn'>
): MedicationRecord | undefined {
  const medications = (session.checkIn as { medications?: unknown } | undefined)?.medications
  if (!isPlainObject(medications)) return undefined
  return sanitizeMedicationRecord(medications[LISDEXAMFETAMINE_ID])
}

const STATUS_LABELS: Record<LisdexamfetamineStatus, string> = {
  taken: 'Sim',
  not_taken: 'Não',
  unknown: 'Não informado',
}

export function lisdexamfetamineStatusLabel(status: LisdexamfetamineStatus): string {
  return STATUS_LABELS[status]
}

/**
 * Chave canônica do conteúdo. Sanea antes de comparar para que ausência do
 * registro e registro vazio (`status: 'unknown'` sem dose nem horário) —
 * que significam exatamente a mesma coisa — comparem iguais.
 */
function contentKey(record: unknown): string {
  const sanitized = sanitizeMedicationRecord(record)
  if (!sanitized) return ''
  return [sanitized.status, sanitized.dose ?? '-', sanitized.time ?? '-'].join('|')
}

/** Compara apenas o conteúdo registrado — `updatedAt` é ignorado de propósito. */
export function medicationContextChanged(
  previous: MedicationContext | undefined,
  next: MedicationContext | undefined
): boolean {
  return (
    contentKey(previous?.[LISDEXAMFETAMINE_ID]) !== contentKey(next?.[LISDEXAMFETAMINE_ID])
  )
}

/**
 * Carimba `updatedAt` somente quando o conteúdo medicamentoso muda de fato.
 * Reabrir a edição de condições e salvar sem mexer neste campo preserva o
 * carimbo anterior — o mesmo contrato do contexto emocional.
 */
export function touchMedicationContext(
  previous: MedicationContext | undefined,
  next: MedicationContext | undefined,
  now: string = new Date().toISOString()
): MedicationContext | undefined {
  const sanitized = sanitizeMedicationContext(next)
  if (!sanitized) return undefined

  const record = sanitized[LISDEXAMFETAMINE_ID]!
  if (!medicationContextChanged(previous, sanitized)) {
    const keptAt = previous?.[LISDEXAMFETAMINE_ID]?.updatedAt
    return { [LISDEXAMFETAMINE_ID]: keptAt ? { ...record, updatedAt: keptAt } : record }
  }
  return { [LISDEXAMFETAMINE_ID]: { ...record, updatedAt: now } }
}
