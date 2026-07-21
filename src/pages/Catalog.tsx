import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { ALL_TESTS, DOMAIN_LABELS } from '../tests/registry'
import { computeBaselineStats } from '../statistics/baseline'
import { Badge } from '../components/common/Badge'
import { Page, PageHeader } from '../components/common/Page'

const PHASE_LABELS: Record<string, string> = {
  familiarization: 'Familiarização',
  baseline_building: 'Construindo baseline',
  monitoring: 'Monitoramento',
  insufficient_data: 'Dados insuficientes',
}

export function Catalog() {
  const { sessions } = useApp()

  return (
    <Page width="wide">
      <PageHeader
        title="Catálogo de Testes"
        subtitle={`${ALL_TESTS.length} testes cognitivos padronizados`}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {ALL_TESTS.map((test) => {
          const stats = computeBaselineStats(sessions, test.id, test.protocolVersion, test.baselineMetricKeys)
          const last = sessions.find((s) => s.testId === test.id && s.mode === 'assessment')
          const phaseLabel = PHASE_LABELS[stats.phase] ?? stats.phase

          return (
            <article
              key={test.id}
              className="card p-5 flex flex-col hover:border-lab-border-strong transition-colors"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <h3 className="card-title">{test.name}</h3>
                  <span className="help-text">{DOMAIN_LABELS[test.domain]}</span>
                </div>
                <span className="help-text shrink-0 whitespace-nowrap">{test.duration}</span>
              </div>

              <p className="text-sm text-lab-muted flex-1 leading-relaxed">{test.description}</p>

              <div className="flex items-center gap-2 flex-wrap mt-4">
                <Badge>{phaseLabel}</Badge>
                {last?.result?.rtMetrics.medianCorrectRT != null && (
                  <Badge title="RT mediano da última avaliação">
                    Último RT · {last.result.rtMetrics.medianCorrectRT.toFixed(0)} ms
                  </Badge>
                )}
              </div>

              <div className="flex gap-2 mt-4 pt-4 hairline">
                <Link to={`/test/${test.id}`} className="btn-primary flex-1">
                  Iniciar
                </Link>
                <Link to={`/test/${test.id}/detail`} className="btn-secondary">
                  Detalhes
                </Link>
              </div>
            </article>
          )
        })}
      </div>
    </Page>
  )
}