import { describe, it, expect } from 'vitest'
import {
  buildTrendPoints,
  formatFullDate,
  formatTrendValue,
  selectTrendSessions,
} from '../chartSelectors'
import type { SessionRecord, SessionResult } from '../../../types'

function makeSession(n: number, overrides: Partial<SessionRecord> = {}): SessionRecord {
  const id = `s-${n}`
  const result = {
    sessionId: id,
    testId: 'simple_rt',
    protocolVersion: 'reaction.simple.v1.0',
    mode: 'assessment',
    startedAt: '',
    completedAt: '',
    quality: 'valid',
    flags: {},
    flagMessages: [],
    rtMetrics: {
      medianCorrectRT: 300 + n,
      meanCorrectRT: 300,
      rtStandardDeviation: 10,
      rtIQR: 10,
      rtCoefficientOfVariation: 0.03,
      p10RT: 280,
      p90RT: 330,
      anticipationRate: 0,
      lapseRate: 0,
      validTrialCount: 40,
      invalidTrialCount: 0,
    },
    accuracyMetrics: { accuracy: 0.95, correctCount: 38, errorCount: 2, omissionCount: 0, totalTrials: 40 },
    conditionMetrics: {},
    blockMetrics: [],
    customMetrics: {},
    isDemo: false,
    deviceInfo: {
      deviceType: 'desktop',
      inputMethod: 'keyboard',
      screenWidth: 1920,
      screenHeight: 1080,
      browser: 'test',
      userAgent: 'test',
    },
  } as SessionResult

  return {
    sessionId: id,
    testId: 'simple_rt',
    protocolVersion: 'reaction.simple.v1.0',
    mode: 'assessment',
    status: 'completed',
    startedAt: new Date(Date.UTC(2026, 0, n)).toISOString(),
    completedAt: new Date(Date.UTC(2026, 0, n, 1)).toISOString(),
    quality: 'valid',
    flags: {},
    flagMessages: [],
    trials: [],
    deviceInfo: result.deviceInfo,
    isDemo: false,
    practiceCompleted: true,
    randomizationSeed: n,
    result,
    ...overrides,
  }
}

describe('selectTrendSessions (spec §5/§6)', () => {
  it('sessões invalid ficam fora da série e são contadas', () => {
    const sel = selectTrendSessions([
      makeSession(1),
      makeSession(2, { quality: 'invalid' }),
      makeSession(3),
    ])
    expect(sel.sessions.map((s) => s.sessionId)).toEqual(['s-1', 's-3'])
    expect(sel.hiddenInvalid).toBe(1)
  })

  it('demo e treino nunca aparecem', () => {
    const sel = selectTrendSessions([
      makeSession(1, { isDemo: true }),
      makeSession(2, { mode: 'training' }),
      makeSession(3),
    ])
    expect(sel.sessions.map((s) => s.sessionId)).toEqual(['s-3'])
  })

  it('sessões sem result ficam fora', () => {
    const sel = selectTrendSessions([makeSession(1, { result: undefined }), makeSession(2)])
    expect(sel.sessions.map((s) => s.sessionId)).toEqual(['s-2'])
  })

  it('apenas a protocolVersion mais recente entra na série; as demais são contadas', () => {
    const sel = selectTrendSessions([
      makeSession(1, { protocolVersion: 'reaction.simple.v0.9' }),
      makeSession(2, { protocolVersion: 'reaction.simple.v0.9' }),
      makeSession(3),
      makeSession(4),
    ])
    expect(sel.protocolVersion).toBe('reaction.simple.v1.0')
    expect(sel.sessions.map((s) => s.sessionId)).toEqual(['s-3', 's-4'])
    expect(sel.hiddenOtherVersions).toBe(2)
  })

  it('ordenação crescente por startedAt', () => {
    const sel = selectTrendSessions([makeSession(5), makeSession(2), makeSession(9)])
    expect(sel.sessions.map((s) => s.sessionId)).toEqual(['s-2', 's-5', 's-9'])
  })

  it('lista vazia é bem comportada', () => {
    const sel = selectTrendSessions([])
    expect(sel.sessions).toEqual([])
    expect(sel.protocolVersion).toBeNull()
  })
})

/**
 * Regressão do gráfico longitudinal.
 *
 * O ponto era chaveado pela data formatada (`toLocaleDateString`), que tem
 * granularidade de dia. Três sessões do mesmo dia produziam a mesma chave de
 * categoria, o Recharts não conseguia distingui-las e o tooltip repetia sempre
 * a mesma sessão. O ponto também não carregava id nem horário, então nem em
 * princípio dava para identificar qual sessão estava sob o cursor.
 */
