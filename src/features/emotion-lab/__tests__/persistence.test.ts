import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SessionRecord, TestConditions } from '../../../types'
import type { EmotionalContext } from '../types'

const importSessionsSkipExisting = vi.fn()
const getAllSessions = vi.fn()
const saveSettings = vi.fn()

vi.mock('../../../storage/repository', () => ({
  importSessionsSkipExisting: (...args: unknown[]) => importSessionsSkipExisting(...args),
  getAllSessions: (...args: unknown[]) => getAllSessions(...args),
  saveSettings: (...args: unknown[]) => saveSettings(...args),
  getSettings: vi.fn(),
}))

import { importBackup, validateImportedSession } from '../../../storage/export'
import { sanitizeNumericValues } from '../../../storage/sanitize'

const CONTEXT: EmotionalContext = {
  version: 1,
  primaryEmotion: { emotionId: 'anxious', intensity: 4 },
  secondaryEmotion: { emotionId: 'hopeful', intensity: 2 },
  relationshipPerception: { rating: 70, confidence: 3 },
  updatedAt: '2026-07-19T10:00:00.000Z',
}

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId: 'emo-1',
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
        sessionId: 'emo-1',
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
    randomizationSeed: 42,
    ...overrides,
  }
}

function backupWith(sessions: unknown[], settings?: unknown) {
  return { version: '1.0.0', exportedAt: '2026-06-02T00:00:00.000Z', sessions, settings }
}

