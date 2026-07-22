import { createHash, randomUUID } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import {
  access,
  link,
  lstat,
  readFile,
  realpath,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { stableStringify } from '../src/historical-reprocessing/canonical'
import {
  MigrationValidationError,
  prepareCorsiMigration,
  validateMigratedBackup,
} from '../src/historical-reprocessing/corsiMigration'
import {
  HISTORICAL_MIGRATOR_TOOL_VERSION,
  type HistoricalMigrationReport,
} from '../src/historical-reprocessing/migrationTypes'
import type { HistoricalReprocessingReport } from '../src/historical-reprocessing/types'

interface MigratorCliArguments {
  input: string
  auditReport: string
  output: string
  migrationReport: string
  writeMigratedCopy: true
}

interface PathIdentity {
  absolute: string
  canonical: string
  metadata?: Awaited<ReturnType<typeof stat>>
}

export interface MigratorRuntimeHooks {
  /** Usado somente por testes para comprovar rollback após a promoção do output. */
  afterOutputCreated?: () => void | Promise<void>
}

export class MigratorCliError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigratorCliError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorCode(error: unknown): unknown {
  return isRecord(error) ? error.code : undefined
}

function takeValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) {
    throw new MigratorCliError(`A opção ${option} exige um caminho.`)
  }
  return value
}

export function parseMigratorCliArguments(argv: string[]): MigratorCliArguments {
  let input: string | undefined
  let auditReport: string | undefined
  let output: string | undefined
  let migrationReport: string | undefined
  let writeMigratedCopy = false

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--input') {
      if (input !== undefined) throw new MigratorCliError('--input foi informado mais de uma vez.')
      input = takeValue(argv, index, argument)
      index += 1
      continue
    }
    if (argument === '--audit-report') {
      if (auditReport !== undefined) {
        throw new MigratorCliError('--audit-report foi informado mais de uma vez.')
      }
      auditReport = takeValue(argv, index, argument)
      index += 1
      continue
    }
    if (argument === '--output') {
      if (output !== undefined) throw new MigratorCliError('--output foi informado mais de uma vez.')
      output = takeValue(argv, index, argument)
      index += 1
      continue
    }
    if (argument === '--migration-report') {
      if (migrationReport !== undefined) {
        throw new MigratorCliError('--migration-report foi informado mais de uma vez.')
      }
      migrationReport = takeValue(argv, index, argument)
      index += 1
      continue
    }
    if (argument === '--write-migrated-copy') {
      if (writeMigratedCopy) {
        throw new MigratorCliError('--write-migrated-copy foi informado mais de uma vez.')
      }
      writeMigratedCopy = true
      continue
    }
    if (argument.startsWith('--')) {
      throw new MigratorCliError(`Opção não suportada pela migração segura: ${argument}.`)
    }
    throw new MigratorCliError(`Argumento posicional inesperado: ${argument}.`)
  }

  if (input === undefined) throw new MigratorCliError('Informe --input <backup-copy.json>.')
  if (auditReport === undefined) {
    throw new MigratorCliError('Informe --audit-report <dry-run-report.json>.')
  }
  if (output === undefined) throw new MigratorCliError('Informe --output <new-backup.json>.')
  if (migrationReport === undefined) {
    throw new MigratorCliError('Informe --migration-report <new-migration-report.json>.')
  }
  if (!writeMigratedCopy) {
    throw new MigratorCliError('O sinalizador --write-migrated-copy é obrigatório.')
  }
  return { input, auditReport, output, migrationReport, writeMigratedCopy: true }
}

function normalizedPath(path: string): string {
  return process.platform === 'win32' ? path.toLocaleLowerCase('en-US') : path
}

async function pathIdentity(path: string, mustExist: boolean): Promise<PathIdentity> {
  const absolute = resolve(path)
  try {
    const canonical = await realpath(absolute)
    const metadata = await stat(canonical)
    if (!mustExist) {
      throw new MigratorCliError(`O arquivo de saída já existe: ${absolute}.`)
    }
    if (!metadata.isFile()) {
      throw new MigratorCliError(`O caminho precisa apontar para um arquivo regular: ${absolute}.`)
    }
    return { absolute, canonical, metadata }
  } catch (error) {
    if (error instanceof MigratorCliError) throw error
    if (errorCode(error) !== 'ENOENT') throw error
    if (mustExist) throw new MigratorCliError(`Arquivo obrigatório não encontrado: ${absolute}.`)

    try {
      await lstat(absolute)
      throw new MigratorCliError(`O arquivo de saída já existe: ${absolute}.`)
    } catch (lstatError) {
      if (lstatError instanceof MigratorCliError) throw lstatError
      if (errorCode(lstatError) !== 'ENOENT') throw lstatError
    }
    const canonicalDirectory = await realpath(dirname(absolute))
    const directoryMetadata = await stat(canonicalDirectory)
    if (!directoryMetadata.isDirectory()) {
      throw new MigratorCliError(`Diretório de saída inválido: ${dirname(absolute)}.`)
    }
    await access(canonicalDirectory, fsConstants.W_OK)
    return {
      absolute,
      canonical: join(canonicalDirectory, basename(absolute)),
    }
  }
}

