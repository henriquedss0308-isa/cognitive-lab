import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SessionRecord } from '../../../types'

const importSessionsSkipExisting = vi.fn()
const getAllSessions = vi.fn()
const saveSettings = vi.fn()

vi.mock('../../../storage/repository', () => ({
  importSessionsSkipExisting: (...args: unknown[]) => importSessionsSkipExisting(...args),
  getAllSessions: (...args: unknown[]) => getAllSessions(...args),
  saveSettings: (...args: unknown[]) => saveSettings(...args),
  getSettings: vi.fn(),
}))

import { importBackup } from '../../../storage/export'
import { getSessionLisdexamfetamineStatus } from '../medicationContext'

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId: 'bkp-1',
    testId: 'simple_rt',
    protocolVersion: 'reaction.simple.v1.0',
    mode: 'assessment',
    status: 'completed',
    startedAt: '2026-06-01T10:00:00.000Z',
    completedAt: '2026-06-01T10:05:00.000Z',
    quality: 'valid',
    flags: {},
    flagMessages: [],
    trials: [
      {
        trialId: 't-1',
        sessionId: 'bkp-1',
        testId: 'simple_rt',
        protocolVersion: 'reaction.simple.v1.0',
        mode: 'assessment',
        blockIndex: 0,
        trialIndex: 0,
        condition: 'simple',
        stimulus: 'green_circle',
        expectedResponse: 'space',
        actualResponse: 'space',
        correct: true,
        reactionTimeMs: 280,
        stimulusOnsetTimestamp: 1000,
        responseTimestamp: 1280,
        windowFocused: true,
        visibilityState: 'visible',
        deviceType: 'desktop',
        inputMethod: 'keyboard',
      },
    ],
    deviceInfo: {
      deviceType: 'desktop',
      inputMethod: 'keyboard',
      screenWidth: 1920,
      screenHeight: 1080,
      browser: 'Chrome',
      userAgent: 'test',
    },
    isDemo: false,
    practiceCompleted: true,
    randomizationSeed: 7,
    ...overrides,
  }
}

function backup(sessions: unknown[]) {
  return { version: '1.0.0', exportedAt: '2026-07-21T00:00:00.000Z', sessions, settings: {} }
}

/** Sessões que o import repassou para gravação. */
function written(): SessionRecord[] {
  return importSessionsSkipExisting.mock.calls[0]?.[0] ?? []
}

beforeEach(() => {
  importSessionsSkipExisting.mockReset()
  getAllSessions.mockReset()
  saveSettings.mockReset()
  getAllSessions.mockResolvedValue([])
  importSessionsSkipExisting.mockImplementation(async (sessions: SessionRecord[]) => ({
    added: sessions.map((s) => s.sessionId),
    skipped: [],
  }))
})