/** Sessões que o importador aceitou e passou adiante para escrita. */
function writtenSessions(): SessionRecord[] {
  return importSessionsSkipExisting.mock.calls[0][0] as SessionRecord[]
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

describe('compatibilidade retroativa', () => {
  it('sessão antiga sem contexto emocional continua válida', () => {
    const legacy = makeSession({ checkIn: { sleep: { hours: 7 } } })
    expect(validateImportedSession(legacy)).toBeNull()
  })

  it('sessão antiga sem checkIn nenhum continua válida', () => {
    expect(validateImportedSession(makeSession({ checkIn: undefined }))).toBeNull()
  })

  it('backup antigo importa sem ganhar campos inventados', async () => {
    await importBackup(backupWith([makeSession({ checkIn: { sleep: { hours: 7 } } })]))
    const [written] = writtenSessions()
    expect(written.checkIn?.emotionalContext).toBeUndefined()
    expect(written.checkIn?.sleep).toEqual({ hours: 7 })
  })

  it('contexto emocional malformado NUNCA rejeita a sessão', () => {
    const session = makeSession({
      checkIn: { emotionalContext: 'lixo' as unknown as EmotionalContext },
    })
    expect(validateImportedSession(session)).toBeNull()
  })
})

describe('importação — saneamento sem contaminar a sessão', () => {
  it('preserva contexto emocional válido', async () => {
    await importBackup(backupWith([makeSession({ checkIn: { emotionalContext: CONTEXT } })]))
    expect(writtenSessions()[0].checkIn?.emotionalContext).toEqual(CONTEXT)
  })

  it('descarta contexto malformado mantendo trials e demais condições', async () => {
    const session = makeSession({
      checkIn: {
        sleep: { hours: 8 },
        notes: 'observação preservada',
        emotionalContext: {
          version: 1,
          primaryEmotion: { emotionId: 'inexistente', intensity: 42 },
          relationshipPerception: { rating: 900 },
        } as unknown as EmotionalContext,
      },
    })

    await importBackup(backupWith([session]))
    const [written] = writtenSessions()

    expect(written.checkIn?.emotionalContext).toBeUndefined()
    expect(written.checkIn?.sleep).toEqual({ hours: 8 })
    expect(written.checkIn?.notes).toBe('observação preservada')
    expect(written.trials).toHaveLength(1)
    expect(written.trials[0].reactionTimeMs).toBe(280)
  })

  it('sanea parcialmente: parte válida entra, parte inválida some', async () => {
    const session = makeSession({
      checkIn: {
        emotionalContext: {
          version: 1,
          primaryEmotion: { emotionId: 'sad', intensity: 3 },
          secondaryEmotion: { emotionId: 'sad', intensity: 5 },
          relationshipPerception: { rating: 40, confidence: 99 },
        } as unknown as EmotionalContext,
      },
    })

    await importBackup(backupWith([session]))
    const context = writtenSessions()[0].checkIn?.emotionalContext

    expect(context?.primaryEmotion).toEqual({ emotionId: 'sad', intensity: 3 })
    expect(context?.secondaryEmotion).toBeUndefined()
    expect(context?.relationshipPerception).toEqual({ rating: 40 })
  })

  it('sanea também o checkIn espelhado em result', async () => {
    const bad = {
      version: 1,
      relationshipPerception: { rating: -50 },
    } as unknown as EmotionalContext
    const session = makeSession({
      checkIn: { emotionalContext: bad },
      result: {
        sessionId: 'emo-1',
        checkIn: { emotionalContext: bad },
      } as unknown as SessionRecord['result'],
    })

    await importBackup(backupWith([session]))
    const [written] = writtenSessions()

    expect(written.checkIn?.emotionalContext).toBeUndefined()
    expect(written.result?.checkIn?.emotionalContext).toBeUndefined()
  })

  it('campos extras injetados no contexto não chegam ao banco', async () => {
    const session = makeSession({
      checkIn: {
        emotionalContext: {
          version: 1,
          primaryEmotion: { emotionId: 'calm', intensity: 2 },
          diagnostico: 'texto arbitrário',
          relationshipScore: 88,
        } as unknown as EmotionalContext,
      },
    })

    await importBackup(backupWith([session]))
    const context = writtenSessions()[0].checkIn?.emotionalContext as unknown as Record<string, unknown>

    expect(Object.keys(context).sort()).toEqual(['primaryEmotion', 'version'])
  })
})

describe('ciclo exportar → importar → exportar', () => {
  it('preserva o contexto emocional na ida e na volta', async () => {
    const original = makeSession({ checkIn: { sleep: { hours: 7 }, emotionalContext: CONTEXT } })

    // Ida: o backup é JSON — o contexto precisa sobreviver à serialização.
    const roundTripped = JSON.parse(JSON.stringify(backupWith([original])))
    expect(roundTripped.sessions[0].checkIn.emotionalContext).toEqual(CONTEXT)

    // Volta: importação preserva integralmente.
    await importBackup(roundTripped)
    const written = writtenSessions()[0]
    expect(written.checkIn?.emotionalContext).toEqual(CONTEXT)

    // Reexportar o que foi escrito devolve o mesmo contexto.
    const reexported = JSON.parse(JSON.stringify({ sessions: [written] }))
    expect(reexported.sessions[0].checkIn.emotionalContext).toEqual(CONTEXT)
  })

  it('importar o mesmo backup duas vezes não duplica nem altera o contexto', async () => {
    const backup = backupWith([makeSession({ checkIn: { emotionalContext: CONTEXT } })])

    const first = await importBackup(backup)
    expect(first.imported).toBe(1)

    // Segunda passada: sessionId já existe ⇒ skip (política "manter dados locais").
    importSessionsSkipExisting.mockImplementationOnce(async () => ({
      added: [],
      skipped: ['emo-1'],
    }))
    const second = await importBackup(backup)

    expect(second.imported).toBe(0)
    expect(second.skipped).toBe(1)
    expect(second.success).toBe(true)
  })

  it('o rótulo da relação viaja em settings (documentado como parte do backup)', async () => {
    getAllSessions.mockResolvedValue([])
    await importBackup(
      backupWith([makeSession()], {
        theme: 'dark',
        fontScale: 1,
        developerMode: false,
        hasSeenIntro: true,
        demoDataActive: false,
        relationshipLabel: 'Fulano',
      })
    )
    expect(saveSettings).toHaveBeenCalledOnce()
    expect(saveSettings.mock.calls[0][0]).toMatchObject({ relationshipLabel: 'Fulano' })
  })
})

describe('sanitização numérica na escrita', () => {
  it('não corrompe o contexto emocional', () => {
    const checkIn: TestConditions = { emotionalContext: CONTEXT }
    expect(sanitizeNumericValues(checkIn).emotionalContext).toEqual(CONTEXT)
  })

  it('converte números não finitos que tenham escapado', () => {
    const checkIn = {
      emotionalContext: { version: 1, relationshipPerception: { rating: NaN } },
    } as unknown as TestConditions
    const out = sanitizeNumericValues(checkIn)
    expect(out.emotionalContext?.relationshipPerception?.rating).toBeNull()
  })
})
