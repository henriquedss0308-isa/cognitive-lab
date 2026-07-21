/**
 * Elegibilidade e ordenação das sessões que podem compor uma referência
 * contextual.
 *
 * Regra metodológica desta V1 (documentada em docs/CONTEXT_AWARE_BASELINE.md):
 *
 * 1. As três primeiras sessões elegíveis GERAIS do teste continuam sendo a
 *    familiarização global.
 * 2. A prática aprendida no teste não reinicia por causa do estado
 *    medicamentoso — por isso a familiarização é global e não por contexto.
 * 3. Depois dessas três, cada contexto coleta a própria janela.
 *
 * A elegibilidade base é EXATAMENTE a do baseline geral
 * (`getValidAssessmentSessions`): sessão inválida, demo, incompleta, com
 * protocolo diferente ou sem prática suficiente continua inelegível. Este
 * módulo não afrouxa nem endurece nenhum critério — apenas particiona.
 */
import type { SessionRecord, TestId } from '../../types'
import { FAMILIARIZATION_SESSIONS, getValidAssessmentSessions } from '../../statistics/baseline'
import { getSessionLisdexamfetamineStatus } from './medicationContext'
import type { LisdexamfetamineStatus } from './types'

/** Tamanho da janela de uma referência contextual. */
export const CONTEXTUAL_REFERENCE_SESSIONS = 8

/**
 * Ordem determinística: `startedAt` crescente, empate resolvido por
 * `sessionId`.
 *
 * O baseline geral ordena só por `startedAt` e é deixado exatamente como está
 * (mudá-lo poderia deslocar janelas já consolidadas). Aqui o desempate
 * explícito é necessário porque a janela contextual é posicional: sem ele,
 * duas sessões com o mesmo timestamp poderiam entrar ou sair da referência
 * conforme a ordem em que o array chegou da leitura do IndexedDB.
 */
export function orderSessionsDeterministically(sessions: SessionRecord[]): SessionRecord[] {
  return [...sessions].sort((a, b) => {
    const ta = new Date(a.startedAt).getTime()
    const tb = new Date(b.startedAt).getTime()
    if (ta !== tb) return ta - tb
    return a.sessionId.localeCompare(b.sessionId)
  })
}

/** Sessões elegíveis da identidade longitudinal, em ordem determinística. */
export function getEligibleSessions(
  sessions: SessionRecord[],
  testId: TestId,
  protocolVersion: string,
  scoringVersion?: unknown
): SessionRecord[] {
  return orderSessionsDeterministically(
    getValidAssessmentSessions(sessions, testId, protocolVersion, scoringVersion)
  )
}

export interface FamiliarizationSplit {
  /** As três primeiras elegíveis gerais — nunca entram em referência alguma. */
  familiarization: SessionRecord[]
  /** Tudo depois da familiarização global, de onde as janelas contextuais saem. */
  afterFamiliarization: SessionRecord[]
}

/**
 * Separa a familiarização global do restante.
 *
 * A familiarização é contada sobre as sessões elegíveis GERAIS: a curva de
 * aprendizado do teste é do teste, não do contexto medicamentoso. Um usuário
 * que fez as três primeiras sessões medicado não precisa "reaprender" o
 * protocolo ao registrar a primeira sessão sem medicação.
 */
export function splitFamiliarization(eligible: SessionRecord[]): FamiliarizationSplit {
  return {
    familiarization: eligible.slice(0, FAMILIARIZATION_SESSIONS),
    afterFamiliarization: eligible.slice(FAMILIARIZATION_SESSIONS),
  }
}

/**
 * Sessões elegíveis para a referência de um contexto: as posteriores à
 * familiarização global que registraram EXPLICITAMENTE aquele estado.
 *
 * Sessões com estado desconhecido não entram em nenhuma das duas referências
 * contextuais — não se presume uso nem ausência.
 */
export function getContextualCandidates(
  eligible: SessionRecord[],
  status: Exclude<LisdexamfetamineStatus, 'unknown'>
): SessionRecord[] {
  return splitFamiliarization(eligible).afterFamiliarization.filter(
    (s) => getSessionLisdexamfetamineStatus(s) === status
  )
}

/**
 * Janela congelada de um contexto: as PRIMEIRAS oito sessões elegíveis daquele
 * contexto após a familiarização global.
 *
 * O congelamento é posicional, como no baseline geral: sessões novas entram
 * depois da oitava e portanto nunca alteram a janela já formada.
 */
export function getContextualWindow(
  eligible: SessionRecord[],
  status: Exclude<LisdexamfetamineStatus, 'unknown'>
): SessionRecord[] {
  return getContextualCandidates(eligible, status).slice(0, CONTEXTUAL_REFERENCE_SESSIONS)
}

/** Progresso X/8 de uma janela contextual, para exibição. */
export function getContextualProgress(
  eligible: SessionRecord[],
  status: Exclude<LisdexamfetamineStatus, 'unknown'>
): { count: number; required: number } {
  return {
    count: getContextualWindow(eligible, status).length,
    required: CONTEXTUAL_REFERENCE_SESSIONS,
  }
}
