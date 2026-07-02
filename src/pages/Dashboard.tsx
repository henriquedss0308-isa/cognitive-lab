import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { getIncompleteSessions } from '../storage/repository'
import { ALL_TESTS, DOMAIN_LABELS } from '../tests/registry'
import { computeBaselineStats } from '../statistics/baseline'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function Dashboard() {
  const { sessions, settings } = useApp()
  const [incompleteCount, setIncompleteCount] = useState(0)

  useEffect(() => {
    getIncompleteSessions().then((s) => setIncompleteCount(s.length))
  }, [sessions])

  const realSessions = sessions.filter((s) => !s.isDemo && s.mode === 'assessment')
  const lastSession = realSessions[0] ?? sessions[0]

  const testsWithBaseline = ALL_TESTS.filter((t) => {
    const stats = computeBaselineStats(sessions, t.id, t.protocolVersion, t.baselineMetricKeys)
    return stats.phase === 'monitoring'
  }).length

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-lab-muted mt-1">
          {settings.demoDataActive && (
            <span className="text-lab-warning mr-2">[Demonstração]</span>
          )}
          Comparado ao seu próprio baseline e histórico.
        </p>
      </header>

      {incompleteCount > 0 && (
        <div className="card p-4 mb-6 border-lab-warning/40">
          <p className="text-sm">
            {incompleteCount} sessão(ões) incompleta(s).{' '}
            <Link to="/settings" className="text-lab-accent hover:underline">
              Ver em Configurações
            </Link>
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card p-5">
          <div className="text-xs text-lab-muted uppercase tracking-wide">Baseline</div>
          <div className="text-3xl font-mono mt-1">{testsWithBaseline}/{ALL_TESTS.length}</div>
          <p className="text-xs text-lab-muted mt-2">testes com baseline suficiente</p>
        </div>
        <div className="card p-5">
          <div className="text-xs text-lab-muted uppercase tracking-wide">Sessões</div>
          <div className="text-3xl font-mono mt-1">{realSessions.length}</div>
          <p className="text-xs text-lab-muted mt-2">avaliações registradas</p>
        </div>
        <div className="card p-5">
          <div className="text-xs text-lab-muted uppercase tracking-wide">Última sessão</div>
          <div className="text-lg font-medium mt-1">
            {lastSession
              ? format(new Date(lastSession.startedAt), "d MMM, HH:mm", { locale: ptBR })
              : '—'}
          </div>
          <p className="text-xs text-lab-muted mt-2">
            {lastSession ? ALL_TESTS.find((t) => t.id === lastSession.testId)?.shortName : 'Nenhuma sessão ainda'}
          </p>
        </div>
      </div>

      <section className="mb-8">
        <h2 className="text-sm font-medium text-lab-muted uppercase tracking-wide mb-4">Início rápido</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link to="/batteries" className="card p-5 hover:border-lab-accent/50 transition-colors block">
            <h3 className="font-medium">Iniciar bateria</h3>
            <p className="text-sm text-lab-muted mt-1">Check-in rápido, diária ou padrão</p>
          </Link>
          <Link to="/catalog" className="card p-5 hover:border-lab-accent/50 transition-colors block">
            <h3 className="font-medium">Teste individual</h3>
            <p className="text-sm text-lab-muted mt-1">Escolha um teste do catálogo</p>
          </Link>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-lab-muted uppercase tracking-wide mb-4">Domínios</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(DOMAIN_LABELS).slice(0, 8).map(([key, label]) => (
            <div key={key} className="card p-3">
              <div className="text-xs text-lab-muted">{label}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}