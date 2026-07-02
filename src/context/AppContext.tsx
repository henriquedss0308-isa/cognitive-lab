import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AppSettings, SessionRecord } from '../types'
import {
  deleteAllSessions,
  deleteDemoSessions,
  deleteSession,
  getAllSessions,
  getSettings,
  saveSession,
  saveSettings,
} from '../storage/repository'

interface AppContextValue {
  sessions: SessionRecord[]
  settings: AppSettings
  loading: boolean
  refresh: () => Promise<void>
  addSession: (session: SessionRecord) => Promise<void>
  removeSession: (id: string) => Promise<void>
  clearAll: () => Promise<void>
  clearDemo: () => Promise<void>
  updateSettings: (s: Partial<AppSettings>) => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [settings, setSettings] = useState<AppSettings>({
    theme: 'dark',
    fontScale: 1,
    developerMode: false,
    hasSeenIntro: false,
    demoDataActive: false,
  })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [s, cfg] = await Promise.all([getAllSessions(), getSettings()])
    setSessions(s.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()))
    setSettings(cfg)
  }, [])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  const addSession = useCallback(
    async (session: SessionRecord) => {
      await saveSession(session)
      await refresh()
    },
    [refresh]
  )

  const removeSession = useCallback(
    async (id: string) => {
      await deleteSession(id)
      await refresh()
    },
    [refresh]
  )

  const clearAll = useCallback(async () => {
    await deleteAllSessions()
    await refresh()
  }, [refresh])

  const clearDemo = useCallback(async () => {
    await deleteDemoSessions()
    await saveSettings({ ...settings, demoDataActive: false })
    await refresh()
  }, [refresh, settings])

  const updateSettings = useCallback(
    async (partial: Partial<AppSettings>) => {
      const next = { ...settings, ...partial }
      await saveSettings(next)
      setSettings(next)
    },
    [settings]
  )

  const value = useMemo(
    () => ({
      sessions,
      settings,
      loading,
      refresh,
      addSession,
      removeSession,
      clearAll,
      clearDemo,
      updateSettings,
    }),
    [
      sessions,
      settings,
      loading,
      refresh,
      addSession,
      removeSession,
      clearAll,
      clearDemo,
      updateSettings,
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}