describe('buildTrendPoints — várias sessões no mesmo dia', () => {
  /** Três sessões do MESMO teste no MESMO dia, em horários e RTs distintos. */
  function sameDaySessions(): SessionRecord[] {
    const spec = [
      { h: 9, min: 15, s: 30, rt: 308 },
      { h: 14, min: 22, s: 5, rt: 245 },
      { h: 19, min: 40, s: 11, rt: 268.300048828125 },
    ]
    return spec.map((sp, i) => {
      const at = new Date(Date.UTC(2026, 6, 21, sp.h, sp.min, sp.s)).toISOString()
      const session = makeSession(i + 1, { startedAt: at, completedAt: at })
      session.result!.rtMetrics.medianCorrectRT = sp.rt
      return session
    })
  }

  it('gera uma chave única por sessão, mesmo caindo tudo no mesmo dia', () => {
    const points = buildTrendPoints(sameDaySessions(), 'medianCorrectRT')

    expect(points).toHaveLength(3)
    expect(new Set(points.map((p) => p.key)).size).toBe(3)
    // A data curta REPETE — é isso que antes servia de chave e quebrava tudo.
    expect(new Set(points.map((p) => p.shortLabel)).size).toBe(1)
  })

  it('mantém cada sessão inspecionável: horário e valor distintos por ponto', () => {
    const points = buildTrendPoints(sameDaySessions(), 'medianCorrectRT')

    expect(new Set(points.map((p) => p.fullLabel)).size).toBe(3)
    expect(points.map((p) => p.value)).toEqual([308, 245, 268.300048828125])
  })

  it('ordena cronologicamente pelo timestamp completo', () => {
    // Entrada fora de ordem: a seleção precisa reordenar antes de plotar.
    const [manha, tarde, noite] = sameDaySessions()
    const selection = selectTrendSessions([noite, manha, tarde])
    const points = buildTrendPoints(selection.sessions, 'medianCorrectRT')

    expect(points.map((p) => p.startedAt)).toEqual([
      manha.startedAt,
      tarde.startedAt,
      noite.startedAt,
    ])
    const times = points.map((p) => new Date(p.startedAt).getTime())
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })

  it('a chave é o id da sessão, e não a posição no array', () => {
    const sessions = sameDaySessions()
    const points = buildTrendPoints(sessions, 'medianCorrectRT')
    expect(points.map((p) => p.key)).toEqual(sessions.map((s) => s.sessionId))
  })

  it('descarta pontos sem valor para a métrica, sem deslocar os demais', () => {
    const sessions = sameDaySessions()
    sessions[1].result!.rtMetrics.medianCorrectRT = null
    const points = buildTrendPoints(sessions, 'medianCorrectRT')

    expect(points).toHaveLength(2)
    expect(points.map((p) => p.key)).toEqual([sessions[0].sessionId, sessions[2].sessionId])
  })

  it('lê métricas customizadas pela chave', () => {
    const sessions = sameDaySessions()
    sessions.forEach((s, i) => {
      s.result!.customMetrics = { 'simple.medianRT': 100 + i }
    })
    expect(buildTrendPoints(sessions, 'simple.medianRT').map((p) => p.value)).toEqual([100, 101, 102])
  })
})

describe('formatFullDate', () => {
  it('inclui data e horário, para distinguir sessões do mesmo dia', () => {
    const a = formatFullDate(new Date(Date.UTC(2026, 6, 21, 9, 15, 30)).toISOString())
    const b = formatFullDate(new Date(Date.UTC(2026, 6, 21, 14, 22, 5)).toISOString())

    expect(a).not.toBe(b)
    for (const label of [a, b]) {
      expect(label).toMatch(/\d{2}\/\d{2}\/\d{4}/)
      expect(label).toMatch(/\d{2}:\d{2}:\d{2}/)
    }
  })
})

describe('formatTrendValue', () => {
  it('arredonda tempo e usa vírgula decimal, em vez do float cru', () => {
    // O tooltip mostrava "268.300048828125".
    expect(formatTrendValue('medianCorrectRT', 268.300048828125)).toBe('268,3 ms')
    expect(formatTrendValue('simple.medianRT', 245)).toBe('245,0 ms')
    expect(formatTrendValue('switchCostRT', 12.34)).toBe('12,3 ms')
  })

  it('exibe proporções como porcentagem', () => {
    expect(formatTrendValue('accuracy', 1)).toBe('100,0%')
    expect(formatTrendValue('simple.accuracy', 0.955)).toBe('95,5%')
    expect(formatTrendValue('lapseRate', 0.025)).toBe('2,5%')
  })

  it('mantém span inteiro e métricas sem unidade com duas casas', () => {
    expect(formatTrendValue('confirmedSpan', 5)).toBe('5')
    expect(formatTrendValue('rtCV', 0.0312)).toBe('0,03')
  })

  it('não inventa unidade para métrica desconhecida', () => {
    expect(formatTrendValue('unknownRTCost', 12.34)).toBe('12,34')
  })
})
