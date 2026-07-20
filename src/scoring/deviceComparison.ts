import type { DeviceInfo, SessionRecord } from '../types'

export interface DeviceComparisonResult {
  differentDevice: boolean
  differentInputMethod: boolean
  messages: string[]
  /** Referência usada (moda do histórico elegível) ou null sem histórico. */
  reference: { deviceType: DeviceInfo['deviceType']; inputMethod: DeviceInfo['inputMethod'] } | null
}

function modeOf<T extends string>(values: T[], mostRecentFirst: T[]): T | null {
  if (values.length === 0) return null
  const counts = new Map<T, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: T | null = null
  let bestCount = -1
  // Empate resolvido pelo valor mais recente no histórico.
  for (const v of mostRecentFirst) {
    const c = counts.get(v) ?? 0
    if (c > bestCount) {
      best = v
      bestCount = c
    }
  }
  return best
}

/**
 * Compara o dispositivo da sessão corrente com a MODA das sessões elegíveis
 * anteriores (spec §6). Divergência nunca bloqueia — sinaliza flags e
 * mensagens para rebaixar a qualidade a valid_with_warnings, tornando a
 * comparação entre dispositivos visível em vez de silenciosa.
 */
export function compareDeviceToHistory(
  current: DeviceInfo,
  priorEligible: SessionRecord[]
): DeviceComparisonResult {
  if (priorEligible.length === 0) {
    return { differentDevice: false, differentInputMethod: false, messages: [], reference: null }
  }

  const recentFirst = [...priorEligible].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  )
  const deviceTypes = priorEligible.map((s) => s.deviceInfo.deviceType)
  const inputMethods = priorEligible.map((s) => s.deviceInfo.inputMethod)
  const refDevice = modeOf(deviceTypes, recentFirst.map((s) => s.deviceInfo.deviceType))
  const refInput = modeOf(inputMethods, recentFirst.map((s) => s.deviceInfo.inputMethod))

  if (refDevice === null || refInput === null) {
    return { differentDevice: false, differentInputMethod: false, messages: [], reference: null }
  }

  const differentDevice = current.deviceType !== refDevice
  const differentInputMethod = current.inputMethod !== refInput
  const messages: string[] = []
  if (differentDevice) {
    messages.push(
      `Dispositivo (${current.deviceType}) difere do habitual neste teste (${refDevice}) — compare com cautela.`
    )
  }
  if (differentInputMethod) {
    messages.push(
      `Método de entrada (${current.inputMethod}) difere do habitual neste teste (${refInput}) — tempos de resposta podem não ser comparáveis.`
    )
  }

  return {
    differentDevice,
    differentInputMethod,
    messages,
    reference: { deviceType: refDevice, inputMethod: refInput },
  }
}
