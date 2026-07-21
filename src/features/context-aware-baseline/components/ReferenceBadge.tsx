import { Badge } from '../../../components/common/Badge'
import { lisdexamfetamineStatusLabel } from '../medicationContext'
import { REFERENCE_LABELS } from '../contextualReference'
import type { ReferenceSelection } from '../types'

interface Props {
  selection: ReferenceSelection
}

/**
 * Diz, em uma frase, contra QUAL referência a sessão foi comparada e por quê.
 *
 * Toda a linguagem é descritiva. A tela nunca afirma que o medicamento
 * melhorou ou piorou o desempenho, nem sugere tomar, deixar de tomar, mudar
 * dose ou mudar horário — só informa qual conjunto de sessões serviu de
 * referência.
 */
export function ReferenceBadge({ selection }: Props) {
  const { metadata } = selection.reference
  const label = REFERENCE_LABELS[metadata.kind]

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="help-text">Comparado à sua</span>
        <Badge tone={metadata.fallback ? 'neutral' : 'accent'} dot>
          {label}
          {metadata.sessionCount > 0 && ` · ${metadata.sessionCount} sessões`}
        </Badge>
        {metadata.fallback && <Badge tone="warning">fallback</Badge>}
      </div>

      {metadata.fallbackReason === 'contextual_incomplete' && (
        <p className="help-text max-w-prose">
          A referência geral foi utilizada porque a referência deste contexto ainda está em
          construção ({selection.sessionStatus === 'taken'
            ? `${selection.progress.taken.count}/${selection.progress.taken.required} com lisdexanfetamina`
            : `${selection.progress.notTaken.count}/${selection.progress.notTaken.required} sem lisdexanfetamina`}
          ). A referência geral pode misturar contextos diferentes.
        </p>
      )}

      {metadata.fallbackReason === 'unknown_status' && (
        <p className="help-text max-w-prose">
          O uso de lisdexanfetamina não foi informado nesta sessão, então ela é comparada apenas
          à referência geral, que pode misturar contextos diferentes.
        </p>
      )}

      {!metadata.fallback && metadata.kind !== 'general' && (
        <p className="help-text max-w-prose">
          Esta referência reúne apenas sessões em que você registrou{' '}
          {lisdexamfetamineStatusLabel(
            metadata.kind === 'lisdexamfetamine_taken' ? 'taken' : 'not_taken'
          ).toLowerCase()}
          {' '}para lisdexanfetamina.
        </p>
      )}
    </div>
  )
}
