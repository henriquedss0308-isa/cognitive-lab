import type { SessionRecord } from '../types'
import { getSession, saveSession } from './repository'
import { prepareSessionForStorage } from './sanitize'

/**
 * Combina o registro final produzido em handleComplete com o registro
 * já persistido da MESMA sessão (criado no início ou retomado).
 *
 * Invariantes (spec §7):
 * - checkIn/batteryId/batteryPosition/startedAt do registro original nunca
 *   são perdidos silenciosamente (o resume não passa pelo formulário de
 *   condições — antes desta função, o check-in original era apagado);
 * - deviceInfo autoritativo é o do INÍCIO da sessão; se o dispositivo da
 *   conclusão divergir (deviceType/inputMethod), a sessão recebe flag e
 *   aviso e é rebaixada para valid_with_warnings.
 */
export function mergeCompletionRecord(
  fresh: SessionRecord,
  existing: SessionRecord | undefined
): SessionRecord {
  if (!existing || existing.sessionId !== fresh.sessionId) return fresh

  const checkIn = fresh.checkIn ?? existing.checkIn
  const batteryId = fresh.batteryId ?? existing.batteryId
  const batteryPosition = fresh.batteryPosition ?? existing.batteryPosition
  const startedAt = existing.startedAt ?? fresh.startedAt
  const originalDevice = existing.deviceInfo ?? fresh.deviceInfo

  const deviceChanged =
    originalDevice.deviceType !== fresh.deviceInfo.deviceType
  const inputChanged =
    originalDevice.inputMethod !== fresh.deviceInfo.inputMethod

  const flags = { ...fresh.flags }
  const flagMessages = [...fresh.flagMessages]
  if (deviceChanged) {
    flags.differentDevice = true
    flagMessages.push('Dispositivo mudou entre o início e a conclusão da sessão.')
  }
  if (inputChanged) {
    flags.differentInputMethod = true
    flagMessages.push('Método de entrada mudou entre o início e a conclusão da sessão.')
  }

  const quality =
    (deviceChanged || inputChanged) && fresh.quality === 'valid'
      ? 'valid_with_warnings'
      : fresh.quality

  return {
    ...fresh,
    startedAt,
    checkIn,
    batteryId,
    batteryPosition,
    deviceInfo: originalDevice,
    quality,
    flags,
    flagMessages,
    result: fresh.result
      ? {
          ...fresh.result,
          startedAt,
          checkIn,
          batteryId,
          batteryPosition,
          deviceInfo: originalDevice,
          quality,
          flags,
          flagMessages,
        }
      : fresh.result,
  }
}

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