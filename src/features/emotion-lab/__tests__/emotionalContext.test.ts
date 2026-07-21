import { describe, it, expect } from 'vitest'
import {
  emotionalContextChanged,
  hasEmotionalContent,
  isValidIntensity,
  sanitizeEmotionalContext,
  touchEmotionalContext,
} from '../emotionalContext'
import type { EmotionalContext } from '../types'

describe('isValidIntensity', () => {
  it('aceita apenas inteiros de 1 a 5', () => {
    for (const v of [1, 2, 3, 4, 5]) expect(isValidIntensity(v)).toBe(true)
    for (const v of [0, 6, -1, 3.5, NaN, Infinity, '4', null, undefined]) {
      expect(isValidIntensity(v)).toBe(false)
    }
  })
})

describe('sanitizeEmotionalContext — emoções', () => {
  it('aceita emoção principal válida', () => {
    const out = sanitizeEmotionalContext({
      version: 1,
      primaryEmotion: { emotionId: 'anxious', intensity: 4 },
    })
    expect(out).toEqual({
      version: 1,
      primaryEmotion: { emotionId: 'anxious', intensity: 4 },
    })
  })

  it('aceita emoção secundária válida junto da principal', () => {
    const out = sanitizeEmotionalContext({
      version: 1,
      primaryEmotion: { emotionId: 'anxious', intensity: 4 },
      secondaryEmotion: { emotionId: 'hopeful', intensity: 2 },
    })
    expect(out?.secondaryEmotion).toEqual({ emotionId: 'hopeful', intensity: 2 })
  })

  it('descarta a secundária quando duplica a principal', () => {
    const out = sanitizeEmotionalContext({
      version: 1,
      primaryEmotion: { emotionId: 'calm', intensity: 3 },
      secondaryEmotion: { emotionId: 'calm', intensity: 5 },
    })
    expect(out?.primaryEmotion).toEqual({ emotionId: 'calm', intensity: 3 })
    expect(out?.secondaryEmotion).toBeUndefined()
  })

  it('descarta a secundária órfã (sem principal válida)', () => {
    const out = sanitizeEmotionalContext({
      version: 1,
      secondaryEmotion: { emotionId: 'hopeful', intensity: 2 },
    })
    expect(out).toBeUndefined()
  })

  it('descarta emoção com id inexistente, preservando o resto', () => {
    const out = sanitizeEmotionalContext({
      version: 1,
      primaryEmotion: { emotionId: 'euforico_inventado', intensity: 3 },
      relationshipPerception: { rating: 70 },
    })
    expect(out?.primaryEmotion).toBeUndefined()
    expect(out?.relationshipPerception).toEqual({ rating: 70 })
  })

  it.each([0, 6, -2, 2.5, NaN, '3', null, undefined])(
    'descarta emoção com intensidade inválida (%s)',
    (intensity) => {
      const out = sanitizeEmotionalContext({
        version: 1,
        primaryEmotion: { emotionId: 'sad', intensity },
      })
      expect(out).toBeUndefined()
    }
  )

  it('descarta emoção sem intensidade', () => {
    expect(sanitizeEmotionalContext({ version: 1, primaryEmotion: { emotionId: 'sad' } })).toBeUndefined()
  })
})

describe('sanitizeEmotionalContext — "não consigo identificar agora"', () => {
  it('preserva o estado não identificado sozinho', () => {
    const out = sanitizeEmotionalContext({ version: 1, unidentifiedEmotion: true })
    expect(out).toEqual({ version: 1, unidentifiedEmotion: true })
  })

  it('não permite coexistir com emoção principal — a emoção nomeada vence', () => {
    const out = sanitizeEmotionalContext({
      version: 1,
      unidentifiedEmotion: true,
      primaryEmotion: { emotionId: 'tired', intensity: 2 },
    })
    expect(out?.primaryEmotion).toEqual({ emotionId: 'tired', intensity: 2 })
    expect(out?.unidentifiedEmotion).toBeUndefined()
  })

  it('mantém o estado não identificado quando a emoção enviada é inválida', () => {
    const out = sanitizeEmotionalContext({
      version: 1,
      unidentifiedEmotion: true,
      primaryEmotion: { emotionId: 'inexistente', intensity: 3 },
    })
    expect(out).toEqual({ version: 1, unidentifiedEmotion: true })
  })

  it('valores não booleanos não ativam o estado', () => {
    expect(sanitizeEmotionalContext({ version: 1, unidentifiedEmotion: 'sim' })).toBeUndefined()
    expect(sanitizeEmotionalContext({ version: 1, unidentifiedEmotion: 1 })).toBeUndefined()
    expect(sanitizeEmotionalContext({ version: 1, unidentifiedEmotion: false })).toBeUndefined()
  })
})

