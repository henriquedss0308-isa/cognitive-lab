import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SessionRecord } from '../../types'

const store = new Map<string, SessionRecord>()

vi.mock('../db', () => ({
  DEFAULT_SETTINGS: {},
  getDB: async () => ({
    get: async (_: string, id: string) => store.get(id),
    put: async (_: string, value: SessionRecord) => {
      store.set(value.sessionId, value)
    },
    getAll: async () => [...store.values()],
    delete: async (_: string, id: string) => {
      store.delete(id)
    },
    transaction: () => {
      const tx = {
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
      }
      return tx
    },
  }),
}))

import {
  updateSessionStatus,
  markStaleInProgressAsInterrupted,
  importSessionsSkipExisting,
} from '../repository'

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId: 'sess-1',
    testId: 'simple_rt',
    protocolVersion: 'reaction.simple.v1.0',
    mode: 'assessment',
    status: 'in_progress',
    startedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    quality: 'valid',
    flags: {},
    flagMessages: [],
    trials: [],
    deviceInfo: {
      deviceType: 'desktop',
      inputMethod: 'keyboard',
      screenWidth: 1920,
      screenHeight: 1080,
      browser: 'test',
      userAgent: 'test',
    },
    isDemo: false,
    practiceCompleted: true,
    randomizationSeed: 1,
    ...overrides,
  }
}

beforeEach(() => store.clear())

describe('updateSessionStatus — transições terminais protegidas (spec §8)', () => {
  it('completed nunca é rebaixada (corrida ESC pós-done)', async () => {
    store.set('sess-1', makeSession({ status: 'completed', completedAt: new Date().toISOString() }))
    await updateSessionStatus('sess-1', 'abandoned', { quality: 'invalid' })
    expect(store.get('sess-1')?.status).toBe('completed')
    expect(store.get('sess-1')?.quality).toBe('valid')
  })

  it('abandoned não vira interrupted', async () => {
    store.set('sess-1', makeSession({ status: 'abandoned' }))
    await updateSessionStatus('sess-1', 'interrupted')
    expect(store.get('sess-1')?.status).toBe('abandoned')
  })

  it('in_progress → interrupted permitido', async () => {
    store.set('sess-1', makeSession())
    await updateSessionStatus('sess-1', 'interrupted', { quality: 'invalid' })
    expect(store.get('sess-1')?.status).toBe('interrupted')
  })

  it('interrupted → abandoned permitido (arquivar)', async () => {
    store.set('sess-1', makeSession({ status: 'interrupted' }))
    await updateSessionStatus('sess-1', 'abandoned')
    expect(store.get('sess-1')?.status).toBe('abandoned')
  })

  it('legado sem status é tratado como completed (terminal)', async () => {
    store.set('sess-1', makeSession({ status: undefined as unknown as SessionRecord['status'] }))
    await updateSessionStatus('sess-1', 'abandoned')
    expect(store.get('sess-1')?.status).toBeUndefined()
  })
})

describe('markStaleInProgressAsInterrupted (spec §7)', () => {
  it('in_progress antiga vira interrupted+invalid+incomplete', async () => {
    store.set('sess-1', makeSession())
    const n = await markStaleInProgressAsInterrupted(60_000)
    expect(n).toBe(1)
    const s = store.get('sess-1')!
    expect(s.status).toBe('interrupted')
    expect(s.quality).toBe('invalid')
    expect(s.flags.incomplete).toBe(true)
    expect(s.flagMessages.join(' ')).toMatch(/recarregada/)
  })

  it('in_progress recente é preservada (possível sessão ativa)', async () => {
    store.set('sess-1', makeSession({ startedAt: new Date().toISOString() }))
    const n = await markStaleInProgressAsInterrupted(60_000)
    expect(n).toBe(0)
    expect(store.get('sess-1')?.status).toBe('in_progress')
  })

  it('sessões terminais e interrupted não são tocadas', async () => {
    store.set('a', makeSession({ sessionId: 'a', status: 'completed' }))
    store.set('b', makeSession({ sessionId: 'b', status: 'interrupted' }))
    store.set('c', makeSession({ sessionId: 'c', status: 'abandoned' }))
    expect(await markStaleInProgressAsInterrupted(60_000)).toBe(0)
  })
})

describe('importSessionsSkipExisting — contrato do fake', () => {
  it('mantém o registro local quando o id já existe', async () => {
    const local = makeSession({ status: 'completed', flagMessages: ['local'] })
    store.set('sess-1', local)
    const incoming = makeSession({ status: 'completed', flagMessages: ['backup'] })
    const r = await importSessionsSkipExisting([incoming, makeSession({ sessionId: 'nova' })])
    expect(r.skipped).toEqual(['sess-1'])
    expect(r.added).toEqual(['nova'])
    expect(store.get('sess-1')?.flagMessages).toEqual(['local'])
  })
})
