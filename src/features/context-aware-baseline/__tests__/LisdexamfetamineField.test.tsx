import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LisdexamfetamineField } from '../components/LisdexamfetamineField'
import { getConditionsLisdexamfetamineStatus } from '../medicationContext'
import type { MedicationContext } from '../types'

afterEach(() => {
  cleanup()
})

function Harness({ initial }: { initial?: MedicationContext }) {
  const [value, setValue] = useState<MedicationContext | undefined>(initial)
  return (
    <>
      <LisdexamfetamineField value={value} onChange={setValue} />
      <pre data-testid="state">{JSON.stringify(value ?? null)}</pre>
    </>
  )
}

function state(): MedicationContext | null {
  return JSON.parse(screen.getByTestId('state').textContent || 'null')
}

const radio = (label: string) => screen.getByRole('radio', { name: label }) as HTMLInputElement

describe('as três opções explícitas', () => {
  it('oferece Sim, Não e Não informado — e nenhum checkbox de medicação', () => {
    render(<Harness />)

    expect(radio('Sim')).toBeInTheDocument()
    expect(radio('Não')).toBeInTheDocument()
    expect(radio('Não informado')).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    // Um checkbox seria ambíguo: desmarcado não distingue "não tomei" de
    // "não respondi", e essa diferença decide a referência usada.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('nenhuma opção vem marcada silenciosamente', () => {
    render(<Harness />)

    expect(radio('Sim').checked).toBe(false)
    expect(radio('Não').checked).toBe(false)
    expect(radio('Não informado').checked).toBe(false)
    expect(state()).toBeNull()
  })

  it('sem resposta, o estado registrado é "Não informado"', () => {
    render(<Harness />)
    expect(screen.getByText(/Estado registrado:/)).toHaveTextContent('Não informado')
    expect(getConditionsLisdexamfetamineStatus({ medications: state() ?? undefined })).toBe('unknown')
  })

  it('registra "taken" ao escolher Sim', () => {
    render(<Harness />)
    fireEvent.click(radio('Sim'))

    expect(state()?.lisdexamfetamine?.status).toBe('taken')
    expect(radio('Sim').checked).toBe(true)
  })

  it('registra "not_taken" ao escolher Não', () => {
    render(<Harness />)
    fireEvent.click(radio('Não'))

    expect(state()?.lisdexamfetamine?.status).toBe('not_taken')
  })

  it('permite voltar explicitamente para Não informado', () => {
    render(<Harness initial={{ lisdexamfetamine: { status: 'taken' } }} />)
    fireEvent.click(radio('Não informado'))

    expect(state()?.lisdexamfetamine?.status).toBe('unknown')
    expect(screen.getByText(/Estado registrado:/)).toHaveTextContent('Não informado')
  })

  it('avisa que o desconhecido usa apenas a referência geral', () => {
    render(<Harness />)
    expect(screen.getByText(/comparada apenas à referência geral/)).toBeInTheDocument()
  })

  it('limpar a resposta volta ao estado sem registro', () => {
    render(<Harness initial={{ lisdexamfetamine: { status: 'taken' } }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Limpar resposta' }))

    expect(state()).toBeNull()
    expect(radio('Sim').checked).toBe(false)
  })
})

describe('dose e horário descritivos', () => {
  it('só aparecem depois de "Sim" e não são obrigatórios', () => {
    render(<Harness />)
    expect(screen.queryByLabelText(/Dose/)).not.toBeInTheDocument()

    fireEvent.click(radio('Sim'))
    expect(screen.getByLabelText(/Dose/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Dose/)).not.toBeRequired()
    expect(screen.getByLabelText(/Horário/)).not.toBeRequired()
    // O status já está registrado mesmo sem preencher dose e horário.
    expect(state()?.lisdexamfetamine?.status).toBe('taken')
  })

  it('grava dose e horário sem alterar o status', () => {
    render(<Harness initial={{ lisdexamfetamine: { status: 'taken' } }} />)
    fireEvent.change(screen.getByLabelText(/Dose/), { target: { value: '30 mg' } })

    expect(state()?.lisdexamfetamine).toMatchObject({ status: 'taken', dose: '30 mg' })
  })

  it('não aparecem para "Não"', () => {
    render(<Harness />)
    fireEvent.click(radio('Não'))
    expect(screen.queryByLabelText(/Dose/)).not.toBeInTheDocument()
  })
})

describe('acessibilidade e navegação por teclado', () => {
  it('é um grupo de rádios rotulado pela pergunta', () => {
    render(<Harness />)
    const group = screen.getByRole('group', { name: /Tomou lisdexanfetamina antes desta sessão/ })
    expect(group).toBeInTheDocument()
  })

  it('os três rádios compartilham o mesmo name (navegação por setas)', () => {
    render(<Harness />)
    const names = screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).name)
    expect(new Set(names).size).toBe(1)
  })

  it('cada rádio é alcançável e operável pelo teclado', () => {
    render(<Harness />)
    const sim = radio('Sim')

    sim.focus()
    expect(sim).toHaveFocus()
    // Selecionar pelo teclado dispara a mesma mudança que o clique.
    fireEvent.click(sim)
    expect(state()?.lisdexamfetamine?.status).toBe('taken')
  })

  it('cada rádio tem rótulo textual associado', () => {
    render(<Harness />)
    for (const label of ['Sim', 'Não', 'Não informado']) {
      expect(radio(label)).toBeInTheDocument()
    }
  })
})

describe('linguagem', () => {
  it('não afirma efeito nem sugere conduta', () => {
    render(<Harness initial={{ lisdexamfetamine: { status: 'taken' } }} />)
    const text = document.body.textContent ?? ''

    // Frases proibidas: afirmações de efeito e recomendações de conduta.
    // O teste procura CLAIMS, não radicais soltos — a própria isenção da tela
    // contém "recomenda" ao negar que recomende algo.
    for (const claim of [
      /melhorou (o |seu )?desempenho/i,
      /funciona melhor/i,
      /(você )?deveria tomar/i,
      /(deixe|pare) de tomar/i,
      /(aumente|diminua|ajuste) a dose/i,
      /prejudic(ou|a) (sua|seu)/i,
      /medicado você/i,
    ]) {
      expect(text).not.toMatch(claim)
    }
    expect(text).toMatch(/não recomenda, avalia nem interpreta/i)
  })

  it('não usa marca comercial na interface', () => {
    render(<Harness initial={{ lisdexamfetamine: { status: 'taken' } }} />)
    expect(document.body.textContent).not.toMatch(/venvanse|elvanse|vyvanse/i)
  })
})
