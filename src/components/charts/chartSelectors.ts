import type { SessionRecord } from '../../types'

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
