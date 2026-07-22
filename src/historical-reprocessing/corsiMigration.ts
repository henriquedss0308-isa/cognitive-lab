import type { DeviceInfo, TrialRecord } from '../types'
import { testDefinition as corsi } from '../tests/corsi'
import { stableStringify } from './canonical'
import { analyzeCorsiDryRun, projectRelevantResult } from './corsiDryRun'
import type {
  MigratedSessionAudit,
  PreparedCorsiMigration,
} from './migrationTypes'
import {
  HISTORICAL_REPROCESSOR_TOOL_VERSION,
  LEGACY_CORSI_SCORING_VERSION,
  REPLAY_CORSI_SCORING_VERSION,
  type CorsiDryRunAnalysis,
  type HistoricalReprocessingReport,
  type ResultHasher,
} from './types'

export class MigrationValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationValidationError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function own(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function requireBackup(value: unknown): Record<string, unknown> & { sessions: unknown[] } {
  if (!isRecord(value) || !Array.isArray(value.sessions)) {
    throw new MigrationValidationError('O backup informado não possui um array sessions válido.')
  }
  return value as Record<string, unknown> & { sessions: unknown[] }
}

function requireAuditReport(value: unknown): HistoricalReprocessingReport {
  if (!isRecord(value)) {
    throw new MigrationValidationError('O relatório de auditoria precisa ser um objeto JSON.')
  }
  if (value.toolVersion !== HISTORICAL_REPROCESSOR_TOOL_VERSION || value.dryRun !== true) {
    throw new MigrationValidationError('O arquivo não é um relatório dry-run compatível.')
  }
  if (
    typeof value.generatedAt !== 'string' ||
    Number.isNaN(Date.parse(value.generatedAt)) ||
    !isRecord(value.inputFile) ||
    typeof value.inputFile.sizeBytes !== 'number' ||
    typeof value.inputFile.sha256Before !== 'string' ||
    typeof value.inputFile.sha256After !== 'string' ||
    typeof value.inputFile.unchanged !== 'boolean' ||
    !isRecord(value.backup) ||
    !isRecord(value.summary) ||
    !Array.isArray(value.candidateSessions) ||
    !Array.isArray(value.skippedSessions)
  ) {
    throw new MigrationValidationError('O relatório dry-run possui estrutura inválida.')
  }
  return value as unknown as HistoricalReprocessingReport
}

function reportAnalysis(report: HistoricalReprocessingReport): CorsiDryRunAnalysis {
  return {
    backup: report.backup,
    summary: report.summary,
    candidateSessions: report.candidateSessions,
    skippedSessions: report.skippedSessions,
  }
}

function assertApprovedAnalysisMatches(
  approved: HistoricalReprocessingReport,
  current: CorsiDryRunAnalysis
): void {
  if (stableStringify(reportAnalysis(approved)) !== stableStringify(current)) {
    throw new MigrationValidationError(
      'A análise atual não coincide integralmente com o relatório dry-run aprovado.'
    )
  }
  if (
    approved.summary.nonReprocessable !== 0 ||
    current.summary.nonReprocessable !== 0 ||
    current.candidateSessions.some((candidate) => candidate.eligibility !== 'eligible')
  ) {
    throw new MigrationValidationError('Existe candidata Corsi não reprocessável; migração recusada.')
  }
  if (current.candidateSessions.length === 0) {
    throw new MigrationValidationError(
      'O relatório aprovado não contém candidatas Corsi legacy; migração sem efeito recusada.'
    )
  }

  const ids = current.candidateSessions.map((candidate) => candidate.sessionId)
  if (ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) {
    throw new MigrationValidationError('As candidatas aprovadas não possuem sessionIds únicos e válidos.')
  }
}

function omitResult(session: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...session }
  delete copy.result
  return copy
}

function resultScoringVersion(session: Record<string, unknown>): string | null {
  if (!isRecord(session.result)) return null
  return typeof session.result.scoringVersion === 'string'
    ? session.result.scoringVersion
    : null
}

function copyOptionalResultField(
  target: Record<string, unknown>,
  key: string,
  primary: Record<string, unknown>,
  secondary?: Record<string, unknown>
): void {
  if (own(primary, key) && primary[key] !== undefined) {
    target[key] = structuredClone(primary[key])
  } else if (secondary && own(secondary, key) && secondary[key] !== undefined) {
    target[key] = structuredClone(secondary[key])
  }
}

