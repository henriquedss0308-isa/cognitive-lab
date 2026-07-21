import { describe, it, expect } from 'vitest'
import {
  PREDOMINANCE_THRESHOLD,
  buildContextComparison,
  classifyComposition,
  countRelationshipPerceptions,
  formatMinutesOfDay,
  formatSleepHours,
  minutesSinceMidnight,
  summarizeBoolean,
  summarizeMedicationComposition,
  summarizeNumeric,
  summarizeQuadrants,
  summarizeTimeOfDay,
} from '../contextSummary'
import { makeSession, medicationCheckIn } from './fixtures'
import type { SessionRecord, TestConditions } from '../../../types'

function withConditions(id: string, checkIn: TestConditions, day = 1): SessionRecord {
  return makeSession({ id, day, checkIn })
}

describe('mediana de campos numéricos', () => {
  it('calcula a mediana do sono e reporta N disponível', () => {
    const sessions = [
      withConditions('a', { sleep: { hours: 6 } }, 1),
      withConditions('b', { sleep: { hours: 7 } }, 2),
      withConditions('c', { sleep: { hours: 8 } }, 3),
    ]
    const summary = summarizeNumeric(sessions, (c) => c?.sleep?.hours)

    expect(summary.median).toBe(7)
    expect(summary.n).toBe(3)
    expect(summary.total).toBe(3)
  })

  it('ignora sessões sem o dado e reporta N corretamente', () => {
    const sessions = [
      withConditions('a', { sleep: { hours: 6 } }, 1),
      withConditions('b', {}, 2),
      withConditions('c', { sleep: {} }, 3),
      withConditions('d', { sleep: { hours: 8 } }, 4),
    ]
    const summary = summarizeNumeric(sessions, (c) => c?.sleep?.hours)

    expect(summary.median).toBe(7)
    expect(summary.n).toBe(2)
    expect(summary.total).toBe(4)
  })

  it('nenhuma sessão com o dado ⇒ mediana null, sem NaN', () => {
    const summary = summarizeNumeric(
      [withConditions('a', {}, 1), withConditions('b', {}, 2)],
      (c) => c?.sleep?.hours
    )
    expect(summary.median).toBeNull()
    expect(summary.n).toBe(0)
    expect(Number.isNaN(summary.median as unknown as number)).toBe(false)
  })

  it('conjunto vazio não divide por zero', () => {
    const summary = summarizeNumeric([], (c) => c?.sleep?.hours)
    expect(summary).toEqual({ median: null, n: 0, total: 0 })
  })

  it('valores não finitos são tratados como ausentes', () => {
    const sessions = [
      withConditions('a', { sleep: { hours: Number.NaN } }, 1),
      withConditions('b', { sleep: { hours: Number.POSITIVE_INFINITY } }, 2),
      withConditions('c', { sleep: { hours: 7 } }, 3),
    ]
    const summary = summarizeNumeric(sessions, (c) => c?.sleep?.hours)

    expect(summary.median).toBe(7)
    expect(summary.n).toBe(1)
  })

  it('medianas dos sliders de estado atual', () => {
    const sessions = [
      withConditions('a', { currentState: { energy: 1, stress: 5 } }, 1),
      withConditions('b', { currentState: { energy: 3, stress: 3 } }, 2),
      withConditions('c', { currentState: { energy: 5 } }, 3),
    ]
    expect(summarizeNumeric(sessions, (c) => c?.currentState?.energy)).toEqual({
      median: 3,
      n: 3,
      total: 3,
    })
    expect(summarizeNumeric(sessions, (c) => c?.currentState?.stress)).toEqual({
      median: 4,
      n: 2,
      total: 3,
    })
  })
})

describe('composição de campos booleanos', () => {
  it('separa sim, não e não informado', () => {
    const sessions = [
      withConditions('a', { substances: { caffeine: true } }, 1),
      withConditions('b', { substances: { caffeine: true } }, 2),
      withConditions('c', { substances: { caffeine: false } }, 3),
      withConditions('d', {}, 4),
    ]
    expect(summarizeBoolean(sessions, (c) => c?.substances?.caffeine)).toEqual({
      yes: 2,
      no: 1,
      unknown: 1,
      total: 4,
    })
  })

  it('conjunto vazio devolve zeros coerentes', () => {
    expect(summarizeBoolean([], (c) => c?.substances?.caffeine)).toEqual({
      yes: 0,
      no: 0,
      unknown: 0,
      total: 0,
    })
  })
})

