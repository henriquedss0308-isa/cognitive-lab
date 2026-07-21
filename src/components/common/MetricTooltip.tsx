const EXPLANATIONS: Record<string, string> = {
  medianCorrectRT: 'Tempo central das suas respostas corretas. É menos afetada por respostas extremamente lentas que a média.',
  rtCV: 'Mostra o quanto seu tempo de reação variou em relação à sua velocidade média.',
  dPrime: 'Estima a capacidade de distinguir alvos de não alvos, separando discriminação de tendência geral de responder.',
  stroopCostRT: 'Diferença entre respostas incongruentes e congruentes. Deve ser interpretada junto às condições originais.',
  switchCost: 'Tempo adicional observado quando a regra muda em comparação com quando a regra se repete.',
  mixingCost: 'Tempo adicional em blocos mistos comparado a blocos com uma única regra.',
  accuracy: 'Proporção de respostas corretas entre todos os ensaios.',
  anticipationRate: 'Proporção de respostas muito rápidas, possivelmente antes do processamento completo do estímulo.',
  lapseRate: 'Proporção de respostas muito lentas ou ausentes.',
}

interface Props {
  metric: string
  label: string
  value: string | number | null
  unit?: string
  /** Métrica principal da sessão — recebe mais peso visual que as demais. */
  emphasis?: boolean
}

export function MetricCard({ metric, label, value, unit, emphasis = false }: Props) {
  const explanation = EXPLANATIONS[metric]
  const display = value === null || value === undefined ? '—' : typeof value === 'number' ? value.toFixed(metric.includes('Rate') || metric === 'accuracy' ? 2 : 0) : value

  return (
    <div className="card p-4 flex flex-col" title={explanation}>
      <div className="section-title">{label}</div>
      {/*
        Número e unidade separados: a unidade em peso menor deixa a magnitude
        legível de relance, que é o que se procura numa grade de métricas.
      */}
      <div className="mt-2 flex items-baseline gap-1">
        <span className={emphasis ? 'metric-value text-3xl' : 'metric-value text-2xl'}>
          {display}
        </span>
        {unit && value !== null && value !== undefined && (
          <span className="text-xs text-lab-muted">{unit.trim()}</span>
        )}
      </div>
      {explanation && <p className="help-text mt-2 flex-1">{explanation}</p>}
    </div>
  )
}
