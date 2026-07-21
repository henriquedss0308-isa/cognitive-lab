import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_FONT_SCALE,
  DEFAULT_THEME,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  applyAppearance,
  cacheAppearance,
  isThemeName,
  normalizeFontScale,
  normalizeTheme,
  readCachedAppearance,
} from '../theme'

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    read: () => Object.fromEntries(map),
  }
}

describe('normalizeTheme', () => {
  it('aceita os dois temas suportados', () => {
    expect(normalizeTheme('dark')).toBe('dark')
    expect(normalizeTheme('light')).toBe('light')
  })

  it('cai no padrão para qualquer entrada inesperada', () => {
    // Backup antigo, localStorage adulterado ou schema futuro não podem
    // deixar a interface sem tema.
    for (const value of [undefined, null, '', 'solarized', 42, {}, []]) {
      expect(normalizeTheme(value)).toBe(DEFAULT_THEME)
    }
  })
})

describe('isThemeName', () => {
  it('distingue nomes válidos de inválidos', () => {
    expect(isThemeName('light')).toBe(true)
    expect(isThemeName('dark')).toBe(true)
    expect(isThemeName('Dark')).toBe(false)
    expect(isThemeName(undefined)).toBe(false)
  })
})

describe('normalizeFontScale', () => {
  it('mantém valores dentro da faixa', () => {
    expect(normalizeFontScale(1)).toBe(1)
    expect(normalizeFontScale(1.2)).toBe(1.2)
    expect(normalizeFontScale('1.3')).toBe(1.3)
  })

  it('limita valores fora da faixa em vez de quebrar o layout', () => {
    expect(normalizeFontScale(0.1)).toBe(FONT_SCALE_MIN)
    expect(normalizeFontScale(9)).toBe(FONT_SCALE_MAX)
  })

  it('cai no padrão quando não é número', () => {
    expect(normalizeFontScale('grande')).toBe(DEFAULT_FONT_SCALE)
    expect(normalizeFontScale(NaN)).toBe(DEFAULT_FONT_SCALE)
    expect(normalizeFontScale(undefined)).toBe(DEFAULT_FONT_SCALE)
    expect(normalizeFontScale(Infinity)).toBe(DEFAULT_FONT_SCALE)
  })
})

describe('applyAppearance', () => {
  it('escreve tema e escala no elemento raiz', () => {
    applyAppearance(document, 'light', 1.2)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.style.getPropertyValue('--lab-font-scale')).toBe('1.2')

    applyAppearance(document, 'dark', 1)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('limita a escala aplicada', () => {
    applyAppearance(document, 'dark', 99)
    expect(document.documentElement.style.getPropertyValue('--lab-font-scale')).toBe(
      String(FONT_SCALE_MAX)
    )
  })

  it('não quebra sem documento', () => {
    expect(() => applyAppearance(undefined, 'dark', 1)).not.toThrow()
  })
})

describe('cacheAppearance / readCachedAppearance', () => {
  it('faz o ciclo completo de ida e volta', () => {
    const storage = fakeStorage()
    cacheAppearance(storage, 'light', 1.1)
    expect(storage.read()).toEqual({
      [THEME_STORAGE_KEY]: 'light',
      [FONT_SCALE_STORAGE_KEY]: '1.1',
    })
    expect(readCachedAppearance(storage)).toEqual({ theme: 'light', fontScale: 1.1 })
  })

  it('devolve o padrão quando não há nada guardado', () => {
    expect(readCachedAppearance(fakeStorage())).toEqual({
      theme: DEFAULT_THEME,
      fontScale: DEFAULT_FONT_SCALE,
    })
  })

  it('sobrevive a storage indisponível', () => {
    // Modo privado / cota estourada não pode derrubar o app: perder a pintura
    // antecipada é aceitável, lançar não é.
    const broken = {
      getItem: vi.fn(() => {
        throw new Error('SecurityError')
      }),
      setItem: vi.fn(() => {
        throw new Error('QuotaExceededError')
      }),
    }
    expect(() => cacheAppearance(broken, 'light', 1)).not.toThrow()
    expect(readCachedAppearance(broken)).toEqual({
      theme: DEFAULT_THEME,
      fontScale: DEFAULT_FONT_SCALE,
    })
  })

  it('ignora valor corrompido no cache', () => {
    const storage = fakeStorage({
      [THEME_STORAGE_KEY]: 'neon',
      [FONT_SCALE_STORAGE_KEY]: 'enorme',
    })
    expect(readCachedAppearance(storage)).toEqual({
      theme: DEFAULT_THEME,
      fontScale: DEFAULT_FONT_SCALE,
    })
  })
})