function buildPersistedResult(
  session: Record<string, unknown>,
  scored: ReturnType<typeof corsi.scoreSession>
): Record<string, unknown> {
  if (!isRecord(session.result)) {
    throw new MigrationValidationError('A candidata perdeu o resultado original durante a migração.')
  }
  const oldResult = session.result
  const completedAt =
    typeof session.completedAt === 'string'
      ? session.completedAt
      : typeof oldResult.completedAt === 'string'
        ? oldResult.completedAt
        : null
  const isDemo =
    typeof session.isDemo === 'boolean'
      ? session.isDemo
      : typeof oldResult.isDemo === 'boolean'
        ? oldResult.isDemo
        : null

  if (completedAt === null || Number.isNaN(Date.parse(completedAt))) {
    throw new MigrationValidationError(
      `Sessão ${String(session.sessionId)} não possui completedAt persistido válido.`
    )
  }
  if (isDemo === null) {
    throw new MigrationValidationError(
      `Sessão ${String(session.sessionId)} não possui isDemo persistido válido.`
    )
  }

  const result: Record<string, unknown> = {
    ...structuredClone(scored),
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    completedAt,
    isDemo,
  }
  copyOptionalResultField(result, 'baselinePhase', oldResult)
  copyOptionalResultField(result, 'batteryId', oldResult, session)
  copyOptionalResultField(result, 'batteryPosition', oldResult, session)
  copyOptionalResultField(result, 'checkIn', oldResult, session)
  return result
}

function assertOnlyApprovedSessionsChanged(
  originalValue: unknown,
  migratedValue: unknown,
  approvedIds: ReadonlySet<string>
): void {
  const original = requireBackup(originalValue)
  const migrated = requireBackup(migratedValue)
  const originalTop: Record<string, unknown> = { ...original }
  const migratedTop: Record<string, unknown> = { ...migrated }
  delete originalTop.sessions
  delete migratedTop.sessions
  if (stableStringify(originalTop) !== stableStringify(migratedTop)) {
    throw new MigrationValidationError('A estrutura superior do backup foi alterada.')
  }
  if (original.sessions.length !== migrated.sessions.length) {
    throw new MigrationValidationError('A quantidade ou a ordem de sessões foi alterada.')
  }

  for (let index = 0; index < original.sessions.length; index++) {
    const before = original.sessions[index]
    const after = migrated.sessions[index]
    if (!isRecord(before) || !isRecord(after)) {
      if (stableStringify(before) !== stableStringify(after)) {
        throw new MigrationValidationError(`A sessão na posição ${index} foi alterada indevidamente.`)
      }
      continue
    }
    const id = typeof before.sessionId === 'string' ? before.sessionId : null
    if (id === null || !approvedIds.has(id)) {
      if (stableStringify(before) !== stableStringify(after)) {
        throw new MigrationValidationError(
          `A sessão não aprovada ${id ?? `na posição ${index}`} foi alterada.`
        )
      }
      continue
    }
    if (after.sessionId !== id || stableStringify(omitResult(before)) !== stableStringify(omitResult(after))) {
      throw new MigrationValidationError(`A sessão aprovada ${id} mudou fora de session.result.`)
    }
    if (resultScoringVersion(after) !== REPLAY_CORSI_SCORING_VERSION) {
      throw new MigrationValidationError(`A sessão aprovada ${id} não recebeu a scoringVersion atual.`)
    }
  }
}

