import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, ScatterChart, Scatter, CartesianGrid, Legend,
} from 'recharts'
import type { SessionRecord } from '../../types'
import {
  buildTrendPoints,
  formatFullDate,
  formatTrendValue,
  selectTrendSessions,
  type TrendPoint,
} from './chartSelectors'
import { useChartTheme, tooltipStyle, type ChartTheme } from './useChartTheme'
import {
  formatMetricValue,
  sessionMedianPresentationKey,
} from '../../metrics/presentation'

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

/**
 * Tooltip de uma sessão.
 *
 * Mostra data COM horário porque várias sessões podem cair no mesmo dia — sem o
 * horário elas ficariam indistinguíveis. O valor é formatado pela métrica, em
 * vez do número cru do ponto flutuante.
 *
 * O nome da métrica vem em `metricLabel`, e NÃO em `label`: o Recharts clona o
 * elemento passado em `content` injetando os próprios props, e entre eles vai um
 * `label` com o valor da categoria do eixo X — que aqui é o sessionId. Um prop
 * chamado `label` seria sobrescrito por esse id, e o UUID apareceria na tela.
 * O id é identidade interna e nunca deve ser exibido.
 */
export function SessionTooltip({
  active,
  payload,
  metricKey,
  metricLabel,
}: {
  active?: boolean
  payload?: { payload?: TrendPoint }[]
  metricKey: string
  metricLabel: string
}) {
  const point = active ? payload?.[0]?.payload : undefined
  if (!point) return null

  return (
    <div className="card px-3 py-2 text-xs shadow-none">
      <div className="text-lab-muted">{point.fullLabel}</div>
      <div className="mt-1 text-lab-fg">
        {metricLabel}:{' '}
        <span className="metric-value">{formatTrendValue(metricKey, point.value)}</span>
      </div>
    </div>
  )
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
          <YAxis
            yAxisId="rt"
            tickFormatter={(value: number) => formatMetricValue('medianRT', value)}
            {...axisProps(theme)}
          />
          <YAxis
            yAxisId="accuracy"
            orientation="right"
            domain={[0, 1]}
            tickFormatter={(value: number) => formatMetricValue('accuracy', value)}
            {...axisProps(theme)}
          />
          <Tooltip
            contentStyle={tooltipStyle(theme)}
            cursor={{ fill: theme.grid, opacity: 0.4 }}
            formatter={(value, name, item) => {
              const metricKey = item.dataKey === 'accuracy' ? 'accuracy' : 'medianRT'
              return [formatMetricValue(metricKey, Number(value)), name]
            }}
          />
          <Bar
            yAxisId="rt"
            dataKey="medianRT"
            name="TR mediano"
            fill={theme.series}
            radius={[2, 2, 0, 0]}
          />
          <Bar
            yAxisId="accuracy"
            dataKey="accuracy"
            name="Precisão"
            fill={theme.seriesAlt}
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

export function RTDistribution({ session }: Props) {
  const theme = useChartTheme()
  const medianMetricKey = sessionMedianPresentationKey(session.testId)
  const isCorsi = session.testId === 'corsi'
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
    <ChartFrame
      title={isCorsi ? 'Distribuição do tempo de reprodução' : 'Distribuição de RT'}
      note={isCorsi ? 'Sequências corretas, em milissegundos.' : 'Ensaios corretos, em milissegundos.'}
    >
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={histogram} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <XAxis dataKey="range" {...axisProps(theme, 10)} />
          <YAxis {...axisProps(theme)} />
          <Tooltip
            contentStyle={tooltipStyle(theme)}
            cursor={{ fill: theme.grid, opacity: 0.4 }}
            labelFormatter={(value) => formatMetricValue(medianMetricKey, Number(value))}
            formatter={(value) => [formatMetricValue('histogramCount', Number(value)), 'Ensaios']}
          />
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
  const data = buildTrendPoints(selection.sessions, metricKey)
  // O eixo recebe o id da sessão e precisa devolver a data curta.
  const axisLabels = new Map(data.map((p) => [p.key, p.shortLabel]))

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
      /*
        O texto diz o que a série de fato contém. Antes falava em "sessões
        anteriores", o que sugeria que a mais recente ficava de fora — este
        gráfico não exclui sessão nenhuma por ser a atual (ele nem é exibido na
        página de uma sessão). Fora da série ficam apenas os casos listados em
        `hiddenNote`: inválidas e de outra versão de protocolo.
      */
      note={`${data.length} sessões, da mais antiga à mais recente — todas as elegíveis entram, inclusive a última.${hiddenNote ? ` ${hiddenNote}.` : ''}`}
    >
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={theme.grid} vertical={false} />
          {/*
            A categoria é o id da sessão (único); o eixo exibe a data curta pelo
            tickFormatter. Chavear pela data faria sessões do mesmo dia
            colidirem numa só categoria.
          */}
          <XAxis
            dataKey="key"
            tickFormatter={(key: string) => axisLabels.get(key) ?? ''}
            {...axisProps(theme)}
          />
          <YAxis
            tickFormatter={(value: number) => formatMetricValue(metricKey, value)}
            {...axisProps(theme)}
          />
          <Tooltip
            cursor={{ stroke: theme.grid }}
            wrapperStyle={{ outline: 'none' }}
            content={<SessionTooltip metricKey={metricKey} metricLabel={label} />}
          />
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

/**
 * Tooltip do dispersão: identifica a sessão por data e horário.
 *
 * Como no longitudinal, a sessão é identificada por data e horário — nunca pelo
 * sessionId, que existe só como identidade interna. Nenhum prop aqui se chama
 * `label`, justamente para não colidir com o que o Recharts injeta.
 */
export function ScatterTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload?: { fullLabel: string; speed: number; accuracy: number } }[]
}) {
  const point = active ? payload?.[0]?.payload : undefined
  if (!point) return null

  return (
    <div className="card px-3 py-2 text-xs shadow-none">
      <div className="text-lab-muted">{point.fullLabel}</div>
      <div className="mt-1 text-lab-fg">
        RT mediano:{' '}
        <span className="metric-value">{formatTrendValue('medianCorrectRT', point.speed)}</span>
      </div>
      <div className="text-lab-fg">
        Precisão: <span className="metric-value">{formatTrendValue('accuracy', point.accuracy)}</span>
      </div>
    </div>
  )
}

