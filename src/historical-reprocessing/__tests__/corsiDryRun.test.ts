import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DeviceInfo, TrialRecord } from '../../types'
import { testDefinition as corsi } from '../../tests/corsi'
import {
  CliArgumentError,
  parseCliArguments,
  runHistoricalReprocessor,
  sha256Canonical,
} from '../../../scripts/historical-reprocessor'
import {
  analyzeCorsiDryRun,
  BackupValidationError,
  projectRelevantResult,
} from '../corsiDryRun'
import {
  LEGACY_CORSI_SCORING_VERSION,
  REPLAY_CORSI_SCORING_VERSION,
} from '../types'

const EXPORTED_AT = '2026-07-20T12:00:00.000Z'
const STARTED_AT = '2026-07-19T12:00:00.000Z'
const COMPLETED_AT = '2026-07-19T12:05:00.000Z'

const DEVICE: DeviceInfo = {
  deviceType: 'desktop',
  inputMethod: 'mouse',
  screenWidth: 1920,
  screenHeight: 1080,
  browser: 'synthetic-test',
  userAgent: 'synthetic-test',
}

let temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true }))
  )
  temporaryDirectories = []
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'corsi-dry-run-synthetic-'))
  temporaryDirectories.push(directory)
  return directory
}

function trial(
  trialIndex: number,
  sequence: number[],
  actual: number[],
  sessionId = 'synthetic-corsi'
): TrialRecord {
  const expectedResponse = sequence.join(',')
  const actualResponse = actual.join(',')
  let partialPositionsCorrect = 0
  while (
    partialPositionsCorrect < sequence.length &&
    partialPositionsCorrect < actual.length &&
    sequence[partialPositionsCorrect] === actual[partialPositionsCorrect]
  ) {
    partialPositionsCorrect += 1
  }
  const correct =
    sequence.length === actual.length && partialPositionsCorrect === sequence.length

  return {
    trialId: `${sessionId}-trial-${trialIndex}`,
    sessionId,
    testId: 'corsi',
    protocolVersion: corsi.protocolVersion,
    mode: 'assessment',
    blockIndex: 0,
    trialIndex,
    condition: 'forward',
    stimulus: expectedResponse,
    expectedResponse,
    actualResponse,
    correct,
    reactionTimeMs: 1200,
    stimulusOnsetTimestamp: 1000 + trialIndex * 2000,
    responseTimestamp: 2200 + trialIndex * 2000,
    windowFocused: true,
    visibilityState: 'visible',
    deviceType: 'desktop',
    inputMethod: 'mouse',
    metadata: {
      sequence: [...sequence],
      userResponse: actualResponse,
      partialPositionsCorrect,
      span: sequence.length,
    },
  }
}

function syntheticTrials(): TrialRecord[] {
  return [
    trial(0, [0, 1], [0, 1]),
    trial(1, [1, 2], [1, 2]),
    trial(2, [2, 3, 4], [8]),
    trial(3, [3, 4, 5], [7]),
  ]
}

function legacyCorsiSession(): Record<string, unknown> {
  const trials = syntheticTrials()
  const flags = {}
  const scored = corsi.scoreSession(structuredClone(trials), 'assessment', DEVICE, flags)
  return {
    sessionId: 'synthetic-corsi',
    testId: 'corsi',
    protocolVersion: corsi.protocolVersion,
    mode: 'assessment',
    status: 'completed',
    startedAt: STARTED_AT,
    completedAt: COMPLETED_AT,
    quality: scored.quality,
    flags,
    flagMessages: scored.flagMessages,
    trials,
    checkIn: {
      currentState: { energy: 3, focus: 4 },
      recordedAt: STARTED_AT,
    },
    deviceInfo: structuredClone(DEVICE),
    isDemo: false,
    practiceCompleted: true,
    randomizationSeed: 42,
    result: {
      ...scored,
      sessionId: 'synthetic-corsi',
      startedAt: STARTED_AT,
      completedAt: COMPLETED_AT,
      isDemo: false,
      scoringVersion: LEGACY_CORSI_SCORING_VERSION,
    },
  }
}

function backup(sessions: unknown[]): Record<string, unknown> {
  return {
    version: '1.0.0-synthetic',
    exportedAt: EXPORTED_AT,
    sessions,
    settings: { theme: 'dark' },
  }
}

async function analyze(sessions: unknown[]) {
  return analyzeCorsiDryRun(backup(sessions), sha256Canonical)
}

function candidateReasonCode(
  analysis: Awaited<ReturnType<typeof analyzeCorsiDryRun>>
): string | undefined {
  return analysis.candidateSessions[0]?.reason?.code
}

