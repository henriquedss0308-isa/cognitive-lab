import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SessionRecord } from '../../types'

const importSessionsSkipExisting = vi.fn()
const getAllSessions = vi.fn()
const saveSettings = vi.fn()

vi.mock('../repository', () => ({
  importSessionsSkipExisting: (...args: unknown[]) => importSessionsSkipExisting(...args),
  getAllSessions: (...args: unknown[]) => getAllSessions(...args),
  saveSettings: (...args: unknown[]) => saveSettings(...args),
  getSettings: vi.fn(),
}))

import { importBackup, validateImportedSession } from '../export'

function makeBackupSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId: 'imp-1',
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
        sessionId: 'imp-1',
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

function backupWith(sessions: unknown[]) {
  return { version: '1.0.0', exportedAt: '2026-06-02T00:00:00.000Z', sessions }
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

describe('validateImportedSession — estrutura estrita (P0-5)', () => {
  it('aceita sessão bem formada', () => {
    expect(validateImportedSession(makeBackupSession())).toBeNull()
  })

  it.each([
    ['trials não-array', { trials: 'oops' as unknown as SessionRecord['trials'] }, /trials/],
    ['quality fora do enum', { quality: 'banana' as SessionRecord['quality'] }, /quality/],
    ['testId desconhecido', { testId: 'iq_test' as SessionRecord['testId'] }, /testId/],
    ['mode inválido', { mode: 'x' as SessionRecord['mode'] }, /mode/],
    ['status inválido', { status: 'meio' as SessionRecord['status'] }, /status/],
    ['startedAt não parseável', { startedAt: 'ontem' }, /startedAt/],
    ['sem protocolVersion', { protocolVersion: '' }, /protocolVersion/],
  ])('rejeita %s', (_label, overrides, expected) => {
    expect(validateImportedSession(makeBackupSession(overrides))).toMatch(expected)
  })

  it('rejeita trial sem trialId ou com correct não-booleano', () => {
    const badTrial = makeBackupSession()
    ;(badTrial.trials[0] as unknown as Record<string, unknown>).correct = 'sim'
    expect(validateImportedSession(badTrial)).toMatch(/correct/)
  })
})

describe('importBackup — política não destrutiva', () => {
  it('sessão duplicada é ignorada, nunca sobrescrita (idempotência)', async () => {
    importSessionsSkipExisting.mockResolvedValueOnce({ added: [], skipped: ['imp-1'] })
    const r = await importBackup(backupWith([makeBackupSession()]))
    expect(r.imported).toBe(0)
    expect(r.skipped).toBe(1)
    expect(r.success).toBe(true)
    expect(r.message).toMatch(/mantida/)
  })

  it('sessão malformada é rejeitada por item sem bloquear as válidas', async () => {
    const ok = makeBackupSession({ sessionId: 'ok-1' })
    const bad = makeBackupSession({ sessionId: 'bad-1', trials: 'x' as unknown as SessionRecord['trials'] })
    const r = await importBackup(backupWith([ok, bad]))
    expect(r.imported).toBe(1)
    expect(r.rejected).toEqual([{ sessionId: 'bad-1', reason: expect.stringMatching(/trials/) }])
    const passed = importSessionsSkipExisting.mock.calls[0][0] as SessionRecord[]
    expect(passed.map((s) => s.sessionId)).toEqual(['ok-1'])
  })

  it('todas malformadas ⇒ falha sem tocar o banco', async () => {
    const r = await importBackup(backupWith([{ sessionId: 'x', testId: 'simple_rt' }]))
    expect(r.success).toBe(false)
    expect(importSessionsSkipExisting).not.toHaveBeenCalled()
    expect(getAllSessions).not.toHaveBeenCalled()
  })

  it('settings do backup NÃO são aplicados quando há sessões locais', async () => {
    getAllSessions.mockResolvedValue([makeBackupSession({ sessionId: 'local-1' })])
    await importBackup({
      ...backupWith([makeBackupSession({ sessionId: 'nova' })]),
      settings: { theme: 'dark', fontScale: 2, developerMode: true, hasSeenIntro: false, demoDataActive: false },
    })
    expect(saveSettings).not.toHaveBeenCalled()
  })

  it('settings aplicados apenas em banco vazio (restauração de dispositivo novo)', async () => {
    getAllSessions.mockResolvedValue([])
    await importBackup({
      ...backupWith([makeBackupSession()]),
      settings: { theme: 'dark', fontScale: 1, developerMode: false, hasSeenIntro: true, demoDataActive: false },
    })
    expect(saveSettings).toHaveBeenCalledOnce()
  })

  it('avisa quando sessões importadas antecedem as locais (janela do baseline)', async () => {
    getAllSessions.mockResolvedValue([
      makeBackupSession({ sessionId: 'local-nova', startedAt: '2026-07-01T10:00:00.000Z' }),
    ])
    const r = await importBackup(
      backupWith([makeBackupSession({ sessionId: 'antiga', startedAt: '2026-05-01T10:00:00.000Z' })])
    )
    expect(r.baselineWarning).toBe(true)
    expect(r.message).toMatch(/recompor/)
  })

  it('JSON de tipo errado falha cedo com mensagem', async () => {
    expect((await importBackup(null)).success).toBe(false)
    expect((await importBackup([1, 2])).success).toBe(false)
    expect((await importBackup({ version: 1, sessions: {} })).success).toBe(false)
  })
})
