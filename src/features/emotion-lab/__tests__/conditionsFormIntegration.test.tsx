import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TestConditions } from '../../../types'

const getLatestConditions = vi.fn()

vi.mock('../../../storage/repository', () => ({
  getLatestConditions: (...args: unknown[]) => getLatestConditions(...args),
}))

import { TestConditionsForm } from '../../../components/test/TestConditionsForm'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  getLatestConditions.mockReset()
  getLatestConditions.mockResolvedValue(undefined)
})

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Registrar e Continuar' }))
}

describe('formulário de condições — integração do Emotion Lab', () => {
  it('a seção emocional está disponível junto das demais condições', () => {
    render(<TestConditionsForm onConfirm={vi.fn()} />)

    expect(screen.getByText('Contexto emocional e relacional')).toBeInTheDocument()
    expect(screen.getByLabelText('Emoção principal')).toBeInTheDocument()
    expect(screen.getByLabelText('Percepção da relação agora')).toBeInTheDocument()
  })

  it('nada é obrigatório: dá para iniciar sem registrar contexto', () => {
    const onConfirm = vi.fn()
    render(<TestConditionsForm onConfirm={onConfirm} />)
    submit()

    const conditions = onConfirm.mock.calls[0][0] as TestConditions
    expect(conditions.emotionalContext).toBeUndefined()
    expect(conditions).not.toHaveProperty('emotionalContext')
    expect(conditions.recordedAt).toBeTruthy()
  })

  it('registra o contexto emocional preenchido, com carimbo de atualização', () => {
    const onConfirm = vi.fn()
    render(<TestConditionsForm onConfirm={onConfirm} />)

    fireEvent.change(screen.getByLabelText('Emoção principal'), { target: { value: 'anxious' } })
    fireEvent.change(screen.getByLabelText('Percepção da relação agora'), { target: { value: '70' } })
    submit()

    const context = (onConfirm.mock.calls[0][0] as TestConditions).emotionalContext
    expect(context?.primaryEmotion).toEqual({ emotionId: 'anxious', intensity: 3 })
    expect(context?.relationshipPerception).toEqual({ rating: 70 })
    expect(context?.updatedAt).toBeTruthy()
    expect(context?.version).toBe(1)
  })

  it('convive com os demais campos de condição sem interferir', () => {
    const onConfirm = vi.fn()
    render(<TestConditionsForm onConfirm={onConfirm} />)

    fireEvent.change(screen.getByLabelText(/Horas dormidas/), { target: { value: '7' } })
    fireEvent.change(screen.getByLabelText('Emoção principal'), { target: { value: 'calm' } })
    submit()

    const conditions = onConfirm.mock.calls[0][0] as TestConditions
    expect(conditions.sleep?.hours).toBe(7)
    expect(conditions.emotionalContext?.primaryEmotion?.emotionId).toBe('calm')
  })
})

