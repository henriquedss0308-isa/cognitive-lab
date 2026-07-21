import { Link } from 'react-router-dom'
import { BATTERIES } from '../batteries/presets'
import { Badge } from '../components/common/Badge'
import { Page, PageHeader } from '../components/common/Page'

export function Batteries() {
  return (
    <Page>
      <PageHeader
        title="Baterias"
        subtitle="Combinações pré-definidas de testes com rotação equilibrada."
      />

      <div className="space-y-3">
        {BATTERIES.filter((b) => b.id !== 'custom').map((battery) => (
          <article key={battery.id} className="card p-5">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="card-title">{battery.name}</h3>
              <span className="help-text shrink-0 whitespace-nowrap">
                {battery.estimatedMinutes}
              </span>
            </div>
            <p className="text-sm text-lab-muted mt-1 leading-relaxed">{battery.description}</p>

            <div className="flex flex-wrap gap-1.5 mt-4">
              {battery.tests.map((t) => (
                <Badge key={t}>{t.replace(/_/g, ' ')}</Badge>
              ))}
            </div>

            <div className="flex gap-2 mt-4 pt-4 hairline">
              {battery.tests[0] && (
                <Link to={`/test/${battery.tests[0]}`} className="btn-primary">
                  Iniciar com {battery.tests[0].replace(/_/g, ' ')}
                </Link>
              )}
              <Link to="/checkin" className="btn-secondary">Check-in</Link>
            </div>
          </article>
        ))}
      </div>

      <p className="help-text mt-6">
        Alterações frequentes no protocolo reduzem a comparabilidade entre sessões.
      </p>
    </Page>
  )
}