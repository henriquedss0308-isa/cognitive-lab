import type { ReactNode } from 'react'
import type {
  CognitiveDomain,
  DeviceInfo,
  SessionResult,
  TestId,
  TestMode,
  TrialRecord,
} from '../types'

export interface PracticeCriteriaConfig {
  minAccuracy: number
  minValidTrials?: number
}

export interface ProtocolConfig {
  version: string
  trialCount: number
  blocks: number
  stimulusDurationMs?: number
  isiMinMs?: number
  isiMaxMs?: number
  proportions?: Record<string, number>
  keyMapping?: Record<string, string>
  practiceCriteria?: PracticeCriteriaConfig
  advancePolicy?: 'after-response' | 'fixed-duration'

  cleaningRules: {
    anticipationThresholdMs: number
    lapseThresholdMs: number
  }
}

export interface GeneratedTrial {
  blockIndex: number
  trialIndex: number
  condition: string
  stimulus: string
  expectedResponse: string
  metadata?: Record<string, unknown>
  isiMs?: number
  stimulusDurationMs?: number
}

export interface TestInstructions {
  title: string
  summary: string
  steps: string[]
  keys: { key: string; action: string }[]
  tips: string[]
  demoVisual?: ReactNode
}

export interface CognitiveTestDefinition {
  id: TestId
  name: string
  shortName: string
  domain: CognitiveDomain
  domains: CognitiveDomain[]
  description: string
  duration: string
  protocolVersion: string
  /** Versão de scoring produzida por novas sessões desta definição. */
  scoringVersion: string
  practiceConfig: ProtocolConfig
  assessmentConfig: ProtocolConfig
  instructions: TestInstructions
  /** Fixo: lista pré-gerada. Adaptativo: ignorar ou retornar []. */
  generateTrials: (mode: TestMode, seed: number) => GeneratedTrial[]
  /** Protocolos adaptativos (ex.: Corsi) */
  isAdaptive?: boolean
  scoreSession: (
    trials: TrialRecord[],
    mode: TestMode,
    deviceInfo: DeviceInfo,
    flags: Record<string, boolean>
  ) => Omit<SessionResult, 'sessionId' | 'startedAt' | 'completedAt' | 'isDemo' | 'checkIn' | 'batteryId' | 'batteryPosition'>
  primaryMetricKey: string
  baselineMetricKeys: string[]
  metricLabels: Record<string, string>
  /**
   * Direção de interpretação por métrica: +1 = valor maior é melhor,
   * -1 = valor menor é melhor. Obrigatória para toda métrica usada em
   * z-score; proibido inferir direção por heurística de nome.
   */
  metricDirections: Record<string, 1 | -1>
}
