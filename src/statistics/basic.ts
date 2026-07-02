export function median(values: number[]): number | null {
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function standardDeviation(values: number[]): number | null {
  if (values.length < 2) return null
  const m = mean(values)!
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(idx)
  const upper = Math.ceil(idx)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower)
}

export function iqr(values: number[]): number | null {
  const p25 = percentile(values, 25)
  const p75 = percentile(values, 75)
  if (p25 === null || p75 === null) return null
  return p75 - p25
}

export function mad(values: number[], center?: number): number | null {
  if (values.length === 0) return null
  const med = center ?? median(values)!
  const deviations = values.map((v) => Math.abs(v - med))
  return median(deviations)
}

export function coefficientOfVariation(values: number[]): number | null {
  const m = mean(values)
  const sd = standardDeviation(values)
  if (m === null || sd === null || m === 0) return null
  return sd / m
}

export function robustZScore(
  value: number,
  baselineMedian: number | null,
  baselineMad: number | null,
  direction: 1 | -1
): number | null {
  if (baselineMedian === null || baselineMad === null || baselineMad === 0) return null
  const scaledMad = 1.4826 * baselineMad
  if (scaledMad === 0) return null
  return (direction * (value - baselineMedian)) / scaledMad
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function movingAverage(values: (number | null)[], window: number): (number | null)[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v !== null)
    if (slice.length === 0) return null
    return mean(slice)
  })
}