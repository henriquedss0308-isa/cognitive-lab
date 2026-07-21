import { useId } from 'react'
import {
  EMOTION_CATALOG,
  QUADRANTS,
  QUADRANT_ORDER,
  describeQuadrant,
  getEmotionById,
} from '../emotionCatalog'
import { hasEmotionalContent } from '../emotionalContext'
import {
  CONFIDENCE_LEVELS,
  RELATIONSHIP_ANCHORS,
  RELATIONSHIP_RATING_MAX,
  RELATIONSHIP_RATING_MIN,
  relationshipQuestion,
  relationshipRatingLabel,
} from '../relationshipScale'
import type {
  EmotionalContext,
  EmotionIntensity,
  EmotionSelection,
  PerceptionConfidence,
} from '../types'

interface Props {
  value?: EmotionalContext
  onChange: (next: EmotionalContext | undefined) => void
  /** Rótulo local opcional da relação acompanhada; vazio ⇒ linguagem genérica. */
  relationshipLabel?: string
}

const INTENSITIES: EmotionIntensity[] = [1, 2, 3, 4, 5]
const DEFAULT_INTENSITY: EmotionIntensity = 3

/**
 * Posição inicial do cursor quando ainda não há resposta. NÃO é um valor
 * registrado: nada é gravado enquanto a pessoa não mover o controle, e o texto
 * ao lado diz "Não registrado" até lá.
 */
const SLIDER_RESTING_POSITION = 50

