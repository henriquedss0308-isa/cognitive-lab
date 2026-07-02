
function inverseNormalCDF(p: number): number {
  if (p <= 0 || p >= 1) return 0
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479824614460e1, 2.506628277459239e0,
  ]
  const b = [
    -5.447738814505127e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ]
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758227161838e0,
    -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0,
  ]
  const d = [
    7.784695709091636e-3, 3.222671216321535e-1, 2.445134137142996e0,
    3.754408661907416e0,
  ]
  const pLow = 0.02425
  const pHigh = 1 - pLow
  let q: number, r: number
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p <= pHigh) {
    q = p - 0.5
    r = q * q
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  }
  q = Math.sqrt(-2 * Math.log(1 - p))
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
}

export interface SDTInput {
  hits: number
  misses: number
  falseAlarms: number
  correctRejections: number
}

export interface SDTResult {
  hits: number
  misses: number
  falseAlarms: number
  correctRejections: number
  hitRate: number
  falseAlarmRate: number
  dPrime: number | null
  criterion: number | null
}

export function computeSDT(input: SDTInput): SDTResult {
  const { hits, misses, falseAlarms, correctRejections } = input
  const signalTrials = hits + misses
  const noiseTrials = falseAlarms + correctRejections

  const rawHitRate = signalTrials > 0 ? hits / signalTrials : 0
  const rawFARate = noiseTrials > 0 ? falseAlarms / noiseTrials : 0

  if (signalTrials === 0 || noiseTrials === 0) {
    return {
      hits,
      misses,
      falseAlarms,
      correctRejections,
      hitRate: rawHitRate,
      falseAlarmRate: rawFARate,
      dPrime: null,
      criterion: null,
    }
  }

  // Hautus (1995) log-linear correction
  const hitRate = (hits + 0.5) / (signalTrials + 1)
  const falseAlarmRate = (falseAlarms + 0.5) / (noiseTrials + 1)

  const zHit = inverseNormalCDF(hitRate)
  const zFA = inverseNormalCDF(falseAlarmRate)

  return {
    hits,
    misses,
    falseAlarms,
    correctRejections,
    hitRate: rawHitRate,
    falseAlarmRate: rawFARate,
    dPrime: zHit - zFA,
    criterion: -0.5 * (zHit + zFA),
  }
}