import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SessionRecord, TestConditions } from '../../../types'

const store = new Map<string, SessionRecord>()
let putShouldFail = false

vi.mock('../../../storage/db', () => ({
  DEFAULT_SETTINGS: {},
  getDB: async () => ({
    get: async (_: string, id: string) => store.get(id),
    put: async (_: string, value: SessionRecord) => {
      if (putShouldFail) throw new Error('QuotaExceededError')
      store.set(value.sessionId, value)
    },
    getAll: async () => [...store.values()],
    delete: async (_: string, id: string) => {
      store.delete(id)
    },
    transaction: () => ({
      store: {
        put: async (value: SessionRecord) => {
          if (putShouldFail) throw new Error('QuotaExceededError')
          store.set(value.sessionId, value)
        },
        delete: async (id: string) => {
          store.delete(id)
        },
        getAllKeys: async () => [...store.keys()],
      },
      done: Promise.resolve(),
    }),
  }),
}))

import {
  getAllSessions,
  getLatestConditions,
  getSession,
  importSessionsSkipExisting,
  saveSession,
  updateSessionConditions,
} from '../../../storage/repository'
import { getSessionLisdexamfetamineStatus } from '../medicationContext'
import type { LisdexamfetamineStatus } from '../types'

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId: 'sess-med',
    testId: 'simple_rt',
    protocolVersion: 'reaction.simple.v1.0',
    mode: 'assessment',
    status: 'completed',
    startedAt: '2026-07-01T10:00:00.000Z',
    completedAt: '2026-07-01T10:06:00.000Z',
    quality: 'valid',
    flags: { windowLostFocus: true },
    flagMessages: ['aviso preservado'],
    trials: [
      {
        trialId: 't-1',
        sessionId: 'sess-med',
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

function checkInWith(status: LisdexamfetamineStatus, extra: TestConditions = {}): TestConditions {
  return { ...extra, medications: { lisdexamfetamine: { status } } }
}

function makeResult(): NonNullable<SessionRecord['result']> {
  return {
    sessionId: 'sess-med',
    testId: 'simple_rt',
    protocolVersion: 'reaction.simple.v1.0',
    mode: 'assessment',
    startedAt: '2026-07-01T10:00:00.000Z',
    completedAt: '2026-07-01T10:06:00.000Z',
    quality: 'valid',
    flags: { windowLostFocus: true },
    flagMessages: ['aviso preservado'],
    rtMetrics: {
      medianCorrectRT: 280,
      meanCorrectRT: 285,
      rtStandardDeviation: 12,
      rtIQR: 15,
      rtCoefficientOfVariation: 0.04,
      p10RT: 260,
      p90RT: 310,
      anticipationRate: 0,
      lapseRate: 0,
      validTrialCount: 1,
      invalidTrialCount: 0,
    },
    accuracyMetrics: {
      accuracy: 1,
      correctCount: 1,
      errorCount: 0,
      omissionCount: 0,
      totalTrials: 1,
    },
    conditionMetrics: {},
    blockMetrics: [],
    customMetrics: { meanRT: 285 },
    baselinePhase: 'familiarization',
    isDemo: false,
    deviceInfo: makeSession().deviceInfo,
    scoringVersion: 'sdt-hautus-1',
  }
}

beforeEach(() => {
  store.clear()
  putShouldFail = false
})

describe('salvar e recarregar', () => {
  it('o estado medicamentoso sobrevive ao ciclo de gravação e leitura', async () => {
    await saveSession(makeSession({ checkIn: checkInWith('taken', { sleep: { hours: 7 } }) }))
    const reloaded = await getSession('sess-med')

    expect(getSessionLisdexamfetamineStatus(reloaded!)).toBe('taken')
    expect(reloaded?.checkIn?.sleep).toEqual({ hours: 7 })
  })

  it('dose e horário descritivos sobrevivem', async () => {
    await saveSession(
      makeSession({
        checkIn: { medications: { lisdexamfetamine: { status: 'taken', dose: '30 mg', time: '07:30' } } },
      })
    )
    const reloaded = await getSession('sess-med')
    expect(reloaded?.checkIn?.medications?.lisdexamfetamine).toEqual({
      status: 'taken',
      dose: '30 mg',
      time: '07:30',
    })
  })

  it('sessão antiga sem o campo continua salvando e abrindo', async () => {
    await saveSession(makeSession({ checkIn: { sleep: { hours: 8 } } }))
    const reloaded = await getSession('sess-med')

    expect(reloaded).toBeDefined()
    expect(reloaded?.checkIn?.medications).toBeUndefined()
    expect(getSessionLisdexamfetamineStatus(reloaded!)).toBe('unknown')
  })

  it('sessão sem checkIn nenhum continua válida', async () => {
    await saveSession(makeSession({ checkIn: undefined }))
    const reloaded = await getSession('sess-med')
    expect(reloaded).toBeDefined()
    expect(getSessionLisdexamfetamineStatus(reloaded!)).toBe('unknown')
  })
})

describe('edição pós-sessão', () => {
  it('registra o estado medicamentoso sem tocar em trials, métricas ou datas', async () => {
    const original = makeSession({ checkIn: { sleep: { hours: 6 } }, result: makeResult() })
    await saveSession(original)

    const updated = await updateSessionConditions('sess-med', checkInWith('not_taken', { sleep: { hours: 6 } }))

    expect(getSessionLisdexamfetamineStatus(updated!)).toBe('not_taken')
    // Nada mais pode ter mudado.
    expect(updated?.trials).toEqual(original.trials)
    expect(updated?.result?.rtMetrics).toEqual(original.result!.rtMetrics)
    expect(updated?.result?.accuracyMetrics).toEqual(original.result!.accuracyMetrics)
    expect(updated?.result?.customMetrics).toEqual(original.result!.customMetrics)
    expect(updated?.result?.baselinePhase).toBe('familiarization')
    expect(updated?.result?.scoringVersion).toBe('sdt-hautus-1')
    expect(updated?.quality).toBe('valid')
    expect(updated?.flags).toEqual(original.flags)
    expect(updated?.flagMessages).toEqual(original.flagMessages)
    expect(updated?.startedAt).toBe(original.startedAt)
    expect(updated?.completedAt).toBe(original.completedAt)
    expect(updated?.randomizationSeed).toBe(original.randomizationSeed)
  })

  it('permite registrar os três estados, inclusive voltar para desconhecido', async () => {
    await saveSession(makeSession({ checkIn: {} }))

    for (const status of ['taken', 'not_taken', 'unknown'] as const) {
      const updated = await updateSessionConditions('sess-med', checkInWith(status))
      expect(getSessionLisdexamfetamineStatus(updated!)).toBe(status)
    }
  })

  it('o espelho em result.checkIn acompanha a edição', async () => {
    await saveSession(makeSession({ sessionId: 'com-result', checkIn: {}, result: makeResult() }))

    const updated = await updateSessionConditions('com-result', checkInWith('taken'))

    expect(updated?.result).toBeDefined()
    expect(getSessionLisdexamfetamineStatus({ checkIn: updated!.result!.checkIn })).toBe('taken')
    expect(getSessionLisdexamfetamineStatus(updated!)).toBe('taken')
  })

  it('sessão sem result é editada sem inventar um result', async () => {
    await saveSession(makeSession({ checkIn: {} }))
    const updated = await updateSessionConditions('sess-med', checkInWith('taken'))

    expect(updated?.result).toBeUndefined()
    expect(getSessionLisdexamfetamineStatus(updated!)).toBe('taken')
  })

  it('falha do IndexedDB propaga o erro sem corromper o registro em memória', async () => {
    await saveSession(makeSession({ checkIn: checkInWith('taken') }))
    putShouldFail = true

    await expect(updateSessionConditions('sess-med', checkInWith('not_taken'))).rejects.toThrow()

    putShouldFail = false
    const stored = await getSession('sess-med')
    expect(getSessionLisdexamfetamineStatus(stored!)).toBe('taken')
  })

  it('editar sessão inexistente devolve undefined em vez de lançar', async () => {
    await expect(updateSessionConditions('nao-existe', checkInWith('taken'))).resolves.toBeUndefined()
  })
})

describe('reaproveitamento de condições anteriores', () => {
  it('não copia o estado medicamentoso da sessão anterior', async () => {
    await saveSession(
      makeSession({
        sessionId: 'anterior',
        checkIn: checkInWith('taken', { sleep: { hours: 7 }, environment: { headphones: true } }),
      })
    )

    const latest = await getLatestConditions()

    // O que se repete de um dia para o outro é copiado…
    expect(latest?.sleep).toEqual({ hours: 7 })
    expect(latest?.environment).toEqual({ headphones: true })
    // …mas o estado medicamentoso é um fato do dia e não é presumido.
    expect(latest?.medications).toBeUndefined()
    expect(getSessionLisdexamfetamineStatus({ checkIn: latest })).toBe('unknown')
  })

  it('também não copia de uma sessão que registrou "não tomou"', async () => {
    await saveSession(makeSession({ sessionId: 'anterior', checkIn: checkInWith('not_taken') }))
    const latest = await getLatestConditions()
    expect(latest?.medications).toBeUndefined()
  })
})

describe('importação', () => {
  it('importa o registro estruturado de um backup novo', async () => {
    const { added } = await importSessionsSkipExisting([
      makeSession({ sessionId: 'imp-1', checkIn: checkInWith('taken') }),
    ])
    expect(added).toEqual(['imp-1'])
    expect(getSessionLisdexamfetamineStatus((await getSession('imp-1'))!)).toBe('taken')
  })

  it('backup antigo sem o campo importa sem ganhar campos inventados', async () => {
    await importSessionsSkipExisting([
      makeSession({ sessionId: 'antiga', checkIn: { sleep: { hours: 7 } } }),
    ])
    const imported = await getSession('antiga')

    expect(imported?.checkIn?.medications).toBeUndefined()
    expect(getSessionLisdexamfetamineStatus(imported!)).toBe('unknown')
  })

  it('importar duas vezes não duplica nem sobrescreve', async () => {
    const local = makeSession({ sessionId: 'dupla', checkIn: checkInWith('taken') })
    await importSessionsSkipExisting([local])

    // Segunda importação do "mesmo" id trazendo informação MENOS completa.
    const fromBackup = makeSession({ sessionId: 'dupla', checkIn: { sleep: { hours: 5 } } })
    const { added, skipped } = await importSessionsSkipExisting([fromBackup])

    expect(added).toEqual([])
    expect(skipped).toEqual(['dupla'])
    expect((await getAllSessions()).filter((s) => s.sessionId === 'dupla')).toHaveLength(1)
    // O dado local mais completo sobreviveu.
    expect(getSessionLisdexamfetamineStatus((await getSession('dupla'))!)).toBe('taken')
  })
})
