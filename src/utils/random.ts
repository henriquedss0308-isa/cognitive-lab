export function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

export function shuffle<T>(array: T[], random: () => number): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function balancedSequence<T>(
  items: T[],
  countPerItem: number,
  random: () => number
): T[] {
  const sequence: T[] = []
  for (const item of items) {
    for (let i = 0; i < countPerItem; i++) sequence.push(item)
  }
  return shuffle(sequence, random)
}

export function pseudoRandomSequence(
  goRatio: number,
  total: number,
  random: () => number,
  maxConsecutive: number = 4
): boolean[] {
  const result: boolean[] = []
  let consecutiveGo = 0
  let consecutiveNoGo = 0

  for (let i = 0; i < total; i++) {
    let isGo = random() < goRatio

    if (isGo && consecutiveGo >= maxConsecutive) isGo = false
    if (!isGo && consecutiveNoGo >= maxConsecutive - 1) isGo = true

    const remaining = total - i
    const remainingGo = Math.round(goRatio * total) - result.filter(Boolean).length
    const remainingNoGo = total - Math.round(goRatio * total) - result.filter((v) => !v).length

    if (remainingGo <= 0) isGo = false
    if (remainingNoGo <= 0) isGo = true
    if (remaining === remainingGo) isGo = true
    if (remaining === remainingNoGo) isGo = false

    result.push(isGo)
    if (isGo) {
      consecutiveGo++
      consecutiveNoGo = 0
    } else {
      consecutiveNoGo++
      consecutiveGo = 0
    }
  }

  return result
}

export function randomInt(min: number, max: number, random: () => number): number {
  return Math.floor(random() * (max - min + 1)) + min
}