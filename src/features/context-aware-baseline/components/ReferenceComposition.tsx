import { Badge, QualityBadge } from '../../../components/common/Badge'
import type { SessionRecord } from '../../../types'
import {
  classificationLabel,
  classifyComposition,
  formatMinutesOfDay,
  formatSleepHours,
  minutesSinceMidnight,
  summarizeMedicationComposition,
} from '../contextSummary'
import { getSessionLisdexamfetamineStatus, lisdexamfetamineStatusLabel } from '../medicationContext'
import { REFERENCE_LABELS } from '../contextualReference'
import type { ContextualReference, ReferenceSelection } from '../types'

function CompositionTable({ sessions }: { sessions: SessionRecord[] }) {
  if (sessions.length === 0) {
    return <p className="text-sm text-lab-muted">Nenhuma sessão nesta janela ainda.</p>
  }

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="data-table">
        <caption className="sr-only">Sessões que compõem esta referência</caption>
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">Lisdexanfetamina</th>
            <th scope="col">Cafeína</th>
            <th scope="col">Sono</th>
            <th scope="col">Qual. sono</th>
            <th scope="col">Horário</th>
            <th scope="col">Dispositivo</th>
            <th scope="col">Qualidade</th>
            <th scope="col">Protocolo</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => {
            const checkIn = session.checkIn
            const caffeine = checkIn?.substances?.caffeine
            const sleep = formatSleepHours(checkIn?.sleep?.hours ?? null)
            return (
              <tr key={session.sessionId}>
                <td className="whitespace-nowrap num">
                  {new Date(session.startedAt).toLocaleDateString('pt-BR')}
                </td>
                <td>{lisdexamfetamineStatusLabel(getSessionLisdexamfetamineStatus(session))}</td>
                <td>{caffeine === undefined ? 'Não informado' : caffeine ? 'Sim' : 'Não'}</td>
                <td className="num">{sleep ?? '—'}</td>
                <td className="num">
                  {checkIn?.sleep?.quality !== undefined ? `${checkIn.sleep.quality}/5` : '—'}
                </td>
                <td className="whitespace-nowrap num">
                  {formatMinutesOfDay(minutesSinceMidnight(session.startedAt)) ?? '—'}
                </td>
                <td>{session.deviceInfo?.deviceType ?? '—'}</td>
                <td>
                  <QualityBadge quality={session.quality} />
                </td>
                <td className="num text-lab-muted">{session.protocolVersion}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CompositionSummary({ reference }: { reference: ContextualReference }) {
  const composition = summarizeMedicationComposition(reference.sessions)
  const classification = classifyComposition(composition)

  return (
    <div className="mt-4 pt-3 hairline space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <Badge>Com lisdexanfetamina · {composition.taken}</Badge>
        <Badge>Sem lisdexanfetamina · {composition.notTaken}</Badge>
        <Badge>Não informado · {composition.unknown}</Badge>
      </div>
      <p className="text-sm text-lab-text">{classificationLabel(classification)}</p>
      <p className="help-text">
        Esta classificação é apenas descritiva: ela não altera nenhuma métrica, nota ou
        comparação.
      </p>
    </div>
  )
}

function ProgressLine({
  label,
  count,
  required,
}: {
  label: string
  count: number
  required: number
}) {
  const complete = count >= required
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 border-b border-lab-border last:border-b-0">
      <span className="text-lab-text">{label}</span>
      <span className="flex items-center gap-2.5">
        <span className="metric-value text-sm">
          {count}/{required}
        </span>
        {complete ? (
          <Badge tone="success" dot>
            Completa
          </Badge>
        ) : (
          <Badge>Em construção</Badge>
        )}
      </span>
    </li>
  )
}

interface Props {
  selection: ReferenceSelection
  general: ContextualReference
  taken: ContextualReference
  notTaken: ContextualReference
}

/**
 * Inspeção da composição das referências de um teste.
 *
 * Mostra de que sessões cada referência é feita e como as duas janelas
 * contextuais estão progredindo. Observações pessoais e detalhes da percepção
 * relacional NÃO aparecem aqui por padrão — a composição existe para auditar
 * o baseline, não para reexibir registros íntimos.
 */
export function ReferenceComposition({ selection, general, taken, notTaken }: Props) {
  return (
    <div className="space-y-6">
      <section>
        <h4 className="font-medium mb-1">Referência geral</h4>
        <p className="text-xs text-lab-muted mb-3">
          As sessões elegíveis nº 4–11 do teste, como sempre foi. As três primeiras são
          familiarização e não entram.
        </p>
        <CompositionTable sessions={general.sessions} />
        <CompositionSummary reference={general} />
      </section>

      <section className="pt-5 border-t border-lab-border">
        <h4 className="font-medium mb-1">Referências por contexto</h4>
        <p className="text-xs text-lab-muted mb-3">
          Cada contexto reúne as primeiras oito sessões elegíveis daquele contexto APÓS a
          familiarização global. Sessões sem registro do estado medicamentoso não entram em
          nenhuma das duas.
        </p>

        <ul className="text-sm mb-5">
          <ProgressLine
            label="Com lisdexanfetamina"
            count={selection.progress.taken.count}
            required={selection.progress.taken.required}
          />
          <ProgressLine
            label="Sem lisdexanfetamina"
            count={selection.progress.notTaken.count}
            required={selection.progress.notTaken.required}
          />
        </ul>

        <div className="space-y-5">
          <div>
            <h5 className="text-sm font-medium mb-2">
              {REFERENCE_LABELS.lisdexamfetamine_taken}
            </h5>
            <CompositionTable sessions={taken.sessions} />
          </div>
          <div>
            <h5 className="text-sm font-medium mb-2">
              {REFERENCE_LABELS.lisdexamfetamine_not_taken}
            </h5>
            <CompositionTable sessions={notTaken.sessions} />
          </div>
        </div>
      </section>
    </div>
  )
}
