import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, ScatterChart, Scatter, CartesianGrid, Legend,
} from 'recharts'
import type { SessionRecord } from '../../types'
import { selectTrendSessions } from './chartSelectors'
import { useChartTheme, tooltipStyle, type ChartTheme } from './useChartTheme'

/**
 * Gráficos das sessões.
 *
 * O redesign mexe só na apresentação: grade mais discreta, eixos sem linha
 * dupla, tipografia menor e cores vindas do tema. Nenhuma seleção, agregação ou
 * escala foi alterada.
 */

interface Props {
  session: SessionRecord
}

/** Eixos com a mesma aparência em todos os gráficos. */
function axisProps(theme: ChartTheme, size = 11) {
  return {
    tick: { fill: theme.axis, fontSize: size },
    tickLine: false,
    axisLine: { stroke: theme.grid },
    stroke: theme.grid,
  }
}

function ChartFrame({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <div className="card p-4">
      <h3 className="card-title">{title}</h3>
      {note && <p className="help-text mt-1">{note}</p>}
      <div className="mt-4">{children}</div>
    </div>
  )
}

export function BlockChart({ session }: Props) {
  const theme = useChartTheme()
  const blocks = session.result?.blockMetrics ?? []
  if (blocks.length === 0) return null

  return (
    <ChartFrame title="Desempenho por bloco">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={blocks} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <XAxis dataKey="blockIndex" {...axisProps(theme)} />
          <YAxis {...axisProps(theme)} />
          <Tooltip contentStyle={tooltipStyle(theme)} cursor={{ fill: theme.grid, opacity: 0.4 }} />
          <Bar dataKey="medianRT" name="RT mediano (ms)" fill={theme.series} radius={[2, 2, 0, 0]} />
          <Bar dataKey="accuracy" name="Precisão" fill={theme.seriesAlt} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

export function RTDistribution({ session }: Props) {
  const theme = useChartTheme()
  const rts = session.trials
    .filter((t) => t.correct && t.reactionTimeMs !== null && t.reactionTimeMs >= 150)
    .map((t) => t.reactionTimeMs!)

  if (rts.length === 0) return null

  const bins = 12
  const min = Math.min(...rts)
  const max = Math.max(...rts)
  const step = (max - min) / bins || 100
  const histogram = Array.from({ length: bins }, (_, i) => ({
    range: `${Math.round(min + i * step)}`,
    count: 0,
  }))
  rts.forEach((rt) => {
    const idx = Math.min(Math.floor((rt - min) / step), bins - 1)
    histogram[idx].count++
  })

  return (
    <ChartFrame title="Distribuição de RT" note="Ensaios corretos, em milissegundos.">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={histogram} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <XAxis dataKey="range" {...axisProps(theme, 10)} />
          <YAxis {...axisProps(theme)} />
          <Tooltip contentStyle={tooltipStyle(theme)} cursor={{ fill: theme.grid, opacity: 0.4 }} />
          <Bar dataKey="count" fill={theme.seriesThird} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

interface LongitudinalProps {
  sessions: SessionRecord[]
  metricKey: string
  label: string
}

export function LongitudinalChart({ sessions, metricKey, label }: LongitudinalProps) {
  const theme = useChartTheme()
  const selection = selectTrendSessions(sessions)
  const data = selection.sessions
    .map((s, i) => {
      let value: number | null = null
      if (metricKey === 'medianCorrectRT') value = s.result!.rtMetrics.medianCorrectRT
      else if (metricKey === 'accuracy') value = s.result!.accuracyMetrics.accuracy
      else value = s.result!.customMetrics[metricKey] ?? null

      return {
        index: i + 1,
        date: new Date(s.startedAt).toLocaleDateString('pt-BR'),
        value,
      }
    })
    .filter((d) => d.value !== null)

  const hiddenNote = [
    selection.hiddenInvalid > 0 ? `${selection.hiddenInvalid} inválida(s) não plotada(s)` : null,
    selection.hiddenOtherVersions > 0
      ? `${selection.hiddenOtherVersions} de versão anterior do protocolo oculta(s)`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  if (data.length < 2) {
    return (
      <div className="card p-4">
        <h3 className="card-title">{label}</h3>
        <p className="help-text mt-1">
          Dados insuficientes para tendência ({data.length} sessão{data.length !== 1 ? 'ões' : ''}).
          {hiddenNote && <span className="block mt-1">{hiddenNote}.</span>}
        </p>
      </div>
    )
  }

  return (
    <ChartFrame
      title={`${label} — tendência longitudinal`}
      note={`Comparado às suas sessões anteriores. ${data.length} sessões.${hiddenNote ? ` ${hiddenNote}.` : ''}`}
    >
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <XAxis dataKey="date" {...axisProps(theme)} />
          <YAxis {...axisProps(theme)} />
          <Tooltip contentStyle={tooltipStyle(theme)} cursor={{ stroke: theme.grid }} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={theme.series}
            strokeWidth={1.75}
            dot={{ fill: theme.series, r: 2.5, strokeWidth: 0 }}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

interface SpeedAccuracyProps {
  sessions: SessionRecord[]
}

export function SpeedAccuracyChart({ sessions }: SpeedAccuracyProps) {
  const theme = useChartTheme()
  const data = selectTrendSessions(sessions)
    .sessions
    .map((s) => ({
      id: s.sessionId.slice(0, 8),
      speed: s.result!.rtMetrics.medianCorrectRT,
      accuracy: s.result!.accuracyMetrics.accuracy * 100,
      date: new Date(s.startedAt).toLocaleDateString('pt-BR'),
    }))
    .filter((d) => d.speed !== null)

  if (data.length === 0) return null

  return (
    <ChartFrame title="Velocidade vs Precisão">
      <ResponsiveContainer width="100%" height={240}>
        <ScatterChart margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={theme.grid} />
          <XAxis dataKey="speed" name="RT mediano" unit="ms" {...axisProps(theme)} />
          <YAxis dataKey="accuracy" name="Precisão" unit="%" domain={[0, 100]} {...axisProps(theme)} />
          <Tooltip contentStyle={tooltipStyle(theme)} cursor={{ stroke: theme.grid }} />
          <Legend wrapperStyle={{ fontSize: 12, color: theme.axis }} />
          <Scatter name="Sessões" data={data} fill={theme.series} />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}
