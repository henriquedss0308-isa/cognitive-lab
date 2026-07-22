import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { SessionRecord } from '../../types'
import { History } from '../History'

const appState = vi.hoisted(() => ({ sessions: [] as SessionRecord[] }))

vi.mock('../../context/AppContext', () => ({
  useApp: () => ({ sessions: appState.sessions }),
}))

const DEVICE: SessionRecord['deviceInfo'] = {
  deviceType: 'desktop',
  inputMethod: 'mouse',
  screenWidth: 1280,
  screenHeight: 800,
  browser: 'test',
  userAgent: 'anonymous-test',
}

function historySession(index: number, scoringVersion: string): SessionRecord {
  const id = `anonymous-${index}`
  const startedAt = new Date(Date.UTC(2026, 0, 1, 10, index)).toISOString()
  return {
    sessionId: id,
    testId: 'corsi',
    protocolVersion: 'corsi.forward.v1.0',
    mode: 'assessment',
    status: 'completed',
    startedAt,
    completedAt: startedAt,
    quality: 'valid',
    flags: {},
    flagMessages: [],
    trials: [],
    deviceInfo: DEVICE,
    isDemo: false,
    practiceCompleted: true,
    randomizationSeed: index,
    result: {
      sessionId: id,
      testId: 'corsi',
      protocolVersion: 'corsi.forward.v1.0',
      mode: 'assessment',
      startedAt,
      completedAt: startedAt,
      quality: 'valid',
      flags: {},
      flagMessages: [],
      rtMetrics: {
        medianCorrectRT: 900 + index,
        meanCorrectRT: 900 + index,
        rtStandardDeviation: 10,
        rtIQR: 10,
        rtCoefficientOfVariation: 0.01,
        p10RT: 880,
        p90RT: 920,
        anticipationRate: 0,
        lapseRate: 0,
        validTrialCount: 1,
        invalidTrialCount: 0,
      },
      accuracyMetrics: {
        accuracy: 1,
        correctCount: 1,
        errorCount: 0,
        omissionCount: 0,
        totalTrials: 1,
      },
      conditionMetrics: {},
      blockMetrics: [],
      customMetrics: { confirmedSpan: index < 7 ? 5 : 6 },
      isDemo: false,
      deviceInfo: DEVICE,
      scoringVersion,
    },
  }
}

describe('History — preserva registros de scoring anterior', () => {
  it('mantém visíveis as 6 sessões legacy e a sessão current', () => {
    appState.sessions = [
      ...Array.from({ length: 6 }, (_, index) =>
        historySession(index + 1, 'sdt-hautus-1')
      ),
      historySession(7, 'sdt-hautus-1;corsi-replay-1'),
    ]

    render(
      <MemoryRouter>
        <History />
      </MemoryRouter>
    )
    fireEvent.change(screen.getByLabelText('Filtrar por teste'), {
      target: { value: 'corsi' },
    })

    expect(screen.getByText('7 sessões')).toBeInTheDocument()
    expect(screen.getAllByText('Corsi')).toHaveLength(7)
    for (const session of appState.sessions) {
      expect(screen.queryByRole('link', { name: new RegExp(session.sessionId) })).not.toBeInTheDocument()
      expect(document.querySelector(`a[href="/results/${session.sessionId}"]`)).toBeInTheDocument()
    }
  })
})
