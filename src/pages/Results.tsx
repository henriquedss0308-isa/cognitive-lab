import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getTest } from '../tests/registry'
import { MetricCard } from '../components/common/MetricTooltip'
import { BlockChart, RTDistribution } from '../components/charts/SessionCharts'
import { TestConditionsForm } from '../components/test/TestConditionsForm'
import { EmotionalContextSummary } from '../features/emotion-lab/components/EmotionalContextSummary'
import { hasEmotionalContent } from '../features/emotion-lab/emotionalContext'
import { evaluatePrimaryZ } from '../statistics/zscore'
import { selectReference } from '../features/context-aware-baseline/referenceSelection'
import {
  buildContextualReference,
  buildGeneralReference,
} from '../features/context-aware-baseline/contextualReference'
import { buildContextComparison } from '../features/context-aware-baseline/contextSummary'
import {
  getSessionLisdexamfetamineStatus,
  getSessionMedicationRecord,
  lisdexamfetamineStatusLabel,
} from '../features/context-aware-baseline/medicationContext'
import { ReferenceBadge } from '../features/context-aware-baseline/components/ReferenceBadge'
import { ReferenceComposition } from '../features/context-aware-baseline/components/ReferenceComposition'
import { SessionContextComparison } from '../features/context-aware-baseline/components/SessionContextComparison'
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
  const { sessions, settings, loading: appLoading, refresh, editSessionConditions } = useApp()
  const [loadState, setLoadState] = useState<ResultsLoadState>('loading')
  const [session, setSession] = useState<SessionRecord | undefined>()
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editingConditions, setEditingConditions] = useState(false)
  const [savingConditions, setSavingConditions] = useState(false)
  const [conditionsSaved, setConditionsSaved] = useState(false)
  const [conditionsError, setConditionsError] = useState<string | null>(null)

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

  // A própria sessão nunca entra na referência com que é comparada — é isso
  // que faz a nona sessão de um contexto ser a primeira comparável à janela
  // já completa daquele contexto.
  const pool = sessions.filter((s) => s.sessionId !== sessionId)
  const referenceArgs = [
    pool,
    session.testId,
    session.protocolVersion,
    test.baselineMetricKeys,
  ] as const

  const selection = selectReference({
    sessions: pool,
    session,
    testId: session.testId,
    protocolVersion: session.protocolVersion,
    metricKeys: test.baselineMetricKeys,
  })
  const reference = selection.reference
  const baseline = reference.stats

  const primaryValue = result.customMetrics[test.primaryMetricKey] ??
    result.rtMetrics.medianCorrectRT

  // Sessão demo nunca é comparada ao baseline real do usuário.
  const zOutcome = session.isDemo
    ? ({ kind: 'not_monitoring' } as const)
    : evaluatePrimaryZ(primaryValue, baseline, test)

  const contextComparison = buildContextComparison(session, reference.sessions)
  const medicationRecord = getSessionMedicationRecord(session)

  const handleConditionsSave = async (conditions: TestConditions) => {
    if (!session) return
    setSavingConditions(true)
    setConditionsSaved(false)
    setConditionsError(null)
    try {
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
      setEditingConditions(false)
      setConditionsSaved(true)
    } catch {
      // Falha de persistência não pode deixar o formulário preso em "Salvando...".
      // Mensagem sem detalhe do conteúdo: contexto emocional não vai para log.
      setConditionsError(
        'Não foi possível salvar as condições. Seus resultados e ensaios não foram alterados. Tente novamente.'
      )
    } finally {
      setSavingConditions(false)
    }
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

      {zOutcome.kind !== 'not_monitoring' && zOutcome.kind !== 'no_baseline_metric' && (
        <div className="card p-4 mb-6">
          <h3 className="text-sm font-medium">Comparado ao seu próprio baseline</h3>
          {zOutcome.kind === 'ok' && (
            <>
              <p className="text-2xl font-mono mt-1">z = {zOutcome.z.toFixed(2)}</p>
              <p className="text-xs text-lab-muted mt-1">
                z positivo = melhor que o seu habitual nesta métrica.
                Baseado em {zOutcome.n} de {baseline.baselineCount} sessões de baseline
                {baseline.warningCount > 0 && ` (${baseline.warningCount} com avisos)`}.
                Diferenças pequenas podem não ser significativas.
              </p>
            </>
          )}
          {zOutcome.kind === 'value_missing' && (
            <p className="text-sm text-lab-muted mt-1">
              A métrica principal não pôde ser calculada nesta sessão — comparação indisponível.
            </p>
          )}
          {zOutcome.kind === 'insufficient_n' && (
            <p className="text-sm text-lab-muted mt-1">
              Baseline com poucos valores nesta métrica ({zOutcome.n} de {baseline.baselineCount})
              — comparação por desvio suprimida para evitar conclusões instáveis.
            </p>
          )}
          {zOutcome.kind === 'zero_mad' && (
            <p className="text-sm text-lab-muted mt-1">
              A variabilidade do seu baseline nesta métrica é ≈ 0 (valores quase idênticos), então o
              desvio padronizado não é informativo. Mediana do baseline: {zOutcome.median?.toFixed(2)}
              {zOutcome.delta !== null &&
                ` · diferença desta sessão: ${zOutcome.delta > 0 ? '+' : ''}${zOutcome.delta.toFixed(2)}`}
              .
            </p>
          )}
          {/* Qual referência serviu de comparação, e por quê. */}
          {!session.isDemo && <ReferenceBadge selection={selection} />}
        </div>
      )}

      {/*
        Contexto da sessão comparado à referência utilizada.

        Puramente descritivo: nenhum destes campos entra em métrica, z-score ou
        seleção de referência — só o estado medicamentoso seleciona referência,
        e isso já aconteceu acima.
      */}
      {!session.isDemo && reference.metadata.sessionCount > 0 && contextComparison.hasAnyData && (
        <section className="card p-5 mb-8">
          <h3 className="text-sm font-medium text-lab-muted uppercase tracking-wide mb-4">
            Contexto da sessão comparado à referência utilizada
          </h3>
          <SessionContextComparison
            comparison={contextComparison}
            referenceKind={reference.metadata.kind}
            referenceCount={reference.metadata.sessionCount}
          />
        </section>
      )}

      {!session.isDemo && (
        <details className="mb-8 bg-lab-surface-2 border border-lab-border rounded-lg overflow-hidden group">
          <summary className="p-4 cursor-pointer font-medium select-none flex items-center justify-between">
            Composição das referências deste teste
            <span className="text-lab-muted group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="p-4 pt-4 border-t border-lab-border">
            <ReferenceComposition
              selection={selection}
              general={buildGeneralReference(...referenceArgs)}
              taken={buildContextualReference(...referenceArgs, 'taken')}
              notTaken={buildContextualReference(...referenceArgs, 'not_taken')}
            />
          </div>
        </details>
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

      {/*
        Contexto emocional — seção própria e sempre visível quando existe.
        Puramente descritiva: não entra em nenhuma métrica acima nem é
        relacionada ao desempenho da sessão.
      */}
      {hasEmotionalContent(session.checkIn?.emotionalContext) && (
        <section className="card p-5 mb-8">
          <h3 className="text-sm font-medium text-lab-muted uppercase tracking-wide mb-4">
            Contexto emocional
          </h3>
          <div className="text-sm text-lab-muted">
            <EmotionalContextSummary
              context={session.checkIn?.emotionalContext}
              relationshipLabel={settings.relationshipLabel}
            />
          </div>
        </section>
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
                setConditionsError(null)
              }}
            >
              {editingConditions ? 'Cancelar edicao' : 'Editar condicoes'}
            </button>
          </div>

          {conditionsSaved && (
            <p className="text-lab-success mb-4">Condicoes atualizadas.</p>
          )}

          {conditionsError && (
            <p className="text-lab-danger mb-4" role="alert">{conditionsError}</p>
          )}

          {editingConditions ? (
            <TestConditionsForm
              compact
              showLoadPrevious={false}
              relationshipLabel={settings.relationshipLabel}
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
              {/* Registro estruturado: vive fora de `substances` e tem rótulos próprios. */}
              <div className="mb-4">
                <h4 className="text-lab-fg font-medium mb-1">Lisdexanfetamina</h4>
                <ul className="space-y-1">
                  <li>
                    Registro:{' '}
                    {lisdexamfetamineStatusLabel(getSessionLisdexamfetamineStatus(session))}
                  </li>
                  {medicationRecord?.dose && <li>Dose: {medicationRecord.dose}</li>}
                  {medicationRecord?.time && <li>Horario: {medicationRecord.time}</li>}
                </ul>
              </div>
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
