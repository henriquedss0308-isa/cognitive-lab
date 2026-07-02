import { describe, expect, it } from 'vitest'
import { testDefinition } from '../index'

function conditions(seed: number, mode: 'assessment' | 'training' = 'assessment') {
  return testDefinition.generateTrials(mode, seed).map((trial) => trial.condition)
}

function maxRun(values: string[], target: string) {
  let current = 0
  let max = 0
  for (const value of values) {
    if (value === target) current++
    else current = 0
    max = Math.max(max, current)
  }
  return max
}

function counts(values: string[]) {
  return {
    go: values.filter((value) => value === 'go').length,
    nogo: values.filter((value) => value === 'nogo').length,
  }
}

function leadingRun(values: string[], target: string) {
  let count = 0
  for (const value of values) {
    if (value !== target) break
    count++
  }
  return count
}

function trailingRun(values: string[], target: string) {
  let count = 0
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] !== target) break
    count++
  }
  return count
}

function assessmentBlocks(values: string[]) {
  return [0, 1, 2, 3].map((blockIndex) =>
    values.slice(blockIndex * 40, blockIndex * 40 + 40)
  )
}

describe('Go/No-Go sequence generation', () => {
  it('generates the configured assessment total and fixed Go/No-Go counts', () => {
    const trials = testDefinition.generateTrials('assessment', 123)
    const summary = counts(trials.map((trial) => trial.condition))

    expect(trials).toHaveLength(160)
    expect(summary).toEqual({ go: 120, nogo: 40 })
    expect(testDefinition.assessmentConfig.blocks).toBe(4)
    expect(testDefinition.practiceConfig.trialCount).toBe(16)
  })

  it('generates each assessment block with exactly 30 Go and 10 No-Go trials', () => {
    const values = conditions(123)

    for (const block of assessmentBlocks(values)) {
      expect(block).toHaveLength(40)
      expect(counts(block)).toEqual({ go: 30, nogo: 10 })
    }
  })

  it('assigns every trial a unique sequential index and preserves block boundaries', () => {
    const trials = testDefinition.generateTrials('assessment', 456)

    expect(trials.map((trial) => trial.trialIndex)).toEqual(
      Array.from({ length: 160 }, (_, index) => index)
    )
    expect(trials.map((trial) => trial.blockIndex)).toEqual([
      ...Array(40).fill(0),
      ...Array(40).fill(1),
      ...Array(40).fill(2),
      ...Array(40).fill(3),
    ])
  })

  it('keeps Go and No-Go interleaved without exhausting No-Go before the final slice', () => {
    const values = conditions(789)
    const final40 = values.slice(-40)
    const final30 = values.slice(-30)

    expect(maxRun(values, 'go')).toBeLessThanOrEqual(4)
    expect(final30).toContain('nogo')
    expect(counts(final40)).toEqual({ go: 30, nogo: 10 })
    expect(values.slice(0, 40).every((value) => value === 'nogo')).toBe(false)
    expect(final40.every((value) => value === 'go')).toBe(false)
  })

  it('enforces the Go streak limit across block boundaries', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const blocks = assessmentBlocks(conditions(seed))
      for (let blockIndex = 0; blockIndex < blocks.length - 1; blockIndex++) {
        const boundaryRun =
          trailingRun(blocks[blockIndex], 'go') + leadingRun(blocks[blockIndex + 1], 'go')
        expect(boundaryRun).toBeLessThanOrEqual(4)
      }
    }
  })

  it('generates valid constrained sequences across many seeds', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const values = conditions(seed)
      expect(values).toHaveLength(160)
      expect(counts(values)).toEqual({ go: 120, nogo: 40 })
      for (const block of assessmentBlocks(values)) {
        expect(counts(block)).toEqual({ go: 30, nogo: 10 })
      }
      expect(maxRun(values, 'go')).toBeLessThanOrEqual(4)
      expect(values.slice(-30).every((value) => value === 'go')).toBe(false)
    }
  })

  it('does not concentrate Go systematically in the final quartile', () => {
    const seeds = 1000
    const blockGoTotals = [0, 0, 0, 0]

    for (let seed = 1; seed <= seeds; seed++) {
      const blocks = assessmentBlocks(conditions(seed))
      blocks.forEach((block, index) => {
        blockGoTotals[index] += counts(block).go
      })
    }

    expect(blockGoTotals.map((total) => total / seeds)).toEqual([30, 30, 30, 30])
  })

  it('keeps position frequencies close to the configured ratio across many seeds', () => {
    const seeds = 10000
    const positionGoTotals = Array(160).fill(0)

    for (let seed = 1; seed <= seeds; seed++) {
      const values = conditions(seed)
      values.forEach((value, index) => {
        if (value === 'go') positionGoTotals[index]++
      })
    }

    for (const total of positionGoTotals) {
      const frequency = total / seeds
      expect(frequency).toBeGreaterThanOrEqual(0.68)
      expect(frequency).toBeLessThanOrEqual(0.82)
    }
  })

  it('does not force exactly one No-Go in every fixed group of four trials', () => {
    const values = conditions(42)
    const noGoCountsPerChunk = Array.from({ length: values.length / 4 }, (_, chunkIndex) =>
      values.slice(chunkIndex * 4, chunkIndex * 4 + 4).filter((value) => value === 'nogo').length
    )

    expect(new Set(noGoCountsPerChunk).size).toBeGreaterThan(1)
  })

  it('generates diverse sequences across seeds', () => {
    const uniqueSequences = new Set<string>()

    for (let seed = 1; seed <= 1000; seed++) {
      uniqueSequences.add(conditions(seed).join(''))
    }

    expect(uniqueSequences.size).toBeGreaterThan(995)
  })

  it('has valid protocol sequences whose maximum Go streak is three', () => {
    const block = Array.from({ length: 10 }, () => ['go', 'go', 'go', 'nogo']).flat()
    const values = [...block, ...block, ...block, ...block]

    expect(values).toHaveLength(160)
    expect(counts(values)).toEqual({ go: 120, nogo: 40 })
    for (const assessmentBlock of assessmentBlocks(values)) {
      expect(counts(assessmentBlock)).toEqual({ go: 30, nogo: 10 })
    }
    expect(maxRun(values, 'go')).toBe(3)
  })

  it('reproduces the same sequence for the same seed', () => {
    expect(conditions(42)).toEqual(conditions(42))
    expect(conditions(42)).not.toEqual(conditions(43))
  })

  it('does not depend on global Math.random state', () => {
    const before = conditions(2026)
    for (let i = 0; i < 100; i++) Math.random()
    expect(conditions(2026)).toEqual(before)
  })

  it('uses the same constraints for practice without concentrating Go at the end', () => {
    const values = conditions(99, 'training')
    expect(values).toHaveLength(16)
    expect(counts(values)).toEqual({ go: 12, nogo: 4 })
    expect(maxRun(values, 'go')).toBeLessThanOrEqual(4)
    expect(values.slice(-4).every((value) => value === 'go')).toBe(false)
  })
})
