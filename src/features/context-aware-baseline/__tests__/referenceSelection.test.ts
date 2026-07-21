import { describe, it, expect } from 'vitest'
import { selectReference } from '../referenceSelection'
import { computeBaselineStats } from '../../../statistics/baseline'
import { evaluatePrimaryZ } from '../../../statistics/zscore'
import { getTest } from '../../../tests/registry'
import { METRIC_KEYS, PROTOCOL, TEST_ID, makeSession, sequence } from './fixtures'
import type { LisdexamfetamineStatus } from '../types'
import type { SessionRecord } from '../../../types'

const test = getTest(TEST_ID)

function evaluated(status: LisdexamfetamineStatus | 'absent') {
  return makeSession({ id: 'atual', day: 28, status })
}

/** Universo com as duas janelas contextuais completas. */
function bothComplete(): SessionRecord[] {
  const statuses: ('taken' | 'not_taken' | 'absent')[] = ['absent', 'absent', 'absent']
  for (let i = 0; i < 8; i++) statuses.push('taken', 'not_taken')
  return sequence(statuses, {
    medianRTs: statuses.map((s, i) => (s === 'taken' ? 300 + i : s === 'not_taken' ? 500 + i : 400)),
  })
}

function select(sessions: SessionRecord[], session: SessionRecord) {
  return selectReference({
    sessions,
    session,
    testId: TEST_ID,
    protocolVersion: PROTOCOL,
    metricKeys: METRIC_KEYS,
  })
}

describe('referência contextual disponível', () => {
  it('sessão com lisdexanfetamina usa a referência com lisdexanfetamina', () => {
    const selection = select(bothComplete(), evaluated('taken'))
    expect(selection.reference.metadata.kind).toBe('lisdexamfetamine_taken')
    expect(selection.reference.metadata.fallback).toBe(false)
    expect(selection.reference.metadata.composition).toBe('complete')
    expect(selection.sessionStatus).toBe('taken')
  })

  it('sessão sem lisdexanfetamina usa a referência sem lisdexanfetamina', () => {
    const selection = select(bothComplete(), evaluated('not_taken'))
    expect(selection.reference.metadata.kind).toBe('lisdexamfetamine_not_taken')
    expect(selection.reference.metadata.fallback).toBe(false)
    expect(selection.sessionStatus).toBe('not_taken')
  })

  it('as duas seleções produzem z diferentes para o mesmo valor', () => {
    const sessions = bothComplete()
    const withMed = select(sessions, evaluated('taken')).reference
    const withoutMed = select(sessions, evaluated('not_taken')).reference

    const zWith = evaluatePrimaryZ(400, withMed.stats, test)
    const zWithout = evaluatePrimaryZ(400, withoutMed.stats, test)
    expect(zWith.kind).toBe('ok')
    expect(zWithout.kind).toBe('ok')
    if (zWith.kind === 'ok' && zWithout.kind === 'ok') {
      expect(zWith.z).not.toBeCloseTo(zWithout.z, 6)
    }
  })

  it('metadados da referência escolhida são auditáveis', () => {
    const selection = select(bothComplete(), evaluated('taken'))
    const meta = selection.reference.metadata

    expect(meta.testId).toBe(TEST_ID)
    expect(meta.protocolVersion).toBe(PROTOCOL)
    expect(meta.sessionIds).toHaveLength(8)
    expect(meta.sessionCount).toBe(8)
    expect(meta.requiredCount).toBe(8)
    expect(meta.dateRange).not.toBeNull()
    expect(selection.reference.stats.metrics.medianCorrectRT.n).toBe(8)
    // A sessão avaliada não entra na própria referência.
    expect(meta.sessionIds).not.toContain('atual')
  })
})

describe('fallback para a referência geral', () => {
  /** Referência geral consolidada (≥11 elegíveis), contextos incompletos. */
  function generalOnly(): SessionRecord[] {
    return sequence([
      ...Array.from({ length: 11 }, () => 'absent' as const),
      'taken', 'not_taken',
    ])
  }

  it('referência contextual incompleta ⇒ geral, com motivo registrado', () => {
    const selection = select(generalOnly(), evaluated('taken'))
    expect(selection.reference.metadata.kind).toBe('general')
    expect(selection.reference.metadata.fallback).toBe(true)
    expect(selection.reference.metadata.fallbackReason).toBe('contextual_incomplete')
  })

  it('vale igualmente para o contexto sem lisdexanfetamina', () => {
    const selection = select(generalOnly(), evaluated('not_taken'))
    expect(selection.reference.metadata.kind).toBe('general')
    expect(selection.reference.metadata.fallbackReason).toBe('contextual_incomplete')
  })

  it('sétima sessão do contexto ainda não basta; a nona é a primeira comparável', () => {
    const base: ('taken' | 'absent')[] = ['absent', 'absent', 'absent']

    // Com 7 sessões "com" no universo consultado: ainda incompleta.
    const seven = sequence([...base, ...Array.from({ length: 7 }, () => 'taken' as const)])
    expect(select(seven, evaluated('taken')).progress.taken.count).toBe(7)
    expect(select(seven, evaluated('taken')).reference.metadata.kind).toBe('general')

    // Com 8 no universo (a avaliada seria a nona): referência contextual pronta.
    const eight = sequence([...base, ...Array.from({ length: 8 }, () => 'taken' as const)])
    const selection = select(eight, evaluated('taken'))
    expect(selection.progress.taken.count).toBe(8)
    expect(selection.reference.metadata.kind).toBe('lisdexamfetamine_taken')
  })

  it('referência geral indisponível ⇒ nenhuma comparação fabricada', () => {
    const few = sequence(['absent', 'absent', 'absent', 'taken'])
    const selection = select(few, evaluated('taken'))

    expect(selection.reference.metadata.kind).toBe('general')
    expect(selection.reference.stats.phase).not.toBe('monitoring')
    expect(evaluatePrimaryZ(300, selection.reference.stats, test).kind).toBe('not_monitoring')
  })
})

