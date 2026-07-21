/**
 * Baseline sensível ao contexto — tipos.
 *
 * O problema que esta funcionalidade resolve: o baseline pessoal usa sessões
 * elegíveis sem olhar as condições registradas nelas. Mediana e MAD podem estar
 * corretos e ainda assim descrever uma MISTURA de contextos muito diferentes.
 *
 * Nesta V1, apenas o estado de lisdexanfetamina seleciona uma referência
 * diferente. Todos os demais dados (sono, cafeína, emoção, sliders) são
 * apresentados como CONTEXTO DESCRITIVO e não entram em nenhum cálculo.
 */
import type { BaselineStats, SessionRecord, TestId } from '../../types'

/**
 * Estado do registro de lisdexanfetamina em uma sessão.
 *
 * `unknown` é um estado de primeira classe e o padrão: campo ausente NUNCA
 * significa "não tomou". É por isso que a interface usa três opções explícitas
 * e não um checkbox — desmarcado seria indistinguível de não respondido.
 */
export type LisdexamfetamineStatus = 'taken' | 'not_taken' | 'unknown'

/**
 * Identificador interno estável do medicamento. Não é marca comercial: nomes
 * comerciais mudam por país e por fabricante, e reaproveitá-los como chave
 * reescreveria o passado das sessões gravadas.
 */
export const LISDEXAMFETAMINE_ID = 'lisdexamfetamine'

/**
 * Registro estruturado de um medicamento nas condições da sessão.
 *
 * Dose e horário continuam descritivos e opcionais — servem para a pessoa
 * reler o próprio registro, nunca para cálculo, classificação ou segmentação
 * de baseline (baseline por dose está explicitamente fora do escopo).
 */
export interface MedicationRecord {
  status: LisdexamfetamineStatus
  dose?: string
  time?: string
  /** Carimbado apenas quando o conteúdo do registro muda (ver `touchMedicationContext`). */
  updatedAt?: string
}

export interface MedicationContext {
  [LISDEXAMFETAMINE_ID]?: MedicationRecord
}

/** Tipo da referência usada em uma comparação. */
export type ReferenceKind =
  | 'general'
  | 'lisdexamfetamine_taken'
  | 'lisdexamfetamine_not_taken'

/** Por que a referência contextual não pôde ser usada. */
export type FallbackReason =
  /** A janela contextual existe mas ainda não tem as 8 sessões. */
  | 'contextual_incomplete'
  /** A sessão não registrou o estado medicamentoso — não se presume nada. */
  | 'unknown_status'

/** Estado de composição de uma referência. */
export type CompositionStatus = 'complete' | 'building' | 'empty'

/**
 * Descrição do contexto medicamentoso de um CONJUNTO de sessões.
 * É um rótulo descritivo para leitura humana — nunca altera scoring.
 */
export type ContextClassification =
  | 'predominantly_taken'
  | 'predominantly_not_taken'
  | 'mixed'
  | 'insufficiently_documented'

/** Metadados auditáveis de uma referência: tudo que a decisão usou. */
export interface ReferenceMetadata {
  kind: ReferenceKind
  testId: TestId
  protocolVersion: string
  /** IDs das sessões que compõem a janela, em ordem determinística. */
  sessionIds: string[]
  sessionCount: number
  composition: CompositionStatus
  /** Quantas sessões a janela contextual exige (8) — `null` na referência geral. */
  requiredCount: number | null
  /** Data da primeira e da última sessão da janela (ISO), quando há sessões. */
  dateRange: { first: string; last: string } | null
  /** `true` quando a referência GERAL foi usada no lugar de uma contextual. */
  fallback: boolean
  fallbackReason?: FallbackReason
}

/**
 * Uma referência pronta para comparação.
 *
 * `stats` tem a forma de `BaselineStats` de propósito: assim a MESMA função
 * `evaluatePrimaryZ` avalia referência geral e contextual, com as mesmas regras
 * de n mínimo, MAD zero e direção da métrica. Nenhuma regra estatística é
 * reimplementada aqui.
 */
export interface ContextualReference {
  metadata: ReferenceMetadata
  stats: BaselineStats
  sessions: SessionRecord[]
}

/** Resultado da seleção de referência para uma sessão. */
export interface ReferenceSelection {
  /**
   * Referência escolhida. Quando nem a geral está consolidada, vem a geral
   * ainda em construção (`stats.phase !== 'monitoring'`): `evaluatePrimaryZ`
   * já se recusa a comparar nesse estado, então nada é fabricado e a tela
   * mantém o comportamento atual de "baseline em construção".
   */
  reference: ContextualReference
  /** Estado medicamentoso da sessão avaliada. */
  sessionStatus: LisdexamfetamineStatus
  /** Progresso das duas janelas contextuais, para exibição (X/8). */
  progress: {
    taken: { count: number; required: number }
    notTaken: { count: number; required: number }
  }
}
