export const HISTORICAL_REPROCESSOR_TOOL_VERSION = '1.0.0'
export const LEGACY_CORSI_SCORING_VERSION = 'sdt-hautus-1'
export const REPLAY_CORSI_SCORING_VERSION = 'sdt-hautus-1;corsi-replay-1'

export interface AuditReason {
  code: string
  message: string
}

export type RelevantResult = Record<string, unknown>

export interface NumericDelta {
  field: string
  oldValue: number
  recalculatedValue: number
  delta: number
}

export interface CandidateSessionAudit {
  sessionId: string | null
  startedAt: string | null
  protocolVersion: string | null
  oldScoringVersion: string
  proposedScoringVersion: string
  trialCount: number
  eligibility: 'eligible' | 'ineligible'
  reason: AuditReason | null
  oldResult: RelevantResult
  recalculatedResult: RelevantResult | null
  numericDeltas: NumericDelta[]
  changedFields: string[]
  oldResultHash: string
  recalculatedResultHash: string | null
  divergent: boolean
}

export interface SkippedSessionAudit {
  sessionId: string | null
  testId: string | null
  scoringVersion: string | null
  reason: AuditReason
}

export interface CorsiAnalysisSummary {
  totalSessions: number
  totalCorsiSessions: number
  candidates: number
  reprocessable: number
  divergent: number
  identical: number
  nonReprocessable: number
  skipped: number
}

export interface CorsiDryRunAnalysis {
  backup: {
    version: string
    exportedAt: string
  }
  summary: CorsiAnalysisSummary
  candidateSessions: CandidateSessionAudit[]
  skippedSessions: SkippedSessionAudit[]
}

export interface HistoricalReprocessingReport extends CorsiDryRunAnalysis {
  toolVersion: string
  generatedAt: string
  dryRun: true
  inputFile: {
    sizeBytes: number
    sha256Before: string
    sha256After: string
    unchanged: boolean
  }
}

export type ResultHasher = (value: unknown) => string | Promise<string>
