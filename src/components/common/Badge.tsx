import clsx from 'clsx'
import type { ReactNode } from 'react'
import type { SessionQuality } from '../../types'

/**
 * Linguagem única de badges.
 *
 * Regra que vale para todos: o rótulo carrega o significado, a cor só reforça.
 * Nada aqui pode ser entendido apenas pela cor — vale para daltonismo, para
 * impressão em preto e branco e para o tema claro, onde os tons são mais
 * próximos entre si.
 */

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const TONES: Record<BadgeTone, string> = {
  neutral: 'badge-neutral',
  accent: 'badge-accent',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
}

export function Badge({
  children,
  tone = 'neutral',
  dot = false,
  className,
  title,
}: {
  children: ReactNode
  tone?: BadgeTone
  /** Ponto discreto antes do rótulo. Nunca substitui o rótulo. */
  dot?: boolean
  className?: string
  title?: string
}) {
  return (
    <span className={clsx('badge', TONES[tone], className)} title={title}>
      {dot && <span aria-hidden="true" className="badge-dot" />}
      {children}
    </span>
  )
}

const QUALITY: Record<SessionQuality, { label: string; tone: BadgeTone }> = {
  valid: { label: 'Válida', tone: 'success' },
  valid_with_warnings: { label: 'Válida com avisos', tone: 'warning' },
  invalid: { label: 'Inválida', tone: 'danger' },
}

export function QualityBadge({ quality, className }: { quality: SessionQuality; className?: string }) {
  const entry = QUALITY[quality] ?? { label: String(quality), tone: 'neutral' as BadgeTone }
  return (
    <Badge tone={entry.tone} dot className={className}>
      {entry.label}
    </Badge>
  )
}

/** Fase do baseline — informativa, nunca um juízo sobre o desempenho. */
const PHASE: Record<string, string> = {
  familiarization: 'Familiarização',
  baseline_building: 'Construindo baseline',
  monitoring: 'Monitoramento',
  insufficient_data: 'Dados insuficientes',
}

export function PhaseBadge({ phase, className }: { phase: string; className?: string }) {
  return (
    <Badge tone="neutral" className={className}>
      {PHASE[phase] ?? phase}
    </Badge>
  )
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge tone="warning" className={className} title="Sessão fictícia, gerada para demonstração">
      Demonstração
    </Badge>
  )
}
