import type {
  CorsiDryRunAnalysis,
  NumericDelta,
  SkippedSessionAudit,
} from './types'

export const HISTORICAL_MIGRATOR_TOOL_VERSION = '1.0.0'

export interface MigratedSessionAudit {
  sessionId: string
  oldScoringVersion: string
  newScoringVersion: string
  oldResultHash: string
  newResultHash: string
  auditOldResultHash: string
  auditRecalculatedResultHash: string
  divergent: boolean
  numericDeltas: NumericDelta[]
}

export interface PreparedCorsiMigration {
  migratedBackup: Record<string, unknown>
  approvedAnalysis: CorsiDryRunAnalysis
  migratedSessions: MigratedSessionAudit[]
  skippedSessions: SkippedSessionAudit[]
}

export interface MigrationPostWriteChecks {
  outputJsonValid: true
  outputHashVerified: true
  inputBytesUnchanged: true
  noLegacyCandidatesRemain: true
  totalSessionsPreserved: true
  totalCorsiSessionsPreserved: true
  onlyApprovedSessionsChanged: true
  corsiScoringVersionDistribution: Record<string, number>
}

export interface HistoricalMigrationReport {
  toolVersion: string
  generatedAt: string
  writeMigratedCopy: true
  files: {
    input: {
      sizeBytes: number
      sha256Before: string
      sha256After: string
      unchanged: boolean
    }
    auditReport: {
      sizeBytes: number
      sha256: string
      toolVersion: string
    }
    output: {
      path: string
      sizeBytes: number
      sha256: string
    }
  }
  summary: {
    totalSessions: number
    totalCorsiSessions: number
    migrated: number
    skipped: number
    numericallyDivergent: number
    numericallyIdenticalButVersioned: number
  }
  migratedSessionIds: string[]
  migratedSessions: MigratedSessionAudit[]
  numericallyIdenticalButVersionedSessionIds: string[]
  skippedSessions: SkippedSessionAudit[]
  postWriteChecks: MigrationPostWriteChecks
}
