import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { ALL_TESTS } from '../tests/registry'
import { LongitudinalChart, SpeedAccuracyChart } from '../components/charts/SessionCharts'
import type { TestId } from '../types'

export function History() {
  const { sessions } = useApp()
  const [filterTest, setFilterTest] = useState<TestId | 'all'>('all')
  const [showDemo, setShowDemo] = useState(true)

  const filtered = sessions.filter((s) => {
    if (filterTest !== 'all' && s.testId !== filterTest) return false
    if (!showDemo && s.isDemo) return false
    if (s.mode !== 'assessment') return false
    return true
  })

  const selectedTest = filterTest !== 'all' ? ALL_TESTS.find((t) => t.id === filterTest) : null

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Histórico</h1>
        <p className="text-lab-muted mt-1">Comparado às suas sessões anteriores.</p>
      </header>

      <div className="flex flex-wrap gap-3 mb-6">
        <select
          className="bg-lab-surface-2 border border-lab-border rounded-lg px-3 py-2 text-sm"
          value={filterTest}
          onChange={(e) => setFilterTest(e.target.value as TestId | 'all')}
        >
          <option value="all">Todos os testes</option>
          {ALL_TESTS.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-lab-muted">
          <input type="checkbox" checked={showDemo} onChange={(e) => setShowDemo(e.target.checked)} />
          Incluir demonstração
        </label>
      </div>

      {selectedTest && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <LongitudinalChart
            sessions={filtered}
            metricKey={selectedTest.primaryMetricKey}
            label={selectedTest.metricLabels[selectedTest.primaryMetricKey] ?? selectedTest.primaryMetricKey}
          />
          <LongitudinalChart sessions={filtered} metricKey="accuracy" label="Precisão" />
          <div className="md:col-span-2">
            <SpeedAccuracyChart sessions={filtered} />
          </div>
        </div>
      )}

      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-lab-muted text-sm">Nenhuma sessão encontrada.</p>
        )}
        {filtered.map((s) => {
          const test = ALL_TESTS.find((t) => t.id === s.testId)
          return (
            <Link
              key={s.sessionId}
              to={`/results/${s.sessionId}`}
              className="card p-4 flex items-center justify-between hover:border-lab-accent/50 transition-colors block"
            >
              <div>
                <span className="font-medium">{test?.shortName}</span>
                {s.isDemo && <span className="text-lab-warning text-xs ml-2">demo</span>}
                <p className="text-xs text-lab-muted mt-0.5">
                  {new Date(s.startedAt).toLocaleString('pt-BR')} · {s.quality}
                </p>
              </div>
              <div className="text-right font-mono text-sm">
                <div>RT: {s.result?.rtMetrics.medianCorrectRT?.toFixed(0) ?? '—'} ms</div>
                <div className="text-lab-muted text-xs">
                  Acc: {((s.result?.accuracyMetrics.accuracy ?? 0) * 100).toFixed(0)}%
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}