describe('núcleo puro da auditoria Corsi', () => {
  it('aceita backup válido sem Corsi e não reprocessa outro teste', async () => {
    const otherTest = {
      sessionId: 'synthetic-nback',
      testId: 'nback',
      result: { scoringVersion: LEGACY_CORSI_SCORING_VERSION },
      trials: 'deliberadamente inválido porque nunca deve ser lido',
    }

    const result = await analyze([otherTest])

    expect(result.summary).toEqual({
      totalSessions: 1,
      totalCorsiSessions: 0,
      candidates: 0,
      reprocessable: 0,
      divergent: 0,
      identical: 0,
      nonReprocessable: 0,
      skipped: 1,
    })
    expect(result.skippedSessions[0].reason.code).toBe('other_test')
  })

  it('marca Corsi legacy reprocessável e idêntico', async () => {
    const result = await analyze([legacyCorsiSession()])
    const audit = result.candidateSessions[0]

    expect(result.summary.identical).toBe(1)
    expect(audit.eligibility).toBe('eligible')
    expect(audit.divergent).toBe(false)
    expect(audit.changedFields).toEqual([])
    expect(audit.oldResultHash).toBe(audit.recalculatedResultHash)
    expect(audit.recalculatedResult).toMatchObject({
      quality: expect.any(String),
      accuracyMetrics: { totalTrials: 4 },
      customMetrics: {
        confirmedSpan: 2,
        maxSpan: 3,
        totalCorrectSequences: 2,
        partialScore: 4,
        partialScoreRate: 0.4,
      },
    })
  })

  it('marca Corsi legacy reprocessável e divergente com deltas numéricos', async () => {
    const session = legacyCorsiSession()
    const resultRecord = session.result as Record<string, unknown>
    const customMetrics = resultRecord.customMetrics as Record<string, unknown>
    customMetrics.confirmedSpan = 1

    const result = await analyze([session])
    const audit = result.candidateSessions[0]

    expect(result.summary.divergent).toBe(1)
    expect(audit.divergent).toBe(true)
    expect(audit.changedFields).toContain('customMetrics.confirmedSpan')
    expect(audit.numericDeltas).toContainEqual({
      field: 'customMetrics.confirmedSpan',
      oldValue: 1,
      recalculatedValue: 2,
      delta: 1,
    })
    expect(audit.oldResultHash).not.toBe(audit.recalculatedResultHash)
  })

  it('pula Corsi que já usa a versão corrigida', async () => {
    const session = legacyCorsiSession()
    ;(session.result as Record<string, unknown>).scoringVersion = REPLAY_CORSI_SCORING_VERSION

    const result = await analyze([session])

    expect(result.summary.candidates).toBe(0)
    expect(result.skippedSessions[0].reason.code).toBe('already_reprocessed')
  })

  it('recusa candidata sem trials', async () => {
    const session = legacyCorsiSession()
    session.trials = []

    const result = await analyze([session])

    expect(result.summary.nonReprocessable).toBe(1)
    expect(candidateReasonCode(result)).toBe('missing_trials')
  })

  it('recusa candidata com sequência ausente', async () => {
    const session = legacyCorsiSession()
    const firstTrial = (session.trials as TrialRecord[])[0]
    delete firstTrial.metadata?.sequence

    const result = await analyze([session])

    expect(candidateReasonCode(result)).toBe('missing_sequence')
  })

  it('recusa candidata com resposta ausente', async () => {
    const session = legacyCorsiSession()
    delete (session.trials as unknown as Record<string, unknown>[])[0].actualResponse

    const result = await analyze([session])

    expect(candidateReasonCode(result)).toBe('missing_response')
  })

  it('recusa candidata com expectedResponse ausente', async () => {
    const session = legacyCorsiSession()
    delete (session.trials as unknown as Record<string, unknown>[])[0].expectedResponse

    const result = await analyze([session])

    expect(candidateReasonCode(result)).toBe('missing_expected_response')
  })

  it('recusa candidata com trialIndex ausente', async () => {
    const session = legacyCorsiSession()
    delete (session.trials as unknown as Record<string, unknown>[])[0].trialIndex

    const result = await analyze([session])

    expect(candidateReasonCode(result)).toBe('invalid_trial_index')
  })

  it('reprocessa deterministicamente metadata derivada ausente sem fabricar campos', async () => {
    const session = legacyCorsiSession()
    const trials = session.trials as TrialRecord[]
    for (const currentTrial of trials) {
      delete currentTrial.metadata?.userResponse
      delete currentTrial.metadata?.partialPositionsCorrect
    }
    const directScore = corsi.scoreSession(structuredClone(trials), 'assessment', DEVICE, {})
    const receivedTrials: TrialRecord[][] = []
    const realScoreSession = corsi.scoreSession
    const scoreSpy = vi.spyOn(corsi, 'scoreSession').mockImplementation((input, ...rest) => {
      receivedTrials.push(structuredClone(input))
      return realScoreSession(input, ...rest)
    })

    try {
      const first = await analyze([session])
      const second = await analyze([session])

      expect(first.candidateSessions[0].eligibility).toBe('eligible')
      expect(second).toEqual(first)
      expect(first.candidateSessions[0].recalculatedResult).toEqual(
        projectRelevantResult(directScore)
      )
      expect(first.candidateSessions[0].recalculatedResultHash).toBe(
        second.candidateSessions[0].recalculatedResultHash
      )
    } finally {
      scoreSpy.mockRestore()
    }

    expect(receivedTrials).toHaveLength(2)
    for (const receivedTrialSet of receivedTrials) {
      for (const receivedTrial of receivedTrialSet) {
        expect(receivedTrial.actualResponse).toEqual(expect.any(String))
        expect(receivedTrial.metadata).not.toHaveProperty('userResponse')
        expect(receivedTrial.metadata).not.toHaveProperty('partialPositionsCorrect')
      }
    }
    for (const currentTrial of trials) {
      expect(currentTrial.metadata).not.toHaveProperty('userResponse')
      expect(currentTrial.metadata).not.toHaveProperty('partialPositionsCorrect')
    }
  })

  it('pula Corsi sem scoringVersion', async () => {
    const session = legacyCorsiSession()
    delete (session.result as Record<string, unknown>).scoringVersion

    const result = await analyze([session])

    expect(result.summary.candidates).toBe(0)
    expect(result.skippedSessions[0].reason.code).toBe('missing_scoring_version')
  })

  it('pula Corsi com scoringVersion desconhecida', async () => {
    const session = legacyCorsiSession()
    ;(session.result as Record<string, unknown>).scoringVersion = 'corsi-unknown-99'

    const result = await analyze([session])

    expect(result.summary.candidates).toBe(0)
    expect(result.skippedSessions[0].reason.code).toBe('unknown_scoring_version')
  })

  it('pula Corsi sem resultado antigo', async () => {
    const session = legacyCorsiSession()
    delete session.result

    const result = await analyze([session])

    expect(result.skippedSessions[0].reason.code).toBe('missing_result')
  })

  it('aceita status legacy ausente como sessão concluída', async () => {
    const session = legacyCorsiSession()
    delete session.status

    const result = await analyze([session])

    expect(result.candidateSessions[0].eligibility).toBe('eligible')
  })

  it('aceita status completed explícito', async () => {
    const session = legacyCorsiSession()
    session.status = 'completed'

    const result = await analyze([session])

    expect(result.candidateSessions[0].eligibility).toBe('eligible')
  })

  it.each(['interrupted', 'abandoned'])(
    'recusa status explicitamente não concluído: %s',
    async (status) => {
      const session = legacyCorsiSession()
      session.status = status

      const result = await analyze([session])

      expect(candidateReasonCode(result)).toBe('incomplete_session')
    }
  )

  it('flag incomplete prevalece quando o status legacy está ausente', async () => {
    const session = legacyCorsiSession()
    delete session.status
    session.flags = { incomplete: true }

    const result = await analyze([session])

    expect(candidateReasonCode(result)).toBe('incomplete_session')
  })

  it('recusa backup sem array sessions', async () => {
    await expect(
      analyzeCorsiDryRun({ version: '1.0.0', exportedAt: EXPORTED_AT }, sha256Canonical)
    ).rejects.toThrow(BackupValidationError)
  })

  it('o scorer real e a análise não mutam os trials recebidos', async () => {
    const session = legacyCorsiSession()
    const trials = session.trials as TrialRecord[]
    const snapshot = structuredClone(trials)

    corsi.scoreSession(trials, 'assessment', DEVICE, {})
    expect(trials).toEqual(snapshot)

    await analyze([session])
    expect(session.trials).toEqual(snapshot)
  })

  it('duas execuções são determinísticas em resultados, deltas e hashes', async () => {
    const session = legacyCorsiSession()
    const customMetrics = (session.result as Record<string, unknown>).customMetrics as Record<
      string,
      unknown
    >
    customMetrics.confirmedSpan = 1

    const first = await analyze([session])
    const second = await analyze([session])

    expect(second).toEqual(first)
    expect(second.candidateSessions[0].numericDeltas).toEqual(
      first.candidateSessions[0].numericDeltas
    )
    expect(second.candidateSessions[0].recalculatedResultHash).toBe(
      first.candidateSessions[0].recalculatedResultHash
    )
  })
})

