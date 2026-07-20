import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getTest } from '../tests/registry'
import { MetricCard } from '../components/common/MetricTooltip'
import { BlockChart, RTDistribution } from '../components/charts/SessionCharts'
import { TestConditionsForm } from '../components/test/TestConditionsForm'
import { computeBaselineStats } from '../statistics'
import { evaluatePrimaryZ } from '../statistics/zscore'
import { getSession } from '../storage/repository'
import { loadResultsSession, type ResultsLoadState } from '../storage/resultsLoader'
import type { SessionRecord, TestConditions } from '../types'

const PHASE_LABELS: Record<string, string> = {
  familiarization: 'Familiarização — não entra no baseline',
  baseline_building: 'Construindo baseline pessoal',
  monitoring: 'Monitoramento longitudinal',
  insufficient_data: 'Dados insuficientes',
}

const QUALITY_LABELS: Record<string, string> = {
  valid: 'Válida',
  valid_with_warnings: 'Válida com avisos',
  invalid: 'Inválida',
}

function formatConditionValue(key: string, value: any): string {
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (key === 'mealType') {
    const types: Record<string, string> = { fasting: 'Jejum', light: 'Leve', normal: 'Normal', heavy: 'Pesada' }
    return types[value as string] || value
  }
  if (key === 'noiseLevel') {
    const levels: Record<string, string> = { silent: 'Silencioso', low: 'Baixo', moderate: 'Moderado', high: 'Alto' }
    return levels[value as string] || value
  }
  if (key === 'location') {
    const locations: Record<string, string> = { bedroom: 'Quarto', office: 'Escritório', living_room: 'Sala', school: 'Escola', other: 'Outro' }
    return locations[value as string] || value
  }
  return String(value)
}

