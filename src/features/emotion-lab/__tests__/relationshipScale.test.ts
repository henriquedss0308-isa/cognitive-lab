import { describe, it, expect } from 'vitest'
import {
  CONFIDENCE_LEVELS,
  RELATIONSHIP_ANCHORS,
  clampRelationshipRating,
  confidenceLabel,
  isValidConfidence,
  isValidRelationshipRating,
  relationshipQuestion,
  relationshipRatingLabel,
} from '../relationshipScale'

describe('relationshipRatingLabel — âncoras exatas', () => {
  it.each([
    [0, 'Ruim'],
    [20, 'Paia'],
    [40, 'Meh'],
    [60, 'Ok'],
    [80, 'Boa'],
    [100, 'Muito boa'],
  ])('%i ⇒ %s', (value, expected) => {
    expect(relationshipRatingLabel(value)).toBe(expected)
  })

  it('cobre exatamente as âncoras declaradas', () => {
    for (const anchor of RELATIONSHIP_ANCHORS) {
      expect(relationshipRatingLabel(anchor.value)).toBe(anchor.label)
    }
  })
})

describe('relationshipRatingLabel — valores intermediários', () => {
  it.each([
    [10, 'Ruim–Paia'],
    [30, 'Paia–Meh'],
    [50, 'Meh–Ok'],
    [61, 'Ok–Boa'],
    [70, 'Ok–Boa'],
    [79, 'Ok–Boa'],
    [81, 'Boa–Muito boa'],
    [99, 'Boa–Muito boa'],
  ])('%i ⇒ %s', (value, expected) => {
    expect(relationshipRatingLabel(value)).toBe(expected)
  })

  it('exemplos da especificação', () => {
    expect(relationshipRatingLabel(60)).toBe('Ok')
    expect(relationshipRatingLabel(70)).toBe('Ok–Boa')
    expect(relationshipRatingLabel(80)).toBe('Boa')
    expect(relationshipRatingLabel(90)).toBe('Boa–Muito boa')
  })

  it('aceita posições fracionárias', () => {
    expect(relationshipRatingLabel(60.5)).toBe('Ok–Boa')
    expect(relationshipRatingLabel(19.9)).toBe('Ruim–Paia')
  })

  it('é determinística', () => {
    for (let v = 0; v <= 100; v++) {
      expect(relationshipRatingLabel(v)).toBe(relationshipRatingLabel(v))
    }
  })

  it('devolve rótulo para todo valor de 0 a 100', () => {
    for (let v = 0; v <= 100; v++) {
      expect(relationshipRatingLabel(v)).toBeTruthy()
    }
  })
})

describe('relationshipRatingLabel — entradas inválidas', () => {
  it('limita valores fora da faixa em vez de quebrar a tela', () => {
    expect(relationshipRatingLabel(-1)).toBe('Ruim')
    expect(relationshipRatingLabel(-999)).toBe('Ruim')
    expect(relationshipRatingLabel(101)).toBe('Muito boa')
    expect(relationshipRatingLabel(9999)).toBe('Muito boa')
  })

  it('devolve null para entradas não numéricas ou não finitas', () => {
    for (const bad of [undefined, null, '60', {}, [], NaN, Infinity, -Infinity, true]) {
      expect(relationshipRatingLabel(bad)).toBeNull()
    }
  })
})

describe('isValidRelationshipRating — critério de persistência', () => {
  it('aceita a faixa fechada de 0 a 100', () => {
    for (const v of [0, 1, 50, 60.5, 99, 100]) {
      expect(isValidRelationshipRating(v)).toBe(true)
    }
  })

  it('rejeita fora da faixa, NaN, Infinity e não-números', () => {
    for (const v of [-0.1, -1, 100.1, 101, NaN, Infinity, -Infinity, '60', null, undefined, {}]) {
      expect(isValidRelationshipRating(v)).toBe(false)
    }
  })
})

describe('clampRelationshipRating', () => {
  it('limita às extremidades e preserva valores válidos', () => {
    expect(clampRelationshipRating(-5)).toBe(0)
    expect(clampRelationshipRating(105)).toBe(100)
    expect(clampRelationshipRating(42)).toBe(42)
    expect(clampRelationshipRating(NaN)).toBe(0)
  })
})

describe('confiança na percepção', () => {
  it('tem cinco níveis rotulados', () => {
    expect(CONFIDENCE_LEVELS.map((l) => l.label)).toEqual([
      'Muito pouco',
      'Pouco',
      'Médio',
      'Bastante',
      'Muito',
    ])
  })

  it('valida apenas inteiros de 1 a 5', () => {
    for (const v of [1, 2, 3, 4, 5]) expect(isValidConfidence(v)).toBe(true)
    for (const v of [0, 6, -1, 2.5, NaN, '3', null, undefined, {}]) {
      expect(isValidConfidence(v)).toBe(false)
    }
  })

  it('confidenceLabel devolve null para valores inválidos', () => {
    expect(confidenceLabel(3)).toBe('Médio')
    expect(confidenceLabel(0)).toBeNull()
    expect(confidenceLabel(9)).toBeNull()
    expect(confidenceLabel('alto')).toBeNull()
  })
})

describe('relationshipQuestion', () => {
  it('usa linguagem genérica quando não há rótulo configurado', () => {
    const generic = 'Neste momento, como sinto que nossa relação está?'
    expect(relationshipQuestion()).toBe(generic)
    expect(relationshipQuestion('')).toBe(generic)
    expect(relationshipQuestion('   ')).toBe(generic)
  })

  it('personaliza discretamente quando há rótulo', () => {
    // Rótulo fictício: nenhum nome real entra em código ou teste.
    expect(relationshipQuestion('Fulano')).toBe(
      'Neste momento, como sinto que minha relação com Fulano está?'
    )
  })

  it('ignora espaços em volta do rótulo', () => {
    expect(relationshipQuestion('  Fulano  ')).toBe(
      'Neste momento, como sinto que minha relação com Fulano está?'
    )
  })
})
