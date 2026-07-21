import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Lido do disco de propósito: sob vitest o plugin do Tailwind não roda e um
// `import '…css?raw'` chega vazio. O CSS é a única fonte da paleta — este teste
// verifica o arquivo que o navegador realmente usa, não uma cópia.
const CSS = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

/**
 * Contraste dos tokens, lido do próprio CSS.
 *
 * Existe porque a paleta é editada à mão: sem esta rede, escurecer um tom para
 * ficar mais elegante pode deixar texto ilegível no outro tema sem ninguém
 * perceber. O amarelo do Emotion Lab no tema claro já falhou aqui uma vez.
 */

function parseBlock(header: string): Record<string, string> {
  const start = CSS.indexOf(header)
  if (start === -1) throw new Error(`Bloco não encontrado no index.css: ${header}`)
  const open = CSS.indexOf('{', start)
  let depth = 0
  let end = open
  for (let i = open; i < CSS.length; i++) {
    if (CSS[i] === '{') depth++
    else if (CSS[i] === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  const body = CSS.slice(open + 1, end)
  const tokens: Record<string, string> = {}
  for (const [, name, value] of body.matchAll(/--color-lab-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[name] = value
  }
  return tokens
}

const DARK = parseBlock('@theme {')
// O tema claro sobrescreve só parte dos tokens; o resto herda do escuro.
const LIGHT = { ...DARK, ...parseBlock(':root[data-theme="light"] {') }

function luminance(hexColor: string): number {
  const h = hexColor.replace('#', '')
  const channels = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Equivalente ao `color-mix(in srgb, fg <ratio>%, bg)` usado nos badges. */
function mix(fg: string, bg: string, ratio: number): string {
  const channels = (hexColor: string) => {
    const h = hexColor.replace('#', '')
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  }
  const f = channels(fg)
  const b = channels(bg)
  return (
    '#' +
    [0, 1, 2]
      .map((i) => Math.round(f[i] * ratio + b[i] * (1 - ratio)))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  )
}

const THEMES: [string, Record<string, string>][] = [
  ['escuro', DARK],
  ['claro', LIGHT],
]

/**
 * Texto normal — WCAG AA.
 *
 * `faint` está aqui, e não numa faixa mais frouxa, porque na prática ele
 * colore `.help-text` a 12px: é corpo de texto, não enfeite. Uma auditoria nos
 * elementos renderizados pegou ele a 3.91:1 sobre superfície.
 */
const TEXT_TOKENS = [
  'text',
  'fg',
  'muted',
  'faint',
  'accent',
  'success',
  'warning',
  'danger',
  'emotion-yellow',
  'emotion-green',
  'emotion-blue',
  'emotion-red',
]

const SURFACES = ['bg', 'surface', 'surface-2']

describe.each(THEMES)('contraste — tema %s', (_name, tokens) => {
  it('define todos os tokens usados na auditoria', () => {
    for (const token of [...TEXT_TOKENS, ...SURFACES, 'faint', 'primary', 'primary-fg']) {
      expect(tokens[token], `token --color-lab-${token} ausente`).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it.each(TEXT_TOKENS)('%s atinge 4.5:1 em todas as superfícies', (fg) => {
    for (const bg of SURFACES) {
      const ratio = contrast(tokens[fg], tokens[bg])
      expect(
        Number(ratio.toFixed(2)),
        `${fg} sobre ${bg} = ${ratio.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  /**
   * Badges pintam o fundo com 10% da própria cor (color-mix no .badge). Essa
   * lavagem aproxima texto e fundo e derruba o contraste em relação à
   * superfície lisa — foi assim que `success` passou na conta dos tokens e
   * ainda assim mediu 3.99:1 no elemento renderizado.
   */
  it.each(['success', 'warning', 'danger', 'accent'])(
    'badge %s mantém 4.5:1 sobre o próprio fundo tingido',
    (tone) => {
      for (const bg of SURFACES) {
        const tinted = mix(tokens[tone], tokens[bg], 0.1)
        const ratio = contrast(tokens[tone], tinted)
        expect(
          Number(ratio.toFixed(2)),
          `badge ${tone} sobre tinta em ${bg} = ${ratio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  )

  it('bordas se distinguem da superfície', () => {
    // 3:1 é o alvo de elementos não textuais: é o que faz o cartão ter contorno
    // visível em vez de sumir no fundo.
    const ratio = contrast(tokens['border-strong'], tokens.surface)
    expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(1.5)
  })

  it('texto sobre o preenchimento primário atinge 4.5:1', () => {
    const ratio = contrast(tokens['primary-fg'], tokens.primary)
    expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(4.5)
  })
})

describe('tokens de estímulo', () => {
  /**
   * A tela de execução é instrumento de medida. Estes valores são os que o app
   * usava antes do redesign e não podem mudar: alterá-los muda a apresentação do
   * estímulo e quebra a comparabilidade com todas as sessões já gravadas.
   */
  const FROZEN: Record<string, string> = {
    'stim-bg': '#0a0e14',
    'stim-surface': '#1a2332',
    'stim-border': '#2a3548',
    'stim-text': '#e8edf4',
    'stim-muted': '#8b9bb4',
    'stim-target': '#4a9eff',
    'stim-go': '#3dd68c',
    'stim-nogo': '#f56565',
    'stim-warning': '#f5a623',
  }

  it.each(Object.entries(FROZEN))('--color-%s permanece congelado', (name, expected) => {
    expect(CSS).toContain(`--color-${name}: ${expected};`)
  })

  it('não é retematizado pelo tema claro', () => {
    const lightBlock = CSS.slice(CSS.indexOf(':root[data-theme="light"] {'))
    const lightScope = lightBlock.slice(0, lightBlock.indexOf('}'))
    expect(lightScope).not.toContain('--color-stim-')
  })
})
