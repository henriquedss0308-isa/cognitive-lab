import type { SessionRecord } from '../types'

export type ResultsLoadState = 'loading' | 'found' | 'not_found' | 'error'

export interface ResultsLoadOutcome {
  state: ResultsLoadState
  session?: SessionRecord
  error?: string
}

export interface ResultsLoaderDeps {
  getSession: (id: string) => Promise<SessionRecord | undefined>
  getFromContext?: (id: string) => SessionRecord | undefined
  appLoading?: boolean
  /** Uma única releitura após refresh, quando contexto ainda não tem result */
  retryAfterRefresh?: () => Promise<void>
}

/**
 * Carrega sessão para /results/:sessionId.
 * Não trata undefined inicial como not_found — exige consulta concluída.
 */
export async function loadResultsSession(
  sessionId: string | undefined,
  deps: ResultsLoaderDeps
): Promise<ResultsLoadOutcome> {
  if (!sessionId) {
    return { state: 'not_found' }
  }

  try {
    if (deps.appLoading) {
      const fromDbWhileLoading = await deps.getSession(sessionId)
      if (fromDbWhileLoading?.result) {
        return { state: 'found', session: fromDbWhileLoading }
      }
      return { state: 'loading' }
    }

    const fromContext = deps.getFromContext?.(sessionId)
    if (fromContext?.result) {
      return { state: 'found', session: fromContext }
    }

    let fromDb = await deps.getSession(sessionId)
    if (fromDb?.result) {
      return { state: 'found', session: fromDb }
    }

    if (deps.retryAfterRefresh && !fromDb?.result) {
      await deps.retryAfterRefresh()
      fromDb = await deps.getSession(sessionId)
      if (fromDb?.result) {
        return { state: 'found', session: fromDb }
      }
    }

    if (fromDb && !fromDb.result) {
      return { state: 'not_found' }
    }

    return { state: 'not_found' }
  } catch (err) {
    if (import.meta.env.DEV) {
      console.error('[loadResultsSession]', err)
    }
    return {
      state: 'error',
      error: err instanceof Error ? err.message : 'Erro ao consultar armazenamento',
    }
  }
}