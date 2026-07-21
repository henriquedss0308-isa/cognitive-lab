import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../storage/repository', () => ({
  getLatestConditions: async () => undefined,
}))

import { TestConditionsForm } from '../../../components/test/TestConditionsForm'
import { getConditionsLisdexamfetamineStatus } from '../medicationContext'
import type { TestConditions } from '../../../types'

afterEach(() => {
  cleanup()
})

function renderForm(initialConditions?: TestConditions) {
  const onConfirm = vi.fn()
  render(
    <TestConditionsForm
      initialConditions={initialConditions}
      showLoadPrevious={false}
      onConfirm={onConfirm}
    />
  )
  return onConfirm
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Registrar e Continuar' }))
}

function submitted(onConfirm: ReturnType<typeof vi.fn>): TestConditions {
  return onConfirm.mock.calls[0][0]
}

const radio = (label: string) => screen.getByRole('radio', { name: label })

describe('o campo estruturado no formulário de condições', () => {
  it('aparece junto das substâncias', () => {
    renderForm()
    expect(
      screen.getByRole('group', { name: /Tomou lisdexanfetamina antes desta sessão/ })
    ).toBeInTheDocument()
  })

  it('não é obrigatório: dá para enviar sem responder', () => {
    const onConfirm = renderForm()
    submit()

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(submitted(onConfirm).medications).toBeUndefined()
    expect(getConditionsLisdexamfetamineStatus(submitted(onConfirm))).toBe('unknown')
  })

  it('leva o estado registrado até as condições salvas', () => {
    const onConfirm = renderForm()
    fireEvent.click(radio('Sim'))
    submit()

    expect(getConditionsLisdexamfetamineStatus(submitted(onConfirm))).toBe('taken')
    expect(submitted(onConfirm).medications?.lisdexamfetamine?.updatedAt).toBeTruthy()
  })

  it('"Não informado" explícito não persiste registro vazio', () => {
    const onConfirm = renderForm()
    fireEvent.click(radio('Não informado'))
    submit()

    // Registro vazio e ausência do campo significam a mesma coisa.
    expect(submitted(onConfirm).medications).toBeUndefined()
    expect(getConditionsLisdexamfetamineStatus(submitted(onConfirm))).toBe('unknown')
  })

  it('preserva os campos livres de medicamento', () => {
    const onConfirm = renderForm({
      substances: { medicationName: 'texto antigo', medicationDose: '30 mg' },
    })
    fireEvent.click(radio('Não'))
    submit()

    const conditions = submitted(onConfirm)
    expect(conditions.substances?.medicationName).toBe('texto antigo')
    expect(conditions.substances?.medicationDose).toBe('30 mg')
    expect(getConditionsLisdexamfetamineStatus(conditions)).toBe('not_taken')
  })

  it('o texto livre sozinho não marca nenhuma opção', () => {
    renderForm({ substances: { medicationName: 'Venvanse 30mg' } })

    expect((radio('Sim') as HTMLInputElement).checked).toBe(false)
    expect((radio('Não') as HTMLInputElement).checked).toBe(false)
    expect((radio('Não informado') as HTMLInputElement).checked).toBe(false)
  })
})

describe('edição posterior de sessão antiga', () => {
  it('sessão sem o campo abre sem nada marcado e permite classificar', () => {
    const onConfirm = renderForm({ sleep: { hours: 7 }, notes: 'observação antiga' })

    expect((radio('Sim') as HTMLInputElement).checked).toBe(false)

    fireEvent.click(radio('Não'))
    submit()

    const conditions = submitted(onConfirm)
    expect(getConditionsLisdexamfetamineStatus(conditions)).toBe('not_taken')
    // Nenhuma outra condição foi perdida na edição.
    expect(conditions.sleep).toEqual({ hours: 7 })
    expect(conditions.notes).toBe('observação antiga')
  })

  it('preserva o carimbo quando o estado não muda', () => {
    const onConfirm = renderForm({
      medications: { lisdexamfetamine: { status: 'taken', updatedAt: '2026-01-01T00:00:00.000Z' } },
    })
    submit()

    expect(submitted(onConfirm).medications?.lisdexamfetamine?.updatedAt).toBe(
      '2026-01-01T00:00:00.000Z'
    )
  })

  it('carimba de novo quando o estado muda', () => {
    const onConfirm = renderForm({
      medications: { lisdexamfetamine: { status: 'taken', updatedAt: '2026-01-01T00:00:00.000Z' } },
    })
    fireEvent.click(radio('Não'))
    submit()

    const record = submitted(onConfirm).medications?.lisdexamfetamine
    expect(record?.status).toBe('not_taken')
    expect(record?.updatedAt).not.toBe('2026-01-01T00:00:00.000Z')
  })

  it('o contexto emocional continua funcionando ao lado do novo campo', () => {
    const onConfirm = renderForm({
      emotionalContext: { version: 1, primaryEmotion: { emotionId: 'calm', intensity: 2 } },
    })
    fireEvent.click(radio('Sim'))
    submit()

    const conditions = submitted(onConfirm)
    expect(conditions.emotionalContext?.primaryEmotion).toEqual({
      emotionId: 'calm',
      intensity: 2,
    })
    expect(getConditionsLisdexamfetamineStatus(conditions)).toBe('taken')
  })
})
