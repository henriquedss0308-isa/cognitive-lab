/**
 * Estimativa simples de frames atrasados durante um ensaio.
 * Não mede frames perdidos com precisão absoluta — apenas intervalos anormais entre rAF.
 */

export interface FrameMonitorSnapshot {
  droppedFramesEstimate: number
  sampleCount: number
  meanFrameMs: number
  excessiveJitter: boolean
}

export class FrameMonitor {
  private rafId: number | null = null
  private lastTs = 0
  private intervals: number[] = []
  private dropped = 0
  private expectedFrameMs: number
  private readonly jitterThreshold: number

  constructor(refreshRateHz = 60) {
    this.expectedFrameMs = 1000 / refreshRateHz
    this.jitterThreshold = this.expectedFrameMs * 2.5
  }

  start(): void {
    this.stop()
    this.lastTs = 0
    this.intervals = []
    this.dropped = 0

    const tick = (ts: number) => {
      if (this.lastTs > 0) {
        const delta = ts - this.lastTs
        this.intervals.push(delta)
        if (delta > this.jitterThreshold) {
          this.dropped += Math.max(1, Math.round(delta / this.expectedFrameMs) - 1)
        }
      }
      this.lastTs = ts
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  stop(): FrameMonitorSnapshot {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    const meanFrameMs =
      this.intervals.length > 0
        ? this.intervals.reduce((a, b) => a + b, 0) / this.intervals.length
        : this.expectedFrameMs

    return {
      droppedFramesEstimate: this.dropped,
      sampleCount: this.intervals.length,
      meanFrameMs,
      excessiveJitter: this.dropped >= 3,
    }
  }
}

export async function registerStimulusOnset(
  setVisible: () => void
): Promise<number> {
  setVisible()
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  return performance.timeOrigin + performance.now()
}