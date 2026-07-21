import { QUADRANTS, describeQuadrant, getEmotionById } from '../../emotion-lab/emotionCatalog'
import { relationshipRatingLabel } from '../../emotion-lab/relationshipScale'
import type { EmotionQuadrant } from '../../emotion-lab/types'
import {
  QUADRANT_ORDER_WITH_NONE,
  formatMinutesOfDay,
  formatSleepHours,
  type BooleanComposition,
  type ContextComparison,
  type NumericComparison,
  type QuadrantComposition,
} from '../contextSummary'
import { lisdexamfetamineStatusLabel } from '../medicationContext'
import { REFERENCE_LABELS } from '../contextualReference'
import type { ReferenceKind } from '../types'

const DASH = '—'

function Row({ label, current, reference }: { label: string; current: string; reference: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-4 py-2 border-b border-lab-border last:border-b-0">
      <span className="text-lab-muted">{label}</span>
      <span className="text-lab-fg text-right font-medium">{current}</span>
      <span className="col-span-2 help-text mt-0.5">{reference}</span>
    </div>
  )
}

function referenceText(
  summary: { median: number | null; n: number; total: number },
  format: (v: number) => string
) {
  if (summary.n === 0) return `Nenhuma sessão da referência registrou este dado (0/${summary.total}).`
  return `Mediana da referência: ${format(summary.median as number)} · ${summary.n}/${summary.total} sessões com o dado.`
}

function NumericRow({
  comparison,
  format = (v: number) => String(v),
  suffix = '',
}: {
  comparison: NumericComparison
  format?: (v: number) => string
  suffix?: string
}) {
  const current = comparison.current !== null ? `${format(comparison.current)}${suffix}` : DASH
  return (
    <Row
      label={comparison.label}
      current={current}
      reference={referenceText(comparison.reference, (v) => `${format(v)}${suffix}`)}
    />
  )
}

function caffeineText(composition: BooleanComposition) {
  const { yes, no, unknown, total } = composition
  if (total === 0) return 'Nenhuma sessão na referência.'
  return `Referência: ${yes}/${total} com cafeína · ${no}/${total} sem · ${unknown}/${total} não informado.`
}

function quadrantText(composition: QuadrantComposition, total: number) {
  if (total === 0) return 'Nenhuma sessão na referência.'
  const parts = QUADRANT_ORDER_WITH_NONE.filter((q) => composition[q] > 0).map((q) =>
    q === 'none'
      ? `${composition.none} sem registro`
      : `${composition[q]} ${QUADRANTS[q as EmotionQuadrant].colorName.toLowerCase()}`
  )
  return parts.length > 0 ? `Referência: ${parts.join(' · ')}.` : 'Nenhum registro emocional na referência.'
}

interface Props {
  comparison: ContextComparison
  referenceKind: ReferenceKind
  referenceCount: number
}

/**
 * "Contexto da sessão comparado à referência utilizada".
 *
 * Apresenta dados brutos lado a lado. Nenhuma linha aqui explica, justifica ou
 * prevê desempenho: a seção existe para tornar visível que a referência pode
 * ter sido construída sob condições diferentes das desta sessão — não para
 * atribuir causa a nada.
 */
export function SessionContextComparison({ comparison, referenceKind, referenceCount }: Props) {
  if (!comparison.hasAnyData) return null

  const currentEmotion = getEmotionById(comparison.emotion.currentEmotionId)
  const ratingLabel =
    comparison.relationship.currentRating !== undefined
      ? relationshipRatingLabel(comparison.relationship.currentRating)
      : null

  return (
    <div className="text-sm">
      <p className="help-text mb-5 max-w-prose">
        As condições abaixo são apresentadas apenas como contexto, comparadas às{' '}
        {referenceCount} sessões da {REFERENCE_LABELS[referenceKind]}. Elas não entram em
        nenhuma métrica e não explicam o resultado — esta associação não demonstra causa.
      </p>

      <section className="mb-6">
        <h4 className="section-title mb-2">Sono</h4>
        <NumericRow
          comparison={comparison.sleepHours}
          format={(v) => formatSleepHours(v) ?? String(v)}
        />
        <NumericRow comparison={comparison.sleepQuality} suffix="/5" />
      </section>

      <section className="mb-6">
        <h4 className="section-title mb-2">Substâncias</h4>
        <Row
          label="Cafeína"
          current={
            comparison.caffeine.current === undefined
              ? 'Não informado'
              : comparison.caffeine.current
                ? 'Sim'
                : 'Não'
          }
          reference={caffeineText(comparison.caffeine.reference)}
        />
        <Row
          label="Lisdexanfetamina"
          current={lisdexamfetamineStatusLabel(comparison.medication.current)}
          reference={`Referência: ${comparison.medication.reference.taken} com · ${comparison.medication.reference.notTaken} sem · ${comparison.medication.reference.unknown} não informado.`}
        />
      </section>

      <section className="mb-6">
        <h4 className="section-title mb-2">Horário</h4>
        <Row
          label="Horário desta sessão"
          current={formatMinutesOfDay(comparison.timeOfDay.currentMinutes) ?? DASH}
          reference={referenceText(
            comparison.timeOfDay.reference,
            (v) => formatMinutesOfDay(v) ?? String(v)
          )}
        />
      </section>

      <section className="mb-6">
        <h4 className="section-title mb-2">Estado atual</h4>
        {comparison.currentState.map((row) => (
          <NumericRow key={row.label} comparison={row} suffix="/5" />
        ))}
      </section>

      <section className="mb-6">
        <h4 className="section-title mb-2">Alimentação e hidratação</h4>
        <NumericRow comparison={comparison.hunger} suffix="/5" />
        <NumericRow comparison={comparison.hydration} suffix="/5" />
      </section>

      <section>
        <h4 className="section-title mb-2">Contexto emocional</h4>
        <Row
          label="Emoção registrada"
          current={currentEmotion ? currentEmotion.label : 'Não informado'}
          reference={quadrantText(comparison.emotion.reference, referenceCount)}
        />
        {currentEmotion && (
          <p className="text-xs text-lab-muted mt-1 flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: QUADRANTS[currentEmotion.quadrant].cssVar }}
            />
            <span>{describeQuadrant(currentEmotion.quadrant)}</span>
          </p>
        )}
        {ratingLabel && (
          <Row
            label="Percepção da relação"
            current={ratingLabel}
            reference={`${comparison.relationship.referenceCount} de ${comparison.relationship.referenceTotal} sessões da referência registraram este campo.`}
          />
        )}
        <p className="text-xs text-lab-muted mt-2">
          Registro de percepção naquele momento, não uma avaliação da relação.
        </p>
      </section>
    </div>
  )
}
