import type { TestId } from '../types'

export type MetricUnit =
  | 'ms'
  | 'percent'
  | 'percentagePoints'
  | 'dimensionless'
  | 'count'
  | 'span'

export type MetricNumberFormat = 'decimal' | 'integer'
export type MetricNegativeBehavior = 'preserve'

export interface MetricPresentation {
  unit: MetricUnit
  scale: number
  decimals: number
  format: MetricNumberFormat
  label: string
  nullDisplay: string
  negative: MetricNegativeBehavior
  explanation?: string
}

export interface PresentedMetricValue {
  /** Parte numérica/textual sem unidade, para componentes que estilizam a unidade separadamente. */
  valueText: string
  /** Unidade visível; vazia para grandezas adimensionais, contagens e spans. */
  unitText: string
  /** Valor e unidade prontos para texto corrido, tooltips e acessibilidade. */
  text: string
  unavailable: boolean
}

const NULL_DISPLAY = 'Indisponível'

function presentation(
  unit: MetricUnit,
  label: string,
  decimals: number,
  options: Pick<MetricPresentation, 'explanation'> = {}
): MetricPresentation {
  return {
    unit,
    scale: unit === 'percent' || unit === 'percentagePoints' ? 100 : 1,
    decimals,
    format: unit === 'count' || unit === 'span' ? 'integer' : 'decimal',
    label,
    nullDisplay: NULL_DISPLAY,
    negative: 'preserve',
    ...options,
  }
}

const time = (label: string, explanation?: string) =>
  presentation('ms', label, 1, { explanation })
const percent = (label: string, explanation?: string) =>
  presentation('percent', label, 1, { explanation })
const percentagePoints = (label: string, explanation?: string) =>
  presentation('percentagePoints', label, 1, { explanation })
const dimensionless = (label: string, decimals = 2, explanation?: string) =>
  presentation('dimensionless', label, decimals, { explanation })
const count = (label: string, explanation?: string) =>
  presentation('count', label, 0, { explanation })
const span = (label: string, explanation?: string) =>
  presentation('span', label, 0, { explanation })

/**
 * Fonte única da semântica de apresentação.
 *
 * As chaves são deliberadamente explícitas. Adicionar uma métrica nova exige
 * escolher sua grandeza aqui; nomes desconhecidos recebem fallback neutro e
 * nunca herdam `ms`/`%` por substring.
 */
export const METRIC_PRESENTATIONS = {
  // Métricas gerais de RT.
  medianCorrectRT: time(
    'TR mediano',
    'Tempo central das respostas corretas; menos sensível a respostas extremamente lentas.'
  ),
  corsiReproductionTime: time(
    'Tempo mediano de reprodução',
    'Tempo para reproduzir uma sequência Corsi completa, não latência de uma resposta isolada.'
  ),
  meanCorrectRT: time('TR médio'),
  meanRT: time('TR médio'),
  medianRT: time('TR mediano'),
  rtStandardDeviation: time('Desvio-padrão do TR'),
  rtIQR: time('Intervalo interquartil do TR'),
  p10RT: time('Percentil 10 do TR'),
  p90RT: time('Percentil 90 do TR'),
  postErrorSlowing: time('Abrandamento pós-erro'),
  leftRightAsymmetry: time('Assimetria esquerda-direita'),
  medianRT1Back: time('TR mediano 1-back'),
  medianRT2Back: time('TR mediano 2-back'),

  // Custos temporais.
  stroopCostRT: time('Custo Stroop (TR)'),
  incongruentNeutralCostRT: time('Custo incongruente vs. neutro (TR)'),
  switchCostRT: time('Custo de alternância (TR)'),
  mixingCostRT: time('Custo de mistura (TR)'),

  // RTs por condição, inclusive chaves usadas no baseline.
  'simple.medianRT': time('TR mediano'),
  'left.medianRT': time('TR mediano (esquerda)'),
  'right.medianRT': time('TR mediano (direita)'),
  'congruent.medianRT': time('TR mediano (congruente)'),
  'incongruent.medianRT': time('TR mediano (incongruente)'),
  'neutral.medianRT': time('TR mediano (neutro)'),
  'go.medianRT': time('TR mediano (Go)'),

  // Proporções persistidas em 0–1.
  accuracy: percent(
    'Precisão',
    'Proporção de respostas corretas entre todos os ensaios.'
  ),
  anticipationRate: percent(
    'Taxa de antecipação',
    'Proporção de respostas muito rápidas, possivelmente anteriores ao processamento completo.'
  ),
  lapseRate: percent('Taxa de lapsos', 'Proporção de respostas muito lentas ou ausentes.'),
  hitRate: percent('Taxa de acertos'),
  falseAlarmRate: percent('Taxa de falsos alarmes'),
  commissionErrorRate: percent('Taxa de erros de comissão'),
  partialScoreRate: percent('Pontuação parcial'),
  accuracy1Back: percent('Precisão 1-back'),
  accuracy2Back: percent('Precisão 2-back'),
  'simple.accuracy': percent('Precisão'),
  'left.accuracy': percent('Precisão (esquerda)'),
  'right.accuracy': percent('Precisão (direita)'),
  'congruent.accuracy': percent('Precisão (congruente)'),
  'incongruent.accuracy': percent('Precisão (incongruente)'),
  'neutral.accuracy': percent('Precisão (neutro)'),
  'go.accuracy': percent('Precisão (Go)'),
  'nogo.accuracy': percent('Precisão (No-Go)'),

  // Diferenças entre proporções: unidade é ponto percentual, sinal preservado.
  stroopCostAccuracy: percentagePoints('Diferença Stroop de precisão'),
  switchCostAccuracy: percentagePoints('Diferença de precisão na alternância'),
  mixingCostAccuracy: percentagePoints('Diferença de precisão na mistura'),

  // Teoria da detecção de sinal e outras grandezas adimensionais.
  dPrime: dimensionless(
    "d' (sensibilidade)",
    2,
    'Capacidade de distinguir alvos de não alvos, separada da tendência geral de responder.'
  ),
  dPrime1Back: dimensionless("d' 1-back", 2),
  dPrime2Back: dimensionless("d' 2-back", 2),
  criterion: dimensionless('Critério de resposta', 2),
  rtCV: dimensionless('Variabilidade do TR (CV)', 2),
  rtCoefficientOfVariation: dimensionless('Variabilidade do TR (CV)', 2),
  zScore: dimensionless('Escore z', 2),

  // Spans e níveis Corsi.
  maxSpan: span('Amplitude máxima'),
  confirmedSpan: span('Amplitude confirmada'),

  // Contagens inteiras.
  isiEarlyPresses: count('Teclas fora da janela'),
  commissionErrors: count('Erros de comissão'),
  totalCorrectSequences: count('Sequências corretas'),
  partialScore: count('Pontuação parcial (itens)'),
  correctCount: count('Acertos'),
  errorCount: count('Erros'),
  omissionCount: count('Omissões'),
  totalTrials: count('Ensaios'),
  validTrialCount: count('Ensaios válidos'),
  invalidTrialCount: count('Ensaios com TR inválido'),
  validTrials: count('Ensaios válidos'),
  blockIndex: count('Bloco'),
} as const satisfies Record<string, MetricPresentation>

