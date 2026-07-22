import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MigratorCliError,
  parseMigratorCliArguments,
  runHistoricalMigrator,
  sha256CanonicalMigrationValue,
} from '../../../scripts/historical-migrator'
import type { DeviceInfo, TrialRecord } from '../../types'
import { testDefinition as corsi } from '../../tests/corsi'
import {
  MigrationValidationError,
  prepareCorsiMigration,
  validateMigratedBackup,
} from '../corsiMigration'
import { analyzeCorsiDryRun } from '../corsiDryRun'
import {
  HISTORICAL_REPROCESSOR_TOOL_VERSION,
  LEGACY_CORSI_SCORING_VERSION,
  REPLAY_CORSI_SCORING_VERSION,
  type HistoricalReprocessingReport,
} from '../types'

const EXPORTED_AT = '2026-07-21T12:00:00.000Z'
const STARTED_AT = '2026-07-20T12:00:00.000Z'
const COMPLETED_AT = '2026-07-20T12:05:00.000Z'
const DEVICE: DeviceInfo = {
  deviceType: 'desktop',
  inputMethod: 'mouse',
  screenWidth: 1920,
  screenHeight: 1080,
  browser: 'synthetic-migration-test',
  userAgent: 'synthetic-migration-test',
}

let temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true }))
  )
  temporaryDirectories = []
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'corsi-migration-synthetic-'))
  temporaryDirectories.push(directory)
  return directory
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function trial(
  sessionId: string,
  trialIndex: number,
  sequence: number[],
  actual: number[]
): TrialRecord {
  const expectedResponse = sequence.join(',')
  const actualResponse = actual.join(',')
  let prefix = 0
  while (prefix < sequence.length && prefix < actual.length && sequence[prefix] === actual[prefix]) {
    prefix += 1
  }
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
    correct: sequence.length === actual.length && prefix === sequence.length,
    reactionTimeMs: 1200,
    stimulusOnsetTimestamp: 1000 + trialIndex * 2000,
    responseTimestamp: 2200 + trialIndex * 2000,
    windowFocused: true,
    visibilityState: 'visible',
    deviceType: 'desktop',
    inputMethod: 'mouse',
    metadata: { sequence: [...sequence], span: sequence.length },
  }
}

function syntheticTrials(sessionId: string): TrialRecord[] {
  return [
    trial(sessionId, 0, [0, 1], [0, 1]),
    trial(sessionId, 1, [1, 2], [1, 2]),
    trial(sessionId, 2, [2, 3, 4], [8]),
    trial(sessionId, 3, [3, 4, 5], [7]),
  ]
}

function corsiSession(options: {
  id: string
  scoringVersion: string
  divergent?: boolean
}): Record<string, unknown> {
  const trials = syntheticTrials(options.id)
  const scored = corsi.scoreSession(structuredClone(trials), 'assessment', DEVICE, {})
  const result: Record<string, unknown> = {
    ...scored,
    sessionId: options.id,
    startedAt: STARTED_AT,
    completedAt: COMPLETED_AT,
    isDemo: false,
    baselinePhase: 'monitoring',
    scoringVersion: options.scoringVersion,
  }
  if (options.divergent) {
    ;(result.customMetrics as Record<string, unknown>).confirmedSpan = 1
  }
  return {
    sessionId: options.id,
    testId: 'corsi',
    protocolVersion: corsi.protocolVersion,
    mode: 'assessment',
    status: 'completed',
    startedAt: STARTED_AT,
    completedAt: COMPLETED_AT,
    quality: scored.quality,
    flags: {},
    flagMessages: scored.flagMessages,
    result,
    trials,
    checkIn: { currentState: { focus: 4 }, recordedAt: STARTED_AT },
    deviceInfo: structuredClone(DEVICE),
    isDemo: false,
    practiceCompleted: true,
    randomizationSeed: 42,
    unknownSessionField: { preserved: options.id },
  }
}