export function SpeedAccuracyChart({ sessions }: SpeedAccuracyProps) {
  const theme = useChartTheme()
  const data = selectTrendSessions(sessions)
    .sessions
    .filter((s) => s.result!.rtMetrics.medianCorrectRT !== null)
    .map((s) => ({
      // Mesma correção do longitudinal: identidade pelo id da sessão, e o
      // timestamp completo viaja junto para o tooltip poder distinguir duas
      // sessões que caiam no mesmo ponto da nuvem.
      key: s.sessionId,
      fullLabel: formatFullDate(s.startedAt),
      speed: s.result!.rtMetrics.medianCorrectRT as number,
      accuracy: s.result!.accuracyMetrics.accuracy,
    }))

  if (data.length === 0) return null

  return (
    <ChartFrame title="Velocidade vs Precisão">
      <ResponsiveContainer width="100%" height={240}>
        <ScatterChart margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={theme.grid} />
          {/*
            Eixos numéricos: num gráfico de dispersão as duas grandezas são
            contínuas. Como categoria, sessões com o mesmo RT cairiam na mesma
            posição — a mesma classe de erro do eixo por data.
          */}
          <XAxis
            type="number"
            dataKey="speed"
            name="RT mediano"
            domain={['dataMin - 20', 'dataMax + 20']}
            tickFormatter={(value: number) => formatMetricValue('medianCorrectRT', value)}
            {...axisProps(theme)}
          />
          <YAxis
            type="number"
            dataKey="accuracy"
            name="Precisão"
            domain={[0, 1]}
            tickFormatter={(value: number) => formatMetricValue('accuracy', value)}
            {...axisProps(theme)}
          />
          <Tooltip
            cursor={{ stroke: theme.grid }}
            wrapperStyle={{ outline: 'none' }}
            content={<ScatterTooltip />}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: theme.axis }} />
          <Scatter name="Sessões" data={data} fill={theme.series} />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}
