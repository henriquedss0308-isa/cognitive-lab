import { describe, it, expect } from 'vitest'
import { mergeCompletionRecord } from '../sessionCompletion'
import type { DeviceInfo, SessionRecord, SessionResult } from '../../types'

const desktop: DeviceInfo = {
  deviceType: 'desktop',
  inputMethod: 'keyboard',
  screenWidth: 1920,
  screenHeight: 1080,
  browser: 'Chrome',
  userAgent: 'ua-desktop',
}

const tablet: DeviceInfo = {
  ...desktop,
  deviceType: 'tablet',
  inputMethod: 'touch',
  userAgent: 'ua-tablet',
}

function makeResult(overrides: Partial<SessionResult> = {}): SessionResult {
  return {
    sessionId: 'sess-1',
    testId: 'corsi',
    protocolVersion: 'corsi.forward.v1.0',
    mode: 'assessment',
    startedAt: '2026-07-01T10:00:00.000Z',
    completedAt: '2026-07-01T10:20:00.000Z',
    quality: 'valid',
    flags: {},
    flagMessages: [],
    rtMetrics: {
      medianCorrectRT: null,
      meanCorrectRT: null,
      rtStandardDeviation: null,
      rtIQR: null,
      rtCoefficientOfVariation: null,
      p10RT: null,
      p90RT: null,
      anticipationRate: 0,
      lapseRate: 0,
      validTrialCount: 10,
      invalidTrialCount: 0,
    },
    accuracyMetrics: { accuracy: 0.9, correctCount: 9, errorCount: 1, omissionCount: 0, totalTrials: 10 },
    conditionMetrics: {},
    blockMetrics: [],
    customMetrics: { confirmedSpan: 5 },
    isDemo: false,
    deviceInfo: desktop,
    ...overrides,
  }
}

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId: 'sess-1',
    testId: 'corsi',
    protocolVersion: 'corsi.forward.v1.0',
    mode: 'assessment',
    status: 'completed',
    startedAt: '2026-07-01T10:00:00.000Z',
    completedAt: '2026-07-01T10:20:00.000Z',
    quality: 'valid',
    flags: {},
    flagMessages: [],
    trials: [],
    deviceInfo: desktop,
    isDemo: false,
    practiceCompleted: true,
    randomizationSeed: 42,
    result: makeResult(),
    ...overrides,
  }
}

describe('mergeCompletionRecord — preservação no resume (P0-4)', () => {
  const originalCheckIn = { sleep: { hours: 7 }, notes: 'ruído no início', recordedAt: '2026-07-01T09:59:00.000Z' }

  it('sem registro existente, retorna o fresh inalterado', () => {
    const fresh = makeSession()
    expect(mergeCompletionRecord(fresh, undefined)).toBe(fresh)
  })

  it('resume: checkIn original preservado quando o fresh não tem condições', () => {
    const existing = makeSession({ status: 'interrupted', checkIn: originalCheckIn, result: undefined })
    const fresh = makeSession({ checkIn: undefined })
    const merged = mergeCompletionRecord(fresh, existing)
    expect(merged.checkIn).toEqual(originalCheckIn)
    expect(merged.result?.checkIn).toEqual(originalCheckIn)
  })

  it('condições novas (fluxo normal) têm precedência sobre as antigas', () => {
    const existing = makeSession({ checkIn: originalCheckIn })
    const fresh = makeSession({ checkIn: { notes: 'novo' } })
    const merged = mergeCompletionRecord(fresh, existing)
    expect(merged.checkIn?.notes).toBe('novo')
  })

  it('batteryId/batteryPosition e startedAt originais preservados', () => {
    const existing = makeSession({
      status: 'in_progress',
      batteryId: 'daily',
      batteryPosition: 2,
      startedAt: '2026-07-01T09:00:00.000Z',
      result: undefined,
    })
    const fresh = makeSession({ startedAt: '2026-07-01T10:00:00.000Z' })
    const merged = mergeCompletionRecord(fresh, existing)
    expect(merged.batteryId).toBe('daily')
    expect(merged.batteryPosition).toBe(2)
    expect(merged.startedAt).toBe('2026-07-01T09:00:00.000Z')
    expect(merged.result?.startedAt).toBe('2026-07-01T09:00:00.000Z')
  })

  it('dispositivo divergente: mantém o original, sinaliza e rebaixa qualidade', () => {
    const existing = makeSession({ status: 'interrupted', deviceInfo: desktop, result: undefined })
    const fresh = makeSession({ deviceInfo: tablet })
    const merged = mergeCompletionRecord(fresh, existing)
    expect(merged.deviceInfo).toEqual(desktop)
    expect(merged.flags.differentDevice).toBe(true)
    expect(merged.flags.differentInputMethod).toBe(true)
    expect(merged.quality).toBe('valid_with_warnings')
    expect(merged.result?.quality).toBe('valid_with_warnings')
    expect(merged.flagMessages.join(' ')).toMatch(/Dispositivo mudou/)
  })

  it('qualidade invalid não é "melhorada" pela divergência de dispositivo', () => {
    const existing = makeSession({ deviceInfo: desktop, result: undefined })
    const fresh = makeSession({ deviceInfo: tablet, quality: 'invalid' })
    expect(mergeCompletionRecord(fresh, existing).quality).toBe('invalid')
  })

  it('mesmo dispositivo: nenhuma flag e qualidade intacta', () => {
    const merged = mergeCompletionRecord(makeSession(), makeSession({ status: 'in_progress', result: undefined }))
    expect(merged.flags.differentDevice).toBeUndefined()
    expect(merged.quality).toBe('valid')
  })

  it('sessionId divergente não faz merge (proteção contra mistura)', () => {
    const fresh = makeSession()
    const other = makeSession({ sessionId: 'outra' })
    expect(mergeCompletionRecord(fresh, other)).toBe(fresh)
  })
})
