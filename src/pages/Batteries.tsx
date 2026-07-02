import { Link } from 'react-router-dom'
import { BATTERIES } from '../batteries/presets'

export function Batteries() {
  return (
    <div className="p-8 max-w-3xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Baterias</h1>
        <p className="text-lab-muted mt-1">
          Combinações pré-definidas de testes com rotação equilibrada.
        </p>
      </header>

      <div className="space-y-4">
        {BATTERIES.filter((b) => b.id !== 'custom').map((battery) => (
          <div key={battery.id} className="card p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium">{battery.name}</h3>
                <p className="text-sm text-lab-muted mt-1">{battery.description}</p>
                <p className="text-xs text-lab-muted mt-2">{battery.estimatedMinutes}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {battery.tests.map((t) => (
                <span key={t} className="text-xs bg-lab-surface-2 px-2 py-1 rounded border border-lab-border">
                  {t.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <Link to="/checkin" className="btn-secondary text-sm">Check-in</Link>
              {battery.tests[0] && (
                <Link to={`/test/${battery.tests[0]}`} className="btn-primary text-sm">
                  Iniciar com {battery.tests[0].replace(/_/g, ' ')}
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-lab-muted mt-6">
        Alterações frequentes no protocolo reduzem a comparabilidade entre sessões.
      </p>
    </div>
  )
}