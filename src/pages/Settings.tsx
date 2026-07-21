import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { exportFullBackup, downloadJSON, downloadCSV, trialsToCSV, resultsToCSV, importBackup } from '../storage/export'
import { getIncompleteSessions, updateSessionStatus } from '../storage/repository'
import { canResumeSession, resumeBlockedReason } from '../storage/sessionRecovery'
import { getTest } from '../tests/registry'
import { ThemeToggle } from '../components/layout/ThemeToggle'
import { Page, PageHeader } from '../components/common/Page'
import { Badge } from '../components/common/Badge'
import { FONT_SCALE_MAX, FONT_SCALE_MIN, normalizeFontScale } from '../theme/theme'
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
    <Page width="narrow">
      <PageHeader
        title="Dados e Configurações"
        subtitle="Local-first — seus dados permanecem neste dispositivo."
      />

      {incomplete.length > 0 && (
        <section className="card p-5 mb-6">
          <h2 className="card-title mb-1">Sessões incompletas</h2>
          <p className="help-text mb-4">
            Avaliações interrompidas não entram no baseline. Protocolos fixos devem ser reiniciados.
          </p>
          <ul className="space-y-3">
            {incomplete.map((s) => {
              const test = getTest(s.testId)
              const canResume = canResumeSession(s)
              const blockReason = resumeBlockedReason(s)
              return (
                <li key={s.sessionId} className="border border-lab-border rounded-md p-4 bg-lab-bg">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-lab-fg">{test.shortName}</span>
                      <span className="help-text">
                        {format(new Date(s.startedAt), "d MMM HH:mm", { locale: ptBR })}
                      </span>
                      <Badge tone="warning" dot>{s.status}</Badge>
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
                        className="btn-secondary text-sm"
                        onClick={async () => {
                          await updateSessionStatus(s.sessionId, 'abandoned', {
                            flags: { ...s.flags, incomplete: true },
                            quality: 'invalid',
                            flagMessages: [...s.flagMessages, 'Sessão arquivada pelo usuário.'],
                          })
                          await refresh()
                        }}
                      >
                        Arquivar
                      </button>
                      <button
                        className="btn-secondary text-sm text-lab-danger"
                        onClick={async () => {
                          if (
                            confirm(
                              `Excluir permanentemente esta sessão e seus ${s.trials.length} ensaios? Esta ação não pode ser desfeita.`
                            )
                          ) {
                            await removeSession(s.sessionId)
                            await refresh()
                          }
                        }}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                  {!canResume && blockReason && (
                    <p className="help-text mt-2">{blockReason}</p>
                  )}
                  {expandedId === s.sessionId && s.trials.length > 0 && (
                    <p className="help-text mt-3 font-mono">
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
        <h2 className="card-title mb-4">Exportar</h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={handleExportJSON}>Backup JSON completo</button>
          <button className="btn-secondary" onClick={handleExportTrials}>CSV ensaios</button>
          <button className="btn-secondary" onClick={handleExportResults}>CSV resultados</button>
        </div>
        <p className="help-text mt-4">
          O backup JSON inclui as condições registradas em cada sessão, e portanto pode conter
          o contexto emocional e a percepção da relação, além do rótulo configurado abaixo.
          Guarde e compartilhe o arquivo com esse cuidado.
        </p>
      </section>

      <section className="card p-5 mb-6">
        <h2 className="card-title mb-4">Importar</h2>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
        <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
          Importar backup
        </button>
      </section>

      <section className="card p-5 mb-6">
        <h2 className="card-title mb-1">Aparência</h2>
        <p className="help-text mb-5">
          A escolha fica salva neste dispositivo e é reaplicada ao recarregar a página.
        </p>

        <div className="flex items-center justify-between gap-4 py-3 border-b border-lab-border">
          <div>
            <div className="text-sm text-lab-text">Tema</div>
            <p className="help-text mt-0.5">
              A tela de execução dos testes mantém a apresentação escura nos dois temas,
              para que sessões continuem comparáveis entre si.
            </p>
          </div>
          <ThemeToggle />
        </div>

        <label className="flex items-center justify-between gap-6 py-3">
          <span className="shrink-0">
            <span className="text-sm text-lab-text">Escala de fonte</span>
            <span className="help-text block mt-0.5">
              {Math.round(normalizeFontScale(settings.fontScale) * 100)}% do tamanho padrão
            </span>
          </span>
          <input
            type="range"
            min={FONT_SCALE_MIN}
            max={FONT_SCALE_MAX}
            step="0.1"
            className="max-w-56"
            value={normalizeFontScale(settings.fontScale)}
            onChange={(e) => updateSettings({ fontScale: parseFloat(e.target.value) })}
          />
        </label>
      </section>

      <section className="card p-5 mb-6">
        <h2 className="card-title mb-4">Preferências</h2>
        <label className="block mb-5">
          <span className="label-text">Nome da pessoa ou relação acompanhada (opcional)</span>
          <input
            type="text"
            className="mt-1.5"
            value={settings.relationshipLabel ?? ''}
            maxLength={40}
            onChange={(e) => updateSettings({ relationshipLabel: e.target.value })}
          />
          <span className="help-text block mt-2">
            Usado apenas para personalizar o texto do registro de percepção neste dispositivo.
            Deixe em branco para manter a linguagem genérica. Fica salvo junto das demais
            preferências e, por isso, também entra no backup JSON.
          </span>
        </label>
        <label className="flex items-center gap-2.5 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={settings.developerMode}
            onChange={(e) => updateSettings({ developerMode: e.target.checked })}
          />
          Modo desenvolvedor
        </label>
      </section>

      <section className="card p-5 mb-6">
        <h2 className="card-title mb-1">Estatísticas</h2>
        <div className="flex gap-8 mt-3">
          <div>
            <div className="metric-value text-xl">{sessions.length}</div>
            <div className="help-text mt-0.5">sessões</div>
          </div>
          <div>
            <div className="metric-value text-xl">
              {sessions.reduce((a, s) => a + s.trials.length, 0)}
            </div>
            <div className="help-text mt-0.5">ensaios</div>
          </div>
        </div>
      </section>

      {/* Borda avermelhada além do texto: a seção precisa se distinguir mesmo
          para quem não percebe a diferença de cor. */}
      <section className="card p-5 border-lab-danger/40">
        <h2 className="card-title mb-1 text-lab-danger">Zona de perigo</h2>
        <p className="help-text mb-4">Estas ações não podem ser desfeitas.</p>
        <div className="flex flex-wrap gap-2">
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
    </Page>
  )
}