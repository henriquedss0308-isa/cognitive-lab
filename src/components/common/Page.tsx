import clsx from 'clsx'
import type { ReactNode } from 'react'

/**
 * Padrões de página.
 *
 * Antes cada página repetia o seu próprio `p-8 max-w-*` e o seu próprio par de
 * `<h1>/<p>`, e o espaçamento tinha derivado. Centralizar aqui é o que dá o
 * mesmo ritmo vertical e a mesma hierarquia em toda a interface.
 */

type Width = 'narrow' | 'default' | 'wide'

const WIDTHS: Record<Width, string> = {
  narrow: 'max-w-2xl',
  default: 'max-w-4xl',
  wide: 'max-w-5xl',
}

export function Page({
  children,
  width = 'default',
  className,
}: {
  children: ReactNode
  width?: Width
  className?: string
}) {
  return (
    <div className={clsx('px-6 py-8 sm:px-10 sm:py-10', WIDTHS[width], className)}>{children}</div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
}) {
  return (
    <header className="mb-8 flex items-start justify-between gap-6">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  )
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={clsx('mb-10', className)}>
      {(title || actions) && (
        <div className="flex items-baseline justify-between gap-4 mb-3">
          {title && <h2 className="section-title">{title}</h2>}
          {actions}
        </div>
      )}
      {description && <p className="help-text mb-4 max-w-prose">{description}</p>}
      {children}
    </section>
  )
}
