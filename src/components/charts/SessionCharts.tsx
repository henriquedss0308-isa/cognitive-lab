import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, ScatterChart, Scatter, CartesianGrid, Legend,
} from 'recharts'
import type { SessionRecord } from '../../types'
import { selectTrendSessions } from './chartSelectors'

interface Props {
  session: SessionRecord
}

export function BlockChart({ session }: Props) {
  const blocks = session.result?.blockMetrics ?? []
  if (blocks.length === 0) return null

  return (
    <div className="card p-4">
      <h3 className="text-sm font-medium mb-4">Desempenho por bloco</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={blocks}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
          <XAxis dataKey="blockIndex" tick={{ fill: '#8b9bb4', fontSize: 12 }} />
          <YAxis tick={{ fill: '#8b9bb4', fontSize: 12 }} />
          <Tooltip contentStyle={{ background: '#111820', border: '1px solid #2a3548' }} />
          <Bar dataKey="medianRT" name="RT mediano (ms)" fill="#4a9eff" radius={[4, 4, 0, 0]} />
          <Bar dataKey="accuracy" name="Precisão" fill="#3dd68c" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function RTDistribution({ session }: Props) {
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
    <div className="card p-4">
      <h3 className="text-sm font-medium mb-4">Distribuição de RT</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={histogram}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
          <XAxis dataKey="range" tick={{ fill: '#8b9bb4', fontSize: 10 }} />
          <YAxis tick={{ fill: '#8b9bb4', fontSize: 12 }} />
          <Tooltip contentStyle={{ background: '#111820', border: '1px solid #2a3548' }} />
          <Bar dataKey="count" fill="#a78bfa" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

interface LongitudinalProps {
  sessions: SessionRecord[]
  metricKey: string
  label: string
}

export function LongitudinalChart({ sessions, metricKey, label }: LongitudinalProps) {
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
      <div className="card p-4 text-lab-muted text-sm">
        Dados insuficientes para tendência ({data.length} sessão{data.length !== 1 ? 'ões' : ''}).
        {hiddenNote && <span className="block mt-1">{hiddenNote}.</span>}
      </div>
    )
  }

  return (
    <div className="card p-4">
      <h3 className="text-sm font-medium mb-4">{label} — tendência longitudinal</h3>
      <p className="text-xs text-lab-muted mb-2">
        Comparado às suas sessões anteriores. {data.length} sessões.
        {hiddenNote && ` ${hiddenNote}.`}
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
          <XAxis dataKey="date" tick={{ fill: '#8b9bb4', fontSize: 11 }} />
          <YAxis tick={{ fill: '#8b9bb4', fontSize: 12 }} />
          <Tooltip contentStyle={{ background: '#111820', border: '1px solid #2a3548' }} />
          <Line type="monotone" dataKey="value" stroke="#4a9eff" strokeWidth={2} dot={{ fill: '#4a9eff' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

interface SpeedAccuracyProps {
  sessions: SessionRecord[]
}

export function SpeedAccuracyChart({ sessions }: SpeedAccuracyProps) {
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
    <div className="card p-4">
      <h3 className="text-sm font-medium mb-4">Velocidade vs Precisão</h3>
      <ResponsiveContainer width="100%" height={240}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
          <XAxis dataKey="speed" name="RT mediano" unit="ms" tick={{ fill: '#8b9bb4' }} />
          <YAxis dataKey="accuracy" name="Precisão" unit="%" tick={{ fill: '#8b9bb4' }} domain={[0, 100]} />
          <Tooltip contentStyle={{ background: '#111820', border: '1px solid #2a3548' }} />
          <Legend />
          <Scatter name="Sessões" data={data} fill="#4a9eff" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}