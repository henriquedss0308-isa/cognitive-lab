import type { TrialRecord } from '../types'

export interface PracticeCriteria {
  minAccuracy: number
  minValidTrials?: number
}

export interface PracticeErrorSummary {
  kind: string
  label: string
  count: number
}

export interface PracticeEvaluation {
  passed: boolean
  accuracy: number
  totalTrials: number
  correctCount: number
  errors: PracticeErrorSummary[]
}

const ERROR_LABELS: Record<string, string> = {
  omission: 'Omissões',
  commission: 'Comissões (respondeu quando não devia)',
  anticipation: 'Antecipações',
  incorrect: 'Erros de resposta',
}

export function evaluatePractice(
  trials: TrialRecord[],
  criteria: PracticeCriteria
): PracticeEvaluation {
  const total = trials.length
  const correct = trials.filter((t) => t.correct).length
  const accuracy = total > 0 ? correct / total : 0

  const errorCounts = new Map<string, number>()
  for (const t of trials) {
    if (t.correct) continue
    const kind =
      t.invalidReason ??
      (t.metadata?.outcomeKind as string) ??
      'incorrect'
    errorCounts.set(kind, (errorCounts.get(kind) ?? 0) + 1)
  }

  const errors: PracticeErrorSummary[] = [...errorCounts.entries()].map(([kind, count]) => ({
    kind,
    label: ERROR_LABELS[kind] ?? kind,
    count,
  }))

  const minTrials = criteria.minValidTrials ?? 1
  const passed = total >= minTrials && accuracy >= criteria.minAccuracy

  return { passed, accuracy, totalTrials: total, correctCount: correct, errors }
}

export const DEFAULT_PRACTICE_CRITERIA: PracticeCriteria = {
  minAccuracy: 0.6,
  minValidTrials: 4,
}