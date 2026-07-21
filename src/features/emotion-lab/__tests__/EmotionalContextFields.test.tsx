import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EmotionalContextFields } from '../components/EmotionalContextFields'
import type { EmotionalContext } from '../types'

afterEach(() => {
  cleanup()
})

function Harness({
  initial,
  relationshipLabel,
}: {
  initial?: EmotionalContext
  relationshipLabel?: string
}) {
  const [value, setValue] = useState<EmotionalContext | undefined>(initial)
  return (
    <>
      <EmotionalContextFields
        value={value}
        onChange={setValue}
        relationshipLabel={relationshipLabel}
      />
      <pre data-testid="state">{JSON.stringify(value ?? null)}</pre>
    </>
  )
}

function state(): EmotionalContext | null {
  return JSON.parse(screen.getByTestId('state').textContent || 'null')
}

function primarySelect() {
  return screen.getByLabelText('Emoção principal')
}

function secondarySelect() {
  return screen.getByLabelText('Emoção secundária (opcional)')
}

function slider() {
  return screen.getByLabelText('Percepção da relação agora')
}

function intensityGroup(emotionLabel: string) {
  return screen.getByRole('group', { name: new RegExp(`Intensidade de ${emotionLabel}`) })
}

describe('seleção de emoção', () => {
  it('grava o id estável, não o texto visível', () => {
    render(<Harness />)
    fireEvent.change(primarySelect(), { target: { value: 'anxious' } })

    expect(state()?.primaryEmotion).toEqual({ emotionId: 'anxious', intensity: 3 })
  })

  it('começa sem nenhuma emoção registrada', () => {
    render(<Harness />)
    expect(state()).toBeNull()
    expect(primarySelect()).toHaveValue('')
  })

  it('permite escolher a emoção pelo nome', () => {
    render(<Harness />)
    expect(within(primarySelect()).getByRole('option', { name: 'Ansioso' })).toBeInTheDocument()
    expect(within(primarySelect()).getByRole('option', { name: 'Esperançoso' })).toBeInTheDocument()
  })

  it('agrupa as opções por quadrante com descrição textual', () => {
    render(<Harness />)
    const groups = Array.from(primarySelect().querySelectorAll('optgroup')).map((g) =>
      g.getAttribute('label')
    )
    expect(groups).toEqual([
      'Amarelo — Energia alta e agradável',
      'Verde — Energia baixa e agradável',
      'Azul — Energia baixa e desagradável',
      'Vermelho — Energia alta e desagradável',
    ])
  })

  it('deriva cor e descrição da emoção escolhida — sem campo de cor editável', () => {
    render(<Harness />)
    fireEvent.change(primarySelect(), { target: { value: 'anxious' } })

    expect(screen.getByText('Vermelho · Energia alta e desagradável')).toBeInTheDocument()
    // A cor nunca é uma resposta que a pessoa edite.
    expect(screen.queryByLabelText(/cor/i)).toBeNull()
    expect(state()).not.toHaveProperty('color')
  })

  it('a descrição textual acompanha a cor (acessibilidade)', () => {
    render(<Harness />)
    fireEvent.change(primarySelect(), { target: { value: 'calm' } })
    expect(screen.getByText('Verde · Energia baixa e agradável')).toBeInTheDocument()

    fireEvent.change(primarySelect(), { target: { value: 'sad' } })
    expect(screen.getByText('Azul · Energia baixa e desagradável')).toBeInTheDocument()
  })

  it('troca a intensidade da emoção principal', () => {
    render(<Harness />)
    fireEvent.change(primarySelect(), { target: { value: 'anxious' } })
    fireEvent.click(within(intensityGroup('Ansioso')).getByLabelText('4'))

    expect(state()?.primaryEmotion).toEqual({ emotionId: 'anxious', intensity: 4 })
  })

  it('intensidade só aparece depois de escolher a emoção', () => {
    render(<Harness />)
    expect(screen.queryByRole('group', { name: /Intensidade/ })).toBeNull()

    fireEvent.change(primarySelect(), { target: { value: 'tired' } })
    expect(intensityGroup('Cansado')).toBeInTheDocument()
  })
})

