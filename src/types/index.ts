import type { EmotionalContext } from '../features/emotion-lab/types'
import type { MedicationContext } from '../features/context-aware-baseline/types'

export type { EmotionalContext, MedicationContext }

export type TestMode = 'assessment' | 'training'
export type SessionStatus = 'in_progress' | 'completed' | 'abandoned' | 'interrupted'
export type SessionQuality = 'valid' | 'valid_with_warnings' | 'invalid'
export type BaselinePhase = 'familiarization' | 'baseline_building' | 'monitoring' | 'insufficient_data'

export type CognitiveDomain =
  | 'speed_alertness'
  | 'sustained_attention'
  | 'selective_attention'
  | 'interference_control'
  | 'motor_inhibition'
  | 'working_memory'
  | 'cognitive_flexibility'
  | 'intraindividual_variability'

export type TestId =
  | 'simple_rt'
  | 'choice_rt'
  | 'stroop'
  | 'gonogo'
  | 'sart'
  | 'nback'
  | 'corsi'
  | 'taskswitch'

export interface TestConditions {
  sleep?: {
    hours?: number
    quality?: number
    bedTime?: string
    wakeTime?: string
  }
  currentState?: {
    energy?: number
    focus?: number
    mood?: number
    stress?: number
    motivation?: number
    sleepiness?: number
  }
  substances?: {
    caffeine?: boolean
    caffeineMg?: number
    caffeineTime?: string
    /**
     * Campos livres herdados. Preservados para compatibilidade e NUNCA lidos
     * para classificar medicação — o registro estruturado vive em `medications`.
     */
    medicationName?: string
    medicationDose?: string
    medicationTime?: string
    other?: string
  }
  /**
   * Registro estruturado de medicamento (baseline sensível ao contexto).
   *
   * Separado dos campos livres acima de propósito: só um registro explícito
   * seleciona uma referência contextual. Ausência do campo significa
   * `unknown` — nunca "não tomou".
   */
  medications?: MedicationContext
  nutrition?: {
    timeSinceLastMeal?: string
    mealType?: 'fasting' | 'light' | 'normal' | 'heavy'
    hunger?: number
    hydration?: number
  }
  environment?: {
    noiseLevel?: 'silent' | 'low' | 'moderate' | 'high'
    location?: 'bedroom' | 'office' | 'living_room' | 'school' | 'other'
    headphones?: boolean
    distractions?: boolean
    inputDevice?: string
  }
  notes?: string
  /**
   * Contexto emocional e de percepção relacional (Emotion Lab).
   *
   * Estritamente contextual: nenhum caminho de scoring, métrica, qualidade ou
   * elegibilidade de baseline lê `checkIn`. Ausente em sessões anteriores à
   * funcionalidade — e a ausência é um estado válido, não um dado faltando.
   */
  emotionalContext?: EmotionalContext
  recordedAt?: string
}

export interface DeviceInfo {
  deviceType: 'desktop' | 'tablet' | 'mobile'
  inputMethod: 'keyboard' | 'mouse' | 'touch'
  screenWidth: number
  screenHeight: number
  browser: string
  refreshRateEstimate?: number
  zoomLevel?: number
  userAgent: string
}

export interface TrialRecord {
  trialId: string
  sessionId: string
  testId: TestId
  protocolVersion: string
  mode: TestMode
  blockIndex: number
  trialIndex: number
  condition: string
  stimulus: string
  expectedResponse: string
  actualResponse: string
  correct: boolean
  reactionTimeMs: number | null
  stimulusOnsetTimestamp: number
  responseTimestamp: number | null
  windowFocused: boolean
  visibilityState: DocumentVisibilityState
  droppedFramesEstimate?: number
  deviceType: string
  inputMethod: string
  invalidReason?: string
  metadata?: Record<string, unknown>
}

export interface SessionFlags {
  windowLostFocus?: boolean
  tabChanged?: boolean
  sessionPaused?: boolean
  tooManyAnticipations?: boolean
  tooManyOmissions?: boolean
  chanceLevelAccuracy?: boolean
  tooFewValidTrials?: boolean
  incomplete?: boolean
  unstableRefreshRate?: boolean
  droppedFrames?: boolean
  differentInputMethod?: boolean
  differentDevice?: boolean
  browserZoomChanged?: boolean
  screenTooSmall?: boolean
  insufficientPractice?: boolean
}

export interface RTMetrics {
  medianCorrectRT: number | null
  meanCorrectRT: number | null
  rtStandardDeviation: number | null
  rtIQR: number | null
  rtCoefficientOfVariation: number | null
  p10RT: number | null
  p90RT: number | null
  anticipationRate: number
  lapseRate: number
  validTrialCount: number
  invalidTrialCount: number
}

export interface AccuracyMetrics {
  accuracy: number
  correctCount: number
  errorCount: number
  omissionCount: number
  totalTrials: number
}

export interface SDTMetrics {
  hits: number
  misses: number
  falseAlarms: number
  correctRejections: number
  hitRate: number
  falseAlarmRate: number
  dPrime: number | null
  criterion: number | null
}

export interface SessionResult {
  sessionId: string
  testId: TestId
  protocolVersion: string
  mode: TestMode
  startedAt: string
  completedAt: string
  quality: SessionQuality
  flags: SessionFlags
  flagMessages: string[]
  rtMetrics: RTMetrics
  accuracyMetrics: AccuracyMetrics
  sdtMetrics?: SDTMetrics
  conditionMetrics: Record<string, Record<string, number | null>>
  blockMetrics: Record<string, unknown>[]
  customMetrics: Record<string, number | null>
  baselinePhase?: BaselinePhase
  isDemo: boolean
  batteryId?: string
  batteryPosition?: number
  checkIn?: TestConditions
  deviceInfo: DeviceInfo
  scoringVersion?: string
}

export interface SessionRecord {
  sessionId: string
  testId: TestId
  protocolVersion: string
  mode: TestMode
  status: SessionStatus
  startedAt: string
  completedAt?: string
  quality: SessionQuality
  flags: SessionFlags
  flagMessages: string[]
  result?: SessionResult
  trials: TrialRecord[]
  checkIn?: TestConditions
  deviceInfo: DeviceInfo
  isDemo: boolean
  batteryId?: string
  batteryPosition?: number
  practiceCompleted: boolean
  randomizationSeed: number
  trialProgress?: number
  adaptiveState?: Record<string, unknown>
}

export interface BaselineStats {
  testId: TestId
  protocolVersion: string
  phase: BaselinePhase
  sessionCount: number
  familiarizationCount: number
  baselineCount: number
  /** Sessões da janela de baseline com quality 'valid_with_warnings' (spec §2). */
  warningCount: number
  metrics: Record<string, { median: number | null; mad: number | null; n: number }>
}

export interface AppSettings {
  theme: 'dark' | 'light'
  primaryDevice?: DeviceInfo
  fontScale: number
  developerMode: boolean
  hasSeenIntro: boolean
  demoDataActive: boolean
  /**
   * Rótulo local e opcional da relação acompanhada (Emotion Lab). Personaliza
   * o texto da interface; vazio ⇒ linguagem genérica. Fica em `settings`, logo
   * FAZ PARTE do backup JSON. Nunca é escrito em log.
   */
  relationshipLabel?: string
}

export interface AppBackup {
  version: string
  exportedAt: string
  sessions: SessionRecord[]
  settings: AppSettings
}

export interface BatteryDefinition {
  id: string
  name: string
  description: string
  estimatedMinutes: string
  tests: TestId[]
  rotationIndex?: number
}