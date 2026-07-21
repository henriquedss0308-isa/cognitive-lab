import { describe, it, expect } from 'vitest'
import {
  EMOTION_CATALOG,
  QUADRANTS,
  QUADRANT_ORDER,
  describeQuadrant,
  getEmotionById,
  getEmotionsByQuadrant,
  isKnownEmotionId,
} from '../emotionCatalog'
import type { EmotionQuadrant } from '../types'

describe('catálogo de emoções', () => {
  it('não tem ids duplicados', () => {
    const ids = EMOTION_CATALOG.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('não tem rótulos duplicados', () => {
    const labels = EMOTION_CATALOG.map((e) => e.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('o id é estável e desacoplado do texto visível', () => {
    // Guarda contra "id = rótulo minúsculo": renomear o rótulo quebraria dados gravados.
    for (const emotion of EMOTION_CATALOG) {
      expect(emotion.id).not.toBe(emotion.label.toLowerCase())
      expect(emotion.id).toMatch(/^[a-z][a-z_]*$/)
    }
  })

  it('cada emoção tem quadrante válido', () => {
    for (const emotion of EMOTION_CATALOG) {
      expect(QUADRANT_ORDER).toContain(emotion.quadrant)
      expect(QUADRANTS[emotion.quadrant]).toBeDefined()
    }
  })

  it('energia e pleasantness são coerentes com o quadrante', () => {
    for (const emotion of EMOTION_CATALOG) {
      const quadrant = QUADRANTS[emotion.quadrant]
      expect(emotion.energy).toBe(quadrant.energy)
      expect(emotion.pleasantness).toBe(quadrant.pleasantness)
    }
  })

  it('os quatro quadrantes cobrem as combinações de energia × agradabilidade', () => {
    const combos = QUADRANT_ORDER.map((q) => `${QUADRANTS[q].energy}/${QUADRANTS[q].pleasantness}`)
    expect(new Set(combos).size).toBe(4)
    expect(QUADRANTS.yellow).toMatchObject({ energy: 'high', pleasantness: 'pleasant' })
    expect(QUADRANTS.green).toMatchObject({ energy: 'low', pleasantness: 'pleasant' })
    expect(QUADRANTS.blue).toMatchObject({ energy: 'low', pleasantness: 'unpleasant' })
    expect(QUADRANTS.red).toMatchObject({ energy: 'high', pleasantness: 'unpleasant' })
  })

  it('cada quadrante tem cor e descrição textual (nunca só a cor)', () => {
    for (const q of QUADRANT_ORDER) {
      const quadrant = QUADRANTS[q]
      expect(quadrant.colorName.length).toBeGreaterThan(0)
      expect(quadrant.description.length).toBeGreaterThan(0)
      expect(quadrant.cssVar).toMatch(/^var\(--color-lab-/)
    }
  })

  it('o catálogo inicial tem 6 emoções por quadrante', () => {
    for (const q of QUADRANT_ORDER) {
      expect(getEmotionsByQuadrant(q)).toHaveLength(6)
    }
    expect(EMOTION_CATALOG).toHaveLength(24)
  })

  it('describeQuadrant combina cor e descrição', () => {
    expect(describeQuadrant('red')).toBe('Vermelho · Energia alta e desagradável')
    expect(describeQuadrant('green')).toBe('Verde · Energia baixa e agradável')
  })
})

describe('getEmotionById', () => {
  it('encontra um id conhecido', () => {
    expect(getEmotionById('anxious')).toMatchObject({
      id: 'anxious',
      label: 'Ansioso',
      quadrant: 'red',
    })
  })

  it('devolve undefined para id desconhecido, sem lançar', () => {
    expect(getEmotionById('nao_existe')).toBeUndefined()
    expect(getEmotionById('')).toBeUndefined()
  })

  it('devolve undefined para entradas não textuais', () => {
    for (const bad of [undefined, null, 42, {}, [], true]) {
      expect(getEmotionById(bad)).toBeUndefined()
      expect(isKnownEmotionId(bad)).toBe(false)
    }
  })

  it('não confunde rótulo visível com id', () => {
    expect(getEmotionById('Ansioso')).toBeUndefined()
    expect(isKnownEmotionId('anxious')).toBe(true)
  })

  it('todo id do catálogo é recuperável', () => {
    for (const emotion of EMOTION_CATALOG) {
      expect(getEmotionById(emotion.id)).toBe(emotion)
    }
  })

  it('getEmotionsByQuadrant devolve apenas emoções daquele quadrante', () => {
    for (const q of QUADRANT_ORDER as EmotionQuadrant[]) {
      for (const emotion of getEmotionsByQuadrant(q)) {
        expect(emotion.quadrant).toBe(q)
      }
    }
  })
})
