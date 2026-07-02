import type { SessionRecord } from '../types'
import { getTest } from '../tests/registry'

export function canResumeSession(session: SessionRecord): boolean {
  if (session.status !== 'in_progress' && session.status !== 'interrupted') return false
  if (session.mode !== 'assessment') return false
  const test = getTest(session.testId)
  return !!test.isAdaptive && !!session.adaptiveState
}

export function resumeBlockedReason(session: SessionRecord): string | null {
  if (session.status !== 'in_progress' && session.status !== 'interrupted') {
    return 'Sessão já finalizada.'
  }
  if (canResumeSession(session)) return null
  return 'Este protocolo fixo não permite continuar sem comprometer a sequência. Reinicie e mantenha a sessão interrompida no histórico.'
}