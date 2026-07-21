import { describe, it, expect } from 'vitest'
import {
  getConditionsLisdexamfetamineStatus,
  getSessionLisdexamfetamineStatus,
  getSessionMedicationRecord,
  medicationContextChanged,
  sanitizeMedicationContext,
  sanitizeMedicationRecord,
  toLisdexamfetamineStatus,
  touchMedicationContext,
  withSanitizedMedicationContext,
  withoutMedicationContext,
} from '../medicationContext'
import type { TestConditions } from '../../../types'

describe('classificação do estado de lisdexanfetamina', () => {
  it('lê os três estados explícitos', () => {
    expect(
      getConditionsLisdexamfetamineStatus({ medications: { lisdexamfetamine: { status: 'taken' } } })
    ).toBe('taken')
    expect(
      getConditionsLisdexamfetamineStatus({
        medications: { lisdexamfetamine: { status: 'not_taken' } },
      })
    ).toBe('not_taken')
    expect(
      getConditionsLisdexamfetamineStatus({
        medications: { lisdexamfetamine: { status: 'unknown' } },
      })
    ).toBe('unknown')
  })

  it('campo ausente é unknown — nunca "não tomou"', () => {
    expect(getConditionsLisdexamfetamineStatus(undefined)).toBe('unknown')
    expect(getConditionsLisdexamfetamineStatus({})).toBe('unknown')
    expect(getConditionsLisdexamfetamineStatus({ medications: {} })).toBe('unknown')
    expect(getConditionsLisdexamfetamineStatus({ sleep: { hours: 7 } })).toBe('unknown')
  })

  it('valor inválido cai para unknown em vez de lançar', () => {
    const garbage: unknown[] = [
      'Taken',
      'TAKEN',
      'sim',
      'yes',
      true,
      false,
      0,
      1,
      null,
      [],
      {},
      'não tomou',
    ]
    for (const value of garbage) {
      expect(toLisdexamfetamineStatus(value)).toBe('unknown')
      expect(
        getConditionsLisdexamfetamineStatus({
          medications: { lisdexamfetamine: { status: value } },
        } as unknown as TestConditions)
      ).toBe('unknown')
    }
  })

  it('estrutura malformada nunca lança e resolve para unknown', () => {
    const malformed: unknown[] = [
      { medications: 'lisdexamfetamine' },
      { medications: ['lisdexamfetamine'] },
      { medications: { lisdexamfetamine: 'taken' } },
      { medications: { lisdexamfetamine: null } },
      { medications: { lisdexamfetamine: [] } },
      { medications: null },
      null,
      [],
      'nada',
      42,
    ]
    for (const value of malformed) {
      expect(() =>
        getConditionsLisdexamfetamineStatus(value as TestConditions)
      ).not.toThrow()
      expect(getConditionsLisdexamfetamineStatus(value as TestConditions)).toBe('unknown')
    }
  })

  it('lê o status a partir de uma sessão', () => {
    expect(
      getSessionLisdexamfetamineStatus({
        checkIn: { medications: { lisdexamfetamine: { status: 'taken' } } },
      })
    ).toBe('taken')
    expect(getSessionLisdexamfetamineStatus({ checkIn: undefined })).toBe('unknown')
  })
})

