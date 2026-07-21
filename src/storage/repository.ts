import type { AppSettings, SessionRecord, SessionStatus, TestId, TestMode, TestConditions } from '../types'
import { withoutEmotionalContext } from '../features/emotion-lab/emotionalContext'
import { withoutMedicationContext } from '../features/context-aware-baseline/medicationContext'
import { DEFAULT_SETTINGS, getDB } from './db'
import { prepareSessionForStorage } from './sanitize'

function normalizeSession(session: SessionRecord): SessionRecord {
  return {
    ...session,
    status: session.status ?? 'completed',
  }
}

export async function saveSession(session: SessionRecord): Promise<void> {
  const db = await getDB()
  const record = prepareSessionForStorage(normalizeSession(session))
  try {
    await db.put('sessions', record)
  } catch (err) {
    if (import.meta.env.DEV) {
      console.error('[saveSession] IndexedDB put falhou', { sessionId: session.sessionId, err })
    }
    throw err
  }
}

const TERMINAL_STATUSES: SessionStatus[] = ['completed', 'abandoned']

export async function appendTrialToSession(
  sessionId: string,
  trial: SessionRecord['trials'][0],
  adaptiveState?: Record<string, unknown>
): Promise<void> {
  const db = await getDB()
  const existing = await db.get('sessions', sessionId)
  if (!existing) return

  const status = existing.status ?? 'completed'
  if (TERMINAL_STATUSES.includes(status)) {
    if (import.meta.env.DEV) {
      console.warn(
        `[appendTrialToSession] ignorado — sessão ${sessionId} já está ${status}`
      )
    }
    return
  }

  const last = existing.trials[existing.trials.length - 1]
  if (last?.trialId === trial.trialId) return

  const updated: SessionRecord = {
    ...existing,
    trials: [...existing.trials, trial],
    trialProgress: trial.trialIndex + 1,
    adaptiveState: adaptiveState ?? existing.adaptiveState,
    status: 'in_progress',
  }
  try {
    await db.put('sessions', prepareSessionForStorage(updated))
  } catch (err) {
    if (import.meta.env.DEV) {
      console.error('[appendTrialToSession] IndexedDB put falhou', { sessionId, err })
    }
    throw err
  }
}

export async function updateSessionStatus(
  sessionId: string,
  status: SessionStatus,
  extra?: Partial<SessionRecord>
): Promise<void> {
  const db = await getDB()
  const existing = await db.get('sessions', sessionId)
  if (!existing) return
  // Invariante (spec §8): status terminal nunca é sobrescrito — protege
  // contra ESC/interrupções tardias rebaixando uma sessão já concluída.
  const current = existing.status ?? 'completed'
  if (TERMINAL_STATUSES.includes(current) && status !== current) {
    if (import.meta.env.DEV) {
      console.warn(
        `[updateSessionStatus] ignorado — sessão ${sessionId} é terminal (${current}), tentativa: ${status}`
      )
    }
    return
  }
  await db.put('sessions', prepareSessionForStorage({ ...existing, ...extra, status }))
}

export async function updateSessionConditions(
  sessionId: string,
  checkIn: TestConditions
): Promise<SessionRecord | undefined> {
  const db = await getDB()
  const existing = await db.get('sessions', sessionId)
  if (!existing) return undefined

  const updated: SessionRecord = {
    ...existing,
    checkIn,
    result: existing.result
      ? {
          ...existing.result,
          checkIn,
        }
      : existing.result,
  }

  const record = prepareSessionForStorage(normalizeSession(updated))
  await db.put('sessions', record)
  return record
}

/**
 * Reload/fechamento de aba não desmontam o TestRunner, então sessões de
 * avaliação podem ficar 'in_progress' para sempre. Na inicialização do app,
 * qualquer in_progress mais antiga que maxAgeMs vira 'interrupted'
 * (spec §7). Se outra aba ainda estiver rodando a sessão, o próximo
 * appendTrialToSession a revive para in_progress — transitório inofensivo.
 */
export async function markStaleInProgressAsInterrupted(
  maxAgeMs = 60_000,
  now = Date.now()
): Promise<number> {
  const db = await getDB()
  const all = await db.getAll('sessions')
  const stale = all.filter((s) => {
    if ((s.status ?? 'completed') !== 'in_progress') return false
    const started = new Date(s.startedAt).getTime()
    return Number.isFinite(started) && now - started > maxAgeMs
  })
  if (stale.length === 0) return 0

  const tx = db.transaction('sessions', 'readwrite')
  await Promise.all([
    ...stale.map((s) =>
      tx.store.put(
        prepareSessionForStorage({
          ...s,
          status: 'interrupted',
          quality: 'invalid',
          flags: { ...s.flags, incomplete: true },
          flagMessages: [
            ...(s.flagMessages ?? []),
            'Sessão interrompida (aplicação fechada ou recarregada).',
          ],
        })
      )
    ),
    tx.done,
  ])
  return stale.length
}