describe('saneamento do registro medicamentoso na importação', () => {
  it('estado válido atravessa intacto', async () => {
    const report = await importBackup(
      backup([
        makeSession({
          checkIn: { medications: { lisdexamfetamine: { status: 'taken', dose: '30 mg' } } },
        }),
      ])
    )

    expect(report.imported).toBe(1)
    expect(written()[0].checkIn?.medications?.lisdexamfetamine).toEqual({
      status: 'taken',
      dose: '30 mg',
    })
  })

  it.each([
    ['string desconhecida', 'Taken'],
    ['booleano', true],
    ['número', 1],
    ['nulo', null],
    ['objeto', { valor: 'taken' }],
    ['texto em português', 'tomou'],
  ])('valor inválido (%s) cai para unknown em vez de rejeitar a sessão', async (_label, value) => {
    const report = await importBackup(
      backup([
        makeSession({
          checkIn: { medications: { lisdexamfetamine: { status: value } } } as never,
        }),
      ])
    )

    expect(report.imported).toBe(1)
    expect(report.rejected).toEqual([])
    expect(getSessionLisdexamfetamineStatus(written()[0])).toBe('unknown')
  })

  it('registro malformado não descarta trials nem as demais condições', async () => {
    await importBackup(
      backup([
        makeSession({
          checkIn: {
            sleep: { hours: 7, quality: 4 },
            substances: { caffeine: true, medicationName: 'Venvanse' },
            medications: 'lixo' as never,
          },
        }),
      ])
    )

    const record = written()[0]
    expect(record.trials).toHaveLength(1)
    expect(record.checkIn?.sleep).toEqual({ hours: 7, quality: 4 })
    expect(record.checkIn?.substances).toEqual({ caffeine: true, medicationName: 'Venvanse' })
    expect(record.checkIn?.medications).toBeUndefined()
    // E o texto livre continua sem classificar nada.
    expect(getSessionLisdexamfetamineStatus(record)).toBe('unknown')
  })

  it('medicamento não suportado é descartado sem afetar o suportado', async () => {
    await importBackup(
      backup([
        makeSession({
          checkIn: {
            medications: {
              lisdexamfetamine: { status: 'not_taken' },
              methylphenidate: { status: 'taken' },
            },
          } as never,
        }),
      ])
    )

    const medications = written()[0].checkIn?.medications
    expect(medications).toEqual({ lisdexamfetamine: { status: 'not_taken' } })
    expect(medications).not.toHaveProperty('methylphenidate')
  })

  it('o espelho em result.checkIn também é saneado', async () => {
    await importBackup(
      backup([
        makeSession({
          checkIn: { medications: { lisdexamfetamine: { status: 'nonsense' } } } as never,
          result: {
            ...makeSession().result,
            checkIn: { medications: { lisdexamfetamine: { status: 'nonsense' } } },
          } as never,
        }),
      ])
    )

    const record = written()[0]
    expect(getSessionLisdexamfetamineStatus(record)).toBe('unknown')
    expect(getSessionLisdexamfetamineStatus({ checkIn: record.result?.checkIn })).toBe('unknown')
  })

  it('contexto emocional e medicamentoso são saneados na mesma passagem', async () => {
    await importBackup(
      backup([
        makeSession({
          checkIn: {
            emotionalContext: {
              version: 1,
              primaryEmotion: { emotionId: 'calm', intensity: 3 },
              relationshipPerception: { rating: 999 },
            },
            medications: { lisdexamfetamine: { status: 'taken' } },
          } as never,
        }),
      ])
    )

    const checkIn = written()[0].checkIn
    // Percepção fora da faixa é descartada (regra do Emotion Lab)…
    expect(checkIn?.emotionalContext?.relationshipPerception).toBeUndefined()
    expect(checkIn?.emotionalContext?.primaryEmotion).toEqual({ emotionId: 'calm', intensity: 3 })
    // …e o registro medicamentoso válido sobrevive.
    expect(checkIn?.medications?.lisdexamfetamine).toEqual({ status: 'taken' })
  })
})

describe('compatibilidade dos backups', () => {
  it('backup antigo sem o campo importa sem ganhar campos inventados', async () => {
    await importBackup(backup([makeSession({ checkIn: { sleep: { hours: 8 } } })]))
    const record = written()[0]

    expect(record.checkIn).toEqual({ sleep: { hours: 8 } })
    expect(record.checkIn).not.toHaveProperty('medications')
  })

  it('backup sem checkIn nenhum continua importando', async () => {
    const report = await importBackup(backup([makeSession({ checkIn: undefined })]))
    expect(report.imported).toBe(1)
    expect(written()[0].checkIn).toBeUndefined()
  })

  it('sessões locais nunca são sobrescritas por um backup', async () => {
    importSessionsSkipExisting.mockResolvedValue({ added: [], skipped: ['bkp-1'] })
    getAllSessions.mockResolvedValue([makeSession({ checkIn: { medications: { lisdexamfetamine: { status: 'taken' } } } })])

    const report = await importBackup(
      backup([makeSession({ checkIn: { sleep: { hours: 5 } } })])
    )

    expect(report.imported).toBe(0)
    expect(report.skipped).toBe(1)
    expect(report.message).toContain('mantida')
  })

  it('ida e volta preserva o registro', async () => {
    const original = makeSession({
      checkIn: { medications: { lisdexamfetamine: { status: 'not_taken', time: '08:00' } } },
    })
    const roundTripped = JSON.parse(JSON.stringify(backup([original])))

    await importBackup(roundTripped)
    expect(written()[0].checkIn?.medications?.lisdexamfetamine).toEqual({
      status: 'not_taken',
      time: '08:00',
    })
  })
})
