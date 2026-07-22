import type { DeviceInfo, SessionFlags, TrialRecord } from '../types'
import { testDefinition as corsi } from '../tests/corsi'
import { stableStringify } from './canonical'
import {
  LEGACY_CORSI_SCORING_VERSION,
  REPLAY_CORSI_SCORING_VERSION,
  type AuditReason,
  type CandidateSessionAudit,
  type CorsiDryRunAnalysis,
  type NumericDelta,
  type RelevantResult,
  type ResultHasher,
  type SkippedSessionAudit,
} from './types'

const RELEVANT_RESULT_FIELDS = [
  'quality',
  'flags',
  'flagMessages',
  'rtMetrics',
  'accuracyMetrics',
  'sdtMetrics',
  'conditionMetrics',
  'blockMetrics',
  'customMetrics',
] as const

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupValidationError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function reason(code: string, message: string): AuditReason {
  return { code, message }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function resultScoringVersion(result: unknown): string | null {
  if (!isRecord(result)) return null
  const value = result.scoringVersion
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function projectRelevantResult(result: unknown): RelevantResult {
  if (!isRecord(result)) return {}
  const projected: RelevantResult = {}
  for (const field of RELEVANT_RESULT_FIELDS) {
    if (result[field] !== undefined) projected[field] = structuredClone(result[field])
  }
  return projected
}

function validateDeviceInfo(value: unknown): value is DeviceInfo {
  if (!isRecord(value)) return false
  return (
    (value.deviceType === 'desktop' || value.deviceType === 'tablet' || value.deviceType === 'mobile') &&
    (value.inputMethod === 'keyboard' || value.inputMethod === 'mouse' || value.inputMethod === 'touch') &&
    typeof value.screenWidth === 'number' &&
    Number.isFinite(value.screenWidth) &&
    typeof value.screenHeight === 'number' &&
    Number.isFinite(value.screenHeight) &&
    typeof value.browser === 'string' &&
    typeof value.userAgent === 'string'
  )
}

function validateFlags(value: unknown): value is SessionFlags {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'boolean')
}

function validateTrial(trial: unknown, position: number): AuditReason | null {
  const prefix = `Trial na posição ${position}`
  if (!isRecord(trial)) return reason('invalid_trial', `${prefix} não é um objeto.`)
  if (!Number.isInteger(trial.trialIndex)) {
    return reason('invalid_trial_index', `${prefix} não possui trialIndex inteiro.`)
  }
  if (!Number.isInteger(trial.blockIndex)) {
    return reason('invalid_block_index', `${prefix} não possui blockIndex inteiro.`)
  }
  if (typeof trial.expectedResponse !== 'string' || trial.expectedResponse.length === 0) {
    return reason('missing_expected_response', `${prefix} não possui expectedResponse persistida.`)
  }
  if (typeof trial.actualResponse !== 'string' || trial.actualResponse.length === 0) {
    return reason('missing_response', `${prefix} não possui actualResponse persistida.`)
  }
  if (typeof trial.correct !== 'boolean') {
    return reason('invalid_correct_flag', `${prefix} não possui correct booleano.`)
  }
  if (
    trial.reactionTimeMs !== null &&
    (typeof trial.reactionTimeMs !== 'number' || !Number.isFinite(trial.reactionTimeMs))
  ) {
    return reason('invalid_reaction_time', `${prefix} possui reactionTimeMs inválido.`)
  }
  if (typeof trial.windowFocused !== 'boolean') {
    return reason('invalid_focus_state', `${prefix} não possui windowFocused booleano.`)
  }
  if (trial.visibilityState !== 'visible' && trial.visibilityState !== 'hidden') {
    return reason('invalid_visibility_state', `${prefix} possui visibilityState inválido.`)
  }
  if (!isRecord(trial.metadata)) {
    return reason('missing_metadata', `${prefix} não possui metadata.`)
  }
  const sequence = trial.metadata.sequence
  if (
    !Array.isArray(sequence) ||
    sequence.length === 0 ||
    !sequence.every((entry) => Number.isInteger(entry))
  ) {
    return reason('missing_sequence', `${prefix} não possui metadata.sequence válida.`)
  }
  if (typeof trial.metadata.userResponse !== 'string') {
    return reason('missing_metadata_response', `${prefix} não possui metadata.userResponse persistida.`)
  }
  if (
    typeof trial.metadata.partialPositionsCorrect !== 'number' ||
    !Number.isInteger(trial.metadata.partialPositionsCorrect)
  ) {
    return reason(
      'missing_partial_positions',
      `${prefix} não possui metadata.partialPositionsCorrect inteira.`
    )
  }
  return null
}

function candidateIneligibility(session: Record<string, unknown>): AuditReason | null {
  if (typeof session.sessionId !== 'string' || session.sessionId.length === 0) {
    return reason('missing_session_id', 'A sessão candidata não possui sessionId auditável.')
  }
  if (
    typeof session.startedAt !== 'string' ||
    Number.isNaN(Date.parse(session.startedAt))
  ) {
    return reason('invalid_started_at', 'A sessão candidata não possui startedAt válido.')
  }
  if (session.protocolVersion !== corsi.protocolVersion) {
    return reason(
      'unsupported_protocol_version',
      `protocolVersion incompatível com o scorer atual: ${String(session.protocolVersion)}.`
    )
  }
  if (session.mode !== 'assessment' && session.mode !== 'training') {
    return reason('invalid_mode', `Modo Corsi inválido: ${String(session.mode)}.`)
  }
  if (
    session.status !== 'completed' ||
    (isRecord(session.flags) && session.flags.incomplete === true) ||
    (isRecord(session.result) && isRecord(session.result.flags) && session.result.flags.incomplete === true)
  ) {
    return reason('incomplete_session', 'A sessão Corsi não está concluída.')
  }
  if (!Array.isArray(session.trials) || session.trials.length === 0) {
    return reason('missing_trials', 'A sessão Corsi não possui trials persistidos.')
  }
  if (!validateDeviceInfo(session.deviceInfo)) {
    return reason('invalid_device_info', 'A sessão Corsi não possui deviceInfo completo e válido.')
  }
  if (!validateFlags(session.flags)) {
    return reason('invalid_flags', 'A sessão Corsi não possui flags booleanas válidas.')
  }
  for (let index = 0; index < session.trials.length; index++) {
    const trialReason = validateTrial(session.trials[index], index)
    if (trialReason) return trialReason
  }
  return null
}

function collectDifferences(
  oldValue: unknown,
  recalculatedValue: unknown,
  path: string,
  changedFields: string[],
  numericDeltas: NumericDelta[]
): void {
  if (stableStringify(oldValue) === stableStringify(recalculatedValue)) return

  if (typeof oldValue === 'number' && typeof recalculatedValue === 'number') {
    changedFields.push(path)
    numericDeltas.push({
      field: path,
      oldValue,
      recalculatedValue,
      delta: recalculatedValue - oldValue,
    })
    return
  }

  if (Array.isArray(oldValue) && Array.isArray(recalculatedValue)) {
    const length = Math.max(oldValue.length, recalculatedValue.length)
    for (let index = 0; index < length; index++) {
      collectDifferences(
        oldValue[index],
        recalculatedValue[index],
        `${path}[${index}]`,
        changedFields,
        numericDeltas
      )
    }
    return
  }

  if (isRecord(oldValue) && isRecord(recalculatedValue)) {
    const keys = [...new Set([...Object.keys(oldValue), ...Object.keys(recalculatedValue)])].sort()
    for (const key of keys) {
      collectDifferences(
        oldValue[key],
        recalculatedValue[key],
        path ? `${path}.${key}` : key,
        changedFields,
        numericDeltas
      )
    }
    return
  }

  changedFields.push(path || '$')
}

function skippedAudit(session: unknown, skippedReason: AuditReason): SkippedSessionAudit {
  const record = isRecord(session) ? session : {}
  return {
    sessionId: stringOrNull(record.sessionId),
    testId: stringOrNull(record.testId),
    scoringVersion: resultScoringVersion(record.result),
    reason: skippedReason,
  }
}

async function analyzeCandidate(
  session: Record<string, unknown>,
  hashResult: ResultHasher
): Promise<CandidateSessionAudit> {
  const oldResult = projectRelevantResult(session.result)
  const oldResultHash = await hashResult(oldResult)
  const base = {
    sessionId: stringOrNull(session.sessionId),
    startedAt: stringOrNull(session.startedAt),
    protocolVersion: stringOrNull(session.protocolVersion),
    oldScoringVersion: LEGACY_CORSI_SCORING_VERSION,
    proposedScoringVersion: REPLAY_CORSI_SCORING_VERSION,
    trialCount: Array.isArray(session.trials) ? session.trials.length : 0,
    oldResult,
    oldResultHash,
  }

  const ineligibility = candidateIneligibility(session)
  if (ineligibility) {
    return {
      ...base,
      eligibility: 'ineligible',
      reason: ineligibility,
      recalculatedResult: null,
      numericDeltas: [],
      changedFields: [],
      recalculatedResultHash: null,
      divergent: false,
    }
  }

  const trialInput = structuredClone(session.trials) as TrialRecord[]
  const trialsBefore = stableStringify(trialInput)
  let scored: ReturnType<typeof corsi.scoreSession>
  try {
    scored = corsi.scoreSession(
      trialInput,
      session.mode as 'assessment' | 'training',
      structuredClone(session.deviceInfo) as DeviceInfo,
      structuredClone(session.flags) as Record<string, boolean>
    )
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      ...base,
      eligibility: 'ineligible',
      reason: reason('scorer_error', `O scorer Corsi recusou a sessão: ${detail}`),
      recalculatedResult: null,
      numericDeltas: [],
      changedFields: [],
      recalculatedResultHash: null,
      divergent: false,
    }
  }

  if (trialsBefore !== stableStringify(trialInput)) {
    return {
      ...base,
      eligibility: 'ineligible',
      reason: reason('scorer_mutated_trials', 'O scorer alterou os trials recebidos.'),
      recalculatedResult: null,
      numericDeltas: [],
      changedFields: [],
      recalculatedResultHash: null,
      divergent: false,
    }
  }

  if (scored.scoringVersion !== REPLAY_CORSI_SCORING_VERSION) {
    return {
      ...base,
      eligibility: 'ineligible',
      reason: reason(
        'unexpected_scorer_version',
        `O scorer produziu uma versão inesperada: ${scored.scoringVersion}.`
      ),
      recalculatedResult: null,
      numericDeltas: [],
      changedFields: [],
      recalculatedResultHash: null,
      divergent: false,
    }
  }

  const recalculatedResult = projectRelevantResult(scored)
  const recalculatedResultHash = await hashResult(recalculatedResult)
  const changedFields: string[] = []
  const numericDeltas: NumericDelta[] = []
  collectDifferences(oldResult, recalculatedResult, '', changedFields, numericDeltas)
  changedFields.sort()
  numericDeltas.sort((left, right) => left.field.localeCompare(right.field))

  return {
    ...base,
    eligibility: 'eligible',
    reason: null,
    recalculatedResult,
    numericDeltas,
    changedFields,
    recalculatedResultHash,
    divergent: changedFields.length > 0,
  }
}