describe('sanitizeEmotionalContext — percepção da relação', () => {
  it('aceita rating nos limites', () => {
    expect(sanitizeEmotionalContext({ version: 1, relationshipPerception: { rating: 0 } })
      ?.relationshipPerception).toEqual({ rating: 0 })
    expect(sanitizeEmotionalContext({ version: 1, relationshipPerception: { rating: 100 } })
      ?.relationshipPerception).toEqual({ rating: 100 })
  })

  it.each([-1, -0.5, 101, 150, NaN, Infinity, -Infinity, '70', null])(
    'descarta rating fora da faixa ou não numérico (%s)',
    (rating) => {
      const out = sanitizeEmotionalContext({ version: 1, relationshipPerception: { rating } })
      expect(out).toBeUndefined()
    }
  )

  it('não inventa um rating quando o valor é inválido', () => {
    // Clamp aqui fabricaria um autorrelato que a pessoa nunca deu.
    const out = sanitizeEmotionalContext({
      version: 1,
      relationshipPerception: { rating: 150, confidence: 3 },
    })
    expect(out).toBeUndefined()
  })

  it('aceita confiança válida', () => {
    const out = sanitizeEmotionalContext({
      version: 1,
      relationshipPerception: { rating: 65, confidence: 3 },
    })
    expect(out?.relationshipPerception).toEqual({ rating: 65, confidence: 3 })
  })

  it.each([0, 6, -1, 2.5, 'alto', null])(
    'confiança inválida (%s) some sem derrubar a percepção',
    (confidence) => {
      const out = sanitizeEmotionalContext({
        version: 1,
        relationshipPerception: { rating: 65, confidence },
      })
      expect(out?.relationshipPerception).toEqual({ rating: 65 })
    }
  )
})

describe('sanitizeEmotionalContext — robustez estrutural', () => {
  it.each([undefined, null, 'texto', 42, [], true, NaN])(
    'devolve undefined para entrada não-objeto (%s)',
    (input) => {
      expect(sanitizeEmotionalContext(input)).toBeUndefined()
    }
  )

  it('objeto vazio não vira contexto vazio persistido', () => {
    expect(sanitizeEmotionalContext({})).toBeUndefined()
    expect(sanitizeEmotionalContext({ version: 1 })).toBeUndefined()
  })

  it('descarta campos extras desconhecidos', () => {
    const out = sanitizeEmotionalContext({
      version: 1,
      primaryEmotion: { emotionId: 'calm', intensity: 3, cor: '#fff', extra: 1 },
      diagnostico: 'nada disso',
      score: 42,
      relationshipScore: 99,
    })
    expect(out).toEqual({ version: 1, primaryEmotion: { emotionId: 'calm', intensity: 3 } })
    expect(Object.keys(out as object).sort()).toEqual(['primaryEmotion', 'version'])
  })

  it('normaliza a versão mesmo se vier ausente ou errada', () => {
    const out = sanitizeEmotionalContext({
      version: 99,
      primaryEmotion: { emotionId: 'calm', intensity: 3 },
    })
    expect(out?.version).toBe(1)
  })

  it('objeto parcialmente malformado preserva a parte válida', () => {
    const out = sanitizeEmotionalContext({
      version: 1,
      primaryEmotion: 'ansioso',
      secondaryEmotion: { emotionId: 'lonely', intensity: 99 },
      unidentifiedEmotion: true,
      relationshipPerception: { rating: 45, confidence: 12 },
      updatedAt: 'ontem',
    })
    expect(out).toEqual({
      version: 1,
      unidentifiedEmotion: true,
      relationshipPerception: { rating: 45 },
    })
  })

  it('descarta updatedAt não parseável e preserva o válido', () => {
    const base = { version: 1, unidentifiedEmotion: true }
    expect(sanitizeEmotionalContext({ ...base, updatedAt: 'ontem' })?.updatedAt).toBeUndefined()
    expect(sanitizeEmotionalContext({ ...base, updatedAt: 42 })?.updatedAt).toBeUndefined()
    expect(
      sanitizeEmotionalContext({ ...base, updatedAt: '2026-07-20T10:00:00.000Z' })?.updatedAt
    ).toBe('2026-07-20T10:00:00.000Z')
  })

  it('não lança para nenhuma entrada hostil', () => {
    const hostile = [
      { primaryEmotion: { emotionId: { toString: () => 'calm' }, intensity: 3 } },
      { relationshipPerception: [] },
      { relationshipPerception: { rating: { valueOf: () => 70 } } },
      { primaryEmotion: null, secondaryEmotion: null },
    ]
    for (const input of hostile) {
      expect(() => sanitizeEmotionalContext(input)).not.toThrow()
    }
  })
})