describe('estado desconhecido', () => {
  it('usa somente a referência geral, sem presumir uso nem ausência', () => {
    const selection = select(bothComplete(), evaluated('unknown'))
    expect(selection.reference.metadata.kind).toBe('general')
    expect(selection.sessionStatus).toBe('unknown')
    expect(selection.reference.metadata.fallbackReason).toBe('unknown_status')
  })

  it('campo ausente é tratado como desconhecido, não como "não tomou"', () => {
    const sessions = bothComplete()
    const semCampo = select(sessions, evaluated('absent'))
    const naoTomou = select(sessions, evaluated('not_taken'))

    expect(semCampo.sessionStatus).toBe('unknown')
    expect(semCampo.reference.metadata.kind).toBe('general')
    // O contraste é o ponto: registrar "não tomou" leva a outra referência.
    expect(naoTomou.reference.metadata.kind).toBe('lisdexamfetamine_not_taken')
  })

  it('mesmo com as duas janelas completas, o desconhecido não escolhe nenhuma', () => {
    const selection = select(bothComplete(), evaluated('unknown'))
    expect(selection.progress.taken.count).toBe(8)
    expect(selection.progress.notTaken.count).toBe(8)
    expect(selection.reference.metadata.kind).toBe('general')
  })
})

describe('protocolo incompatível', () => {
  it('sessões de outra versão não compõem a referência', () => {
    const sessions = [
      ...bothComplete(),
      ...Array.from({ length: 10 }, (_, i) =>
        makeSession({
          id: `outra-v${i}`,
          day: i + 1,
          status: 'taken',
          protocolVersion: 'reaction.simple.v2.0',
        })
      ),
    ]
    const selection = select(sessions, evaluated('taken'))
    expect(selection.reference.metadata.protocolVersion).toBe(PROTOCOL)
    for (const id of selection.reference.metadata.sessionIds) {
      expect(id).not.toMatch(/^outra-v/)
    }
  })

  it('nenhuma sessão do protocolo consultado ⇒ referência vazia, sem comparação', () => {
    const sessions = Array.from({ length: 12 }, (_, i) =>
      makeSession({
        id: `v2-${i}`,
        day: i + 1,
        status: 'taken',
        protocolVersion: 'reaction.simple.v2.0',
      })
    )
    const selection = select(sessions, evaluated('taken'))
    expect(selection.reference.metadata.sessionCount).toBe(0)
    expect(evaluatePrimaryZ(300, selection.reference.stats, test).kind).toBe('not_monitoring')
  })
})

describe('progresso das janelas contextuais', () => {
  it('reporta X/8 para cada contexto', () => {
    const sessions = sequence([
      'absent', 'absent', 'absent',
      'taken', 'taken', 'taken', 'not_taken', 'unknown',
    ])
    const selection = select(sessions, evaluated('unknown'))

    expect(selection.progress.taken).toEqual({ count: 3, required: 8 })
    expect(selection.progress.notTaken).toEqual({ count: 1, required: 8 })
  })

  it('o progresso nunca ultrapassa 8', () => {
    const sessions = sequence([
      'absent', 'absent', 'absent',
      ...Array.from({ length: 15 }, () => 'taken' as const),
    ])
    expect(select(sessions, evaluated('taken')).progress.taken.count).toBe(8)
  })
})

describe('garantias de regressão', () => {
  it('sem nenhuma referência contextual, o z é idêntico ao anterior à funcionalidade', () => {
    // Universo inteiro sem o campo — exatamente o estado dos dados existentes.
    const legacy = sequence(Array.from({ length: 14 }, () => 'absent' as const), {
      medianRTs: Array.from({ length: 14 }, (_, i) => 300 + i * 5),
    })

    const before = computeBaselineStats(legacy, TEST_ID, PROTOCOL, METRIC_KEYS)
    const after = select(legacy, evaluated('absent')).reference

    expect(after.stats).toEqual(before)
    expect(evaluatePrimaryZ(320, after.stats, test)).toEqual(
      evaluatePrimaryZ(320, before, test)
    )
  })

  it('classificar sessões antigas não altera a referência geral', () => {
    const legacy = sequence(Array.from({ length: 14 }, () => 'absent' as const), {
      medianRTs: Array.from({ length: 14 }, (_, i) => 300 + i * 5),
    })
    const classified = legacy.map((s, i) => ({
      ...s,
      checkIn: {
        ...s.checkIn,
        medications: { lisdexamfetamine: { status: i % 2 === 0 ? 'taken' : 'not_taken' } },
      },
    })) as SessionRecord[]

    expect(computeBaselineStats(classified, TEST_ID, PROTOCOL, METRIC_KEYS)).toEqual(
      computeBaselineStats(legacy, TEST_ID, PROTOCOL, METRIC_KEYS)
    )
  })

  it('a seleção é determinística e não muta o universo recebido', () => {
    const sessions = bothComplete()
    const snapshot = JSON.stringify(sessions)

    const first = select(sessions, evaluated('taken'))
    const second = select(sessions, evaluated('taken'))

    expect(first.reference.metadata).toEqual(second.reference.metadata)
    expect(first.reference.stats).toEqual(second.reference.stats)
    expect(JSON.stringify(sessions)).toBe(snapshot)
  })
})
