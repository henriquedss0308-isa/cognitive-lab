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
import type { TestId } from '../types'

export function TestDetail() {
  const { testId } = useParams<{ testId: TestId }>()
  const { sessions } = useApp()
  const test = testId ? getTest(testId) : null

  if (!test) return <div className="p-8">Teste não encontrado.</div>

  const baseline = computeBaselineStats(sessions, test.id, test.protocolVersion, test.baselineMetricKeys)
  const testSessions = sessions.filter((s) => s.testId === test.id && s.mode === 'assessment')

  const referenceArgs = [sessions, test.id, test.protocolVersion, test.baselineMetricKeys] as const
  // Sem sessão corrente aqui: a inspeção é do estado das referências do teste,
  // então basta um contexto neutro para obter o progresso das duas janelas.
  const selection = selectReference({
    sessions,
    session: { checkIn: undefined, testId: test.id, protocolVersion: test.protocolVersion },
    testId: test.id,
    protocolVersion: test.protocolVersion,
    metricKeys: test.baselineMetricKeys,
  })

  return (
    <div className="p-8 max-w-3xl">
      <Link to="/catalog" className="text-sm text-lab-muted hover:text-lab-accent">← Catálogo</Link>
      <h1 className="text-2xl font-semibold mt-2">{test.name}</h1>
      <p className="text-lab-accent text-sm">{DOMAIN_LABELS[test.domain]}</p>

      <div className="card p-5 mt-6 mb-6">
        <h3 className="font-medium mb-2">O que mede</h3>
        <p className="text-sm text-lab-muted">{test.description}</p>
      </div>

      <div className="card p-5 mb-6">
        <h3 className="font-medium mb-2">O que NÃO mede</h3>
        <p className="text-sm text-lab-muted">
          Não diagnostica TDAH, transtornos cognitivos, doenças neurológicas, déficits clínicos ou QI.
          Não fornece percentis populacionais.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-xs text-lab-muted">Protocolo</div>
          <div className="font-mono text-sm mt-1">{test.protocolVersion}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-lab-muted">Ensaios (avaliação)</div>
          <div className="font-mono text-sm mt-1">{test.assessmentConfig.trialCount}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-lab-muted">Baseline</div>
          <div className="text-sm mt-1">{baseline.sessionCount} sessões · fase {baseline.phase}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-lab-muted">Duração</div>
          <div className="text-sm mt-1">{test.duration}</div>
        </div>
      </div>

      {testSessions.length >= 2 && (
        <LongitudinalChart
          sessions={testSessions}
          metricKey={test.primaryMetricKey}
          label={test.metricLabels[test.primaryMetricKey] ?? test.primaryMetricKey}
        />
      )}

      <details className="mt-6 bg-lab-surface-2 border border-lab-border rounded-lg overflow-hidden group">
        <summary className="p-4 cursor-pointer font-medium select-none flex items-center justify-between">
          Composição das referências
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

      <div className="mt-6">
        <Link to={`/test/${test.id}`} className="btn-primary">Iniciar teste</Link>
      </div>
    </div>
  )
}