import { createHash } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { access, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { stableStringify } from '../src/historical-reprocessing/canonical'
import {
  analyzeCorsiDryRun,
  BackupValidationError,
} from '../src/historical-reprocessing/corsiDryRun'
import {
  HISTORICAL_REPROCESSOR_TOOL_VERSION,
  type HistoricalReprocessingReport,
} from '../src/historical-reprocessing/types'

interface CliArguments {
  input: string
  report: string
  dryRun: true
}

export class CliArgumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CliArgumentError'
  }
}

function takeValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) {
    throw new CliArgumentError(`A opção ${option} exige um caminho.`)
  }
  return value
}

export function parseCliArguments(argv: string[]): CliArguments {
  let input: string | undefined
  let report: string | undefined
  let dryRun = false

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--input') {
      if (input !== undefined) throw new CliArgumentError('A opção --input foi informada mais de uma vez.')
      input = takeValue(argv, index, argument)
      index += 1
      continue
    }
    if (argument === '--report') {
      if (report !== undefined) throw new CliArgumentError('A opção --report foi informada mais de uma vez.')
      report = takeValue(argv, index, argument)
      index += 1
      continue
    }
    if (argument === '--dry-run') {
      if (dryRun) throw new CliArgumentError('A opção --dry-run foi informada mais de uma vez.')
      dryRun = true
      continue
    }
    if (argument.startsWith('--')) {
      throw new CliArgumentError(
        `Opção não suportada nesta versão somente-dry-run: ${argument}.`
      )
    }
    throw new CliArgumentError(`Argumento posicional inesperado: ${argument}.`)
  }

  if (input === undefined) throw new CliArgumentError('Informe --input <backup-copy.json>.')
  if (report === undefined) throw new CliArgumentError('Informe --report <report.json>.')
  if (!dryRun) throw new CliArgumentError('A opção --dry-run é obrigatória nesta versão.')

  return { input, report, dryRun: true }
}

function normalizedPath(path: string): string {
  const absolute = resolve(path)
  return process.platform === 'win32' ? absolute.toLocaleLowerCase('en-US') : absolute
}

async function assertDistinctPaths(inputPath: string, reportPath: string): Promise<string> {
  if (normalizedPath(inputPath) === normalizedPath(reportPath)) {
    throw new CliArgumentError('--input e --report não podem apontar para o mesmo caminho.')
  }

  const canonicalInput = await realpath(inputPath)
  try {
    const canonicalReport = await realpath(reportPath)
    if (normalizedPath(canonicalInput) === normalizedPath(canonicalReport)) {
      throw new CliArgumentError('--input e --report não podem apontar para o mesmo arquivo.')
    }
  } catch (error) {
    const code = isRecord(error) ? error.code : undefined
    if (code !== 'ENOENT') throw error
  }
  return canonicalInput
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function sha256Canonical(value: unknown): string {
  return sha256(stableStringify(value))
}

function parseBackup(bytes: Buffer): unknown {
  const text = bytes.toString('utf8').replace(/^\uFEFF/, '')
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new BackupValidationError(`JSON de entrada inválido: ${detail}`)
  }
}

async function ensureReportDirectoryExists(reportPath: string): Promise<void> {
  const directory = dirname(reportPath)
  let metadata
  try {
    metadata = await stat(directory)
  } catch {
    throw new CliArgumentError(`O diretório de --report não existe: ${directory}.`)
  }
  if (!metadata.isDirectory()) {
    throw new CliArgumentError(`O diretório de --report não é um diretório: ${directory}.`)
  }
  await access(directory, fsConstants.W_OK)
}

export async function runHistoricalReprocessor(
  argv: string[]
): Promise<HistoricalReprocessingReport> {
  const args = parseCliArguments(argv)
  const inputPath = resolve(args.input)
  const reportPath = resolve(args.report)
  const canonicalInput = await assertDistinctPaths(inputPath, reportPath)

  const inputMetadata = await stat(canonicalInput)
  if (!inputMetadata.isFile()) {
    throw new BackupValidationError('--input precisa apontar para um arquivo JSON regular.')
  }
  await ensureReportDirectoryExists(reportPath)

  const bytesBefore = await readFile(canonicalInput)
  const hashBefore = sha256(bytesBefore)
  const backup = parseBackup(bytesBefore)
  const analysis = await analyzeCorsiDryRun(backup, sha256Canonical)

  const bytesAfter = await readFile(canonicalInput)
  const hashAfter = sha256(bytesAfter)
  if (!bytesBefore.equals(bytesAfter)) {
    throw new BackupValidationError(
      'O arquivo de entrada mudou durante a auditoria; nenhum relatório foi escrito.'
    )
  }

  const report: HistoricalReprocessingReport = {
    toolVersion: HISTORICAL_REPROCESSOR_TOOL_VERSION,
    generatedAt: new Date().toISOString(),
    dryRun: true,
    inputFile: {
      sizeBytes: bytesBefore.byteLength,
      sha256Before: hashBefore,
      sha256After: hashAfter,
      unchanged: hashBefore === hashAfter,
    },
    ...analysis,
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'w',
  })
  return report
}

function printSummary(report: HistoricalReprocessingReport): void {
  const { summary } = report
  process.stdout.write(
    [
      'Dry-run Corsi concluído.',
      `Sessões: ${summary.totalSessions}; Corsi: ${summary.totalCorsiSessions}; candidatas: ${summary.candidates}.`,
      `Reprocessáveis: ${summary.reprocessable}; divergentes: ${summary.divergent}; idênticas: ${summary.identical}.`,
      `Não reprocessáveis: ${summary.nonReprocessable}; puladas: ${summary.skipped}.`,
    ].join('\n') + '\n'
  )
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url) {
  runHistoricalReprocessor(process.argv.slice(2))
    .then(printSummary)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`Erro: ${message}\n`)
      process.exitCode = 1
    })
}