describe('edição posterior das condições', () => {
  const existing: TestConditions = {
    sleep: { hours: 7 },
    notes: 'observação original',
    emotionalContext: {
      version: 1,
      primaryEmotion: { emotionId: 'anxious', intensity: 4 },
      relationshipPerception: { rating: 70, confidence: 3 },
      updatedAt: '2026-07-01T10:00:00.000Z',
    },
  }

  it('abre já refletindo o contexto registrado antes', () => {
    render(
      <TestConditionsForm
        onConfirm={vi.fn()}
        initialConditions={existing}
        showLoadPrevious={false}
        confirmLabel="Salvar condicoes"
      />
    )

    expect(screen.getByLabelText('Emoção principal')).toHaveValue('anxious')
    expect(screen.getByLabelText('Percepção da relação agora')).toHaveValue('70')
    expect(screen.getByLabelText('Médio')).toBeChecked()
  })

  it('altera o contexto e carimba novo updatedAt', () => {
    const onConfirm = vi.fn()
    render(
      <TestConditionsForm
        onConfirm={onConfirm}
        initialConditions={existing}
        showLoadPrevious={false}
        confirmLabel="Salvar condicoes"
      />
    )

    fireEvent.change(screen.getByLabelText('Emoção principal'), { target: { value: 'calm' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar condicoes' }))

    const context = (onConfirm.mock.calls[0][0] as TestConditions).emotionalContext
    expect(context?.primaryEmotion?.emotionId).toBe('calm')
    expect(context?.updatedAt).not.toBe('2026-07-01T10:00:00.000Z')
  })

  it('salvar sem mexer no contexto preserva o updatedAt anterior', () => {
    const onConfirm = vi.fn()
    render(
      <TestConditionsForm
        onConfirm={onConfirm}
        initialConditions={existing}
        showLoadPrevious={false}
        confirmLabel="Salvar condicoes"
      />
    )

    fireEvent.change(screen.getByLabelText(/Observações Gerais/), {
      target: { value: 'texto novo' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar condicoes' }))

    const conditions = onConfirm.mock.calls[0][0] as TestConditions
    expect(conditions.notes).toBe('texto novo')
    expect(conditions.emotionalContext?.updatedAt).toBe('2026-07-01T10:00:00.000Z')
  })

  it('permite remover totalmente o contexto emocional', () => {
    const onConfirm = vi.fn()
    render(
      <TestConditionsForm
        onConfirm={onConfirm}
        initialConditions={existing}
        showLoadPrevious={false}
        confirmLabel="Salvar condicoes"
      />
    )

    fireEvent.change(screen.getByLabelText('Emoção principal'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Limpar resposta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar condicoes' }))

    const conditions = onConfirm.mock.calls[0][0] as TestConditions
    expect(conditions).not.toHaveProperty('emotionalContext')
    // As demais condições sobrevivem à remoção.
    expect(conditions.sleep?.hours).toBe(7)
    expect(conditions.notes).toBe('observação original')
  })

  it('sessão antiga sem contexto emocional abre normalmente', () => {
    render(
      <TestConditionsForm
        onConfirm={vi.fn()}
        initialConditions={{ sleep: { hours: 6 } }}
        showLoadPrevious={false}
      />
    )

    expect(screen.getByLabelText('Emoção principal')).toHaveValue('')
    expect(screen.getByLabelText('Percepção da relação agora')).toHaveAttribute(
      'aria-valuetext',
      'Não registrado'
    )
  })

  it('contexto malformado é saneado ao salvar em vez de propagar', () => {
    const onConfirm = vi.fn()
    render(
      <TestConditionsForm
        onConfirm={onConfirm}
        initialConditions={
          {
            emotionalContext: {
              version: 1,
              primaryEmotion: { emotionId: 'inexistente', intensity: 99 },
            },
          } as unknown as TestConditions
        }
        showLoadPrevious={false}
      />
    )
    submit()

    expect(onConfirm.mock.calls[0][0]).not.toHaveProperty('emotionalContext')
  })
})

describe('"usar condições da sessão anterior"', () => {
  it('não traz emoção nem percepção da sessão passada', async () => {
    // O repositório já remove o contexto; a interface não deve reintroduzi-lo.
    getLatestConditions.mockResolvedValue({ sleep: { hours: 8 }, environment: { headphones: true } })

    const onConfirm = vi.fn()
    render(<TestConditionsForm onConfirm={onConfirm} />)

    const button = await screen.findByRole('button', { name: /condições da sessão anterior/i })
    fireEvent.click(button)
    await screen.findByDisplayValue('8')
    submit()

    const conditions = onConfirm.mock.calls[0][0] as TestConditions
    expect(conditions.sleep?.hours).toBe(8)
    expect(conditions).not.toHaveProperty('emotionalContext')
  })

  it('não apaga o que a pessoa acabou de registrar agora', async () => {
    getLatestConditions.mockResolvedValue({ sleep: { hours: 8 } })

    const onConfirm = vi.fn()
    render(<TestConditionsForm onConfirm={onConfirm} />)

    fireEvent.change(screen.getByLabelText('Emoção principal'), { target: { value: 'calm' } })

    const button = await screen.findByRole('button', { name: /condições da sessão anterior/i })
    fireEvent.click(button)
    await screen.findByDisplayValue('8')
    submit()

    const conditions = onConfirm.mock.calls[0][0] as TestConditions
    expect(conditions.sleep?.hours).toBe(8)
    expect(conditions.emotionalContext?.primaryEmotion?.emotionId).toBe('calm')
  })
})
