import type { AppBackup, SessionRecord, TestConditions } from '../types'
import { withSanitizedEmotionalContext } from '../features/emotion-lab/emotionalContext'
import { withSanitizedMedicationContext } from '../features/context-aware-baseline/medicationContext'
import {
  getAllSessions,
  getSettings,
  importSessionsSkipExisting,
  saveSettings,
} from './repository'

const BACKUP_VERSION = '1.0.0'

const VALID_TEST_IDS = new Set([
  'simple_rt', 'choice_rt', 'stroop', 'gonogo', 'sart', 'nback', 'corsi', 'taskswitch',
])
const VALID_MODES = new Set(['assessment', 'training'])
const VALID_QUALITIES = new Set(['valid', 'valid_with_warnings', 'invalid'])
const VALID_STATUSES = new Set(['in_progress', 'completed', 'abandoned', 'interrupted'])

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

export interface ImportReport {
  success: boolean
  message: string
  imported: number
  skipped: number
  rejected: { sessionId: string; reason: string }[]
  baselineWarning: boolean
}

/**
 * Validação estrutural estrita de UMA sessão de backup (spec §10a).
 * Retorna o motivo da rejeição ou null se aceitável.
 */
export function validateImportedSession(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'registro não é um objeto'
  }
  const s = value as Record<string, unknown>
  if (typeof s.sessionId !== 'string' || s.sessionId.length === 0) {
    return 'sessionId ausente ou inválido'
  }
  if (typeof s.testId !== 'string' || !VALID_TEST_IDS.has(s.testId)) {
    return `testId desconhecido: ${String(s.testId)}`
  }
  if (typeof s.mode !== 'string' || !VALID_MODES.has(s.mode)) {
    return `mode inválido: ${String(s.mode)}`
  }
  if (typeof s.quality !== 'string' || !VALID_QUALITIES.has(s.quality)) {
    return `quality inválida: ${String(s.quality)}`
  }
  if (s.status !== undefined && (typeof s.status !== 'string' || !VALID_STATUSES.has(s.status))) {
    return `status inválido: ${String(s.status)}`
  }
  if (typeof s.protocolVersion !== 'string' || s.protocolVersion.length === 0) {
    return 'protocolVersion ausente'
  }
  if (typeof s.startedAt !== 'string' || Number.isNaN(new Date(s.startedAt).getTime())) {
    return 'startedAt ausente ou não parseável'
  }
  if (!Array.isArray(s.trials)) {
    return 'trials não é uma lista'
  }
  for (const t of s.trials as unknown[]) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) return 'trial não é um objeto'
    const trial = t as Record<string, unknown>
    if (typeof trial.trialId !== 'string') return 'trial sem trialId'
    if (typeof trial.correct !== 'boolean') return `trial ${trial.trialId}: correct não é booleano`
    if (
      trial.reactionTimeMs !== null &&
      trial.reactionTimeMs !== undefined &&
      typeof trial.reactionTimeMs !== 'number'
    ) {
      return `trial ${trial.trialId}: reactionTimeMs inválido`
    }
  }
  if (s.deviceInfo !== undefined && (typeof s.deviceInfo !== 'object' || s.deviceInfo === null)) {
    return 'deviceInfo inválido'
  }
  if (s.result !== undefined && (typeof s.result !== 'object' || s.result === null)) {
    return 'result inválido'
  }
  return null
}

/**
 * Campos contextuais de backup passam por saneamento em vez de rejeitar a
 * sessão: descartar trials por causa de um campo contextual malformado seria
 * destrutivo. O que não sobrevive à validação simplesmente some (spec §10a).
 *
 * No registro medicamentoso, um `status` desconhecido não apaga o registro:
 * cai para `unknown`, que é exatamente o significado de "não sabemos" e mantém
 * a sessão fora das referências contextuais até classificação explícita.
 */
function sanitizeImportedCheckIn(checkIn: TestConditions | undefined): TestConditions | undefined {
  if (!checkIn || typeof checkIn !== 'object' || Array.isArray(checkIn)) return undefined
  return withSanitizedMedicationContext(withSanitizedEmotionalContext(checkIn))
}

