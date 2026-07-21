import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getTest } from '../tests/registry'
import { MetricCard } from '../components/common/MetricTooltip'
import { DemoBadge, QualityBadge } from '../components/common/Badge'
import { Page, PageHeader, Section } from '../components/common/Page'
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
import {
  formatMetricDelta,
  formatMetricValue,
  getMetricLabel,
  sessionMedianPresentationKey,
} from '../metrics/presentation'
import { resolvePrimaryMetricValue } from '../metrics/primaryMetric'
import type { SessionRecord, TestConditions } from '../types'

const PHASE_LABELS: Record<string, string> = {
  familiarization: 'Familiarização — não entra no baseline',
  baseline_building: 'Construindo baseline pessoal',
  monitoring: 'Monitoramento longitudinal',
  insufficient_data: 'Dados insuficientes',
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
  const scoringVersion = result.scoringVersion

  const selection = selectReference({
    sessions: pool,
    session,
    testId: session.testId,
    protocolVersion: session.protocolVersion,
    metricKeys: test.baselineMetricKeys,
  })
  const reference = selection.reference
  const baseline = reference.stats

  const primaryValue = resolvePrimaryMetricValue(test, result)
  const primaryLabel = getMetricLabel(
    test.primaryMetricKey,
    test.metricLabels[test.primaryMetricKey]
  )
  const medianPresentationKey = sessionMedianPresentationKey(session.testId)

  // Sessão demo nunca é comparada ao baseline real do usuário.
  const zOutcome = session.isDemo
    ? ({ kind: 'not_monitoring' } as const)
    : evaluatePrimaryZ(primaryValue, baseline, test, session)

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
    <Page>
      <PageHeader
        title={test.name}
        eyebrow={
          <Link to="/history" className="text-xs text-lab-muted hover:text-lab-accent">
            ← Histórico
          </Link>
        }
        subtitle={
          <span className="flex items-center gap-2 flex-wrap">
            <span>
              {session.mode === 'assessment' ? 'Avaliação' : 'Treino'} ·{' '}
              {new Date(session.startedAt).toLocaleString('pt-BR')}
            </span>
            {session.isDemo && <DemoBadge />}
          </span>
        }
      />

      {/* Estado da sessão: qualidade e fase juntas, uma linha só. */}
      <div className="card px-4 py-3 mb-6 flex items-center gap-3 flex-wrap">
        <QualityBadge quality={result.quality} />
        {baseline.phase && (
          <>
            <span aria-hidden="true" className="text-lab-faint">·</span>
            <span className="text-sm text-lab-muted">{PHASE_LABELS[baseline.phase]}</span>
          </>
        )}
      </div>

      {result.flagMessages.length > 0 && (
        <div className="card p-4 mb-6 border-lab-warning/40">
          <h3 className="card-title mb-2">Avisos de qualidade</h3>
          <ul className="text-sm text-lab-muted space-y-1.5">
            {result.flagMessages.map((m, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden="true" className="text-lab-warning shrink-0">·</span>
                <span>{m}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        <MetricCard
          emphasis
          metric={test.primaryMetricKey}
          label={`Métrica principal · ${primaryLabel}`}
          value={primaryValue}
        />
        <MetricCard metric="accuracy" value={result.accuracyMetrics.accuracy} />
        <MetricCard metric={medianPresentationKey} value={result.rtMetrics.medianCorrectRT} />
        <MetricCard metric="rtCV" label="Variabilidade (CV)" value={result.rtMetrics.rtCoefficientOfVariation} />
      </div>

      {zOutcome.kind !== 'not_monitoring' && zOutcome.kind !== 'no_baseline_metric' && (
        <div className="card p-5 mb-6">
          <h3 className="section-title">Comparado ao seu próprio baseline</h3>
          {zOutcome.kind === 'ok' && (
            <>
              <p className="metric-value text-3xl mt-3">
                z = {formatMetricValue('zScore', zOutcome.z)}
              </p>
              <p className="help-text mt-2 max-w-prose">
                z positivo = melhor que o seu habitual nesta métrica.
                Baseado em {zOutcome.n} de {baseline.baselineCount} sessões de baseline
                {baseline.warningCount > 0 && ` (${baseline.warningCount} com avisos)`}.
                Diferenças pequenas podem não ser significativas.
              </p>
            </>
          )}
          {zOutcome.kind === 'value_missing' && (
            <p className="text-sm text-lab-muted mt-2 max-w-prose">
              A métrica principal não pôde ser calculada nesta sessão — comparação indisponível.
            </p>
          )}
          {zOutcome.kind === 'insufficient_n' && (
            <p className="text-sm text-lab-muted mt-2 max-w-prose">
              Baseline com poucos valores nesta métrica ({zOutcome.n} de {baseline.baselineCount})
              — comparação por desvio suprimida para evitar conclusões instáveis.
            </p>
          )}
          {zOutcome.kind === 'zero_mad' && (
            <p className="text-sm text-lab-muted mt-2 max-w-prose">
              A variabilidade do seu baseline nesta métrica é ≈ 0 (valores quase idênticos), então o
              desvio padronizado não é informativo. Mediana do baseline:{' '}
              {formatMetricValue(test.primaryMetricKey, zOutcome.median)}
              {zOutcome.delta !== null &&
                ` · diferença desta sessão: ${formatMetricDelta(test.primaryMetricKey, zOutcome.delta)}`}
              .
            </p>
          )}
          {/* Qual referência serviu de comparação, e por quê. */}
          {!session.isDemo && (
            <div className="mt-4 pt-4 hairline">
              <ReferenceBadge selection={selection} />
            </div>
          )}
        </div>
      )}

      {/*
        Contexto da sessão comparado à referência utilizada.

        Puramente descritivo: nenhum destes campos entra em métrica, z-score ou
        seleção de referência — só o estado medicamentoso seleciona referência,
        e isso já aconteceu acima.
      */}
      {Object.keys(result.customMetrics).length > 0 && (
        <Section title="Métricas específicas">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(result.customMetrics).map(([key, val]) => (
              <MetricCard
                key={key}
                metric={key}
                label={getMetricLabel(key, test.metricLabels[key])}
                value={val}
              />
            ))}
          </div>
        </Section>
      )}

      {Object.keys(result.conditionMetrics).length > 0 && (
        <Section title="Condições">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Object.entries(result.conditionMetrics).map(([cond, metrics]) => (
              <div key={cond} className="card p-4">
                <h4 className="card-title capitalize mb-2">{cond.replace(/_/g, ' ')}</h4>
                <dl>
                  {Object.entries(metrics).map(([k, v]) => (
                    <div
                      key={k}
                      className="flex justify-between gap-3 text-sm py-1.5 border-b border-lab-border last:border-b-0"
                    >
                      <dt className="text-lab-muted">{getMetricLabel(k)}</dt>
                      <dd className="metric-value text-sm">
                        {formatMetricValue(k, v)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </Section>
      )}

      {!session.isDemo && reference.metadata.sessionCount > 0 && contextComparison.hasAnyData && (
        <Section title="Contexto da sessão comparado à referência utilizada">
          <div className="card p-5">
            <SessionContextComparison
              comparison={contextComparison}
              referenceKind={reference.metadata.kind}
              referenceCount={reference.metadata.sessionCount}
            />
          </div>
        </Section>
      )}

      {!session.isDemo && (
        <details className="section-toggle group mb-10">
          <summary>
            Composição das referências deste teste
            <span aria-hidden="true" className="text-lab-faint text-[0.625rem] group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="px-4 pb-5 pt-4 border-t border-lab-border">
            <ReferenceComposition
              selection={selection}
              general={buildGeneralReference(...referenceArgs, scoringVersion)}
              taken={buildContextualReference(...referenceArgs, 'taken', scoringVersion)}
              notTaken={buildContextualReference(...referenceArgs, 'not_taken', scoringVersion)}
            />
          </div>
        </details>
      )}

      {/*
        Contexto emocional — seção própria e sempre visível quando existe.
        Puramente descritiva: não entra em nenhuma métrica acima nem é
        relacionada ao desempenho da sessão.
      */}
      {hasEmotionalContent(session.checkIn?.emotionalContext) && (
        <Section title="Contexto emocional">
          <div className="card p-5 text-sm text-lab-muted">
            <EmotionalContextSummary
              context={session.checkIn?.emotionalContext}
              relationshipLabel={settings.relationshipLabel}
            />
          </div>
        </Section>
      )}

      <details className="section-toggle group mb-10">
        <summary>
          Condições da Sessão
          <span aria-hidden="true" className="text-lab-faint text-[0.625rem] group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <div className="px-4 pb-5 pt-4 border-t border-lab-border text-sm text-lab-muted">
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

      <Section title="Distribuições desta sessão">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <BlockChart session={session} />
          <RTDistribution session={session} />
        </div>
      </Section>

      <div className="flex gap-2 pt-2">
        <Link to={`/test/${session.testId}`} className="btn-primary">Repetir teste</Link>
        <Link to="/history" className="btn-secondary">Ver histórico</Link>
      </div>
    </Page>
  )
}
