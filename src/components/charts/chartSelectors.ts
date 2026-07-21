import type { SessionRecord } from '../../types'
import { formatMetricValue } from '../../metrics/presentation'

export interface TrendSelection {
  /** Sessões plotáveis, ordenadas por startedAt crescente. */
  sessions: SessionRecord[]
  /** Sessões de OUTRAS versões de protocolo, ocultadas da série (spec §6). */
  hiddenOtherVersions: number
  /** Sessões excluídas por quality === 'invalid'. */
  hiddenInvalid: number
  /** Versão de protocolo efetivamente plotada (a da sessão mais recente). */
  protocolVersion: string | null
}

/**
 * Seleção única para gráficos longitudinais (spec §5/§6):
 * - apenas avaliações completas com result;
 * - nunca demo;
 * - sessões invalid ficam FORA da série (eram plotadas silenciosamente);
 * - uma única protocolVersion por série — a mais recente; as demais são
 *   contadas para aviso, nunca misturadas.
 */
export function selectTrendSessions(sessions: SessionRecord[]): TrendSelection {
  const base = sessions
    .filter((s) => s.result && s.mode === 'assessment' && !s.isDemo)
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())

  const valid = base.filter((s) => s.quality !== 'invalid')
  const hiddenInvalid = base.length - valid.length

  if (valid.length === 0) {
    return { sessions: [], hiddenOtherVersions: 0, hiddenInvalid, protocolVersion: null }
  }

  const currentVersion = valid[valid.length - 1].protocolVersion
  const sameVersion = valid.filter((s) => s.protocolVersion === currentVersion)

  return {
    sessions: sameVersion,
    hiddenOtherVersions: valid.length - sameVersion.length,
    hiddenInvalid,
    protocolVersion: currentVersion,
  }
}

/** Um ponto plotável. `key` é a identidade — nunca a data. */
export interface TrendPoint {
  /**
   * Chave única do ponto no eixo X.
   *
   * É o `sessionId`, e não a data: a data formatada tem granularidade de dia,
   * então várias sessões do mesmo dia produziam a MESMA chave de categoria e o
   * Recharts não conseguia distinguir os pontos — o tooltip repetia sempre a
   * mesma sessão. O eixo mostra a data curta via `tickFormatter`; a identidade
   * fica com o id, que o armazenamento garante único.
   */
  key: string
  /** Timestamp completo — ordenação e rótulo do tooltip saem daqui. */
  startedAt: string
  /** Data curta, para o eixo. Pode repetir entre pontos sem prejuízo. */
  shortLabel: string
  /** Data + horário, para o tooltip distinguir sessões do mesmo dia. */
  fullLabel: string
  value: number
}

function metricValue(session: SessionRecord, metricKey: string): number | null {
  const result = session.result
  if (!result) return null
  if (metricKey === 'medianCorrectRT') return result.rtMetrics.medianCorrectRT
  if (metricKey === 'accuracy') return result.accuracyMetrics.accuracy
  return result.customMetrics[metricKey] ?? null
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

export function formatFullDate(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR')}`
}

/**
 * Formata o valor de uma métrica para leitura humana.
 *
 * Cards e gráficos delegam ao mesmo registry explícito. Métrica desconhecida
 * recebe apresentação neutra — nunca unidade inferida pelo nome.
 */
export function formatTrendValue(metricKey: string, value: number): string {
  return formatMetricValue(metricKey, value)
}

/**
 * Converte sessões em pontos plotáveis, preservando identidade e ordem.
 *
 * A ordenação cronológica vem de `selectTrendSessions`, que já ordena por
 * `startedAt` completo; aqui só se mantém essa ordem.
 */
export function buildTrendPoints(sessions: SessionRecord[], metricKey: string): TrendPoint[] {
  const points: TrendPoint[] = []
  for (const session of sessions) {
    const value = metricValue(session, metricKey)
    if (value === null || value === undefined || Number.isNaN(value)) continue
    points.push({
      key: session.sessionId,
      startedAt: session.startedAt,
      shortLabel: formatShortDate(session.startedAt),
      fullLabel: formatFullDate(session.startedAt),
      value,
    })
  }
  return points
}
