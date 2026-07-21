/**
 * Seleção da referência usada para comparar UMA sessão.
 *
 * Árvore de decisão completa (não há outros caminhos):
 *
 * | estado da sessão | referência contextual completa | referência usada |
 * |---|---|---|
 * | `taken`      | sim  | com lisdexanfetamina            |
 * | `taken`      | não  | geral, com aviso de fallback    |
 * | `not_taken`  | sim  | sem lisdexanfetamina            |
 * | `not_taken`  | não  | geral, com aviso de fallback    |
 * | `unknown`    | —    | geral, sem presumir nada        |
 *
 * Se nem a referência geral está disponível, nada é fabricado: a seleção
 * devolve `reference: null` e a interface mantém o comportamento atual de
 * "baseline em construção".
 */
import type { SessionRecord, TestId } from '../../types'
import { getEligibleSessions, getContextualProgress } from './contextualEligibility'
import { buildContextualReference, buildGeneralReference } from './contextualReference'
import { getSessionLisdexamfetamineStatus } from './medicationContext'
import type {
  ContextualReference,
  FallbackReason,
  LisdexamfetamineStatus,
  ReferenceSelection,
} from './types'

function asFallback(
  reference: ContextualReference,
  reason: FallbackReason
): ContextualReference {
  return {
    ...reference,
    metadata: { ...reference.metadata, fallback: true, fallbackReason: reason },
  }
}

export interface SelectReferenceInput {
  /**
   * Universo de sessões consultadas. Quem chama é responsável por EXCLUIR a
   * própria sessão avaliada — igual ao que a tela de resultados já fazia para
   * o baseline geral. É essa exclusão que faz a nona sessão de um contexto ser
   * a primeira comparável à sua referência já completa.
   */
  sessions: SessionRecord[]
  session: Pick<SessionRecord, 'checkIn' | 'testId' | 'protocolVersion'>
  testId: TestId
  protocolVersion: string
  metricKeys: string[]
}

/**
 * Escolhe a referência de uma sessão e devolve, junto, os metadados que tornam
 * a decisão auditável e reproduzível: tipo, IDs usados, contagens, protocolo,
 * se houve fallback e por quê.
 */
export function selectReference({
  sessions,
  session,
  testId,
  protocolVersion,
  metricKeys,
}: SelectReferenceInput): ReferenceSelection {
  const sessionStatus: LisdexamfetamineStatus = getSessionLisdexamfetamineStatus(session)
  const eligible = getEligibleSessions(sessions, testId, protocolVersion)

  const progress = {
    taken: getContextualProgress(eligible, 'taken'),
    notTaken: getContextualProgress(eligible, 'not_taken'),
  }

  const general = buildGeneralReference(sessions, testId, protocolVersion, metricKeys)
  // Sem referência geral consolidada não há comparação a apresentar. Devolver a
  // geral "em construção" aqui manteria o comportamento anterior da tela, que
  // já sabe não exibir z fora de monitoring.
  const generalAvailable = general.stats.phase === 'monitoring'

  if (sessionStatus === 'unknown') {
    return {
      reference: generalAvailable ? asFallback(general, 'unknown_status') : general,
      sessionStatus,
      progress,
    }
  }

  const contextual = buildContextualReference(
    sessions,
    testId,
    protocolVersion,
    metricKeys,
    sessionStatus
  )

  if (contextual.metadata.composition === 'complete') {
    return { reference: contextual, sessionStatus, progress }
  }

  return {
    reference: generalAvailable ? asFallback(general, 'contextual_incomplete') : general,
    sessionStatus,
    progress,
  }
}