function scenarioBackup(): Record<string, unknown> {
  return {
    version: '1.0.0-synthetic',
    exportedAt: EXPORTED_AT,
    settings: { theme: 'dark', unknownSetting: 'preserved' },
    unknownTopLevel: { nested: [1, 2, 3] },
    sessions: [
      corsiSession({ id: 'legacy-identical', scoringVersion: LEGACY_CORSI_SCORING_VERSION }),
      {
        sessionId: 'synthetic-nback',
        testId: 'nback',
        result: { scoringVersion: 'sdt-hautus-1', opaque: { keep: true } },
        trials: [{ opaqueTrial: true }],
        unknownOtherTestField: 'preserved',
      },
      corsiSession({ id: 'already-current', scoringVersion: REPLAY_CORSI_SCORING_VERSION }),
      corsiSession({
        id: 'legacy-divergent',
        scoringVersion: LEGACY_CORSI_SCORING_VERSION,
        divergent: true,
      }),
    ],
  }
}

async function approvedReport(
  backupValue: Record<string, unknown>,
  inputBytes: Buffer
): Promise<HistoricalReprocessingReport> {
  const analysis = await analyzeCorsiDryRun(backupValue, sha256CanonicalMigrationValue)
  const inputHash = sha256(inputBytes)
  return {
    toolVersion: HISTORICAL_REPROCESSOR_TOOL_VERSION,
    generatedAt: '2026-07-21T13:00:00.000Z',
    dryRun: true,
    inputFile: {
      sizeBytes: inputBytes.byteLength,
      sha256Before: inputHash,
      sha256After: inputHash,
      unchanged: true,
    },
    ...analysis,
  }
}

async function prepareScenario(backupValue = scenarioBackup()) {
  const inputBytes = Buffer.from(`${JSON.stringify(backupValue, null, 2)}\n`, 'utf8')
  const audit = await approvedReport(backupValue, inputBytes)
  const prepared = await prepareCorsiMigration({
    backupValue,
    auditReportValue: audit,
    inputSha256: sha256(inputBytes),
    inputSizeBytes: inputBytes.byteLength,
    hashResult: sha256CanonicalMigrationValue,
  })
  return { backupValue, inputBytes, audit, prepared }
}

interface ScenarioFiles {
  directory: string
  input: string
  auditPath: string
  output: string
  migrationReport: string
  inputBytes: Buffer
  audit: HistoricalReprocessingReport
}

async function writeScenarioFiles(backupValue = scenarioBackup()): Promise<ScenarioFiles> {
  const directory = await temporaryDirectory()
  const input = join(directory, 'input-backup.json')
  const auditPath = join(directory, 'approved-audit.json')
  const output = join(directory, 'migrated-backup.json')
  const migrationReport = join(directory, 'migration-report.json')
  const inputBytes = Buffer.from(`${JSON.stringify(backupValue, null, 2)}\n`, 'utf8')
  const audit = await approvedReport(backupValue, inputBytes)
  await writeFile(input, inputBytes)
  await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8')
  return { directory, input, auditPath, output, migrationReport, inputBytes, audit }
}

function cliArgs(files: ScenarioFiles, overrides: Partial<Record<'input' | 'auditPath' | 'output' | 'migrationReport', string>> = {}): string[] {
  return [
    '--input',
    overrides.input ?? files.input,
    '--audit-report',
    overrides.auditPath ?? files.auditPath,
    '--output',
    overrides.output ?? files.output,
    '--migration-report',
    overrides.migrationReport ?? files.migrationReport,
    '--write-migrated-copy',
  ]
}

function sessions(backupValue: unknown): Record<string, unknown>[] {
  return (backupValue as { sessions: Record<string, unknown>[] }).sessions
}

function byId(backupValue: unknown, id: string): Record<string, unknown> {
  const session = sessions(backupValue).find((entry) => entry.sessionId === id)
  if (!session) throw new Error(`Synthetic fixture missing session ${id}`)
  return session
}

function withoutResult(session: Record<string, unknown>): Record<string, unknown> {
  const copy = structuredClone(session)
  delete copy.result
  return copy
}

