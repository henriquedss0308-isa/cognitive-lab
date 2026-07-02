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
}

export function MetricCard({ metric, label, value, unit }: Props) {
  const explanation = EXPLANATIONS[metric]
  const display = value === null || value === undefined ? '—' : typeof value === 'number' ? value.toFixed(metric.includes('Rate') || metric === 'accuracy' ? 2 : 0) : value

  return (
    <div className="card p-4" title={explanation}>
      <div className="text-xs text-lab-muted uppercase tracking-wide mb-1">{label}</div>
      <div className="text-2xl font-mono font-medium">
        {display}{unit && value !== null ? unit : ''}
      </div>
      {explanation && (
        <p className="text-xs text-lab-muted mt-2 leading-relaxed">{explanation}</p>
      )}
    </div>
  )
}