/**
 * Analisa somente dados já carregados. Não acessa disco, IndexedDB, relógio ou rede.
 */
export async function analyzeCorsiDryRun(
  backupValue: unknown,
  hashResult: ResultHasher
): Promise<CorsiDryRunAnalysis> {
  if (!isRecord(backupValue)) {
    throw new BackupValidationError('O backup precisa ser um objeto JSON.')
  }
  if (typeof backupValue.version !== 'string' || backupValue.version.length === 0) {
    throw new BackupValidationError('O backup não possui version válida.')
  }
  if (
    typeof backupValue.exportedAt !== 'string' ||
    Number.isNaN(Date.parse(backupValue.exportedAt))
  ) {
    throw new BackupValidationError('O backup não possui exportedAt válido.')
  }
  if (!Array.isArray(backupValue.sessions)) {
    throw new BackupValidationError('O backup não possui um array sessions.')
  }

  const candidateSessions: CandidateSessionAudit[] = []
  const skippedSessions: SkippedSessionAudit[] = []
  let totalCorsiSessions = 0

  for (const sessionValue of backupValue.sessions) {
    if (!isRecord(sessionValue)) {
      skippedSessions.push(
        skippedAudit(sessionValue, reason('invalid_session', 'O item de sessions não é um objeto.'))
      )
      continue
    }
    if (sessionValue.testId !== 'corsi') {
      skippedSessions.push(
        skippedAudit(
          sessionValue,
          reason('other_test', 'A ferramenta não reprocessa testes diferentes do Corsi.')
        )
      )
      continue
    }

    totalCorsiSessions += 1
    if (!isRecord(sessionValue.result)) {
      skippedSessions.push(
        skippedAudit(sessionValue, reason('missing_result', 'A sessão Corsi não possui resultado antigo.'))
      )
      continue
    }

    const scoringVersion = resultScoringVersion(sessionValue.result)
    if (scoringVersion === null) {
      skippedSessions.push(
        skippedAudit(
          sessionValue,
          reason('missing_scoring_version', 'O resultado Corsi não possui scoringVersion.')
        )
      )
      continue
    }
    if (scoringVersion === REPLAY_CORSI_SCORING_VERSION) {
      skippedSessions.push(
        skippedAudit(
          sessionValue,
          reason('already_reprocessed', 'A sessão Corsi já usa o scorer de replay atual.')
        )
      )
      continue
    }
    if (scoringVersion !== LEGACY_CORSI_SCORING_VERSION) {
      skippedSessions.push(
        skippedAudit(
          sessionValue,
          reason('unknown_scoring_version', `scoringVersion Corsi desconhecida: ${scoringVersion}.`)
        )
      )
      continue
    }

    candidateSessions.push(await analyzeCandidate(sessionValue, hashResult))
  }

  const reprocessable = candidateSessions.filter((entry) => entry.eligibility === 'eligible')
  return {
    backup: {
      version: backupValue.version,
      exportedAt: backupValue.exportedAt,
    },
    summary: {
      totalSessions: backupValue.sessions.length,
      totalCorsiSessions,
      candidates: candidateSessions.length,
      reprocessable: reprocessable.length,
      divergent: reprocessable.filter((entry) => entry.divergent).length,
      identical: reprocessable.filter((entry) => !entry.divergent).length,
      nonReprocessable: candidateSessions.length - reprocessable.length,
      skipped: skippedSessions.length,
    },
    candidateSessions,
    skippedSessions,
  }
}