export async function getIncompleteSessions(): Promise<SessionRecord[]> {
  const db = await getDB()
  const all = await db.getAll('sessions')
  return all
    .map(normalizeSession)
    .filter((s) => s.status === 'in_progress' || s.status === 'interrupted')
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
}

export async function getSession(sessionId: string): Promise<SessionRecord | undefined> {
  const db = await getDB()
  const s = await db.get('sessions', sessionId)
  return s ? normalizeSession(s) : undefined
}

export async function getAllSessions(): Promise<SessionRecord[]> {
  const db = await getDB()
  return (await db.getAll('sessions')).map(normalizeSession)
}

export async function getSessionsByTest(testId: TestId): Promise<SessionRecord[]> {
  const db = await getDB()
  return (await db.getAllFromIndex('sessions', 'by-test', testId)).map(normalizeSession)
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = await getDB()
  await db.delete('sessions', sessionId)
}

export async function deleteAllSessions(): Promise<void> {
  const db = await getDB()
  const all = await db.getAll('sessions')
  const tx = db.transaction('sessions', 'readwrite')
  await Promise.all([...all.map((s) => tx.store.delete(s.sessionId)), tx.done])
}

export async function deleteDemoSessions(): Promise<void> {
  const db = await getDB()
  const all = await db.getAll('sessions')
  const demo = all.filter((s) => s.isDemo)
  const tx = db.transaction('sessions', 'readwrite')
  await Promise.all([...demo.map((s) => tx.store.delete(s.sessionId)), tx.done])
}

export async function getSettings(): Promise<AppSettings> {
  const db = await getDB()
  const stored = await db.get('settings', 'app')
  if (!stored) return DEFAULT_SETTINGS
  const { key: _, ...settings } = stored
  return settings
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDB()
  await db.put('settings', { ...settings, key: 'app' })
}

export async function importSessions(sessions: SessionRecord[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('sessions', 'readwrite')
  await Promise.all([
    ...sessions.map((s) => tx.store.put(prepareSessionForStorage(normalizeSession(s)))),
    tx.done,
  ])
}

/**
 * Importação idempotente: sessionId já existente é IGNORADO (dados locais
 * nunca são sobrescritos por backup — spec §10). Retorna o que aconteceu.
 */
export async function importSessionsSkipExisting(
  sessions: SessionRecord[]
): Promise<{ added: string[]; skipped: string[] }> {
  const db = await getDB()
  const tx = db.transaction('sessions', 'readwrite')
  const existing = new Set(await tx.store.getAllKeys())
  const added: string[] = []
  const skipped: string[] = []
  const writes: Promise<unknown>[] = []
  for (const s of sessions) {
    if (existing.has(s.sessionId)) {
      skipped.push(s.sessionId)
      continue
    }
    writes.push(tx.store.put(prepareSessionForStorage(normalizeSession(s))))
    added.push(s.sessionId)
  }
  await Promise.all([...writes, tx.done])
  return { added, skipped }
}

export function filterSessions(
  sessions: SessionRecord[],
  filters: {
    testId?: TestId
    mode?: TestMode
    quality?: string
    isDemo?: boolean
    status?: SessionStatus
    fromDate?: string
    toDate?: string
  }
): SessionRecord[] {
  return sessions.filter((s) => {
    if (filters.testId && s.testId !== filters.testId) return false
    if (filters.mode && s.mode !== filters.mode) return false
    if (filters.quality && s.quality !== filters.quality) return false
    if (filters.isDemo !== undefined && s.isDemo !== filters.isDemo) return false
    if (filters.status && s.status !== filters.status) return false
    if (filters.fromDate && s.startedAt < filters.fromDate) return false
    if (filters.toDate && s.startedAt > filters.toDate) return false
    return true
  })
}

export async function getLatestConditions(): Promise<TestConditions | undefined> {
  const db = await getDB()
  const all = await db.getAll('sessions')
  const withConditions = all
    // Sessões demo carregam check-ins fictícios — nunca reaproveitar.
    .filter((s) => !s.isDemo && s.checkIn && Object.keys(s.checkIn).length > 0)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())

  const latest = withConditions[0]?.checkIn
  // Emoção e percepção da relação são momentâneas: reaproveitá-las registraria
  // como "de agora" um relato dado em outro dia. O estado medicamentoso é um
  // fato do DIA e sai pelo mesmo motivo, agravado: copiá-lo colocaria a sessão
  // numa referência contextual sem que a pessoa tenha confirmado nada hoje.
  return latest ? withoutMedicationContext(withoutEmotionalContext(latest)) : undefined
}
