import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TEST_MAP } from '../../tests/registry'
import type { SessionRecord } from '../../types'
import { Results } from '../Results'

const appState = vi.hoisted(() => ({
  sessions: [] as SessionRecord[],
  refresh: vi.fn(async () => undefined),
  editSessionConditions: vi.fn(async () => undefined),
}))

vi.mock('../../context/AppContext', () => ({
  useApp: () => ({
    sessions: appState.sessions,
    settings: {
      theme: 'dark',
      fontScale: 1,
      developerMode: false,
      hasSeenIntro: true,
      demoDataActive: false,
    },
    loading: false,
    refresh: appState.refresh,
    editSessionConditions: appState.editSessionConditions,
  }),
}))

const DEVICE: SessionRecord['deviceInfo'] = {
  deviceType: 'desktop',
  inputMethod: 'keyboard',
  screenWidth: 1920,
  screenHeight: 1080,
  browser: 'test',
  userAgent: 'test',
}

function makeSession(
  testId: 'stroop' | 'taskswitch' | 'corsi',
  sessionId: string,
  day: number,
  primaryValue: number | null,
  medianCorrectRT: number,
  options: { scoringVersion?: string; baselinePhase?: 'monitoring' } = {}
): SessionRecord {
  const test = TEST_MAP[testId]
  const startedAt = `2026-06-${String(day).padStart(2, '0')}T10:00:00.000Z`
  const completedAt = `2026-06-${String(day).padStart(2, '0')}T10:05:00.000Z`
  const customMetrics = { [test.primaryMetricKey]: primaryValue }

  return {
    sessionId,
    testId,
    protocolVersion: test.protocolVersion,
    mode: 'assessment',
    status: 'completed',
    startedAt,
    completedAt,
    quality: 'valid',
    flags: {},
    flagMessages: [],
    trials: [],
    deviceInfo: DEVICE,
    isDemo: false,
    practiceCompleted: true,
    randomizationSeed: day,
    result: {
      sessionId,
      testId,
      protocolVersion: test.protocolVersion,
      mode: 'assessment',
      startedAt,
      completedAt,
      quality: 'valid',
      flags: {},
      flagMessages: [],
      rtMetrics: {
        medianCorrectRT,
        meanCorrectRT: medianCorrectRT,
        rtStandardDeviation: 20,
        rtIQR: 25,
        rtCoefficientOfVariation: 0.04,
        p10RT: medianCorrectRT - 30,
        p90RT: medianCorrectRT + 40,
        anticipationRate: 0,
        lapseRate: 0,
        validTrialCount: 40,
        invalidTrialCount: 0,
      },
      accuracyMetrics: {
        accuracy: 0.9,
        correctCount: 36,
        errorCount: 4,
        omissionCount: 0,
        totalTrials: 40,
      },
      conditionMetrics: {},
      blockMetrics: [],
      customMetrics,
      scoringVersion: options.scoringVersion,
      baselinePhase: options.baselinePhase,
      isDemo: false,
      deviceInfo: DEVICE,
    },
  }
}

async function renderMissingPrimary(testId: 'stroop' | 'taskswitch') {
  const current = makeSession(testId, `${testId}-current`, 20, null, 500)
  const baseline = Array.from({ length: 11 }, (_, index) =>
    makeSession(testId, `${testId}-baseline-${index}`, index + 1, 10 + index, 400 + index)
  )
  appState.sessions = [current, ...baseline]

  render(
    <MemoryRouter initialEntries={[`/results/${current.sessionId}`]}>
      <Routes>
        <Route path="/results/:sessionId" element={<Results />} />
      </Routes>
    </MemoryRouter>
  )

  await screen.findByRole('heading', { name: TEST_MAP[testId].name })
  return current
}

function expectMissingPrimaryWithoutRtFallback() {
  const primaryLabel = screen.getByText(/Métrica principal ·/i)
  const primaryCard = primaryLabel.closest('.card')
  const generalRtLabel = /^500(?:,0)? ms$/

  expect(primaryCard).not.toBeNull()
  if (!(primaryCard instanceof HTMLElement)) throw new Error('Cartão principal não encontrado')
  expect(within(primaryCard).getByLabelText('Indisponível')).toBeInTheDocument()
  expect(within(primaryCard).queryByLabelText(generalRtLabel)).not.toBeInTheDocument()
  expect(screen.getByLabelText(generalRtLabel)).toBeInTheDocument()
  expect(screen.queryByText(/^z =/i)).not.toBeInTheDocument()
  expect(
    screen.getByText(/métrica principal não pôde ser calculada nesta sessão/i)
  ).toBeInTheDocument()
}

describe('Results — métrica primária ausente', () => {
  beforeEach(() => {
    appState.sessions = []
    appState.refresh.mockClear()
    appState.editSessionConditions.mockClear()
  })

  it('não usa 500 ms como stroopCostRT nem calcula z falso', async () => {
    await renderMissingPrimary('stroop')
    expectMissingPrimaryWithoutRtFallback()
  })

  it('não usa 500 ms como switchCostRT nem calcula z falso', async () => {
    await renderMissingPrimary('taskswitch')
    expectMissingPrimaryWithoutRtFallback()
  })
})

describe('Results — série de scoring da sessão', () => {
  beforeEach(() => {
    appState.sessions = []
    appState.refresh.mockClear()
    appState.editSessionConditions.mockClear()
  })

  it('mostra familiarização current e preserva aviso sobre 6 sessões legacy', async () => {
    const legacy = Array.from({ length: 6 }, (_, index) =>
      makeSession('corsi', `legacy-${index + 1}`, index + 1, 5, 900, {
        scoringVersion: 'sdt-hautus-1',
      })
    )
    const current = makeSession('corsi', 'current-1', 20, 6, 910, {
      scoringVersion: 'sdt-hautus-1;corsi-replay-1',
      // Simula o rótulo persistido antes da proteção; a tela deve derivar a
      // fase compatível sem regravar o registro.
      baselinePhase: 'monitoring',
    })
    appState.sessions = [current, ...legacy]

    render(
      <MemoryRouter initialEntries={[`/results/${current.sessionId}`]}>
        <Routes>
          <Route path="/results/:sessionId" element={<Results />} />
        </Routes>
      </MemoryRouter>
    )

    await screen.findByRole('heading', { name: TEST_MAP.corsi.name })
    expect(screen.getByText('Familiarização — não entra no baseline')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(
      /Existem 6 sessões históricas deste protocolo com outra regra de scoring/i
    )
    expect(screen.queryByText(/^z =/i)).not.toBeInTheDocument()
    expect(current.result?.baselinePhase).toBe('monitoring')
  })
})