function EmotionSelect({
  id,
  label,
  selected,
  excludeId,
  onSelect,
  onClear,
}: {
  id: string
  label: string
  selected?: EmotionSelection
  excludeId?: string
  onSelect: (emotionId: string) => void
  onClear: () => void
}) {
  const definition = getEmotionById(selected?.emotionId)
  const quadrant = definition ? QUADRANTS[definition.quadrant] : undefined

  return (
    <div>
      <label htmlFor={id} className="text-sm text-lab-muted block">
        {label}
      </label>
      <select
        id={id}
        className="w-full mt-1 border border-lab-border rounded-lg px-3 py-2"
        value={definition?.id ?? ''}
        onChange={(e) => (e.target.value ? onSelect(e.target.value) : onClear())}
      >
        <option value="">Não informado</option>
        {QUADRANT_ORDER.map((q) => (
          <optgroup key={q} label={`${QUADRANTS[q].colorName} — ${QUADRANTS[q].description}`}>
            {EMOTION_CATALOG.filter((e) => e.quadrant === q && e.id !== excludeId).map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {definition && quadrant && (
        /* A cor acompanha o texto, nunca o substitui. */
        <p className="text-xs text-lab-muted mt-2 flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: quadrant.cssVar }}
          />
          <span>{describeQuadrant(definition.quadrant)}</span>
        </p>
      )}
    </div>
  )
}

function IntensityRadios({
  name,
  legend,
  value,
  onChange,
}: {
  name: string
  legend: string
  value: EmotionIntensity
  onChange: (intensity: EmotionIntensity) => void
}) {
  return (
    <fieldset className="border-0 p-0 m-0 mt-3">
      <legend className="text-sm text-lab-muted mb-1">{legend}</legend>
      <div className="flex flex-wrap gap-3">
        {INTENSITIES.map((level) => (
          <label key={level} className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input
              type="radio"
              name={name}
              value={level}
              checked={value === level}
              onChange={() => onChange(level)}
            />
            <span>{level}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function EmotionalContextFields({ value, onChange, relationshipLabel }: Props) {
  const baseId = useId()
  const context: EmotionalContext = value ?? { version: 1 }

  const update = (patch: Partial<EmotionalContext>) => {
    const next: EmotionalContext = { ...context, ...patch }
    onChange(hasEmotionalContent(next) ? next : undefined)
  }

  const primary = context.primaryEmotion
  const secondary = context.secondaryEmotion
  const perception = context.relationshipPerception
  const ratingRegistered = perception?.rating !== undefined

  const selectPrimary = (emotionId: string) => {
    update({
      primaryEmotion: { emotionId, intensity: primary?.intensity ?? DEFAULT_INTENSITY },
      // A secundária nunca pode repetir a principal.
      secondaryEmotion: secondary?.emotionId === emotionId ? undefined : secondary,
      // "Não consigo identificar" não coexiste com uma emoção nomeada.
      unidentifiedEmotion: undefined,
    })
  }

  // Sem principal, a secundária ficaria órfã (e seria descartada no saneamento).
  const clearPrimary = () => update({ primaryEmotion: undefined, secondaryEmotion: undefined })

  const toggleUnidentified = (checked: boolean) => {
    update(
      checked
        ? { unidentifiedEmotion: true, primaryEmotion: undefined, secondaryEmotion: undefined }
        : { unidentifiedEmotion: undefined }
    )
  }

  const setRating = (rating: number) => {
    update({ relationshipPerception: { ...perception, rating } })
  }

  const setConfidence = (confidence: PerceptionConfidence | undefined) => {
    if (!perception) return
    const next = { ...perception }
    if (confidence === undefined) delete next.confidence
    else next.confidence = confidence
    update({ relationshipPerception: next })
  }

  const ratingLabel = ratingRegistered ? relationshipRatingLabel(perception.rating) : null
  const sliderValue = perception?.rating ?? SLIDER_RESTING_POSITION
  const sliderId = `${baseId}-rating`

  return (
    <div className="space-y-6">
      {/* ---------------- Registro emocional ---------------- */}
      <section>
        <h3 className="font-medium mb-1">Como estou me sentindo agora</h3>
        <p className="text-xs text-lab-muted mb-4">
          Opcional. Serve para dar contexto à sessão — não altera seus resultados nem a
          análise do seu desempenho.
        </p>

        <label className="flex items-center gap-2 text-sm mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={context.unidentifiedEmotion === true}
            onChange={(e) => toggleUnidentified(e.target.checked)}
          />
          <span>Não consigo identificar agora</span>
        </label>

        {context.unidentifiedEmotion !== true && (
          <div className="space-y-4">
            <div>
              <EmotionSelect
                id={`${baseId}-primary`}
                label="Emoção principal"
                selected={primary}
                onSelect={selectPrimary}
                onClear={clearPrimary}
              />
              {primary && (
                <IntensityRadios
                  name={`${baseId}-primary-intensity`}
                  legend={`Intensidade de ${getEmotionById(primary.emotionId)?.label ?? 'emoção'} (1 a 5)`}
                  value={primary.intensity}
                  onChange={(intensity) => update({ primaryEmotion: { ...primary, intensity } })}
                />
              )}
            </div>

            {/* A secundária só faz sentido depois da principal. */}
            {primary && (
              <div>
                <EmotionSelect
                  id={`${baseId}-secondary`}
                  label="Emoção secundária (opcional)"
                  selected={secondary}
                  excludeId={primary.emotionId}
                  onSelect={(emotionId) =>
                    update({
                      secondaryEmotion: {
                        emotionId,
                        intensity: secondary?.intensity ?? DEFAULT_INTENSITY,
                      },
                    })
                  }
                  onClear={() => update({ secondaryEmotion: undefined })}
                />
                {secondary && (
                  <IntensityRadios
                    name={`${baseId}-secondary-intensity`}
                    legend={`Intensidade de ${getEmotionById(secondary.emotionId)?.label ?? 'emoção'} (1 a 5)`}
                    value={secondary.intensity}
                    onChange={(intensity) => update({ secondaryEmotion: { ...secondary, intensity } })}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ---------------- Percepção da relação ---------------- */}
      <section className="pt-5 border-t border-lab-border">
        <h3 className="font-medium mb-1">{relationshipQuestion(relationshipLabel)}</h3>
        <p className="text-xs text-lab-muted mb-4">
          Este registro representa sua percepção neste momento. Ela pode ser influenciada pelo
          contexto, acontecimentos recentes, ansiedade, cansaço ou outras emoções.
        </p>

        <label htmlFor={sliderId} className="text-sm text-lab-muted block">
          Percepção da relação agora
        </label>
        <input
          id={sliderId}
          type="range"
          min={RELATIONSHIP_RATING_MIN}
          max={RELATIONSHIP_RATING_MAX}
          step={1}
          className="w-full mt-3"
          value={sliderValue}
          aria-valuetext={ratingRegistered ? (ratingLabel ?? undefined) : 'Não registrado'}
          onChange={(e) => setRating(Number(e.target.value))}
          onPointerUp={(e) => {
            // Clicar exatamente sobre a posição de repouso não muda o valor do
            // input e portanto não dispara `change` — sem isto, seria impossível
            // registrar justamente o valor do meio da escala com um clique.
            // Pelo teclado não é preciso: a partir do repouso toda tecla de
            // operação altera o valor e já dispara `change`.
            if (!ratingRegistered) setRating(Number(e.currentTarget.value))
          }}
        />

        <div className="flex justify-between text-[11px] text-lab-muted mt-1" aria-hidden="true">
          {RELATIONSHIP_ANCHORS.map((anchor) => (
            <span key={anchor.value}>{anchor.label}</span>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 mt-3">
          <p className="text-sm">
            {ratingRegistered ? (
              <>
                <span className="text-lab-muted">Sua resposta: </span>
                <span className="font-medium">{ratingLabel}</span>
              </>
            ) : (
              <span className="text-lab-muted">Não registrado — mova o controle para responder.</span>
            )}
          </p>
          {ratingRegistered && (
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => update({ relationshipPerception: undefined })}
            >
              Limpar resposta
            </button>
          )}
        </div>

        {/* Confiança só existe se houver percepção registrada. */}
        {ratingRegistered && (
          <fieldset className="border-0 p-0 m-0 mt-5">
            <legend className="text-sm text-lab-muted mb-1">
              Quanto confio nessa percepção neste momento?
            </legend>
            <p className="text-xs text-lab-muted mb-2">
              Este campo descreve sua confiança na própria leitura agora. Ele não corrige nem
              invalida o que você registrou acima.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {CONFIDENCE_LEVELS.map((level) => (
                <label key={level.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name={`${baseId}-confidence`}
                    value={level.value}
                    checked={perception?.confidence === level.value}
                    onChange={() => setConfidence(level.value)}
                  />
                  <span>{level.label}</span>
                </label>
              ))}
            </div>
            {perception?.confidence !== undefined && (
              <button
                type="button"
                className="btn-secondary text-xs mt-3"
                onClick={() => setConfidence(undefined)}
              >
                Limpar confiança
              </button>
            )}
          </fieldset>
        )}
      </section>
    </div>
  )
}