describe('emoção secundária', () => {
  it('só é oferecida depois da principal', () => {
    render(<Harness />)
    expect(screen.queryByLabelText('Emoção secundária (opcional)')).toBeNull()

    fireEvent.change(primarySelect(), { target: { value: 'anxious' } })
    expect(secondarySelect()).toBeInTheDocument()
  })

  it('não oferece a mesma emoção já escolhida como principal', () => {
    render(<Harness />)
    fireEvent.change(primarySelect(), { target: { value: 'anxious' } })

    expect(within(secondarySelect()).queryByRole('option', { name: 'Ansioso' })).toBeNull()
    expect(within(secondarySelect()).getByRole('option', { name: 'Esperançoso' })).toBeInTheDocument()
  })

  it('registra emoção secundária com intensidade própria', () => {
    render(<Harness />)
    fireEvent.change(primarySelect(), { target: { value: 'anxious' } })
    fireEvent.change(secondarySelect(), { target: { value: 'hopeful' } })
    fireEvent.click(within(intensityGroup('Esperançoso')).getByLabelText('2'))

    expect(state()?.primaryEmotion).toEqual({ emotionId: 'anxious', intensity: 3 })
    expect(state()?.secondaryEmotion).toEqual({ emotionId: 'hopeful', intensity: 2 })
  })

  it('trocar a principal para a emoção já usada como secundária remove a duplicata', () => {
    render(<Harness />)
    fireEvent.change(primarySelect(), { target: { value: 'anxious' } })
    fireEvent.change(secondarySelect(), { target: { value: 'hopeful' } })
    fireEvent.change(primarySelect(), { target: { value: 'hopeful' } })

    expect(state()?.primaryEmotion?.emotionId).toBe('hopeful')
    expect(state()?.secondaryEmotion).toBeUndefined()
  })

  it('limpar a principal remove a secundária órfã', () => {
    render(<Harness />)
    fireEvent.change(primarySelect(), { target: { value: 'anxious' } })
    fireEvent.change(secondarySelect(), { target: { value: 'hopeful' } })
    fireEvent.change(primarySelect(), { target: { value: '' } })

    expect(state()).toBeNull()
  })
})

describe('"Não consigo identificar agora"', () => {
  it('registra o estado e esconde a escolha de emoções', () => {
    render(<Harness />)
    fireEvent.click(screen.getByLabelText('Não consigo identificar agora'))

    expect(state()).toEqual({ version: 1, unidentifiedEmotion: true })
    expect(screen.queryByLabelText('Emoção principal')).toBeNull()
  })

  it('não coexiste com uma emoção principal já escolhida', () => {
    render(<Harness />)
    fireEvent.change(primarySelect(), { target: { value: 'anxious' } })
    fireEvent.click(screen.getByLabelText('Não consigo identificar agora'))

    expect(state()?.primaryEmotion).toBeUndefined()
    expect(state()?.unidentifiedEmotion).toBe(true)
  })

  it('desmarcar devolve a escolha de emoções e não deixa resíduo', () => {
    render(<Harness />)
    const checkbox = screen.getByLabelText('Não consigo identificar agora')
    fireEvent.click(checkbox)
    fireEvent.click(checkbox)

    expect(state()).toBeNull()
    expect(primarySelect()).toBeInTheDocument()
  })
})

