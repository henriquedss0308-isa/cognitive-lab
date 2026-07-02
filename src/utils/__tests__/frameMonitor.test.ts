import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FrameMonitor } from '../frameMonitor'

describe('FrameMonitor', () => {
  let rafCallbacks: Array<(ts: number) => void>
  let ts = 0

  beforeEach(() => {
    rafCallbacks = []
    ts = 0
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function tick(delta: number) {
    ts += delta
    const cbs = [...rafCallbacks]
    rafCallbacks = []
    cbs.forEach((cb) => cb(ts))
  }

  it('conta frames significativamente atrasados como estimativa', () => {
    const monitor = new FrameMonitor(60)
    monitor.start()
    tick(16)
    tick(16)
    tick(45)
    const snap = monitor.stop()
    expect(snap.droppedFramesEstimate).toBeGreaterThan(0)
    expect(snap.excessiveJitter).toBe(false)
  })

  it('marca excessiveJitter após muitos atrasos', () => {
    const monitor = new FrameMonitor(60)
    monitor.start()
    for (let i = 0; i < 5; i++) {
      tick(16)
      tick(90)
    }
    const snap = monitor.stop()
    expect(snap.excessiveJitter).toBe(true)
  })
})