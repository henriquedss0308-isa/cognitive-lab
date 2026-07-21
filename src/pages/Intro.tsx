import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { generateDemoData } from '../demo/generate'
import { importSessions } from '../storage/repository'

export function Intro() {
  const navigate = useNavigate()
  const { updateSettings, refresh } = useApp()

  const handleStart = async () => {
    await updateSettings({ hasSeenIntro: true })
    navigate('/')
  }

  const handleDemo = async () => {
    const sessions = generateDemoData()
    await importSessions(sessions)
    await updateSettings({ hasSeenIntro: true, demoDataActive: true })
    await refresh()
    navigate('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 sm:p-8">
      <div className="max-w-md w-full">
        <div className="text-2xl text-lab-accent mb-5" aria-hidden="true">◈</div>
        <h1 className="text-xl font-semibold tracking-[0.14em] text-lab-fg">COGNITIVE LAB</h1>
        <p className="text-sm text-lab-muted mt-1">Seu laboratório cognitivo pessoal</p>

        <p className="text-sm text-lab-muted leading-relaxed mt-6 pt-6 hairline">
          Execute testes cognitivos padronizados, acompanhe seu desempenho ao longo do tempo
          e compare com seu próprio baseline. Todos os dados permanecem no seu dispositivo.
        </p>

        <div className="flex flex-col gap-2 mt-8">
          <button className="btn-primary w-full" onClick={handleStart}>
            Começar com dados vazios
          </button>
          <button className="btn-secondary w-full" onClick={handleDemo}>
            Explorar com dados de demonstração
          </button>
        </div>

        <p className="help-text mt-6">
          Dados de demonstração são fictícios e claramente identificados.
          Não diagnostica TDAH, transtornos cognitivos ou QI.
        </p>
      </div>
    </div>
  )
}