describe('composição medicamentosa e classificação descritiva', () => {
  function composed(taken: number, notTaken: number, unknown: number) {
    const sessions: SessionRecord[] = []
    let day = 1
    for (let i = 0; i < taken; i++) sessions.push(makeSession({ id: `t${i}`, day: day++, status: 'taken' }))
    for (let i = 0; i < notTaken; i++) sessions.push(makeSession({ id: `n${i}`, day: day++, status: 'not_taken' }))
    for (let i = 0; i < unknown; i++) sessions.push(makeSession({ id: `u${i}`, day: day++, status: 'absent' }))
    return sessions
  }

  it('conta os três estados', () => {
    expect(summarizeMedicationComposition(composed(5, 2, 1))).toEqual({
      taken: 5,
      notTaken: 2,
      unknown: 1,
      total: 8,
    })
  })

  it('predominantemente com lisdexanfetamina', () => {
    expect(classifyComposition(summarizeMedicationComposition(composed(7, 1, 0)))).toBe(
      'predominantly_taken'
    )
  })

  it('predominantemente sem lisdexanfetamina', () => {
    expect(classifyComposition(summarizeMedicationComposition(composed(1, 7, 0)))).toBe(
      'predominantly_not_taken'
    )
  })

  it('contexto misto', () => {
    expect(classifyComposition(summarizeMedicationComposition(composed(4, 4, 0)))).toBe('mixed')
  })

  it('metade ou mais sem registro ⇒ insuficientemente documentado', () => {
    expect(classifyComposition(summarizeMedicationComposition(composed(4, 0, 4)))).toBe(
      'insufficiently_documented'
    )
    expect(classifyComposition(summarizeMedicationComposition(composed(0, 0, 8)))).toBe(
      'insufficiently_documented'
    )
  })

  it('conjunto vazio é insuficientemente documentado, não "misto"', () => {
    expect(classifyComposition({ taken: 0, notTaken: 0, unknown: 0, total: 0 })).toBe(
      'insufficiently_documented'
    )
  })

  it('respeita o limiar declarado', () => {
    // 7/8 = 0.875 ≥ 0.7 ⇒ predominante; 5/8 = 0.625 < 0.7 ⇒ misto.
    expect(PREDOMINANCE_THRESHOLD).toBe(0.7)
    expect(classifyComposition({ taken: 7, notTaken: 1, unknown: 0, total: 8 })).toBe(
      'predominantly_taken'
    )
    expect(classifyComposition({ taken: 5, notTaken: 3, unknown: 0, total: 8 })).toBe('mixed')
  })
})

describe('horário', () => {
  it('converte para minutos desde a meia-noite local', () => {
    const iso = new Date(2026, 5, 10, 14, 30).toISOString()
    expect(minutesSinceMidnight(iso)).toBe(14 * 60 + 30)
  })

  it('data não parseável devolve null', () => {
    expect(minutesSinceMidnight('não é data')).toBeNull()
    expect(minutesSinceMidnight('')).toBeNull()
  })

  it('formata minutos como HH:MM', () => {
    expect(formatMinutesOfDay(0)).toBe('00:00')
    expect(formatMinutesOfDay(9 * 60 + 5)).toBe('09:05')
    expect(formatMinutesOfDay(23 * 60 + 59)).toBe('23:59')
    expect(formatMinutesOfDay(null)).toBeNull()
    expect(formatMinutesOfDay(Number.NaN)).toBeNull()
  })

  it('mediana do horário das sessões da referência', () => {
    const sessions = [
      makeSession({ id: 'a', day: 1, startedAt: new Date(2026, 5, 1, 8, 0).toISOString() }),
      makeSession({ id: 'b', day: 2, startedAt: new Date(2026, 5, 2, 10, 0).toISOString() }),
      makeSession({ id: 'c', day: 3, startedAt: new Date(2026, 5, 3, 12, 0).toISOString() }),
    ]
    const summary = summarizeTimeOfDay(sessions)

    expect(formatMinutesOfDay(summary.median)).toBe('10:00')
    expect(summary.n).toBe(3)
  })

  it('conjunto vazio devolve null sem NaN', () => {
    expect(summarizeTimeOfDay([])).toEqual({ median: null, n: 0, total: 0 })
  })
})

describe('quadrantes emocionais', () => {
  function withEmotion(id: string, emotionId: string | undefined, day: number): SessionRecord {
    return withConditions(
      id,
      emotionId
        ? {
            emotionalContext: {
              version: 1,
              primaryEmotion: { emotionId, intensity: 3 },
            },
          }
        : {},
      day
    )
  }

  it('conta os quadrantes das sessões da referência', () => {
    const sessions = [
      withEmotion('a', 'joyful', 1),      // amarelo
      withEmotion('b', 'excited', 2),     // amarelo
      withEmotion('c', 'calm', 3),        // verde
      withEmotion('d', 'sad', 4),         // azul
      withEmotion('e', 'anxious', 5),     // vermelho
      withEmotion('f', undefined, 6),     // sem registro
    ]
    expect(summarizeQuadrants(sessions)).toEqual({
      yellow: 2,
      green: 1,
      blue: 1,
      red: 1,
      none: 1,
    })
  })

  it('emoção desconhecida conta como sem registro, sem lançar', () => {
    const sessions = [withEmotion('a', 'emocao-inexistente', 1)]
    expect(() => summarizeQuadrants(sessions)).not.toThrow()
    expect(summarizeQuadrants(sessions).none).toBe(1)
  })

  it('conjunto vazio devolve todos os contadores em zero', () => {
    expect(summarizeQuadrants([])).toEqual({ yellow: 0, green: 0, blue: 0, red: 0, none: 0 })
  })

  it('conta quantas sessões registraram percepção da relação, sem expor detalhes', () => {
    const sessions = [
      withConditions('a', {
        emotionalContext: { version: 1, relationshipPerception: { rating: 70 } },
      }, 1),
      withConditions('b', {
        emotionalContext: { version: 1, relationshipPerception: { rating: 20, confidence: 4 } },
      }, 2),
      withConditions('c', {}, 3),
    ]
    expect(countRelationshipPerceptions(sessions)).toBe(2)
  })
})