function sameFileIdentity(left: PathIdentity, right: PathIdentity): boolean {
  if (normalizedPath(left.canonical) === normalizedPath(right.canonical)) return true
  return (
    left.metadata !== undefined &&
    right.metadata !== undefined &&
    left.metadata.dev === right.metadata.dev &&
    left.metadata.ino === right.metadata.ino
  )
}

async function resolveAndValidatePaths(args: MigratorCliArguments): Promise<{
  input: PathIdentity
  auditReport: PathIdentity
  output: PathIdentity
  migrationReport: PathIdentity
}> {
  const identities = {
    input: await pathIdentity(args.input, true),
    auditReport: await pathIdentity(args.auditReport, true),
    output: await pathIdentity(args.output, false),
    migrationReport: await pathIdentity(args.migrationReport, false),
  }
  const entries = Object.entries(identities) as [keyof typeof identities, PathIdentity][]
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex++) {
      const [leftName, left] = entries[leftIndex]
      const [rightName, right] = entries[rightIndex]
      if (sameFileIdentity(left, right)) {
        throw new MigratorCliError(
          `Os caminhos --${leftName.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} e ` +
            `--${rightName.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} devem ser distintos.`
        )
      }
    }
  }
  return identities
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function sha256CanonicalMigrationValue(value: unknown): string {
  return sha256(stableStringify(value))
}

function parseJson(bytes: Buffer, label: string): unknown {
  try {
    return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')) as unknown
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new MigrationValidationError(`${label} não contém JSON válido: ${detail}`)
  }
}

function temporaryPath(finalPath: string): string {
  return join(dirname(finalPath), `.${basename(finalPath)}.tmp-${process.pid}-${randomUUID()}`)
}

async function safeUnlink(path: string): Promise<void> {
  try {
    await unlink(path)
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error
  }
}

async function promoteExclusive(temporary: string, finalPath: string, label: string): Promise<void> {
  try {
    await link(temporary, finalPath)
  } catch (error) {
    if (errorCode(error) === 'EEXIST') {
      throw new MigratorCliError(`${label} já existe e foi preservado: ${finalPath}.`)
    }
    throw error
  }
}

