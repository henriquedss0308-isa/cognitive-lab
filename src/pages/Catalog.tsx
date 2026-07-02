import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { ALL_TESTS, DOMAIN_LABELS } from '../tests/registry'
import { computeBaselineStats } from '../statistics/baseline'

const PHASE_LABELS: Record<string, string> = {
  familiarization: 'Familiarização',
  baseline_building: 'Construindo baseline',
  monitoring: 'Monitoramento',
  insufficient_data: 'Dados insuficientes',
}

export function Catalog() {
  const { sessions } = useApp()

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Catálogo de Testes</h1>
        <p className="text-lab-muted mt-1">8 testes cognitivos padronizados</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ALL_TESTS.map((test) => {
          const stats = computeBaselineStats(sessions, test.id, test.protocolVersion, test.baselineMetricKeys)
          const last = sessions.find((s) => s.testId === test.id && s.mode === 'assessment')
          const phaseLabel = PHASE_LABELS[stats.phase] ?? stats.phase

          return (
            <div key={test.id} className="card p-5 flex flex-col">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-medium">{test.name}</h3>
                  <span className="text-xs text-lab-accent">{DOMAIN_LABELS[test.domain]}</span>
                </div>
                <span className="text-xs text-lab-muted">{test.duration}</span>
              </div>
              <p className="text-sm text-lab-muted flex-1">{test.description}</p>
              <div className="flex items-center gap-4 mt-3 text-xs text-lab-muted">
                <span>Baseline: {phaseLabel}</span>
                {last?.result && (
                  <span>
                    Último RT: {last.result.rtMetrics.medianCorrectRT?.toFixed(0) ?? '—'} ms
                  </span>
                )}
              </div>
              <div className="flex gap-2 mt-4">
                <Link to={`/test/${test.id}`} className="btn-primary text-center flex-1">
                  Iniciar
                </Link>
                <Link to={`/test/${test.id}/detail`} className="btn-secondary text-center">
                  Detalhes
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}