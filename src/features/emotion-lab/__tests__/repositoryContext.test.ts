import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SessionRecord } from '../../../types'
import type { EmotionalContext } from '../types'

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
  getLatestConditions,
  getSession,
  saveSession,
  updateSessionConditions,
} from '../../../storage/repository'

const CONTEXT: EmotionalContext = {
  version: 1,
  primaryEmotion: { emotionId: 'anxious', intensity: 4 },
  relationshipPerception: { rating: 70, confidence: 3 },
  updatedAt: '2026-07-19T10:00:00.000Z',
}

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId: 'sess-emo',
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
        sessionId: 'sess-emo',
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
    result: {
      sessionId: 'sess-emo',
      testId: 'simple_rt',
      protocolVersion: 'reaction.simple.v1.0',
      mode: 'assessment',
      startedAt: '2026-07-01T10:00:00.000Z',
      completedAt: '2026-07-01T10:06:00.000Z',
      quality: 'valid',
      flags: {},
      flagMessages: [],
      rtMetrics: {
        medianCorrectRT: 280,
        meanCorrectRT: 280,
        rtStandardDeviation: 12,
        rtIQR: 20,
        rtCoefficientOfVariation: 0.04,
        p10RT: 250,
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
      customMetrics: { meanRT: 280 },
      baselinePhase: 'monitoring',
      isDemo: false,
      deviceInfo: {
        deviceType: 'desktop',
        inputMethod: 'keyboard',
        screenWidth: 1920,
        screenHeight: 1080,
        browser: 'Chrome',
        userAgent: 'test',
      },
    },
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

beforeEach(() => {
  store.clear()
  putShouldFail = false
})

describe('persistência do contexto emocional', () => {
  it('salva e recarrega o contexto intacto', async () => {
    await saveSession(makeSession({ checkIn: { sleep: { hours: 7 }, emotionalContext: CONTEXT } }))

    const reloaded = await getSession('sess-emo')
    expect(reloaded?.checkIn?.emotionalContext).toEqual(CONTEXT)
    expect(reloaded?.checkIn?.sleep).toEqual({ hours: 7 })
  })

  it('sessão sem contexto emocional recarrega normalmente', async () => {
    await saveSession(makeSession({ checkIn: { sleep: { hours: 7 } } }))

    const reloaded = await getSession('sess-emo')
    expect(reloaded?.checkIn?.emotionalContext).toBeUndefined()
    expect(reloaded?.trials).toHaveLength(1)
  })
})

describe('edição posterior — só o contexto muda', () => {
  it('preserva trials, métricas, qualidade, flags e duração', async () => {
    const original = makeSession({ checkIn: { sleep: { hours: 7 } } })
    await saveSession(original)

    const updated = await updateSessionConditions('sess-emo', {
      sleep: { hours: 7 },
      emotionalContext: CONTEXT,
    })

    expect(updated?.checkIn?.emotionalContext).toEqual(CONTEXT)
    // Tudo o que não é contexto permanece byte a byte igual.
    expect(updated?.trials).toEqual(original.trials)
    expect(updated?.result?.rtMetrics).toEqual(original.result?.rtMetrics)
    expect(updated?.result?.accuracyMetrics).toEqual(original.result?.accuracyMetrics)
    expect(updated?.result?.customMetrics).toEqual(original.result?.customMetrics)
    expect(updated?.result?.baselinePhase).toBe('monitoring')
    expect(updated?.quality).toBe('valid')
    expect(updated?.flags).toEqual({ windowLostFocus: true })
    expect(updated?.flagMessages).toEqual(['aviso preservado'])
    expect(updated?.startedAt).toBe(original.startedAt)
    expect(updated?.completedAt).toBe(original.completedAt)
    expect(updated?.status).toBe('completed')
    expect(updated?.randomizationSeed).toBe(42)
  })

  it('espelha o contexto em result.checkIn', async () => {
    await saveSession(makeSession())
    const updated = await updateSessionConditions('sess-emo', { emotionalContext: CONTEXT })

    expect(updated?.result?.checkIn?.emotionalContext).toEqual(CONTEXT)
  })

  it('remover o contexto não apaga as demais condições', async () => {
    await saveSession(makeSession({ checkIn: { sleep: { hours: 7 }, emotionalContext: CONTEXT } }))
    const updated = await updateSessionConditions('sess-emo', { sleep: { hours: 7 } })

    expect(updated?.checkIn?.emotionalContext).toBeUndefined()
    expect(updated?.checkIn?.sleep).toEqual({ hours: 7 })
    expect(updated?.trials).toHaveLength(1)
  })

  it('sobrevive ao recarregamento (persistiu de fato)', async () => {
    await saveSession(makeSession())
    await updateSessionConditions('sess-emo', { emotionalContext: CONTEXT })

    const reloaded = await getSession('sess-emo')
    expect(reloaded?.checkIn?.emotionalContext).toEqual(CONTEXT)
  })
})

describe('falha de persistência', () => {
  it('propaga o erro em vez de fingir sucesso silencioso', async () => {
    putShouldFail = true
    await expect(saveSession(makeSession({ checkIn: { emotionalContext: CONTEXT } }))).rejects.toThrow(
      /QuotaExceeded/
    )
  })

  it('a rejeição é observável para a interface tratar (sem congelar)', async () => {
    await saveSession(makeSession())
    putShouldFail = true

    // O importante: a promessa REJEITA — quem chama consegue sair do estado
    // "salvando" e mostrar erro, em vez de aguardar para sempre.
    await expect(updateSessionConditions('sess-emo', { emotionalContext: CONTEXT })).rejects.toThrow()

    putShouldFail = false
    const reloaded = await getSession('sess-emo')
    expect(reloaded?.checkIn?.emotionalContext).toBeUndefined()
    expect(reloaded?.trials).toHaveLength(1)
  })
})

describe('reaproveitar condições da sessão anterior', () => {
  it('NÃO carrega o contexto emocional (é momentâneo)', async () => {
    await saveSession(
      makeSession({
        sessionId: 'anterior',
        checkIn: { sleep: { hours: 7 }, environment: { headphones: true }, emotionalContext: CONTEXT },
      })
    )

    const latest = await getLatestConditions()
    expect(latest?.emotionalContext).toBeUndefined()
    // O contexto estável continua sendo reaproveitado.
    expect(latest?.sleep).toEqual({ hours: 7 })
    expect(latest?.environment).toEqual({ headphones: true })
  })

  it('não altera a sessão de origem ao filtrar', async () => {
    await saveSession(makeSession({ checkIn: { emotionalContext: CONTEXT } }))
    await getLatestConditions()

    const reloaded = await getSession('sess-emo')
    expect(reloaded?.checkIn?.emotionalContext).toEqual(CONTEXT)
  })
})