describe('nenhuma inferência a partir de texto livre', () => {
  const freeTextCases = [
    'Venvanse',
    'venvanse 30mg',
    'lisdex',
    'Lisdexanfetamina',
    'lisdexamfetamine',
    'remédio',
    '30 mg',
    'estimulante',
    'Elvanse',
    'tomei o remédio hoje',
  ]

  it.each(freeTextCases)('«%s» em medicationName NÃO classifica a sessão', (text) => {
    const conditions: TestConditions = {
      substances: { medicationName: text, medicationDose: '30 mg', medicationTime: '08:00' },
    }
    expect(getConditionsLisdexamfetamineStatus(conditions)).toBe('unknown')
  })

  it.each(freeTextCases)('«%s» em notes NÃO classifica a sessão', (text) => {
    expect(getConditionsLisdexamfetamineStatus({ notes: text })).toBe('unknown')
  })

  it('o texto legado é preservado intacto pelo saneamento', () => {
    const conditions: TestConditions = {
      substances: {
        medicationName: 'Venvanse',
        medicationDose: '30 mg',
        medicationTime: '07:30',
        other: 'ômega 3',
        caffeine: true,
      },
      notes: 'tomei estimulante',
      medications: { lisdexamfetamine: { status: 'not_taken' } },
    }

    const sanitized = withSanitizedMedicationContext(conditions)

    expect(sanitized.substances).toEqual(conditions.substances)
    expect(sanitized.notes).toBe('tomei estimulante')
    // O texto diz "Venvanse", o registro estruturado diz "não tomou":
    // a fonte de verdade é o registro explícito, e o texto segue intacto.
    expect(getConditionsLisdexamfetamineStatus(sanitized)).toBe('not_taken')
  })

  it('texto livre sozinho nunca cria um registro estruturado', () => {
    const conditions: TestConditions = { substances: { medicationName: 'Venvanse 30mg' } }
    const sanitized = withSanitizedMedicationContext(conditions)
    expect(sanitized.medications).toBeUndefined()
  })
})

describe('saneamento do registro', () => {
  it('preserva dose e horário descritivos', () => {
    expect(
      sanitizeMedicationRecord({ status: 'taken', dose: '30 mg', time: '07:30' })
    ).toEqual({ status: 'taken', dose: '30 mg', time: '07:30' })
  })

  it('status inválido vira unknown mas preserva dose e horário escritos', () => {
    expect(sanitizeMedicationRecord({ status: 'banana', dose: '30 mg' })).toEqual({
      status: 'unknown',
      dose: '30 mg',
    })
  })

  it('registro sem nenhuma informação equivale à ausência do campo', () => {
    expect(sanitizeMedicationRecord({ status: 'unknown' })).toBeUndefined()
    expect(sanitizeMedicationRecord({})).toBeUndefined()
    expect(sanitizeMedicationRecord({ status: 'unknown', dose: '   ' })).toBeUndefined()
  })

  it('descarta campos extras (lista branca)', () => {
    const record = sanitizeMedicationRecord({
      status: 'taken',
      dose: '30 mg',
      brandName: 'Venvanse',
      effectiveness: 5,
    })
    expect(record).toEqual({ status: 'taken', dose: '30 mg' })
    expect(record).not.toHaveProperty('brandName')
    expect(record).not.toHaveProperty('effectiveness')
  })

  it('descarta medicamentos não suportados nesta versão', () => {
    const context = sanitizeMedicationContext({
      lisdexamfetamine: { status: 'taken' },
      methylphenidate: { status: 'taken' },
    })
    expect(context).toEqual({ lisdexamfetamine: { status: 'taken' } })
    expect(context).not.toHaveProperty('methylphenidate')
  })

  it('updatedAt não parseável é descartado', () => {
    expect(sanitizeMedicationRecord({ status: 'taken', updatedAt: 'ontem' })).toEqual({
      status: 'taken',
    })
    expect(
      sanitizeMedicationRecord({ status: 'taken', updatedAt: '2026-07-20T10:00:00.000Z' })
    ).toEqual({ status: 'taken', updatedAt: '2026-07-20T10:00:00.000Z' })
  })

  it('withSanitizedMedicationContext não toca em nenhum outro campo', () => {
    const conditions: TestConditions = {
      sleep: { hours: 7, quality: 4 },
      currentState: { energy: 3 },
      emotionalContext: { version: 1, primaryEmotion: { emotionId: 'calm', intensity: 2 } },
      medications: { lisdexamfetamine: { status: 'taken' } },
    }
    const sanitized = withSanitizedMedicationContext(conditions)
    expect(sanitized.sleep).toEqual(conditions.sleep)
    expect(sanitized.currentState).toEqual(conditions.currentState)
    expect(sanitized.emotionalContext).toEqual(conditions.emotionalContext)
  })

  it('condições sem o campo passam sem alteração de identidade', () => {
    const conditions: TestConditions = { sleep: { hours: 8 } }
    expect(withSanitizedMedicationContext(conditions)).toBe(conditions)
  })
})

