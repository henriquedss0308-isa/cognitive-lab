import type { AppSettings, SessionRecord, SessionStatus, TestId, TestMode, TestConditions } from '../types'
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
  await db.put('sessions', { ...existing, ...extra, status })
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
  await Promise.all([...sessions.map((s) => tx.store.put(normalizeSession(s))), tx.done])
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
    .filter((s) => s.checkIn && Object.keys(s.checkIn).length > 0)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
  
  return withConditions[0]?.checkIn
}
