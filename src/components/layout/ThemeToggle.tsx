import clsx from 'clsx'
import { useApp } from '../../context/AppContext'
import { THEME_LABELS, normalizeTheme, type ThemeName } from '../../theme/theme'

const THEMES: ThemeName[] = ['dark', 'light']

/**
 * Alternador rápido de tema.
 *
 * É um grupo de rádio de verdade, não dois botões: são opções mutuamente
 * exclusivas de um mesmo campo, e assim leitor de tela e teclado (setas)
 * funcionam sem nenhum código extra. O estado ativo é marcado por fundo, borda
 * e `aria-checked` — nunca só por cor.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { settings, updateSettings } = useApp()
  const current = normalizeTheme(settings.theme)

  return (
    <div
      role="radiogroup"
      aria-label="Tema da interface"
      className={clsx(
        'inline-flex items-center gap-0.5 p-0.5 rounded-md border border-lab-border bg-lab-bg',
        className
      )}
    >
      {THEMES.map((theme) => {
        const active = current === theme
        return (
          <button
            key={theme}
            type="button"
            role="radio"
            aria-checked={active}
            title={`Tema ${THEME_LABELS[theme].toLowerCase()}`}
            onClick={() => updateSettings({ theme })}
            className={clsx(
              'flex-1 px-2.5 py-1 rounded-sm text-xs font-medium transition-colors',
              active
                ? 'bg-lab-surface-2 text-lab-fg border border-lab-border-strong'
                : 'border border-transparent text-lab-muted hover:text-lab-text'
            )}
          >
            {THEME_LABELS[theme]}
          </button>
        )
      })}
    </div>
  )
}
