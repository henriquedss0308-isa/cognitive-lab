import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CORSI_BLOCK_LAYOUT } from '../corsiLayout'
import { StimulusDisplay } from '../StimulusDisplay'
import { testDefinition as stroopDefinition } from '../../../tests/stroop'
import type { GeneratedTrial } from '../../../tests/types'

const STROOP_COLORS = [
  ['vermelho', '#ef4444'],
  ['azul', '#3b82f6'],
  ['verde', '#22c55e'],
  ['amarelo', '#eab308'],
] as const

const STROOP_WORDS = ['vermelho', 'azul', 'verde', 'amarelo', '++++'] as const

afterEach(() => {
  cleanup()
})

function corsiGeometry(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[data-testid="corsi-block"]')).map((el) => {
    const block = el as HTMLElement
    return {
      id: Number(block.dataset.blockId),
      x: Number(block.dataset.x),
      y: Number(block.dataset.y),
      size: Number(block.dataset.size),
      left: block.style.left,
      top: block.style.top,
    }
  })
}

function expectedCorsiGeometry() {
  return CORSI_BLOCK_LAYOUT.map((block) => ({
    id: block.id,
    x: block.x,
    y: block.y,
    size: block.size,
    left: `${block.x}%`,
    top: `${block.y}%`,
  }))
}

function stroopWordFromTrial(trial: GeneratedTrial) {
  return String(trial.metadata?.word).toUpperCase()
}

describe('StimulusDisplay regressions', () => {
  it('keeps Corsi block geometry and node identity unchanged between stimulus and response', () => {
    const onBlockClick = vi.fn()
    const { container, rerender } = render(
      <StimulusDisplay
        testId="corsi"
        stimulus="0,1"
        metadata={{ highlight: 4 }}
        phase="stimulus"
      />
    )

    const board = screen.getByTestId('corsi-board')
    const beforeNodes = Array.from(container.querySelectorAll('[data-testid="corsi-block"]'))
    const beforeGeometry = corsiGeometry(container)

    expect(board).toHaveAttribute('data-layout-id', 'corsi-fixed-layout-v1')
    expect(beforeGeometry).toEqual(expectedCorsiGeometry())
    expect(beforeNodes).toHaveLength(9)
    expect(beforeNodes[4]).not.toHaveClass('scale-110')

    rerender(
      <StimulusDisplay
        testId="corsi"
        stimulus="0,1"
        metadata={{ highlight: -1 }}
        phase="response"
        onCorsiBlockClick={onBlockClick}
      />
    )

    const afterNodes = Array.from(container.querySelectorAll('[data-testid="corsi-block"]'))
    expect(corsiGeometry(container)).toEqual(beforeGeometry)
    afterNodes.forEach((node, index) => {
      expect(node).toBe(beforeNodes[index])
    })

    fireEvent.click(afterNodes[2])
    expect(onBlockClick).toHaveBeenCalledWith(2)
  })

  it.each(STROOP_WORDS.flatMap((word) => STROOP_COLORS.map(([inkColor, expectedColor]) => [word, inkColor, expectedColor] as const)))(
    'renders Stroop text %s in ink color %s without a background substitute',
    (word, inkColor, expectedColor) => {
      render(
        <StimulusDisplay
          testId="stroop"
          stimulus={JSON.stringify({ word, inkColor })}
          metadata={{ word, inkColor }}
          phase="stimulus"
        />
      )

      const element = screen.getByTestId('stroop-word')
      expect(element).toHaveTextContent(word.toUpperCase())
      expect(element.textContent).toHaveLength(word.length)
      expect(element).toHaveStyle({ color: expectedColor })
      expect(element.style.backgroundColor).toBe('')
      expect(element.textContent).not.toMatch(/^\u2588+$/)
    }
  )

  it('renders a long Stroop sequence with textual content for every trial', () => {
    const trials = [
      ...stroopDefinition.generateTrials('assessment', 12345),
      ...stroopDefinition.generateTrials('training', 67890),
    ]
    const seenConditions = new Set<string>()

    expect(trials.length).toBeGreaterThan(100)

    for (const trial of trials) {
      seenConditions.add(trial.condition)
      const view = render(
        <StimulusDisplay
          testId="stroop"
          stimulus={trial.stimulus}
          metadata={trial.metadata}
          phase="stimulus"
        />
      )

      const element = screen.getByTestId('stroop-word')
      const expectedText = stroopWordFromTrial(trial)
      expect(expectedText).not.toBe('')
      expect(element.textContent).toBe(expectedText)
      expect(element.textContent).toHaveLength(expectedText.length)
      expect(element.textContent).not.toMatch(/^\u2588+$/)
      expect(element.style.backgroundColor).toBe('')
      view.unmount()
    }

    expect(seenConditions).toEqual(new Set(['congruent', 'incongruent', 'neutral']))
  })
})