export function corsiScoringVersionDistribution(backupValue: unknown): Record<string, number> {
  const backup = requireBackup(backupValue)
  const distribution: Record<string, number> = {}
  for (const value of backup.sessions) {
    if (!isRecord(value) || value.testId !== 'corsi') continue
    const version = resultScoringVersion(value) ?? '(missing)'
    distribution[version] = (distribution[version] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(distribution).sort(([left], [right]) => left.localeCompare(right)))
}

export async function prepareCorsiMigration(options: {
  backupValue: unknown
  auditReportValue: unknown
  inputSha256: string
  inputSizeBytes: number
  hashResult: ResultHasher
}): Promise<PreparedCorsiMigration> {
  const backup = requireBackup(options.backupValue)
  const approvedReport = requireAuditReport(options.auditReportValue)
  if (
    approvedReport.inputFile.sha256Before !== options.inputSha256 ||
    approvedReport.inputFile.sha256After !== options.inputSha256 ||
    approvedReport.inputFile.sizeBytes !== options.inputSizeBytes
  ) {
    throw new MigrationValidationError(
      'O hash ou tamanho do input atual não coincide com o relatório dry-run aprovado.'
    )
  }
  if (
    approvedReport.inputFile.sha256Before !== approvedReport.inputFile.sha256After ||
    approvedReport.inputFile.unchanged !== true
  ) {
    throw new MigrationValidationError(
      'O relatório dry-run não comprova que o input permaneceu inalterado.'
    )
  }

  const currentAnalysis = await analyzeCorsiDryRun(options.backupValue, options.hashResult)
  assertApprovedAnalysisMatches(approvedReport, currentAnalysis)

  const migratedBackup = structuredClone(backup)
  const migratedSessions = migratedBackup.sessions
  const candidateById = new Map(
    currentAnalysis.candidateSessions.map((candidate) => [candidate.sessionId as string, candidate])
  )
  const migrations: MigratedSessionAudit[] = []

  for (const sessionValue of migratedSessions) {
    if (!isRecord(sessionValue) || typeof sessionValue.sessionId !== 'string') continue
    const candidate = candidateById.get(sessionValue.sessionId)
    if (!candidate) continue
    if (!isRecord(sessionValue.result) || resultScoringVersion(sessionValue) !== LEGACY_CORSI_SCORING_VERSION) {
      throw new MigrationValidationError(`A candidata ${sessionValue.sessionId} mudou antes da migração.`)
    }

    const trialInput = structuredClone(sessionValue.trials) as TrialRecord[]
    const trialSnapshot = stableStringify(trialInput)
    const scored = corsi.scoreSession(
      trialInput,
      sessionValue.mode as 'assessment' | 'training',
      structuredClone(sessionValue.deviceInfo) as DeviceInfo,
      structuredClone(sessionValue.flags) as Record<string, boolean>
    )
    if (stableStringify(trialInput) !== trialSnapshot) {
      throw new MigrationValidationError(`O scorer alterou os trials da sessão ${sessionValue.sessionId}.`)
    }
    if (scored.scoringVersion !== REPLAY_CORSI_SCORING_VERSION) {
      throw new MigrationValidationError(
        `O scorer produziu versão inesperada para ${sessionValue.sessionId}: ${scored.scoringVersion}.`
      )
    }
    const recalculatedHash = await options.hashResult(projectRelevantResult(scored))
    if (recalculatedHash !== candidate.recalculatedResultHash) {
      throw new MigrationValidationError(
        `O resultado recalculado de ${sessionValue.sessionId} diverge do relatório aprovado.`
      )
    }

    const oldResult = structuredClone(sessionValue.result)
    const newResult = buildPersistedResult(sessionValue, scored)
    sessionValue.result = newResult
    migrations.push({
      sessionId: sessionValue.sessionId,
      oldScoringVersion: candidate.oldScoringVersion,
      newScoringVersion: scored.scoringVersion,
      oldResultHash: await options.hashResult(oldResult),
      newResultHash: await options.hashResult(newResult),
      auditOldResultHash: candidate.oldResultHash,
      auditRecalculatedResultHash: candidate.recalculatedResultHash,
      divergent: candidate.divergent,
      numericDeltas: structuredClone(candidate.numericDeltas),
    })
  }

  if (migrations.length !== currentAnalysis.candidateSessions.length) {
    throw new MigrationValidationError('Nem todas as candidatas aprovadas foram encontradas para migração.')
  }
  const approvedIds = new Set(migrations.map((migration) => migration.sessionId))
  assertOnlyApprovedSessionsChanged(backup, migratedBackup, approvedIds)
  return {
    migratedBackup,
    approvedAnalysis: currentAnalysis,
    migratedSessions: migrations,
    skippedSessions: structuredClone(currentAnalysis.skippedSessions),
  }
}

export async function validateMigratedBackup(options: {
  originalBackup: unknown
  migratedBackup: unknown
  approvedSessionIds: string[]
  hashResult: ResultHasher
}): Promise<{
  analysis: CorsiDryRunAnalysis
  corsiDistribution: Record<string, number>
}> {
  const original = requireBackup(options.originalBackup)
  const migrated = requireBackup(options.migratedBackup)
  const approvedIds = new Set(options.approvedSessionIds)
  if (approvedIds.size !== options.approvedSessionIds.length) {
    throw new MigrationValidationError('A lista de sessões aprovadas contém IDs duplicados.')
  }
  assertOnlyApprovedSessionsChanged(original, migrated, approvedIds)

  const analysis = await analyzeCorsiDryRun(migrated, options.hashResult)
  if (analysis.candidateSessions.length !== 0 || analysis.summary.nonReprocessable !== 0) {
    throw new MigrationValidationError('O output ainda contém candidatas Corsi legacy.')
  }
  if (
    migrated.sessions.length !== original.sessions.length ||
    analysis.summary.totalSessions !== original.sessions.length
  ) {
    throw new MigrationValidationError('O total de sessões não foi preservado no output.')
  }

  const originalDistribution = corsiScoringVersionDistribution(original)
  const migratedDistribution = corsiScoringVersionDistribution(migrated)
  const originalCorsiTotal = Object.values(originalDistribution).reduce((sum, count) => sum + count, 0)
  const migratedCorsiTotal = Object.values(migratedDistribution).reduce((sum, count) => sum + count, 0)
  if (originalCorsiTotal !== migratedCorsiTotal || analysis.summary.totalCorsiSessions !== originalCorsiTotal) {
    throw new MigrationValidationError('O total de sessões Corsi não foi preservado no output.')
  }
  if ((migratedDistribution[LEGACY_CORSI_SCORING_VERSION] ?? 0) !== 0) {
    throw new MigrationValidationError('O output ainda contém scoringVersion Corsi legacy.')
  }
  const expectedCurrent =
    (originalDistribution[REPLAY_CORSI_SCORING_VERSION] ?? 0) + approvedIds.size
  if ((migratedDistribution[REPLAY_CORSI_SCORING_VERSION] ?? 0) !== expectedCurrent) {
    throw new MigrationValidationError('A distribuição final de scoringVersion Corsi é inesperada.')
  }

  return { analysis, corsiDistribution: migratedDistribution }
}