describe('CLI somente-dry-run', () => {
  it('recusa JSON inválido sem criar relatório', async () => {
    const directory = await temporaryDirectory()
    const input = join(directory, 'invalid.json')
    const report = join(directory, 'report.json')
    await writeFile(input, '{ invalid synthetic json', 'utf8')

    await expect(
      runHistoricalReprocessor(['--input', input, '--report', report, '--dry-run'])
    ).rejects.toThrow('JSON de entrada inválido')
    await expect(readFile(report)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('recusa input e report com o mesmo caminho', async () => {
    const directory = await temporaryDirectory()
    const input = join(directory, 'same.json')
    await writeFile(input, JSON.stringify(backup([])), 'utf8')

    await expect(
      runHistoricalReprocessor(['--input', input, '--report', input, '--dry-run'])
    ).rejects.toThrow(CliArgumentError)
  })

  it('mantém o original byte a byte e registra hashes antes/depois iguais', async () => {
    const directory = await temporaryDirectory()
    const input = join(directory, 'synthetic-backup.json')
    const reportPath = join(directory, 'audit-report.json')
    const originalBytes = Buffer.from(`${JSON.stringify(backup([legacyCorsiSession()]), null, 4)}\n`)
    await writeFile(input, originalBytes)

    const report = await runHistoricalReprocessor([
      '--input',
      input,
      '--report',
      reportPath,
      '--dry-run',
    ])

    expect(await readFile(input)).toEqual(originalBytes)
    expect(report.inputFile.unchanged).toBe(true)
    expect(report.inputFile.sizeBytes).toBe(originalBytes.byteLength)
    expect(report.inputFile.sha256After).toBe(report.inputFile.sha256Before)
    expect(report.dryRun).toBe(true)
  })

  it('recusa report existente sem alterar report ou input', async () => {
    const directory = await temporaryDirectory()
    const input = join(directory, 'synthetic-backup.json')
    const reportPath = join(directory, 'existing-report.json')
    const inputBytes = Buffer.from(`${JSON.stringify(backup([legacyCorsiSession()]), null, 2)}\n`)
    const sentinelBytes = Buffer.from('SENTINELA: relatório anterior deve permanecer intacto.\n')
    await writeFile(input, inputBytes)
    await writeFile(reportPath, sentinelBytes)

    await expect(
      runHistoricalReprocessor(['--input', input, '--report', reportPath, '--dry-run'])
    ).rejects.toThrow('arquivo de --report já existe')

    expect(await readFile(reportPath)).toEqual(sentinelBytes)
    expect(await readFile(input)).toEqual(inputBytes)
  })

  it('o relatório não contém cópias integrais de trials', async () => {
    const directory = await temporaryDirectory()
    const input = join(directory, 'synthetic-backup.json')
    const reportPath = join(directory, 'audit-report.json')
    await writeFile(input, JSON.stringify(backup([legacyCorsiSession()])), 'utf8')

    await runHistoricalReprocessor(['--input', input, '--report', reportPath, '--dry-run'])
    const reportText = await readFile(reportPath, 'utf8')

    expect(reportText).not.toContain('"trials"')
    expect(reportText).not.toContain('processedTrials')
    expect(JSON.parse(reportText)).toMatchObject({
      toolVersion: '1.0.0',
      dryRun: true,
      summary: { candidates: 1, reprocessable: 1 },
    })
  })

  it('torna --dry-run obrigatório', () => {
    expect(() => parseCliArguments(['--input', 'in.json', '--report', 'out.json'])).toThrow(
      '--dry-run é obrigatória'
    )
  })

  it.each(['--migrate', '--write', '--apply', '--in-place'])('recusa opção de escrita %s', (option) => {
    expect(() =>
      parseCliArguments([
        '--input',
        'in.json',
        '--report',
        'out.json',
        '--dry-run',
        option,
      ])
    ).toThrow('Opção não suportada')
  })

  it('exige input e report explícitos', () => {
    expect(() => parseCliArguments(['--report', 'out.json', '--dry-run'])).toThrow('--input')
    expect(() => parseCliArguments(['--input', 'in.json', '--dry-run'])).toThrow('--report')
  })
})
