import { Link, useParams } from 'react-router-dom'
import { getTest } from '../tests/registry'
import { DOMAIN_LABELS } from '../tests/registry'
import { useApp } from '../context/AppContext'
import { computeBaselineStats } from '../statistics/baseline'
import { LongitudinalChart } from '../components/charts/SessionCharts'
import {
  buildContextualReference,
  buildGeneralReference,
} from '../features/context-aware-baseline/contextualReference'
import { selectReference } from '../features/context-aware-baseline/referenceSelection'
import { ReferenceComposition } from '../features/context-aware-baseline/components/ReferenceComposition'
import { Page, PageHeader } from '../components/common/Page'
import type { TestId } from '../types'

export function TestDetail() {
  const { testId } = useParams<{ testId: TestId }>()
  const { sessions } = useApp()
  const test = testId ? getTest(testId) : null

  if (!test) return <div className="p-8">Teste não encontrado.</div>

  const baseline = computeBaselineStats(
    sessions,
    test.id,
    test.protocolVersion,
    test.baselineMetricKeys,
    test.scoringVersion
  )
  const testSessions = sessions.filter((s) => s.testId === test.id && s.mode === 'assessment')

  const referenceArgs = [sessions, test.id, test.protocolVersion, test.baselineMetricKeys] as const
  // Sem sessão corrente aqui: a inspeção é do estado das referências do teste,
  // então basta um contexto neutro para obter o progresso das duas janelas.
  const selection = selectReference({
    sessions,
    session: {
      checkIn: undefined,
      testId: test.id,
      protocolVersion: test.protocolVersion,
      result: { scoringVersion: test.scoringVersion },
    },
    testId: test.id,
    protocolVersion: test.protocolVersion,
    metricKeys: test.baselineMetricKeys,
  })

  return (
    <Page>
      <PageHeader
        title={test.name}
        subtitle={DOMAIN_LABELS[test.domain]}
        eyebrow={
          <Link to="/catalog" className="text-xs text-lab-muted hover:text-lab-accent">
            ← Catálogo
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        <div className="card p-5">
          <h3 className="card-title mb-2">O que mede</h3>
          <p className="text-sm text-lab-muted leading-relaxed">{test.description}</p>
        </div>
        <div className="card p-5">
          <h3 className="card-title mb-2">O que NÃO mede</h3>
          <p className="text-sm text-lab-muted leading-relaxed">
            Não diagnostica TDAH, transtornos cognitivos, doenças neurológicas, déficits clínicos ou QI.
            Não fornece percentis populacionais.
          </p>
        </div>
      </div>

      <div className="card grid grid-cols-2 md:grid-cols-4 divide-x divide-lab-border mb-8">
        <div className="p-4">
          <div className="section-title">Protocolo</div>
          <div className="metric-value text-sm mt-1.5">{test.protocolVersion}</div>
        </div>
        <div className="p-4">
          <div className="section-title">Ensaios</div>
          <div className="metric-value text-sm mt-1.5">{test.assessmentConfig.trialCount}</div>
        </div>
        <div className="p-4">
          <div className="section-title">Baseline</div>
          <div className="text-sm mt-1.5">{baseline.sessionCount} sessões</div>
          <div className="help-text">fase {baseline.phase}</div>
        </div>
        <div className="p-4">
          <div className="section-title">Duração</div>
          <div className="text-sm mt-1.5">{test.duration}</div>
        </div>
      </div>

      {testSessions.length >= 2 && (
        <LongitudinalChart
          sessions={testSessions}
          metricKey={test.primaryMetricKey}
          label={test.metricLabels[test.primaryMetricKey] ?? test.primaryMetricKey}
        />
      )}

      <details className="section-toggle group mt-6">
        <summary>
          Composição das referências
          <span aria-hidden="true" className="text-lab-faint text-[0.625rem] group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <div className="px-4 pb-5 pt-4 border-t border-lab-border">
          <ReferenceComposition
            selection={selection}
            general={buildGeneralReference(...referenceArgs, test.scoringVersion)}
            taken={buildContextualReference(...referenceArgs, 'taken', test.scoringVersion)}
            notTaken={buildContextualReference(...referenceArgs, 'not_taken', test.scoringVersion)}
          />
        </div>
      </details>

      <div className="mt-6">
        <Link to={`/test/${test.id}`} className="btn-primary">Iniciar teste</Link>
      </div>
    </Page>
  )
}
