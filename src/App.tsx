import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import { Layout } from './components/layout/Layout'
import { Intro } from './pages/Intro'
import { Dashboard } from './pages/Dashboard'
import { Catalog } from './pages/Catalog'
import { TestFlow } from './pages/TestFlow'
import { Results } from './pages/Results'
import { History } from './pages/History'
import { Settings } from './pages/Settings'
import { TestDetail } from './pages/TestDetail'
import { Batteries } from './pages/Batteries'

function AppRoutes() {
  const { settings, loading } = useApp()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-lab-muted">Carregando...</span>
      </div>
    )
  }

  if (!settings.hasSeenIntro) {
    return (
      <Routes>
        <Route path="*" element={<Intro />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/batteries" element={<Batteries />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/test/:testId/detail" element={<TestDetail />} />
      </Route>
      <Route path="/test/:testId" element={<TestFlow />} />
      <Route path="/results/:sessionId" element={<Results />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </BrowserRouter>
  )
}