describe('núcleo da migração histórica Corsi', () => {
  it('migra somente as candidatas aprovadas e produz resultados completos', async () => {
    const { backupValue, prepared } = await prepareScenario()

    expect(prepared.migratedSessions.map((entry) => entry.sessionId)).toEqual([
      'legacy-identical',
      'legacy-divergent',
    ])
    for (const id of ['legacy-identical', 'legacy-divergent']) {
      const before = byId(backupValue, id)
      const after = byId(prepared.migratedBackup, id)
      const result = after.result as Record<string, unknown>
      expect(withoutResult(after)).toEqual(withoutResult(before))
      expect(result).toMatchObject({
        sessionId: id,
        testId: 'corsi',
        protocolVersion: corsi.protocolVersion,
        mode: 'assessment',
        startedAt: STARTED_AT,
        completedAt: COMPLETED_AT,
        isDemo: false,
        baselinePhase: 'monitoring',
        scoringVersion: REPLAY_CORSI_SCORING_VERSION,
      })
    }
  })

  it('versiona também a candidata numericamente idêntica', async () => {
    const { prepared } = await prepareScenario()
    const entry = prepared.migratedSessions.find((item) => item.sessionId === 'legacy-identical')

    expect(entry).toMatchObject({
      divergent: false,
      oldScoringVersion: LEGACY_CORSI_SCORING_VERSION,
      newScoringVersion: REPLAY_CORSI_SCORING_VERSION,
    })
    expect(entry?.oldResultHash).not.toBe(entry?.newResultHash)
  })

  it('preserva integralmente Corsi atual e outros testes', async () => {
    const { backupValue, prepared } = await prepareScenario()

    expect(byId(prepared.migratedBackup, 'already-current')).toEqual(
      byId(backupValue, 'already-current')
    )
    expect(byId(prepared.migratedBackup, 'synthetic-nback')).toEqual(
      byId(backupValue, 'synthetic-nback')
    )
  })

  it('preserva ordem de sessões, trials e campos desconhecidos', async () => {
    const { backupValue, prepared } = await prepareScenario()

    expect(sessions(prepared.migratedBackup).map((session) => session.sessionId)).toEqual(
      sessions(backupValue).map((session) => session.sessionId)
    )
    expect(prepared.migratedBackup.unknownTopLevel).toEqual(backupValue.unknownTopLevel)
    expect(prepared.migratedBackup.settings).toEqual(backupValue.settings)
    expect(prepared.migratedBackup.exportedAt).toBe(EXPORTED_AT)
    for (const id of ['legacy-identical', 'legacy-divergent']) {
      expect((byId(prepared.migratedBackup, id).trials as TrialRecord[]).map((trial) => trial.trialId)).toEqual(
        (byId(backupValue, id).trials as TrialRecord[]).map((trial) => trial.trialId)
      )
      expect(byId(prepared.migratedBackup, id).unknownSessionField).toEqual(
        byId(backupValue, id).unknownSessionField
      )
    }
  })

  it('output preparado pode ser reaberto e auditado sem candidatas legacy', async () => {
    const { backupValue, prepared } = await prepareScenario()
    const reopened = JSON.parse(JSON.stringify(prepared.migratedBackup)) as unknown
    const validation = await validateMigratedBackup({
      originalBackup: backupValue,
      migratedBackup: reopened,
      approvedSessionIds: prepared.migratedSessions.map((entry) => entry.sessionId),
      hashResult: sha256CanonicalMigrationValue,
    })

    expect(validation.analysis.candidateSessions).toEqual([])
    expect(validation.analysis.summary.totalCorsiSessions).toBe(3)
    expect(validation.corsiDistribution).toEqual({
      [REPLAY_CORSI_SCORING_VERSION]: 3,
    })
  })

  it('recusa relatório com hash de input incorreto', async () => {
    const backupValue = scenarioBackup()
    const inputBytes = Buffer.from(JSON.stringify(backupValue))
    const audit = await approvedReport(backupValue, inputBytes)
    audit.inputFile.sha256Before = '0'.repeat(64)

    await expect(
      prepareCorsiMigration({
        backupValue,
        auditReportValue: audit,
        inputSha256: sha256(inputBytes),
        inputSizeBytes: inputBytes.byteLength,
        hashResult: sha256CanonicalMigrationValue,
      })
    ).rejects.toThrow('não coincide')
  })

  it('recusa relatório adulterado', async () => {
    const backupValue = scenarioBackup()
    const inputBytes = Buffer.from(JSON.stringify(backupValue))
    const audit = await approvedReport(backupValue, inputBytes)
    audit.candidateSessions[0].divergent = !audit.candidateSessions[0].divergent

    await expect(
      prepareCorsiMigration({
        backupValue,
        auditReportValue: audit,
        inputSha256: sha256(inputBytes),
        inputSizeBytes: inputBytes.byteLength,
        hashResult: sha256CanonicalMigrationValue,
      })
    ).rejects.toThrow('não coincide integralmente')
  })

  it.each(['added', 'removed'])('recusa sessão %s após a auditoria', async (change) => {
    const original = scenarioBackup()
    const originalBytes = Buffer.from(JSON.stringify(original))
    const audit = await approvedReport(original, originalBytes)
    const changed = structuredClone(original)
    const changedSessions = changed.sessions as unknown[]
    if (change === 'added') {
      changedSessions.push(
        corsiSession({ id: 'late-session', scoringVersion: LEGACY_CORSI_SCORING_VERSION })
      )
    } else {
      changed.sessions = changedSessions.filter(
        (session) => (session as Record<string, unknown>).sessionId !== 'legacy-divergent'
      )
    }
    const changedBytes = Buffer.from(JSON.stringify(changed))
    const changedHash = sha256(changedBytes)
    audit.inputFile = {
      sizeBytes: changedBytes.byteLength,
      sha256Before: changedHash,
      sha256After: changedHash,
      unchanged: true,
    }

    await expect(
      prepareCorsiMigration({
        backupValue: changed,
        auditReportValue: audit,
        inputSha256: changedHash,
        inputSizeBytes: changedBytes.byteLength,
        hashResult: sha256CanonicalMigrationValue,
      })
    ).rejects.toThrow('não coincide integralmente')
  })

  it('recusa hash recalculado diferente do relatório', async () => {
    const backupValue = scenarioBackup()
    const inputBytes = Buffer.from(JSON.stringify(backupValue))
    const audit = await approvedReport(backupValue, inputBytes)
    audit.candidateSessions[0].recalculatedResultHash = 'f'.repeat(64)

    await expect(
      prepareCorsiMigration({
        backupValue,
        auditReportValue: audit,
        inputSha256: sha256(inputBytes),
        inputSizeBytes: inputBytes.byteLength,
        hashResult: sha256CanonicalMigrationValue,
      })
    ).rejects.toThrow(MigrationValidationError)
  })

  it('recusa candidata inelegível', async () => {
    const backupValue = scenarioBackup()
    byId(backupValue, 'legacy-identical').trials = []
    const inputBytes = Buffer.from(JSON.stringify(backupValue))
    const audit = await approvedReport(backupValue, inputBytes)

    await expect(
      prepareCorsiMigration({
        backupValue,
        auditReportValue: audit,
        inputSha256: sha256(inputBytes),
        inputSizeBytes: inputBytes.byteLength,
        hashResult: sha256CanonicalMigrationValue,
      })
    ).rejects.toThrow('não reprocessável')
  })
})