function renderConditionSection(title: string, data: any) {
  if (!data || Object.keys(data).length === 0) return null
  return (
    <div className="mb-4">
      <h4 className="text-lab-fg font-medium mb-1">{title}</h4>
      <ul className="space-y-1">
        {Object.entries(data).map(([k, v]) => (
          <li key={k}>
            <span className="capitalize">{k.replace(/([A-Z])/g, ' $1')}:</span> {formatConditionValue(k, v)}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Results() {
  const { sessionId } = useParams()
  const { sessions, loading: appLoading, refresh, editSessionConditions } = useApp()
  const [loadState, setLoadState] = useState<ResultsLoadState>('loading')
  const [session, setSession] = useState<SessionRecord | undefined>()
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editingConditions, setEditingConditions] = useState(false)
  const [savingConditions, setSavingConditions] = useState(false)
  const [conditionsSaved, setConditionsSaved] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const outcome = await loadResultsSession(sessionId, {
        getSession,
        getFromContext: (id) => sessions.find((s) => s.sessionId === id),
        appLoading,
        retryAfterRefresh: refresh,
      })

      if (cancelled) return

      setLoadState(outcome.state)
      setSession(outcome.session)
      setLoadError(outcome.error ?? null)
    }

    setLoadState('loading')
    void load()

    return () => {
      cancelled = true
    }
  }, [sessionId, sessions, appLoading, refresh])

  if (loadState === 'loading' || appLoading) {
    return <div className="p-8 text-lab-muted">Carregando resultados...</div>
  }

  if (loadState === 'error') {
    return (
      <div className="p-8">
        <p className="text-lab-danger mb-2">Erro ao carregar resultados.</p>
        <p className="text-lab-muted text-sm">{loadError}</p>
      </div>
    )
  }

  if (loadState === 'not_found' || !session?.result) {
    return <div className="p-8">Sessão não encontrada.</div>
  }

  const test = getTest(session.testId)
  const result = session.result
  const baseline = computeBaselineStats(
    sessions.filter((s) => s.sessionId !== sessionId),
    session.testId,
    session.protocolVersion,
    test.baselineMetricKeys
  )

  const primaryValue = result.customMetrics[test.primaryMetricKey] ??
    result.rtMetrics.medianCorrectRT

  const zOutcome = evaluatePrimaryZ(primaryValue, baseline, test)

  const handleConditionsSave = async (conditions: TestConditions) => {
    if (!session) return
    setSavingConditions(true)
    setConditionsSaved(false)
    await editSessionConditions(session.sessionId, conditions)
    setSession({
      ...session,
      checkIn: conditions,
      result: session.result
        ? {
            ...session.result,
            checkIn: conditions,
          }
        : session.result,
    })
    setSavingConditions(false)
    setEditingConditions(false)
    setConditionsSaved(true)
  }

  return (
    <div className="p-8 max-w-4xl">
      <header className="mb-8">
        <Link to="/history" className="text-sm text-lab-muted hover:text-lab-accent">← Histórico</Link>
        <h1 className="text-2xl font-semibold mt-2">{test.name}</h1>
        <p className="text-lab-muted">
          {session.mode === 'assessment' ? 'Avaliação' : 'Treino'} ·{' '}
          {new Date(session.startedAt).toLocaleString('pt-BR')}
          {session.isDemo && <span className="text-lab-warning ml-2">[Demonstração]</span>}
        </p>
      </header>

      <div className="card p-4 mb-6 flex items-center gap-4">
        <div className={`w-3 h-3 rounded-full ${
          result.quality === 'valid' ? 'bg-lab-success' :
          result.quality === 'valid_with_warnings' ? 'bg-lab-warning' : 'bg-lab-danger'
        }`} />
        <div>
          <span className="font-medium">{QUALITY_LABELS[result.quality]}</span>
          {result.baselinePhase && (
            <span className="text-sm text-lab-muted ml-3">
              {PHASE_LABELS[result.baselinePhase]}
            </span>
          )}
        </div>
      </div>

      {result.flagMessages.length > 0 && (
        <div className="card p-4 mb-6 border-lab-warning/50">
          <h3 className="text-sm font-medium mb-2">Avisos de qualidade</h3>
          <ul className="text-sm text-lab-muted space-y-1">
            {result.flagMessages.map((m, i) => <li key={i}>· {m}</li>)}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard metric={test.primaryMetricKey} label="Métrica principal"
          value={primaryValue} unit={test.primaryMetricKey.includes('accuracy') || test.primaryMetricKey.includes('span') ? '' : ' ms'} />
        <MetricCard metric="accuracy" label="Precisão" value={result.accuracyMetrics.accuracy * 100} unit="%" />
        <MetricCard metric="medianCorrectRT" label="RT mediano" value={result.rtMetrics.medianCorrectRT} unit=" ms" />
        <MetricCard metric="rtCV" label="Variabilidade (CV)" value={result.rtMetrics.rtCoefficientOfVariation} />
      </div>

      {zOutcome.kind === 'ok' && (
        <div className="card p-4 mb-6">
          <h3 className="text-sm font-medium">Comparado ao seu próprio baseline</h3>
          <p className="text-2xl font-mono mt-1">z = {zOutcome.z.toFixed(2)}</p>
          <p className="text-xs text-lab-muted mt-1">
            z positivo = melhor que o seu habitual nesta métrica.
            Baseado em {zOutcome.n} sessões de baseline.
            Diferenças pequenas podem não ser significativas.
          </p>
        </div>
      )}
      {zOutcome.kind === 'value_missing' && (
        <div className="card p-4 mb-6">
          <h3 className="text-sm font-medium">Comparado ao seu próprio baseline</h3>
          <p className="text-sm text-lab-muted mt-1">
            A métrica principal não pôde ser calculada nesta sessão — comparação indisponível.
          </p>
        </div>
      )}

      {Object.keys(result.customMetrics).length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-medium text-lab-muted uppercase tracking-wide mb-4">Métricas específicas</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Object.entries(result.customMetrics).map(([key, val]) => (
              <MetricCard key={key} metric={key} label={test.metricLabels[key] ?? key} value={val}
                unit={key.includes('Rate') || key.includes('accuracy') ? '' : key.includes('Cost') || key.includes('RT') ? ' ms' : ''} />
            ))}
          </div>
        </div>
      )}

      {Object.keys(result.conditionMetrics).length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-medium text-lab-muted uppercase tracking-wide mb-4">Condições</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(result.conditionMetrics).map(([cond, metrics]) => (
              <div key={cond} className="card p-4">
                <h4 className="text-sm font-medium capitalize mb-2">{cond.replace(/_/g, ' ')}</h4>
                {Object.entries(metrics).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm py-1">
                    <span className="text-lab-muted">{k}</span>
                    <span className="font-mono">{v !== null ? (typeof v === 'number' ? v.toFixed(1) : v) : '—'}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <details className="mb-8 bg-lab-surface-2 border border-lab-border rounded-lg overflow-hidden group">
        <summary className="p-4 cursor-pointer font-medium select-none flex items-center justify-between">
          Condições da Sessão
          <span className="text-lab-muted group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <div className="p-4 pt-0 border-t border-lab-border text-sm text-lab-muted mt-4">
          <div className="flex justify-end mb-4">
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => {
                setEditingConditions((value) => !value)
                setConditionsSaved(false)
              }}
            >
              {editingConditions ? 'Cancelar edicao' : 'Editar condicoes'}
            </button>
          </div>

          {conditionsSaved && (
            <p className="text-lab-success mb-4">Condicoes atualizadas.</p>
          )}

          {editingConditions ? (
            <TestConditionsForm
              compact
              showLoadPrevious={false}
              initialConditions={session.checkIn}
              title="Editar condicoes"
              description="Atualize apenas o contexto da sessao. Os trials e as metricas nao serao recalculados."
              confirmLabel={savingConditions ? 'Salvando...' : 'Salvar condicoes'}
              skipLabel="Cancelar"
              onConfirm={handleConditionsSave}
              onSkip={() => setEditingConditions(false)}
            />
          ) : !session.checkIn || Object.keys(session.checkIn).length === 0 ? (
            <p>Condicoes nao registradas.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {renderConditionSection('Sono', session.checkIn.sleep)}
              {renderConditionSection('Estado Atual', session.checkIn.currentState)}
              {renderConditionSection('Substancias', session.checkIn.substances)}
              {renderConditionSection('Alimentacao', session.checkIn.nutrition)}
              {renderConditionSection('Ambiente', session.checkIn.environment)}
              {session.checkIn.notes && (
                <div className="col-span-full">
                  <h4 className="text-lab-fg font-medium mb-1">Observacoes</h4>
                  <p>{session.checkIn.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </details>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <BlockChart session={session} />
        <RTDistribution session={session} />
      </div>

      <div className="flex gap-3">
        <Link to={`/test/${session.testId}`} className="btn-primary">Repetir teste</Link>
        <Link to="/history" className="btn-secondary">Ver histórico</Link>
      </div>
    </div>
  )
}
