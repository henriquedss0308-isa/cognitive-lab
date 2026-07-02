export function now(): number {
  return performance.now()
}

export function highResTimestamp(): number {
  return performance.timeOrigin + performance.now()
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function waitCancellable(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const id = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(id)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true }
    )
  })
}

export function waitUntilFrame(): Promise<number> {
  return new Promise((resolve) => {
    requestAnimationFrame((t) => resolve(t))
  })
}

export async function waitRandomInterval(
  minMs: number,
  maxMs: number,
  random: () => number
): Promise<void> {
  const delay = minMs + random() * (maxMs - minMs)
  await wait(delay)
}

export interface FocusTracker {
  lostFocusCount: number
  totalHiddenMs: number
  isFocused: boolean
  lastHiddenAt: number | null
}

export function createFocusTracker(): FocusTracker {
  return {
    lostFocusCount: 0,
    totalHiddenMs: 0,
    isFocused: document.visibilityState === 'visible' && document.hasFocus(),
    lastHiddenAt: null,
  }
}

export function updateFocusTracker(tracker: FocusTracker): void {
  const hidden = document.visibilityState === 'hidden' || !document.hasFocus()
  if (hidden && tracker.isFocused) {
    tracker.lostFocusCount++
    tracker.lastHiddenAt = now()
    tracker.isFocused = false
  } else if (!hidden && !tracker.isFocused) {
    if (tracker.lastHiddenAt !== null) {
      tracker.totalHiddenMs += now() - tracker.lastHiddenAt
    }
    tracker.isFocused = true
    tracker.lastHiddenAt = null
  }
}