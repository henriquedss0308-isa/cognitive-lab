import { useEffect, useState } from 'react'

/**
 * Cores dos gráficos lidas dos tokens do tema.
 *
 * O Recharts recebe cor como prop em JavaScript, não como CSS, então não há
 * como ele herdar `var(--color-lab-*)` sozinho. Este hook lê os tokens já
 * resolvidos e observa `data-theme` para reagir à troca de tema.
 *
 * Só aparência: nada aqui toca nos dados, nas séries ou nos eixos.
 */
export interface ChartTheme {
  grid: string
  axis: string
  text: string
  tooltipBg: string
  tooltipBorder: string
  series: string
  seriesAlt: string
  seriesThird: string
}

const FALLBACK: ChartTheme = {
  grid: '#222834',
  axis: '#868f9f',
  text: '#dde3ec',
  tooltipBg: '#11141b',
  tooltipBorder: '#2e3644',
  series: '#82a8de',
  seriesAlt: '#55a37f',
  seriesThird: '#9b8ed6',
}

function readTheme(): ChartTheme {
  if (typeof window === 'undefined') return FALLBACK
  const cs = getComputedStyle(document.documentElement)
  const token = (name: string, fallback: string) =>
    cs.getPropertyValue(`--color-lab-${name}`).trim() || fallback

  return {
    grid: token('border', FALLBACK.grid),
    axis: token('muted', FALLBACK.axis),
    text: token('text', FALLBACK.text),
    tooltipBg: token('surface', FALLBACK.tooltipBg),
    tooltipBorder: token('border-strong', FALLBACK.tooltipBorder),
    series: token('accent', FALLBACK.series),
    seriesAlt: token('success', FALLBACK.seriesAlt),
    seriesThird: token('purple', FALLBACK.seriesThird),
  }
}

export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(readTheme)

  useEffect(() => {
    const update = () => setTheme(readTheme())
    update()

    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  return theme
}

/** Estilo comum dos tooltips — mesma superfície e borda dos cards. */
export function tooltipStyle(theme: ChartTheme) {
  return {
    background: theme.tooltipBg,
    border: `1px solid ${theme.tooltipBorder}`,
    borderRadius: 4,
    color: theme.text,
    fontSize: 12,
  }
}
