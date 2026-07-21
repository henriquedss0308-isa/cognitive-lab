import { QUADRANTS, describeQuadrant, getEmotionById } from '../emotionCatalog'
import { hasEmotionalContent } from '../emotionalContext'
import { confidenceLabel, relationshipRatingLabel } from '../relationshipScale'
import type { EmotionalContext, EmotionSelection } from '../types'

interface Props {
  context?: EmotionalContext
  relationshipLabel?: string
}

/**
 * Exibição do contexto emocional de uma sessão.
 *
 * Toda a linguagem é descritiva e ancorada em quem relatou ("Você registrou…",
 * "Sua percepção naquele momento foi…"). A tela NUNCA afirma como a relação
 * está, se melhorou ou piorou, nem relaciona emoção com desempenho — o dado é
 * um autorrelato de um instante, não uma medida de nada.
 */
function EmotionLine({ selection, prefix }: { selection: EmotionSelection; prefix?: string }) {
  const definition = getEmotionById(selection.emotionId)

  // Id desconhecido (backup de uma versão futura, catálogo editado à mão):
  // degrada para uma linha honesta em vez de sumir ou quebrar a tela.
  if (!definition) {
    return (
      <li className="text-lab-muted">
        {prefix}Emoção não reconhecida por esta versão — intensidade {selection.intensity}/5
      </li>
    )
  }

  const quadrant = QUADRANTS[definition.quadrant]

  return (
    <li>
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: quadrant.cssVar }}
        />
        <span>
          {prefix}
          <span className="text-lab-text font-medium">{definition.label}</span>
          {' — intensidade '}
          {selection.intensity}/5
        </span>
      </span>
      <span className="block text-xs text-lab-muted ml-[18px]">
        {describeQuadrant(definition.quadrant)}
      </span>
    </li>
  )
}

export function EmotionalContextSummary({ context, relationshipLabel }: Props) {
  if (!hasEmotionalContent(context)) return null
  const ctx = context as EmotionalContext

  const perception = ctx.relationshipPerception
  const ratingLabel = perception ? relationshipRatingLabel(perception.rating) : null
  const confidence = confidenceLabel(perception?.confidence)
  const relationName = relationshipLabel?.trim()

  const hasEmotion =
    ctx.primaryEmotion !== undefined || ctx.unidentifiedEmotion === true

  return (
    <div className="space-y-5">
      {hasEmotion && (
        <section>
          <h4 className="text-lab-text font-medium mb-2">Estado emocional</h4>
          {ctx.unidentifiedEmotion === true ? (
            <p>
              Você registrou que não conseguia identificar como estava se sentindo naquele
              momento.
            </p>
          ) : (
            <ul className="space-y-2">
              {ctx.primaryEmotion && <EmotionLine selection={ctx.primaryEmotion} />}
              {ctx.secondaryEmotion && (
                <EmotionLine selection={ctx.secondaryEmotion} prefix="Emoção secundária: " />
              )}
            </ul>
          )}
        </section>
      )}

      {perception && ratingLabel && (
        <section>
          <h4 className="text-lab-text font-medium mb-2">
            {relationName ? `Percepção da relação com ${relationName}` : 'Percepção da relação'}
          </h4>
          <ul className="space-y-1">
            <li>
              Você registrou sua percepção como:{' '}
              <span className="text-lab-text font-medium">{ratingLabel}</span>
            </li>
            {confidence && <li>Confiança nessa percepção: {confidence}</li>}
          </ul>
          <p className="text-xs text-lab-muted mt-2">
            Registro de percepção naquele momento, não uma avaliação da relação.
          </p>
        </section>
      )}

      {ctx.updatedAt && (
        <p className="text-xs text-lab-muted">
          Contexto atualizado em {new Date(ctx.updatedAt).toLocaleString('pt-BR')}.
        </p>
      )}
    </div>
  )
}
