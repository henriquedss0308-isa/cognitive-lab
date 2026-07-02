import type { AppBackup, SessionRecord } from '../types'
import { getAllSessions, getSettings, importSessions, saveSettings } from './repository'

const BACKUP_VERSION = '1.0.0'

export async function exportFullBackup(): Promise<AppBackup> {
  const sessions = await getAllSessions()
  const settings = await getSettings()
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    sessions,
    settings,
  }
}

export function downloadJSON(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadCSV(rows: Record<string, unknown>[], filename: string): void {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h]
          if (val === null || val === undefined) return ''
          const str = String(val)
          return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str
        })
        .join(',')
    ),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function trialsToCSV(sessions: SessionRecord[]): Record<string, unknown>[] {
  return sessions.flatMap((s) =>
    s.trials.map((t) => ({
      trialId: t.trialId,
      sessionId: t.sessionId,
      testId: t.testId,
      mode: t.mode,
      protocolVersion: t.protocolVersion,
      blockIndex: t.blockIndex,
      trialIndex: t.trialIndex,
      condition: t.condition,
      stimulus: t.stimulus,
      expectedResponse: t.expectedResponse,
      actualResponse: t.actualResponse,
      correct: t.correct,
      reactionTimeMs: t.reactionTimeMs,
      stimulusOnsetTimestamp: t.stimulusOnsetTimestamp,
      responseTimestamp: t.responseTimestamp,
      invalidReason: t.invalidReason ?? '',
      windowFocused: t.windowFocused,
      visibilityState: t.visibilityState,
      deviceType: t.deviceType,
      inputMethod: t.inputMethod,
      startedAt: s.startedAt,
      isDemo: s.isDemo,
    }))
  )
}

export function resultsToCSV(sessions: SessionRecord[]): Record<string, unknown>[] {
  return sessions
    .filter((s) => s.result)
    .map((s) => ({
      sessionId: s.sessionId,
      testId: s.testId,
      mode: s.mode,
      protocolVersion: s.protocolVersion,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      quality: s.quality,
      medianRT: s.result!.rtMetrics.medianCorrectRT,
      accuracy: s.result!.accuracyMetrics.accuracy,
      rtCV: s.result!.rtMetrics.rtCoefficientOfVariation,
      validTrials: s.result!.rtMetrics.validTrialCount,
      isDemo: s.isDemo,
      ...s.result!.customMetrics,
    }))
}

export async function importBackup(data: unknown): Promise<{ success: boolean; message: string }> {
  if (!data || typeof data !== 'object') {
    return { success: false, message: 'Formato de backup inválido.' }
  }

  const backup = data as AppBackup
  if (!backup.version || !Array.isArray(backup.sessions)) {
    return { success: false, message: 'Estrutura de backup inválida.' }
  }

  for (const session of backup.sessions) {
    if (!session.sessionId || !session.testId || !session.trials) {
      return { success: false, message: `Sessão inválida: ${session.sessionId ?? 'desconhecida'}` }
    }
  }

  await importSessions(backup.sessions)
  if (backup.settings) await saveSettings(backup.settings)

  return {
    success: true,
    message: `Backup importado: ${backup.sessions.length} sessões.`,
  }
}