describe('formatação de sono', () => {
  it('converte horas decimais em Xh MM', () => {
    expect(formatSleepHours(5.67)).toBe('5h40')
    expect(formatSleepHours(7)).toBe('7h00')
    expect(formatSleepHours(7.5)).toBe('7h30')
    expect(formatSleepHours(0)).toBe('0h00')
  })

  it('arredondamento não produz "6h60"', () => {
    expect(formatSleepHours(5.999)).toBe('6h00')
  })

  it('entrada inválida devolve null', () => {
    expect(formatSleepHours(null)).toBeNull()
    expect(formatSleepHours(Number.NaN)).toBeNull()
    expect(formatSleepHours(Number.POSITIVE_INFINITY)).toBeNull()
    expect(formatSleepHours(-1)).toBeNull()
  })
})

describe('comparação completa do contexto', () => {
  const reference = [
    withConditions('r1', {
      sleep: { hours: 7, quality: 4 },
      currentState: { energy: 3, focus: 4, mood: 3, stress: 2, motivation: 4, sleepiness: 2 },
      substances: { caffeine: true },
      nutrition: { hunger: 2, hydration: 4 },
      ...medicationCheckIn('taken'),
    }, 1),
    withConditions('r2', {
      sleep: { hours: 8, quality: 5 },
      substances: { caffeine: false },
      ...medicationCheckIn('taken'),
    }, 2),
    withConditions('r3', { ...medicationCheckIn('taken') }, 3),
  ]

  const current = withConditions('atual', {
    sleep: { hours: 5.67, quality: 2 },
    currentState: { energy: 2 },
    substances: { caffeine: true },
    ...medicationCheckIn('taken'),
  }, 10)

  it('põe valor atual e mediana da referência lado a lado', () => {
    const comparison = buildContextComparison(current, reference)

    expect(comparison.sleepHours.current).toBe(5.67)
    expect(comparison.sleepHours.reference.median).toBe(7.5)
    expect(comparison.sleepHours.reference.n).toBe(2)
    expect(comparison.sleepHours.reference.total).toBe(3)
  })

  it('descreve a composição da cafeína da referência', () => {
    const comparison = buildContextComparison(current, reference)
    expect(comparison.caffeine.current).toBe(true)
    expect(comparison.caffeine.reference).toEqual({ yes: 1, no: 1, unknown: 1, total: 3 })
  })

  it('campos parcialmente ausentes não quebram nem inventam valores', () => {
    const comparison = buildContextComparison(current, reference)

    const sleepiness = comparison.currentState.find((r) => r.label === 'Sonolência')!
    expect(sleepiness.current).toBeNull()
    expect(sleepiness.reference.n).toBe(1)

    expect(comparison.hunger.current).toBeNull()
    expect(comparison.hunger.reference.median).toBe(2)
  })

  it('sessão sem nenhuma condição não produz NaN nem Infinity', () => {
    const empty = withConditions('vazia', {}, 20)
    const comparison = buildContextComparison(empty, [])

    const numbers: (number | null)[] = [
      comparison.sleepHours.current,
      comparison.sleepHours.reference.median,
      comparison.sleepQuality.reference.median,
      comparison.timeOfDay.reference.median,
      comparison.hunger.reference.median,
      comparison.hydration.reference.median,
      ...comparison.currentState.map((r) => r.reference.median),
    ]
    for (const value of numbers) {
      expect(value === null || Number.isFinite(value)).toBe(true)
    }
    expect(comparison.hasAnyData).toBe(false)
  })

  it('sessão sem checkIn nenhum é comparável sem lançar', () => {
    const noCheckIn = makeSession({ id: 'sem', day: 5, checkIn: undefined })
    expect(() => buildContextComparison(noCheckIn, reference)).not.toThrow()

    const comparison = buildContextComparison(noCheckIn, reference)
    expect(comparison.medication.current).toBe('unknown')
    expect(comparison.sleepHours.current).toBeNull()
  })

  it('reporta a composição medicamentosa da referência', () => {
    const comparison = buildContextComparison(current, reference)
    expect(comparison.medication.current).toBe('taken')
    expect(comparison.medication.reference).toEqual({
      taken: 3,
      notTaken: 0,
      unknown: 0,
      total: 3,
    })
  })

  it('hasAnyData é verdadeiro quando há qualquer dado exibível', () => {
    expect(buildContextComparison(current, reference).hasAnyData).toBe(true)
    // Só o estado medicamentoso já basta.
    const onlyMedication = withConditions('m', medicationCheckIn('not_taken'), 30)
    expect(buildContextComparison(onlyMedication, []).hasAnyData).toBe(true)
  })
})
