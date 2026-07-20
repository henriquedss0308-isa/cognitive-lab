import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { exportFullBackup, downloadJSON, downloadCSV, trialsToCSV, resultsToCSV, importBackup } from '../storage/export'
import { getIncompleteSessions, updateSessionStatus } from '../storage/repository'
import { canResumeSession, resumeBlockedReason } from '../storage/sessionRecovery'
import { getTest } from '../tests/registry'
import type { SessionRecord } from '../types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function Settings() {
  const { sessions, settings, clearAll, clearDemo, updateSettings, removeSession, refresh } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const [incomplete, setIncomplete] = useState<SessionRecord[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    getIncompleteSessions().then(setIncomplete)
  }, [sessions])

  const handleExportJSON = async () => {
    const backup = await exportFullBackup()
    downloadJSON(backup, `cognitive-lab-backup-${Date.now()}.json`)
  }

  const handleExportTrials = () => {
    downloadCSV(trialsToCSV(sessions), `cognitive-lab-trials-${Date.now()}.csv`)
  }

  const handleExportResults = () => {
    downloadCSV(resultsToCSV(sessions), `cognitive-lab-results-${Date.now()}.csv`)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    let data: unknown
    try {
      data = JSON.parse(await file.text())
    } catch {
      alert('Arquivo não é um JSON válido — nada foi importado.')
      return
    }
    try {
      const result = await importBackup(data)
      const detail =
        result.rejected.length > 0
          ? '\n\nRejeitadas:\n' +
            result.rejected
              .slice(0, 10)
              .map((r) => `· ${r.sessionId}: ${r.reason}`)
              .join('\n')
          : ''
      alert(result.message + detail)
      if (result.imported > 0) window.location.reload()
    } catch (err) {
      alert(
        `Falha ao importar: ${err instanceof Error ? err.message : 'erro desconhecido'}. Nenhum dado local foi alterado.`
      )
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Dados e Configurações</h1>
        <p className="text-lab-muted mt-1">Local-first — seus dados permanecem neste dispositivo.</p>
      </header>

      {incomplete.length > 0 && (
        <section className="card p-5 mb-6 border-lab-warning/40">
          <h2 className="font-medium mb-2">Sessões incompletas</h2>
          <p className="text-sm text-lab-muted mb-4">
            Avaliações interrompidas não entram no baseline. Protocolos fixos devem ser reiniciados.
          </p>
          <ul className="space-y-3">
            {incomplete.map((s) => {
              const test = getTest(s.testId)
              const canResume = canResumeSession(s)
              const blockReason = resumeBlockedReason(s)
              return (
                <li key={s.sessionId} className="border border-lab-border rounded-lg p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-medium">{test.shortName}</span>
                      <span className="text-lab-muted text-sm ml-2">
                        {format(new Date(s.startedAt), "d MMM HH:mm", { locale: ptBR })}
                      </span>
                      <span className="text-xs text-lab-warning ml-2">{s.status}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="btn-secondary text-sm"
                        onClick={() => setExpandedId(expandedId === s.sessionId ? null : s.sessionId)}
                      >
                        Ver ensaios ({s.trials.length})
                      </button>
                      {canResume ? (
                        <Link
                          className="btn-primary text-sm"
                          to={`/test/${s.testId}?resume=${s.sessionId}`}
                        >
                          Continuar
                        </Link>
                      ) : (
                        <Link className="btn-secondary text-sm" to={`/test/${s.testId}`}>
                          Reiniciar
                        </Link>
                      )}
                      <button
                        className="btn-secondary text-sm text-lab-danger"
                        onClick={async () => {
                          await updateSessionStatus(s.sessionId, 'abandoned', {
                            flags: { incomplete: true },
                            quality: 'invalid',
                            flagMessages: ['Sessão descartada pelo usuário.'],
                          })
                          await removeSession(s.sessionId)
                          await refresh()
                        }}
                      >
                        Descartar
                      </button>
                    </div>
                  </div>
                  {!canResume && blockReason && (
                    <p className="text-xs text-lab-muted mt-2">{blockReason}</p>
                  )}
                  {expandedId === s.sessionId && s.trials.length > 0 && (
                    <p className="text-xs text-lab-muted mt-3 font-mono">
                      Últimos ensaios: {s.trials.slice(-3).map((t) => `#${t.trialIndex + 1} ${t.correct ? '✓' : '✗'}`).join(' · ')}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="card p-5 mb-6">
        <h2 className="font-medium mb-4">Exportar</h2>
        <div className="flex flex-wrap gap-3">
          <button className="btn-secondary" onClick={handleExportJSON}>Backup JSON completo</button>
          <button className="btn-secondary" onClick={handleExportTrials}>CSV ensaios</button>
          <button className="btn-secondary" onClick={handleExportResults}>CSV resultados</button>
        </div>
      </section>

      <section className="card p-5 mb-6">
        <h2 className="font-medium mb-4">Importar</h2>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
        <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
          Importar backup
        </button>
      </section>

      <section className="card p-5 mb-6">
        <h2 className="font-medium mb-4">Preferências</h2>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={settings.developerMode}
            onChange={(e) => updateSettings({ developerMode: e.target.checked })}
          />
          Modo desenvolvedor
        </label>
        <label className="flex items-center gap-3 text-sm mt-3">
          <span className="text-lab-muted">Escala de fonte</span>
          <input
            type="range" min="0.8" max="1.4" step="0.1"
            value={settings.fontScale}
            onChange={(e) => updateSettings({ fontScale: parseFloat(e.target.value) })}
          />
        </label>
      </section>

      <section className="card p-5 mb-6 border-lab-danger/30">
        <h2 className="font-medium mb-4 text-lab-danger">Zona de perigo</h2>
        <div className="flex flex-wrap gap-3">
          {settings.demoDataActive && (
            <button className="btn-secondary" onClick={clearDemo}>Limpar dados de demonstração</button>
          )}
          <button
            className="btn-secondary text-lab-danger"
            onClick={() => {
              if (confirm('Apagar TODOS os dados? Esta ação não pode ser desfeita.')) clearAll()
            }}
          >
            Apagar todos os dados
          </button>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-medium mb-2">Estatísticas</h2>
        <p className="text-sm text-lab-muted">
          {sessions.length} sessões · {sessions.reduce((a, s) => a + s.trials.length, 0)} ensaios
        </p>
      </section>
    </div>
  )
}