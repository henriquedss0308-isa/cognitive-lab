import type { SessionRecord } from '../types'
import { getSession, saveSession } from './repository'
import { prepareSessionForStorage } from './sanitize'

export class SessionPersistenceError extends Error {
  readonly sessionId: string

  constructor(message: string, sessionId: string) {
    super(message)
    this.name = 'SessionPersistenceError'
    this.sessionId = sessionId
  }
}

export function assertSessionId(session: SessionRecord, expectedId: string): void {
  if (!expectedId) {
    throw new SessionPersistenceError('sessionId indefinido — navegação bloqueada', expectedId)
  }
  if (session.sessionId !== expectedId) {
    throw new SessionPersistenceError(
      `ID inconsistente: esperado ${expectedId}, recebido ${session.sessionId}`,
      expectedId
    )
  }
}

/**
 * Persiste sessão completed e confirma leitura imediata pelo mesmo sessionId.
 * Deve ser chamado após o último trial estar em memória e antes de navigate().
 */
export async function completeAssessmentSession(session: SessionRecord): Promise<SessionRecord> {
  assertSessionId(session, session.sessionId)

  if (session.status !== 'completed') {
    throw new SessionPersistenceError(
      `status deve ser completed antes da navegação (atual: ${session.status})`,
      session.sessionId
    )
  }
  if (!session.result) {
    throw new SessionPersistenceError(
      'result ausente — sessão não pode ser concluída',
      session.sessionId
    )
  }

  const prepared = prepareSessionForStorage(session)

  try {
    await saveSession(prepared)
  } catch (err) {
    if (import.meta.env.DEV) {
      console.error('[completeAssessmentSession] saveSession falhou', err)
    }
    throw new SessionPersistenceError(
      `Falha ao salvar sessão ${session.sessionId}`,
      session.sessionId
    )
  }

  const verified = await getSession(session.sessionId)
  if (!verified) {
    throw new SessionPersistenceError(
      `Sessão ${session.sessionId} não encontrada após saveSession`,
      session.sessionId
    )
  }
  if (!verified.result) {
    throw new SessionPersistenceError(
      `Sessão ${session.sessionId} salva sem result`,
      session.sessionId
    )
  }
  if (verified.sessionId !== session.sessionId) {
    throw new SessionPersistenceError(
      `Leitura retornou ID diferente: ${verified.sessionId}`,
      session.sessionId
    )
  }

  return verified
}