describe('withoutMedicationContext', () => {
  it('remove o registro sem tocar no resto', () => {
    const conditions: TestConditions = {
      sleep: { hours: 7 },
      substances: { medicationName: 'texto livre' },
      medications: { lisdexamfetamine: { status: 'taken' } },
    }
    const stripped = withoutMedicationContext(conditions)
    expect(stripped.medications).toBeUndefined()
    expect(stripped.sleep).toEqual({ hours: 7 })
    expect(stripped.substances).toEqual({ medicationName: 'texto livre' })
    expect(getConditionsLisdexamfetamineStatus(stripped)).toBe('unknown')
  })
})

describe('touchMedicationContext', () => {
  const now = '2026-07-21T12:00:00.000Z'
  const before = '2026-07-01T09:00:00.000Z'

  it('carimba updatedAt quando o conteúdo muda', () => {
    const next = touchMedicationContext(
      { lisdexamfetamine: { status: 'not_taken', updatedAt: before } },
      { lisdexamfetamine: { status: 'taken' } },
      now
    )
    expect(next?.lisdexamfetamine?.status).toBe('taken')
    expect(next?.lisdexamfetamine?.updatedAt).toBe(now)
  })

  it('preserva o carimbo anterior quando nada muda', () => {
    const previous = { lisdexamfetamine: { status: 'taken' as const, updatedAt: before } }
    const next = touchMedicationContext(previous, { lisdexamfetamine: { status: 'taken' } }, now)
    expect(next?.lisdexamfetamine?.updatedAt).toBe(before)
  })

  it('mudança apenas de dose também carimba', () => {
    const next = touchMedicationContext(
      { lisdexamfetamine: { status: 'taken', dose: '30 mg', updatedAt: before } },
      { lisdexamfetamine: { status: 'taken', dose: '50 mg' } },
      now
    )
    expect(next?.lisdexamfetamine?.updatedAt).toBe(now)
  })

  it('detecta mudança de conteúdo ignorando updatedAt', () => {
    expect(
      medicationContextChanged(
        { lisdexamfetamine: { status: 'taken', updatedAt: before } },
        { lisdexamfetamine: { status: 'taken', updatedAt: now } }
      )
    ).toBe(false)
    expect(
      medicationContextChanged(
        { lisdexamfetamine: { status: 'taken' } },
        { lisdexamfetamine: { status: 'not_taken' } }
      )
    ).toBe(true)
    expect(
      medicationContextChanged(undefined, { lisdexamfetamine: { status: 'unknown' } })
    ).toBe(false)
  })

  it('conteúdo vazio devolve undefined', () => {
    expect(touchMedicationContext(undefined, undefined, now)).toBeUndefined()
    expect(
      touchMedicationContext(undefined, { lisdexamfetamine: { status: 'unknown' } }, now)
    ).toBeUndefined()
  })
})

describe('registro completo da sessão', () => {
  it('devolve dose e horário quando existem', () => {
    expect(
      getSessionMedicationRecord({
        checkIn: { medications: { lisdexamfetamine: { status: 'taken', dose: '30 mg' } } },
      })
    ).toEqual({ status: 'taken', dose: '30 mg' })
  })

  it('devolve undefined para sessão antiga', () => {
    expect(getSessionMedicationRecord({ checkIn: { sleep: { hours: 7 } } })).toBeUndefined()
    expect(getSessionMedicationRecord({ checkIn: undefined })).toBeUndefined()
  })
})
