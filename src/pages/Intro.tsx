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
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-xl text-center">
        <div className="text-4xl mb-6 opacity-80">◈</div>
        <h1 className="text-3xl font-semibold mb-3">COGNITIVE LAB</h1>
        <p className="text-lab-muted text-lg mb-2">Seu laboratório cognitivo pessoal</p>
        <p className="text-lab-muted leading-relaxed mb-8">
          Execute testes cognitivos padronizados, acompanhe seu desempenho ao longo do tempo
          e compare com seu próprio baseline. Todos os dados permanecem no seu dispositivo.
        </p>
        <div className="space-y-3">
          <button className="btn-primary w-full" onClick={handleStart}>
            Começar com dados vazios
          </button>
          <button className="btn-secondary w-full" onClick={handleDemo}>
            Explorar com dados de demonstração
          </button>
        </div>
        <p className="text-xs text-lab-muted mt-6">
          Dados de demonstração são fictícios e claramente identificados.
          Não diagnostica TDAH, transtornos cognitivos ou QI.
        </p>
      </div>
    </div>
  )
}