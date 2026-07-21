import { useId } from 'react'
import { LISDEXAMFETAMINE_ID, type LisdexamfetamineStatus, type MedicationContext } from '../types'
import { getConditionsLisdexamfetamineStatus, lisdexamfetamineStatusLabel } from '../medicationContext'

interface Props {
  value?: MedicationContext
  onChange: (next: MedicationContext | undefined) => void
}

/**
 * As três opções são explícitas de propósito.
 *
 * Um checkbox simples seria ambíguo no estado desmarcado: não daria para
 * distinguir "não tomei" de "não respondi", e essa diferença decide se a
 * sessão entra ou não numa referência contextual. Por isso "Não informado" é
 * uma opção de primeira classe e não a mera ausência de clique.
 */
const OPTIONS: { value: LisdexamfetamineStatus; hint?: string }[] = [
  { value: 'taken' },
  { value: 'not_taken' },
  { value: 'unknown', hint: 'Não entra em nenhuma referência por contexto.' },
]

export function LisdexamfetamineField({ value, onChange }: Props) {
  const baseId = useId()
  const record = value?.[LISDEXAMFETAMINE_ID]
  // Sem registro nenhum, NADA fica marcado: a ausência é o estado inicial e
  // não pode parecer uma resposta dada.
  const selected = record?.status
  const effective = getConditionsLisdexamfetamineStatus({ medications: value })

  const update = (patch: Partial<NonNullable<MedicationContext['lisdexamfetamine']>>) => {
    const next = { ...(record ?? { status: 'unknown' as const }), ...patch }
    onChange({ [LISDEXAMFETAMINE_ID]: next })
  }

  const clear = () => onChange(undefined)

  return (
    <fieldset className="border-0 p-0 m-0">
      <legend className="font-medium mb-1">Tomou lisdexanfetamina antes desta sessão?</legend>
      <p className="text-xs text-lab-muted mb-3">
        Opcional. Este registro serve para comparar sessões com o mesmo contexto — não
        recomenda, avalia nem interpreta o uso do medicamento.
      </p>

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {OPTIONS.map((option) => (
          <label key={option.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input
              type="radio"
              name={`${baseId}-lisdexamfetamine`}
              value={option.value}
              checked={selected === option.value}
              onChange={() => update({ status: option.value })}
            />
            <span>{lisdexamfetamineStatusLabel(option.value)}</span>
          </label>
        ))}
      </div>

      <p className="text-xs text-lab-muted mt-2">
        Estado registrado: <span className="text-lab-fg">{lisdexamfetamineStatusLabel(effective)}</span>
        {effective === 'unknown' && ' — a sessão será comparada apenas à referência geral.'}
        {OPTIONS.find((o) => o.value === selected)?.hint ? ` ${OPTIONS.find((o) => o.value === selected)!.hint}` : ''}
      </p>

      {/* Dose e horário são descritivos: nunca criam baseline por dose. */}
      {selected === 'taken' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <label className="block">
            <span className="text-sm text-lab-muted">Dose (opcional)</span>
            <input
              type="text"
              className="w-full mt-1 bg-lab-surface-1 border border-lab-border rounded-lg px-3 py-2"
              value={record?.dose ?? ''}
              onChange={(e) => update({ dose: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="text-sm text-lab-muted">Horário (opcional)</span>
            <input
              type="time"
              className="w-full mt-1 bg-lab-surface-1 border border-lab-border rounded-lg px-3 py-2"
              value={record?.time ?? ''}
              onChange={(e) => update({ time: e.target.value })}
            />
          </label>
        </div>
      )}

      {selected !== undefined && (
        <button type="button" className="btn-secondary text-xs mt-3" onClick={clear}>
          Limpar resposta
        </button>
      )}
    </fieldset>
  )
}
