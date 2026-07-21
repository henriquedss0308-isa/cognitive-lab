import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { getIncompleteSessions } from '../storage/repository'
import { ALL_TESTS, DOMAIN_LABELS } from '../tests/registry'
import { computeBaselineStats } from '../statistics/baseline'
import { Badge, DemoBadge } from '../components/common/Badge'
import { Page, PageHeader, Section } from '../components/common/Page'
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

  const lastTest = lastSession
    ? ALL_TESTS.find((t) => t.id === lastSession.testId)?.shortName
    : null

  return (
    <Page width="wide">
      <PageHeader
        title="Dashboard"
        subtitle="Comparado ao seu próprio baseline e histórico."
        eyebrow={settings.demoDataActive ? <DemoBadge /> : undefined}
      />

      {incompleteCount > 0 && (
        <div className="card p-4 mb-6 flex items-center justify-between gap-4 border-lab-warning/40">
          <p className="text-sm text-lab-text">
            {incompleteCount} {incompleteCount === 1 ? 'sessão incompleta' : 'sessões incompletas'}.
          </p>
          <Link to="/settings" className="btn-secondary shrink-0">
            Revisar
          </Link>
        </div>
      )}

      {/*
        Resumo em três medidas. Uma régua entre elas em vez de três cartões
        separados: é um bloco só de estado, não três coisas distintas.
      */}
      <div className="card grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-lab-border mb-10">
        <div className="p-5">
          <div className="section-title">Baseline</div>
          <div className="metric-value text-3xl mt-2">
            {testsWithBaseline}
            <span className="text-lab-muted text-xl">/{ALL_TESTS.length}</span>
          </div>
          <p className="help-text mt-1.5">testes com baseline suficiente</p>
        </div>
        <div className="p-5">
          <div className="section-title">Sessões</div>
          <div className="metric-value text-3xl mt-2">{realSessions.length}</div>
          <p className="help-text mt-1.5">avaliações registradas</p>
        </div>
        <div className="p-5">
          <div className="section-title">Última sessão</div>
          <div className="metric-value text-xl mt-2">
            {lastSession
              ? format(new Date(lastSession.startedAt), "d MMM, HH:mm", { locale: ptBR })
              : '—'}
          </div>
          <p className="help-text mt-1.5">{lastTest ?? 'Nenhuma sessão ainda'}</p>
        </div>
      </div>

      <Section title="Início rápido">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Link
            to="/batteries"
            className="card p-5 hover:border-lab-border-strong hover:bg-lab-surface-2 transition-colors block"
          >
            <h3 className="card-title">Iniciar bateria</h3>
            <p className="text-sm text-lab-muted mt-1">Check-in rápido, diária ou padrão</p>
          </Link>
          <Link
            to="/catalog"
            className="card p-5 hover:border-lab-border-strong hover:bg-lab-surface-2 transition-colors block"
          >
            <h3 className="card-title">Teste individual</h3>
            <p className="text-sm text-lab-muted mt-1">Escolha um teste do catálogo</p>
          </Link>
        </div>
      </Section>

      <Section
        title="Domínios"
        description="Áreas cognitivas cobertas pelos testes deste instrumento."
      >
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(DOMAIN_LABELS).slice(0, 8).map(([key, label]) => (
            <Badge key={key}>{label}</Badge>
          ))}
        </div>
      </Section>
    </Page>
  )
}