describe('CLI transacional da migração histórica', () => {
  it('gera cópia e relatório válidos sem alterar o input', async () => {
    const files = await writeScenarioFiles()

    const report = await runHistoricalMigrator(cliArgs(files))
    const outputBytes = await readFile(files.output)
    const output = JSON.parse(outputBytes.toString('utf8')) as unknown
    const reportText = await readFile(files.migrationReport, 'utf8')

    expect(await readFile(files.input)).toEqual(files.inputBytes)
    expect(report.files.input.unchanged).toBe(true)
    expect(report.summary).toMatchObject({
      totalSessions: 4,
      totalCorsiSessions: 3,
      migrated: 2,
      numericallyDivergent: 1,
      numericallyIdenticalButVersioned: 1,
    })
    expect(report.postWriteChecks.corsiScoringVersionDistribution).toEqual({
      [REPLAY_CORSI_SCORING_VERSION]: 3,
    })
    expect(sha256(outputBytes)).toBe(report.files.output.sha256)
    expect(reportText).not.toContain('"trials"')
    expect(reportText).not.toContain('processedTrials')
    expect((await analyzeCorsiDryRun(output, sha256CanonicalMigrationValue)).candidateSessions).toEqual([])
  })

  it('recusa caminhos iguais ou normalizados como equivalentes', async () => {
    const files = await writeScenarioFiles()
    const equivalent = join(files.directory, 'nested', '..', 'input-backup.json')

    await expect(
      runHistoricalMigrator(cliArgs(files, { output: equivalent }))
    ).rejects.toThrow(MigratorCliError)
    expect(await readFile(files.input)).toEqual(files.inputBytes)
  })

  it('preserva output preexistente', async () => {
    const files = await writeScenarioFiles()
    const sentinel = Buffer.from('OUTPUT SENTINEL\n')
    await writeFile(files.output, sentinel)

    await expect(runHistoricalMigrator(cliArgs(files))).rejects.toThrow('já existe')
    expect(await readFile(files.output)).toEqual(sentinel)
    await expect(readFile(files.migrationReport)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('preserva migration-report preexistente', async () => {
    const files = await writeScenarioFiles()
    const sentinel = Buffer.from('REPORT SENTINEL\n')
    await writeFile(files.migrationReport, sentinel)

    await expect(runHistoricalMigrator(cliArgs(files))).rejects.toThrow('já existe')
    expect(await readFile(files.migrationReport)).toEqual(sentinel)
    await expect(readFile(files.output)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('aborta sem o sinalizador explícito de escrita', () => {
    expect(() =>
      parseMigratorCliArguments([
        '--input',
        'input.json',
        '--audit-report',
        'audit.json',
        '--output',
        'output.json',
        '--migration-report',
        'migration.json',
      ])
    ).toThrow('--write-migrated-copy')
  })

  it.each(['--in-place', '--force', '--overwrite', '--write'])('recusa opção perigosa %s', (option) => {
    expect(() =>
      parseMigratorCliArguments([
        '--input',
        'input.json',
        '--audit-report',
        'audit.json',
        '--output',
        'output.json',
        '--migration-report',
        'migration.json',
        '--write-migrated-copy',
        option,
      ])
    ).toThrow('Opção não suportada')
  })

  it('falha posterior à escrita não deixa output final ou temporários', async () => {
    const files = await writeScenarioFiles()

    await expect(
      runHistoricalMigrator(cliArgs(files), {
        afterOutputCreated: () => {
          throw new Error('synthetic post-write failure')
        },
      })
    ).rejects.toThrow('synthetic post-write failure')

    await expect(readFile(files.output)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(files.migrationReport)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await readdir(files.directory)).some((name) => name.includes('.tmp-'))).toBe(false)
    expect(await readFile(files.input)).toEqual(files.inputBytes)
  })

  it('segunda tentativa com output já atual recusa migração sem efeito', async () => {
    const files = await writeScenarioFiles()
    await runHistoricalMigrator(cliArgs(files))
    const firstOutputBytes = await readFile(files.output)
    const firstOutput = JSON.parse(firstOutputBytes.toString('utf8')) as Record<string, unknown>
    const secondAudit = await approvedReport(firstOutput, firstOutputBytes)
    const secondAuditPath = join(files.directory, 'second-audit.json')
    const secondOutput = join(files.directory, 'second-output.json')
    const secondReport = join(files.directory, 'second-migration-report.json')
    await writeFile(secondAuditPath, JSON.stringify(secondAudit), 'utf8')

    await expect(
      runHistoricalMigrator([
        '--input',
        files.output,
        '--audit-report',
        secondAuditPath,
        '--output',
        secondOutput,
        '--migration-report',
        secondReport,
        '--write-migrated-copy',
      ])
    ).rejects.toThrow('migração sem efeito recusada')
    await expect(readFile(secondOutput)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(secondReport)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('relatório de auditoria adulterado não cria arquivos finais', async () => {
    const files = await writeScenarioFiles()
    files.audit.candidateSessions.pop()
    await writeFile(files.auditPath, JSON.stringify(files.audit), 'utf8')

    await expect(runHistoricalMigrator(cliArgs(files))).rejects.toThrow(MigrationValidationError)
    await expect(readFile(files.output)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(files.migrationReport)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