export type KnownMetricKey = keyof typeof METRIC_PRESENTATIONS

const UNKNOWN_METRIC_PRESENTATION: MetricPresentation = dimensionless('Métrica', 2)

const UNIT_TEXT: Record<MetricUnit, string> = {
  ms: 'ms',
  percent: '%',
  percentagePoints: 'pp',
  dimensionless: '',
  count: '',
  span: '',
}

export function isKnownMetric(metricKey: string): metricKey is KnownMetricKey {
  return Object.prototype.hasOwnProperty.call(METRIC_PRESENTATIONS, metricKey)
}

export function getMetricPresentation(metricKey: string): MetricPresentation {
  return isKnownMetric(metricKey)
    ? METRIC_PRESENTATIONS[metricKey]
    : UNKNOWN_METRIC_PRESENTATION
}

export function getMetricLabel(metricKey: string, explicitLabel?: string): string {
  if (explicitLabel) return explicitLabel
  if (isKnownMetric(metricKey)) return METRIC_PRESENTATIONS[metricKey].label
  return metricKey
}

function localizedNumber(value: number, decimals: number): string {
  const normalized = Object.is(value, -0) ? 0 : value
  const formatted = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  }).format(normalized)

  // O sinal matemático fica visualmente distinto do hífen e nunca é removido.
  return formatted.replace(/^-/, '−')
}

function withUnit(valueText: string, unit: MetricUnit): string {
  const unitText = UNIT_TEXT[unit]
  if (!unitText) return valueText
  return unit === 'percent' ? `${valueText}${unitText}` : `${valueText} ${unitText}`
}

export function presentMetricValue(
  metricKey: string,
  value: string | number | null | undefined
): PresentedMetricValue {
  const metadata = getMetricPresentation(metricKey)

  if (value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value))) {
    return {
      valueText: metadata.nullDisplay,
      unitText: '',
      text: metadata.nullDisplay,
      unavailable: true,
    }
  }

  if (typeof value === 'string') {
    return { valueText: value, unitText: '', text: value, unavailable: false }
  }

  const scaled = value * metadata.scale
  const valueText = localizedNumber(scaled, metadata.decimals)
  const unitText = UNIT_TEXT[metadata.unit]
  return {
    valueText,
    unitText,
    text: withUnit(valueText, metadata.unit),
    unavailable: false,
  }
}

export function formatMetricValue(
  metricKey: string,
  value: string | number | null | undefined
): string {
  return presentMetricValue(metricKey, value).text
}

/** Formata uma diferença na unidade da métrica; proporções viram pontos percentuais. */
export function formatMetricDelta(metricKey: string, value: number | null | undefined): string {
  const metadata = getMetricPresentation(metricKey)
  if (metadata.unit !== 'percent') return formatMetricValue(metricKey, value)
  if (value === null || value === undefined || !Number.isFinite(value)) return metadata.nullDisplay
  return withUnit(localizedNumber(value * 100, metadata.decimals), 'percentagePoints')
}

/**
 * `medianCorrectRT` no Corsi é duração da reprodução da sequência. A chave de
 * apresentação distinta evita chamar essa duração de “tempo de reação”.
 */
const SESSION_MEDIAN_PRESENTATION: Record<TestId, KnownMetricKey> = {
  simple_rt: 'medianCorrectRT',
  choice_rt: 'medianCorrectRT',
  stroop: 'medianCorrectRT',
  gonogo: 'medianCorrectRT',
  sart: 'medianCorrectRT',
  nback: 'medianCorrectRT',
  corsi: 'corsiReproductionTime',
  taskswitch: 'medianCorrectRT',
}

export function sessionMedianPresentationKey(testId: TestId): KnownMetricKey {
  return SESSION_MEDIAN_PRESENTATION[testId]
}
