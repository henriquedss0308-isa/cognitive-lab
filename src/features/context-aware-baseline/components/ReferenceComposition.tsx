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
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <caption className="sr-only">Sessões que compõem esta referência</caption>
        <thead>
          <tr className="text-left text-xs text-lab-muted">
            <th scope="col" className="py-2 pr-3 font-medium">Data</th>
            <th scope="col" className="py-2 pr-3 font-medium">Lisdexanfetamina</th>
            <th scope="col" className="py-2 pr-3 font-medium">Cafeína</th>
            <th scope="col" className="py-2 pr-3 font-medium">Sono</th>
            <th scope="col" className="py-2 pr-3 font-medium">Qual. sono</th>
            <th scope="col" className="py-2 pr-3 font-medium">Horário</th>
            <th scope="col" className="py-2 pr-3 font-medium">Dispositivo</th>
            <th scope="col" className="py-2 pr-3 font-medium">Qualidade</th>
            <th scope="col" className="py-2 font-medium">Protocolo</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => {
            const checkIn = session.checkIn
            const caffeine = checkIn?.substances?.caffeine
            const sleep = formatSleepHours(checkIn?.sleep?.hours ?? null)
            return (
              <tr key={session.sessionId} className="border-t border-lab-border">
                <td className="py-2 pr-3 whitespace-nowrap">
                  {new Date(session.startedAt).toLocaleDateString('pt-BR')}
                </td>
                <td className="py-2 pr-3">
                  {lisdexamfetamineStatusLabel(getSessionLisdexamfetamineStatus(session))}
                </td>
                <td className="py-2 pr-3">
                  {caffeine === undefined ? 'Não informado' : caffeine ? 'Sim' : 'Não'}
                </td>
                <td className="py-2 pr-3">{sleep ?? '—'}</td>
                <td className="py-2 pr-3">
                  {checkIn?.sleep?.quality !== undefined ? `${checkIn.sleep.quality}/5` : '—'}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {formatMinutesOfDay(minutesSinceMidnight(session.startedAt)) ?? '—'}
                </td>
                <td className="py-2 pr-3">{session.deviceInfo?.deviceType ?? '—'}</td>
                <td className="py-2 pr-3">
                  {session.quality === 'valid_with_warnings' ? 'Com avisos' : 'Válida'}
                </td>
                <td className="py-2 font-mono text-xs">{session.protocolVersion}</td>
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
    <div className="text-sm text-lab-muted mt-3 space-y-1">
      <p>
        Com lisdexanfetamina: {composition.taken} · Sem lisdexanfetamina: {composition.notTaken} ·
        Não informado: {composition.unknown}
      </p>
      <p className="text-lab-fg">{classificationLabel(classification)}</p>
      <p className="text-xs">
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
  return (
    <li>
      {label}: <span className="text-lab-fg font-mono">{count}/{required}</span>
      {count >= required && ' — referência completa'}
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

        <ul className="text-sm text-lab-muted space-y-1 mb-4">
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
