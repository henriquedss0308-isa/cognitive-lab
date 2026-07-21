import {
  getMetricLabel,
  getMetricPresentation,
  presentMetricValue,
} from '../../metrics/presentation'

interface Props {
  metric: string
  label?: string
  value?: string | number | null
  /** Métrica principal da sessão — recebe mais peso visual que as demais. */
  emphasis?: boolean
}

export function MetricCard({ metric, label, value, emphasis = false }: Props) {
  const metadata = getMetricPresentation(metric)
  const displayLabel = getMetricLabel(metric, label)
  const presented = presentMetricValue(metric, value)

  return (
    <div className="card p-4 flex flex-col" title={metadata.explanation}>
      <div className="section-title">{displayLabel}</div>
      {/*
        Número e unidade separados: a unidade em peso menor deixa a magnitude
        legível de relance, que é o que se procura numa grade de métricas.
      */}
      <div className="mt-2 flex items-baseline gap-1">
        <span
          className={emphasis ? 'metric-value text-3xl' : 'metric-value text-2xl'}
          aria-label={presented.text}
        >
          {presented.valueText}
        </span>
        {presented.unitText && !presented.unavailable && (
          <span className="text-xs text-lab-muted">{presented.unitText}</span>
        )}
      </div>
      {metadata.explanation && <p className="help-text mt-2 flex-1">{metadata.explanation}</p>}
    </div>
  )
}