export async function runHistoricalMigrator(
  argv: string[],
  hooks: MigratorRuntimeHooks = {}
): Promise<HistoricalMigrationReport> {
  const args = parseMigratorCliArguments(argv)
  const paths = await resolveAndValidatePaths(args)
  const inputBytesBefore = await readFile(paths.input.canonical)
  const auditBytesBefore = await readFile(paths.auditReport.canonical)
  const inputHashBefore = sha256(inputBytesBefore)
  const auditHash = sha256(auditBytesBefore)
  const inputBackup = parseJson(inputBytesBefore, 'O backup de input')
  const auditReportValue = parseJson(auditBytesBefore, 'O relatório dry-run')

  const prepared = await prepareCorsiMigration({
    backupValue: inputBackup,
    auditReportValue,
    inputSha256: inputHashBefore,
    inputSizeBytes: inputBytesBefore.byteLength,
    hashResult: sha256CanonicalMigrationValue,
  })
  const migratedOutputText = `${JSON.stringify(prepared.migratedBackup, null, 2)}\n`
  const migratedOutputBytes = Buffer.from(migratedOutputText, 'utf8')
  const migratedOutputValue = parseJson(migratedOutputBytes, 'O output serializado')
  await validateMigratedBackup({
    originalBackup: inputBackup,
    migratedBackup: migratedOutputValue,
    approvedSessionIds: prepared.migratedSessions.map((session) => session.sessionId),
    hashResult: sha256CanonicalMigrationValue,
  })

  const outputTemporary = temporaryPath(paths.output.absolute)
  const reportTemporary = temporaryPath(paths.migrationReport.absolute)
  let outputCreated = false
  let reportCreated = false
  try {
    await writeFile(outputTemporary, migratedOutputBytes, { flag: 'wx' })
    const temporaryBytes = await readFile(outputTemporary)
    if (!temporaryBytes.equals(migratedOutputBytes)) {
      throw new MigrationValidationError('A verificação do arquivo temporário de output falhou.')
    }

    await promoteExclusive(outputTemporary, paths.output.absolute, 'O output')
    outputCreated = true
    await hooks.afterOutputCreated?.()

    const outputBytesAfterWrite = await readFile(paths.output.absolute)
    const outputHash = sha256(outputBytesAfterWrite)
    if (!outputBytesAfterWrite.equals(migratedOutputBytes)) {
      throw new MigrationValidationError('O output final não corresponde aos bytes validados.')
    }
    const outputBackup = parseJson(outputBytesAfterWrite, 'O output final')
    const postValidation = await validateMigratedBackup({
      originalBackup: inputBackup,
      migratedBackup: outputBackup,
      approvedSessionIds: prepared.migratedSessions.map((session) => session.sessionId),
      hashResult: sha256CanonicalMigrationValue,
    })

    const inputBytesAfter = await readFile(paths.input.canonical)
    const auditBytesAfter = await readFile(paths.auditReport.canonical)
    const inputHashAfter = sha256(inputBytesAfter)
    if (!inputBytesAfter.equals(inputBytesBefore) || inputHashAfter !== inputHashBefore) {
      throw new MigrationValidationError('O input mudou durante a migração; o output foi descartado.')
    }
    if (!auditBytesAfter.equals(auditBytesBefore) || sha256(auditBytesAfter) !== auditHash) {
      throw new MigrationValidationError(
        'O relatório dry-run mudou durante a migração; o output foi descartado.'
      )
    }

    const approvedAudit = auditReportValue as HistoricalReprocessingReport
    const migratedSessionIds = prepared.migratedSessions.map((session) => session.sessionId)
    const identicalIds = prepared.migratedSessions
      .filter((session) => !session.divergent)
      .map((session) => session.sessionId)
    const migrationReport: HistoricalMigrationReport = {
      toolVersion: HISTORICAL_MIGRATOR_TOOL_VERSION,
      generatedAt: new Date().toISOString(),
      writeMigratedCopy: true,
      files: {
        input: {
          sizeBytes: inputBytesBefore.byteLength,
          sha256Before: inputHashBefore,
          sha256After: inputHashAfter,
          unchanged: true,
        },
        auditReport: {
          sizeBytes: auditBytesBefore.byteLength,
          sha256: auditHash,
          toolVersion: approvedAudit.toolVersion,
        },
        output: {
          path: paths.output.absolute,
          sizeBytes: outputBytesAfterWrite.byteLength,
          sha256: outputHash,
        },
      },
      summary: {
        totalSessions: prepared.approvedAnalysis.summary.totalSessions,
        totalCorsiSessions: prepared.approvedAnalysis.summary.totalCorsiSessions,
        migrated: prepared.migratedSessions.length,
        skipped: prepared.skippedSessions.length,
        numericallyDivergent: prepared.migratedSessions.filter((session) => session.divergent).length,
        numericallyIdenticalButVersioned: identicalIds.length,
      },
      migratedSessionIds,
      migratedSessions: prepared.migratedSessions,
      numericallyIdenticalButVersionedSessionIds: identicalIds,
      skippedSessions: prepared.skippedSessions,
      postWriteChecks: {
        outputJsonValid: true,
        outputHashVerified: true,
        inputBytesUnchanged: true,
        noLegacyCandidatesRemain: true,
        totalSessionsPreserved: true,
        totalCorsiSessionsPreserved: true,
        onlyApprovedSessionsChanged: true,
        corsiScoringVersionDistribution: postValidation.corsiDistribution,
      },
    }
    const reportBytes = Buffer.from(`${JSON.stringify(migrationReport, null, 2)}\n`, 'utf8')
    parseJson(reportBytes, 'O relatório de migração serializado')
    await writeFile(reportTemporary, reportBytes, { flag: 'wx' })
    if (!(await readFile(reportTemporary)).equals(reportBytes)) {
      throw new MigrationValidationError('A verificação do relatório temporário falhou.')
    }
    await promoteExclusive(reportTemporary, paths.migrationReport.absolute, 'O migration-report')
    reportCreated = true
    if (!(await readFile(paths.migrationReport.absolute)).equals(reportBytes)) {
      throw new MigrationValidationError('O migration-report final não corresponde aos bytes validados.')
    }
    return migrationReport
  } catch (error) {
    if (reportCreated) await safeUnlink(paths.migrationReport.absolute)
    if (outputCreated) await safeUnlink(paths.output.absolute)
    throw error
  } finally {
    await safeUnlink(outputTemporary)
    await safeUnlink(reportTemporary)
  }
}

function printSummary(report: HistoricalMigrationReport): void {
  process.stdout.write(
    [
      'Cópia migrada do backup Corsi criada com segurança.',
      `Sessões migradas: ${report.summary.migrated}; puladas: ${report.summary.skipped}.`,
      `Output: ${report.files.output.path}`,
    ].join('\n') + '\n'
  )
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url) {
  runHistoricalMigrator(process.argv.slice(2))
    .then(printSummary)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`Erro: ${message}\n`)
      process.exitCode = 1
    })
}