describe('percepção da relação — slider', () => {
  it('não tem valor padrão silencioso', () => {
    render(<Harness />)

    expect(state()).toBeNull()
    expect(slider()).toHaveAttribute('aria-valuetext', 'Não registrado')
    expect(screen.getByText(/Não registrado/)).toBeInTheDocument()
  })

  it('registra o valor apenas quando a pessoa move o controle', () => {
    render(<Harness />)
    fireEvent.change(slider(), { target: { value: '70' } })

    expect(state()?.relationshipPerception).toEqual({ rating: 70 })
  })

  it('é acessível: label real, papel de slider, faixa e valor textual', () => {
    render(<Harness />)
    const input = slider()

    expect(input).toHaveAttribute('type', 'range')
    expect(input).toHaveAttribute('min', '0')
    expect(input).toHaveAttribute('max', '100')
    expect(screen.getByRole('slider')).toBe(input)

    fireEvent.change(input, { target: { value: '70' } })
    expect(input).toHaveAttribute('aria-valuetext', 'Ok–Boa')
  })

  it('prioriza o rótulo qualitativo na interface', () => {
    render(<Harness />)
    fireEvent.change(slider(), { target: { value: '85' } })

    expect(screen.getByText('Boa–Muito boa')).toBeInTheDocument()
  })

  it('permite posições intermediárias entre as âncoras', () => {
    render(<Harness />)

    fireEvent.change(slider(), { target: { value: '60' } })
    expect(slider()).toHaveAttribute('aria-valuetext', 'Ok')
    expect(state()?.relationshipPerception?.rating).toBe(60)

    fireEvent.change(slider(), { target: { value: '61' } })
    expect(slider()).toHaveAttribute('aria-valuetext', 'Ok–Boa')
    expect(state()?.relationshipPerception?.rating).toBe(61)
  })

  it('clicar sobre a posição de repouso registra o valor do meio', () => {
    // Sem tratamento explícito, o input não dispara `change` (valor idêntico) e
    // a pessoa não conseguiria registrar justamente o meio da escala.
    render(<Harness />)
    fireEvent.pointerUp(slider())

    expect(state()?.relationshipPerception).toEqual({ rating: 50 })
    expect(slider()).toHaveAttribute('aria-valuetext', 'Meh–Ok')
  })

  it('clicar de novo não sobrescreve um valor já registrado', () => {
    render(<Harness />)
    fireEvent.change(slider(), { target: { value: '80' } })
    fireEvent.pointerUp(slider())

    expect(state()?.relationshipPerception?.rating).toBe(80)
  })

  it('exibe as âncoras da escala', () => {
    render(<Harness />)
    for (const label of ['Ruim', 'Paia', 'Meh', 'Ok', 'Boa', 'Muito boa']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
  })

  it('permite limpar a resposta', () => {
    render(<Harness />)
    fireEvent.change(slider(), { target: { value: '70' } })
    fireEvent.click(screen.getByRole('button', { name: 'Limpar resposta' }))

    expect(state()).toBeNull()
    expect(slider()).toHaveAttribute('aria-valuetext', 'Não registrado')
  })

  it('mostra o texto de enquadramento da percepção', () => {
    render(<Harness />)
    expect(
      screen.getByText(/representa sua percepção neste momento/i)
    ).toBeInTheDocument()
  })
})

describe('confiança na percepção', () => {
  it('só aparece depois de registrar a percepção', () => {
    render(<Harness />)
    expect(screen.queryByText(/Quanto confio nessa percepção/)).toBeNull()

    fireEvent.change(slider(), { target: { value: '70' } })
    expect(screen.getByText(/Quanto confio nessa percepção/)).toBeInTheDocument()
  })

  it('registra o nível escolhido sem alterar a percepção', () => {
    render(<Harness />)
    fireEvent.change(slider(), { target: { value: '70' } })
    fireEvent.click(screen.getByLabelText('Médio'))

    expect(state()?.relationshipPerception).toEqual({ rating: 70, confidence: 3 })
  })

  it('oferece os cinco níveis rotulados', () => {
    render(<Harness />)
    fireEvent.change(slider(), { target: { value: '55' } })

    for (const label of ['Muito pouco', 'Pouco', 'Médio', 'Bastante', 'Muito']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })

  it('permite limpar apenas a confiança, preservando a percepção', () => {
    render(<Harness />)
    fireEvent.change(slider(), { target: { value: '70' } })
    fireEvent.click(screen.getByLabelText('Bastante'))
    fireEvent.click(screen.getByRole('button', { name: 'Limpar confiança' }))

    expect(state()?.relationshipPerception).toEqual({ rating: 70 })
  })

  it('limpar a percepção também remove a confiança', () => {
    render(<Harness />)
    fireEvent.change(slider(), { target: { value: '70' } })
    fireEvent.click(screen.getByLabelText('Bastante'))
    fireEvent.click(screen.getByRole('button', { name: 'Limpar resposta' }))

    expect(state()).toBeNull()
  })
})

describe('rótulo da relação', () => {
  it('usa linguagem genérica sem rótulo configurado', () => {
    render(<Harness />)
    expect(screen.getByText('Neste momento, como sinto que nossa relação está?')).toBeInTheDocument()
  })

  it('personaliza discretamente quando há rótulo', () => {
    render(<Harness relationshipLabel="Fulano" />)
    expect(
      screen.getByText('Neste momento, como sinto que minha relação com Fulano está?')
    ).toBeInTheDocument()
  })
})

describe('acessibilidade e linguagem', () => {
  it('todo controle tem label real associado', () => {
    render(<Harness initial={{ version: 1, primaryEmotion: { emotionId: 'anxious', intensity: 3 } }} />)

    for (const control of screen.getAllByRole('combobox')) {
      expect(control).toHaveAccessibleName()
    }
    for (const control of screen.getAllByRole('radio')) {
      expect(control).toHaveAccessibleName()
    }
    expect(screen.getByRole('checkbox')).toHaveAccessibleName()
    expect(slider()).toHaveAccessibleName()
  })

  it('nenhuma emoção é representada apenas por emoji', () => {
    render(<Harness />)
    fireEvent.change(primarySelect(), { target: { value: 'joyful' } })

    expect(screen.getByRole('option', { name: 'Alegre', selected: true })).toBeInTheDocument()
    // Emoji não substitui o nome em lugar nenhum da seção.
    const emoji = /\p{Extended_Pictographic}/u
    expect(emoji.test(screen.getByLabelText('Emoção principal').textContent ?? '')).toBe(false)
  })

  it('não usa linguagem clínica nem diagnóstica', () => {
    render(<Harness />)
    fireEvent.change(slider(), { target: { value: '30' } })
    const text = document.body.textContent ?? ''

    for (const forbidden of ['diagnóstic', 'transtorno', 'sintoma', 'patológic', 'score']) {
      expect(text.toLowerCase()).not.toContain(forbidden)
    }
  })

  it('deixa claro que o registro não altera resultados', () => {
    render(<Harness />)
    expect(screen.getByText(/não altera seus resultados/i)).toBeInTheDocument()
  })
})

describe('estado inicial vindo de uma sessão existente', () => {
  it('reflete o contexto já registrado', () => {
    render(
      <Harness
        initial={{
          version: 1,
          primaryEmotion: { emotionId: 'anxious', intensity: 4 },
          secondaryEmotion: { emotionId: 'hopeful', intensity: 2 },
          relationshipPerception: { rating: 70, confidence: 3 },
        }}
      />
    )

    expect(primarySelect()).toHaveValue('anxious')
    expect(secondarySelect()).toHaveValue('hopeful')
    expect(within(intensityGroup('Ansioso')).getByLabelText('4')).toBeChecked()
    expect(within(intensityGroup('Esperançoso')).getByLabelText('2')).toBeChecked()
    expect(slider()).toHaveValue('70')
    expect(screen.getByLabelText('Médio')).toBeChecked()
  })

  it('id desconhecido não quebra o formulário', () => {
    render(
      <Harness
        initial={
          { version: 1, primaryEmotion: { emotionId: 'inexistente', intensity: 3 } } as EmotionalContext
        }
      />
    )

    // Cai para "Não informado" em vez de estourar.
    expect(primarySelect()).toHaveValue('')
    expect(screen.getByLabelText('Não consigo identificar agora')).not.toBeChecked()
  })
})
