/**
 * Aparência: tema e escala de fonte.
 *
 * A fonte da verdade continua sendo `AppSettings` no IndexedDB — este módulo não
 * cria armazenamento novo nem altera o schema. O espelho em `localStorage` existe
 * só para pintar: o IndexedDB é assíncrono, então sem uma leitura síncrona antes
 * do primeiro frame o app apareceria no tema errado e trocaria na frente da
 * pessoa.
 */

export type ThemeName = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'cognitive-lab:theme'
export const FONT_SCALE_STORAGE_KEY = 'cognitive-lab:font-scale'

export const DEFAULT_THEME: ThemeName = 'dark'
export const DEFAULT_FONT_SCALE = 1

/** Limites do controle em Aparência; fora disso a interface quebra o layout. */
export const FONT_SCALE_MIN = 0.8
export const FONT_SCALE_MAX = 1.4

export const THEME_LABELS: Record<ThemeName, string> = {
  dark: 'Escuro',
  light: 'Claro',
}

export function isThemeName(value: unknown): value is ThemeName {
  return value === 'dark' || value === 'light'
}

/** Qualquer entrada inesperada (backup antigo, localStorage adulterado) vira o padrão. */
export function normalizeTheme(value: unknown): ThemeName {
  return isThemeName(value) ? value : DEFAULT_THEME
}

export function normalizeFontScale(value: unknown): number {
  // Ausência tem de virar o padrão, não o piso da faixa: `Number(null)` é 0, que
  // é finito e seria limitado a FONT_SCALE_MIN — a pessoa acabaria com a menor
  // fonte possível só por nunca ter escolhido nenhuma.
  if (value === null || value === undefined || value === '') return DEFAULT_FONT_SCALE
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return DEFAULT_FONT_SCALE
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, n))
}

/**
 * Aplica a aparência ao documento.
 *
 * O tema vira um atributo em `<html>` (e não uma classe) porque o CSS já
 * seleciona por `:root[data-theme="light"]`; a escala vira uma custom property
 * lida por `html { font-size: … }`.
 */
export function applyAppearance(
  doc: Document | undefined,
  theme: ThemeName,
  fontScale: number = DEFAULT_FONT_SCALE
): void {
  const root = doc?.documentElement
  if (!root) return
  root.setAttribute('data-theme', theme)
  root.style.setProperty('--lab-font-scale', String(normalizeFontScale(fontScale)))
}

/**
 * Espelha a escolha para a leitura síncrona do próximo boot.
 *
 * Falhar aqui é aceitável e silencioso: em modo privado ou com storage cheio o
 * app segue funcionando, só volta a pintar no tema padrão antes de o IndexedDB
 * responder.
 */
export function cacheAppearance(
  storage: Pick<Storage, 'setItem'> | undefined,
  theme: ThemeName,
  fontScale: number = DEFAULT_FONT_SCALE
): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme)
    storage?.setItem(FONT_SCALE_STORAGE_KEY, String(normalizeFontScale(fontScale)))
  } catch {
    /* storage indisponível — só perdemos a pintura antecipada */
  }
}

export function readCachedAppearance(
  storage: Pick<Storage, 'getItem'> | undefined
): { theme: ThemeName; fontScale: number } {
  try {
    return {
      theme: normalizeTheme(storage?.getItem(THEME_STORAGE_KEY)),
      fontScale: normalizeFontScale(storage?.getItem(FONT_SCALE_STORAGE_KEY)),
    }
  } catch {
    return { theme: DEFAULT_THEME, fontScale: DEFAULT_FONT_SCALE }
  }
}