function normalizeImportedSession(s: SessionRecord): SessionRecord {
  const normalized: SessionRecord = {
    ...s,
    flags: s.flags && typeof s.flags === 'object' ? s.flags : {},
    flagMessages: Array.isArray(s.flagMessages) ? s.flagMessages : [],
    isDemo: s.isDemo === true,
    practiceCompleted: s.practiceCompleted === true,
    randomizationSeed: typeof s.randomizationSeed === 'number' ? s.randomizationSeed : 0,
  }

  const checkIn = sanitizeImportedCheckIn(s.checkIn)
  if (checkIn) normalized.checkIn = checkIn
  else delete normalized.checkIn

  if (normalized.result) {
    const resultCheckIn = sanitizeImportedCheckIn(normalized.result.checkIn)
    normalized.result = { ...normalized.result }
    if (resultCheckIn) normalized.result.checkIn = resultCheckIn
    else delete normalized.result.checkIn
  }

  return normalized
}

/**
 * Importa um backup sem jamais sobrescrever dados locais (spec §10):
 * - validação por sessão com motivo de rejeição (atomicidade por item);
 * - sessionId existente ⇒ ignorado;
 * - settings do backup só se o banco local está vazio;
 * - aviso quando sessões importadas antecedem as locais (possível
 *   recomposição da janela de baseline — spec §3.2).
 */
export async function importBackup(data: unknown): Promise<ImportReport> {
  const fail = (message: string): ImportReport => ({
    success: false,
    message,
    imported: 0,
    skipped: 0,
    rejected: [],
    baselineWarning: false,
  })

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return fail('Formato de backup inválido.')
  }

  const backup = data as AppBackup
  if (typeof backup.version !== 'string' || !Array.isArray(backup.sessions)) {
    return fail('Estrutura de backup inválida (version/sessions).')
  }

  const rejected: ImportReport['rejected'] = []
  const acceptable: SessionRecord[] = []
  for (const session of backup.sessions) {
    const reason = validateImportedSession(session)
    if (reason) {
      const id =
        session && typeof session === 'object' && typeof (session as SessionRecord).sessionId === 'string'
          ? (session as SessionRecord).sessionId
          : '(sem id)'
      rejected.push({ sessionId: id, reason })
    } else {
      acceptable.push(normalizeImportedSession(session))
    }
  }

  if (acceptable.length === 0) {
    return {
      success: backup.sessions.length === 0,
      message:
        backup.sessions.length === 0
          ? 'Backup vazio — nada a importar.'
          : `Nenhuma sessão importada: ${rejected.length} rejeitada(s) por estrutura inválida.`,
      imported: 0,
      skipped: 0,
      rejected,
      baselineWarning: false,
    }
  }

  const localBefore = await getAllSessions()
  const { added, skipped } = await importSessionsSkipExisting(acceptable)

  const addedSet = new Set(added)
  const newestLocalByKey = new Map<string, number>()
  for (const s of localBefore) {
    const key = `${s.testId}::${s.protocolVersion}`
    const t = new Date(s.startedAt).getTime()
    newestLocalByKey.set(key, Math.max(newestLocalByKey.get(key) ?? -Infinity, t))
  }
  const baselineWarning = acceptable.some((s) => {
    if (!addedSet.has(s.sessionId) || s.mode !== 'assessment') return false
    const newest = newestLocalByKey.get(`${s.testId}::${s.protocolVersion}`)
    return newest !== undefined && new Date(s.startedAt).getTime() < newest
  })

  if (backup.settings && localBefore.length === 0) {
    await saveSettings(backup.settings)
  }

  const parts = [`${added.length} sessão(ões) importada(s)`]
  if (skipped.length > 0) parts.push(`${skipped.length} já existia(m) e foi(ram) mantida(s)`)
  if (rejected.length > 0) parts.push(`${rejected.length} rejeitada(s) por estrutura inválida`)
  if (baselineWarning) {
    parts.push(
      'Atenção: sessões importadas são anteriores às locais e podem recompor a janela do seu baseline'
    )
  }

  return {
    success: rejected.length < backup.sessions.length || backup.sessions.length === 0,
    message: parts.join(' · ') + '.',
    imported: added.length,
    skipped: skipped.length,
    rejected,
    baselineWarning,
  }
}