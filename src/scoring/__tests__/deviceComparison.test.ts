import { describe, it, expect } from 'vitest'
import { compareDeviceToHistory } from '../deviceComparison'
import type { DeviceInfo, SessionRecord } from '../../types'

function device(
  deviceType: DeviceInfo['deviceType'],
  inputMethod: DeviceInfo['inputMethod']
): DeviceInfo {
  return {
    deviceType,
    inputMethod,
    screenWidth: 1920,
    screenHeight: 1080,
    browser: 'test',
    userAgent: 'test',
  }
}

function session(
  n: number,
  deviceType: DeviceInfo['deviceType'],
  inputMethod: DeviceInfo['inputMethod']
): SessionRecord {
  return {
    sessionId: `s-${n}`,
    testId: 'simple_rt',
    protocolVersion: 'reaction.simple.v1.0',
    mode: 'assessment',
    status: 'completed',
    startedAt: new Date(Date.UTC(2026, 0, n)).toISOString(),
    completedAt: new Date(Date.UTC(2026, 0, n, 1)).toISOString(),
    quality: 'valid',
    flags: {},
    flagMessages: [],
    trials: [],
    deviceInfo: device(deviceType, inputMethod),
    isDemo: false,
    practiceCompleted: true,
    randomizationSeed: n,
  }
}

describe('compareDeviceToHistory (spec §6)', () => {
  it('sem histórico não há comparação nem flags', () => {
    const r = compareDeviceToHistory(device('mobile', 'touch'), [])
    expect(r.differentDevice).toBe(false)
    expect(r.differentInputMethod).toBe(false)
    expect(r.reference).toBeNull()
  })

  it('dispositivo igual à moda: nenhuma flag', () => {
    const history = [session(1, 'desktop', 'keyboard'), session(2, 'desktop', 'keyboard')]
    const r = compareDeviceToHistory(device('desktop', 'keyboard'), history)
    expect(r.differentDevice).toBe(false)
    expect(r.differentInputMethod).toBe(false)
    expect(r.reference).toEqual({ deviceType: 'desktop', inputMethod: 'keyboard' })
  })

  it('divergência de tipo E de entrada gera ambas as flags e mensagens', () => {
    const history = [
      session(1, 'desktop', 'keyboard'),
      session(2, 'desktop', 'keyboard'),
      session(3, 'desktop', 'keyboard'),
    ]
    const r = compareDeviceToHistory(device('mobile', 'touch'), history)
    expect(r.differentDevice).toBe(true)
    expect(r.differentInputMethod).toBe(true)
    expect(r.messages).toHaveLength(2)
    expect(r.messages[0]).toMatch(/difere do habitual/)
  })

  it('moda vence minoria: uma sessão antiga em tablet não muda a referência', () => {
    const history = [
      session(1, 'tablet', 'touch'),
      session(2, 'desktop', 'keyboard'),
      session(3, 'desktop', 'keyboard'),
    ]
    const r = compareDeviceToHistory(device('desktop', 'keyboard'), history)
    expect(r.differentDevice).toBe(false)
    expect(r.reference?.deviceType).toBe('desktop')
  })

  it('empate resolvido pelo mais recente', () => {
    const history = [session(1, 'desktop', 'keyboard'), session(2, 'tablet', 'touch')]
    const r = compareDeviceToHistory(device('tablet', 'touch'), history)
    // Empate 1×1 — referência é a mais recente (tablet/touch)
    expect(r.differentDevice).toBe(false)
    expect(r.differentInputMethod).toBe(false)
  })

  it('divergência apenas de método de entrada', () => {
    const history = [session(1, 'desktop', 'keyboard'), session(2, 'desktop', 'keyboard')]
    const r = compareDeviceToHistory(device('desktop', 'mouse'), history)
    expect(r.differentDevice).toBe(false)
    expect(r.differentInputMethod).toBe(true)
    expect(r.messages).toHaveLength(1)
  })
})
