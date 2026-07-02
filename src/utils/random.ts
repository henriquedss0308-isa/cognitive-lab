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
  const targetGo = Math.round(goRatio * total)
  const targetNoGo = total - targetGo
  const maxConsecutiveGo = Math.max(maxConsecutive, Math.ceil(targetGo / (targetNoGo + 1)))
  const maxConsecutiveNoGo = Math.max(
    1,
    maxConsecutive - 1,
    Math.ceil(targetNoGo / (targetGo + 1))
  )
  const result: boolean[] = []

  const canComplete = (
    goLeft: number,
    noGoLeft: number,
    last: boolean | null,
    streak: number
  ): boolean => {
    if (goLeft < 0 || noGoLeft < 0) return false
    if (goLeft === 0 && noGoLeft === 0) return true

    const firstGoRunCapacity = last === true ? maxConsecutiveGo - streak : maxConsecutiveGo
    const firstNoGoRunCapacity = last === false ? maxConsecutiveNoGo - streak : maxConsecutiveNoGo
    const goCapacity = firstGoRunCapacity + noGoLeft * maxConsecutiveGo
    const noGoCapacity = firstNoGoRunCapacity + goLeft * maxConsecutiveNoGo

    return goLeft <= goCapacity && noGoLeft <= noGoCapacity
  }

  let goLeft = targetGo
  let noGoLeft = targetNoGo
  let last: boolean | null = null
  let streak = 0

  for (let i = 0; i < total; i++) {
    const nextIfGoStreak = last === true ? streak + 1 : 1
    const nextIfNoGoStreak = last === false ? streak + 1 : 1
    const canPlaceGo =
      goLeft > 0 &&
      nextIfGoStreak <= maxConsecutiveGo &&
      canComplete(goLeft - 1, noGoLeft, true, nextIfGoStreak)
    const canPlaceNoGo =
      noGoLeft > 0 &&
      nextIfNoGoStreak <= maxConsecutiveNoGo &&
      canComplete(goLeft, noGoLeft - 1, false, nextIfNoGoStreak)

    let isGo: boolean
    if (canPlaceGo && canPlaceNoGo) {
      isGo = random() < goLeft / (goLeft + noGoLeft)
    } else if (canPlaceGo) {
      isGo = true
    } else if (canPlaceNoGo) {
      isGo = false
    } else {
      throw new Error('Unable to generate constrained pseudo-random sequence')
    }

    result.push(isGo)
    if (isGo) {
      goLeft--
      streak = last === true ? streak + 1 : 1
      last = true
    } else {
      noGoLeft--
      streak = last === false ? streak + 1 : 1
      last = false
    }
  }

  return result
}

export function randomInt(min: number, max: number, random: () => number): number {
  return Math.floor(random() * (max - min + 1)) + min
}
