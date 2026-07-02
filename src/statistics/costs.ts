import { median } from './basic'

export function stroopCostRT(
  congruentRTs: number[],
  incongruentRTs: number[]
): number | null {
  const medC = median(congruentRTs)
  const medI = median(incongruentRTs)
  if (medC === null || medI === null) return null
  return medI - medC
}

export function stroopCostAccuracy(
  congruentAccuracy: number,
  incongruentAccuracy: number
): number {
  return congruentAccuracy - incongruentAccuracy
}

export function switchCost(
  switchRTs: number[],
  repeatRTs: number[]
): number | null {
  const medS = median(switchRTs)
  const medR = median(repeatRTs)
  if (medS === null || medR === null) return null
  return medS - medR
}

export function mixingCost(
  repeatMixedRTs: number[],
  pureRTs: number[]
): number | null {
  const medR = median(repeatMixedRTs)
  const medP = median(pureRTs)
  if (medR === null || medP === null) return null
  return medR - medP
}

export function choiceRTCost(
  choiceMedianRT: number | null,
  simpleMedianRT: number | null
): number | null {
  if (choiceMedianRT === null || simpleMedianRT === null) return null
  return choiceMedianRT - simpleMedianRT
}