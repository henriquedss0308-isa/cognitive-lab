import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { ALL_TESTS } from '../tests/registry'
import { LongitudinalChart, SpeedAccuracyChart } from '../components/charts/SessionCharts'
import { DemoBadge, QualityBadge } from '../components/common/Badge'
import { Page, PageHeader } from '../components/common/Page'
import {
  formatMetricValue,
  getMetricPresentation,
  sessionMedianPresentationKey,
} from '../metrics/presentation'
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
    <Page width="wide">
      <PageHeader
        title="Histórico"
        subtitle="Comparado às suas sessões anteriores."
      />

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <select
          className="w-auto min-w-52"
          aria-label="Filtrar por teste"
          value={filterTest}
          onChange={(e) => setFilterTest(e.target.value as TestId | 'all')}
        >
          <option value="all">Todos os testes</option>
          {ALL_TESTS.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-lab-muted cursor-pointer">
          <input type="checkbox" checked={showDemo} onChange={(e) => setShowDemo(e.target.checked)} />
          Incluir demonstração
        </label>
        <span className="help-text ml-auto">
          {filtered.length} {filtered.length === 1 ? 'sessão' : 'sessões'}
        </span>
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

      {filtered.length === 0 ? (
        <div className="card px-5 py-10 text-center">
          <p className="text-sm text-lab-muted">Nenhuma sessão encontrada.</p>
          <p className="help-text mt-1">Ajuste o filtro acima ou registre uma nova sessão.</p>
        </div>
      ) : (
        /* Lista uniforme: uma linha por sessão, separadas por régua em vez de
           cada uma virar o seu próprio cartão. */
        <div className="card divide-y divide-lab-border overflow-hidden">
          {filtered.map((s) => {
            const test = ALL_TESTS.find((t) => t.id === s.testId)
            const medianMetricKey = sessionMedianPresentationKey(s.testId)
            return (
              <Link
                key={s.sessionId}
                to={`/results/${s.sessionId}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-lab-surface-2 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-lab-fg">{test?.shortName}</span>
                    <QualityBadge quality={s.quality} />
                    {s.isDemo && <DemoBadge />}
                  </div>
                  <p className="help-text mt-1">
                    {new Date(s.startedAt).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="metric-value text-sm">
                    <span className="text-lab-muted font-sans text-xs mr-1">
                      {getMetricPresentation(medianMetricKey).label} ·
                    </span>
                    {formatMetricValue(medianMetricKey, s.result?.rtMetrics.medianCorrectRT)}
                  </div>
                  <div className="help-text mt-0.5">
                    Precisão · {formatMetricValue('accuracy', s.result?.accuracyMetrics.accuracy)}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </Page>
  )
}