describe('hasEmotionalContent', () => {
  it('reconhece ausência de conteúdo', () => {
    expect(hasEmotionalContent(undefined)).toBe(false)
    expect(hasEmotionalContent({ version: 1 })).toBe(false)
    expect(hasEmotionalContent({ version: 1, updatedAt: '2026-07-20T10:00:00.000Z' })).toBe(false)
  })

  it('reconhece qualquer resposta registrada', () => {
    expect(hasEmotionalContent({ version: 1, unidentifiedEmotion: true })).toBe(true)
    expect(
      hasEmotionalContent({ version: 1, primaryEmotion: { emotionId: 'calm', intensity: 1 } })
    ).toBe(true)
    expect(hasEmotionalContent({ version: 1, relationshipPerception: { rating: 0 } })).toBe(true)
  })
})

describe('emotionalContextChanged / touchEmotionalContext', () => {
  const base: EmotionalContext = {
    version: 1,
    primaryEmotion: { emotionId: 'anxious', intensity: 4 },
    relationshipPerception: { rating: 70, confidence: 3 },
    updatedAt: '2026-07-01T10:00:00.000Z',
  }

  it('ignora updatedAt na comparação de conteúdo', () => {
    expect(emotionalContextChanged(base, { ...base, updatedAt: '2026-07-19T23:00:00.000Z' })).toBe(false)
  })

  it('detecta mudança de emoção, intensidade, rating e confiança', () => {
    expect(emotionalContextChanged(base, { ...base, primaryEmotion: { emotionId: 'calm', intensity: 4 } })).toBe(true)
    expect(emotionalContextChanged(base, { ...base, primaryEmotion: { emotionId: 'anxious', intensity: 5 } })).toBe(true)
    expect(emotionalContextChanged(base, { ...base, relationshipPerception: { rating: 71, confidence: 3 } })).toBe(true)
    expect(emotionalContextChanged(base, { ...base, relationshipPerception: { rating: 70 } })).toBe(true)
  })

  it('detecta remoção e adição de contexto', () => {
    expect(emotionalContextChanged(base, undefined)).toBe(true)
    expect(emotionalContextChanged(undefined, base)).toBe(true)
    expect(emotionalContextChanged(undefined, undefined)).toBe(false)
  })

  it('carimba updatedAt quando o conteúdo muda', () => {
    const out = touchEmotionalContext(
      base,
      { ...base, primaryEmotion: { emotionId: 'calm', intensity: 2 } },
      '2026-07-20T12:00:00.000Z'
    )
    expect(out?.updatedAt).toBe('2026-07-20T12:00:00.000Z')
  })

  it('preserva updatedAt quando nada muda', () => {
    const out = touchEmotionalContext(base, { ...base }, '2026-07-20T12:00:00.000Z')
    expect(out?.updatedAt).toBe('2026-07-01T10:00:00.000Z')
  })

  it('carimba na primeira vez que o contexto passa a existir', () => {
    const out = touchEmotionalContext(
      undefined,
      { version: 1, unidentifiedEmotion: true },
      '2026-07-20T12:00:00.000Z'
    )
    expect(out).toEqual({
      version: 1,
      unidentifiedEmotion: true,
      updatedAt: '2026-07-20T12:00:00.000Z',
    })
  })

  it('limpar tudo devolve undefined em vez de um objeto vazio', () => {
    expect(touchEmotionalContext(base, { version: 1 }, '2026-07-20T12:00:00.000Z')).toBeUndefined()
    expect(touchEmotionalContext(base, undefined, '2026-07-20T12:00:00.000Z')).toBeUndefined()
  })

  it('sanea antes de comparar (lixo não conta como mudança)', () => {
    const dirty = {
      ...base,
      secondaryEmotion: { emotionId: 'inexistente', intensity: 3 },
    } as unknown as EmotionalContext
    const out = touchEmotionalContext(base, dirty, '2026-07-20T12:00:00.000Z')
    expect(out?.updatedAt).toBe('2026-07-01T10:00:00.000Z')
    expect(out?.secondaryEmotion).toBeUndefined()
  })
})
