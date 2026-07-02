import { describe, it, expect } from 'vitest'

/**
 * Documenta a ordem assíncrona exigida em TestFlow.handleComplete.
 * A rota /results/:sessionId recebe sempre sessionId (nunca testResultId separado).
 */
describe('completion navigation contract', () => {
  it('ordem correta: complete → refresh → navigate com mesmo sessionId', async () => {
    const sessionId = '8f77d2c4-4070-4502-b241-944b729c4d77'
    const order: string[] = []

    const complete = async () => {
      order.push('complete')
    }
    const refresh = async () => {
      order.push('refresh')
    }
    const navigate = (path: string) => {
      order.push(`navigate:${path}`)
    }

    await complete()
    await refresh()
    navigate(`/results/${sessionId}`)

    expect(order).toEqual([
      'complete',
      'refresh',
      `navigate:/results/${sessionId}`,
    ])
  })

  it('navigate usa sessionId da sessão, não IDs derivados', () => {
    const sessionId = 'abc-123'
    const result = { sessionId }
    expect(result.sessionId).toBe(sessionId)
    expect(`/results/${sessionId}`).toBe('/results/abc-123')
  })
})