import clsx from 'clsx'
import { CorsiBoard } from './CorsiBoard'

const COLOR_MAP: Record<string, string> = {
  vermelho: '#ef4444',
  azul: '#3b82f6',
  verde: '#22c55e',
  amarelo: '#eab308',
}

interface Props {
  testId: string
  stimulus: string
  metadata?: Record<string, unknown>
  feedback?: 'correct' | 'incorrect' | null
  showMapping?: boolean
  phase?: string
  onCorsiBlockClick?: (blockId: number) => void
}

function parseStroop(stimulus: string, metadata?: Record<string, unknown>) {
  if (metadata?.word !== undefined && metadata?.inkColor !== undefined) {
    return { word: String(metadata.word), inkColor: String(metadata.inkColor) }
  }
  if (stimulus.startsWith('{')) {
    try {
      const p = JSON.parse(stimulus) as { word: string; inkColor: string }
      return { word: p.word, inkColor: p.inkColor }
    } catch { /* fall through */ }
  }
  const parts = stimulus.split('|')
  return { word: parts[0], inkColor: parts[1] ?? 'vermelho' }
}

export function StimulusDisplay({
  testId,
  stimulus,
  metadata,
  feedback,
  showMapping,
  phase,
  onCorsiBlockClick,
}: Props) {
  const feedbackClass = feedback === 'correct'
    ? 'ring-2 ring-lab-success'
    : feedback === 'incorrect'
      ? 'ring-2 ring-lab-danger'
      : ''

  if (testId === 'simple_rt') {
    return (
      <div className={clsx('flex items-center justify-center h-full', feedbackClass)}>
        <div className="w-24 h-24 rounded-full bg-lab-success shadow-lg shadow-lab-success/30" />
      </div>
    )
  }

  if (testId === 'choice_rt') {
    const side =
      stimulus === 'left' || stimulus === 'arrow_left' || metadata?.side === 'left'
        ? 'left'
        : 'right'
    return (
      <div className={clsx('flex items-center justify-center h-full gap-32', feedbackClass)}>
        <div className={clsx(
          'w-20 h-20 rounded-lg transition-opacity',
          side === 'left' ? 'bg-lab-accent opacity-100' : 'bg-lab-border opacity-30'
        )} />
        <div className="text-lab-muted text-sm">F ← → J</div>
        <div className={clsx(
          'w-20 h-20 rounded-lg transition-opacity',
          side === 'right' ? 'bg-lab-accent opacity-100' : 'bg-lab-border opacity-30'
        )} />
      </div>
    )
  }

  if (testId === 'stroop') {
    const { word, inkColor } = parseStroop(stimulus, metadata)
    const ink = COLOR_MAP[inkColor] ?? '#fff'
    const normalizedWord = word.trim()
    const displayWord = (normalizedWord || word || stimulus).toUpperCase()
    return (
      <div className={clsx('flex flex-col items-center justify-center h-full gap-8', feedbackClass)}>
        <div
          className="text-5xl font-bold tracking-wider"
          style={{ color: ink }}
          data-testid="stroop-word"
          data-word={word}
          data-ink-color={inkColor}
        >
          {displayWord}
        </div>
        {showMapping && (
          <div className="flex gap-4 text-sm text-lab-muted">
            <span><kbd className="kbd">F</kbd> Vermelho</span>
            <span><kbd className="kbd">G</kbd> Azul</span>
            <span><kbd className="kbd">H</kbd> Verde</span>
            <span><kbd className="kbd">J</kbd> Amarelo</span>
          </div>
        )}
      </div>
    )
  }

  if (testId === 'gonogo') {
    const isGo =
      stimulus === 'go' ||
      stimulus === 'green_circle' ||
      metadata?.isGo === true ||
      metadata?.condition === 'go'
    return (
      <div className={clsx('flex items-center justify-center h-full', feedbackClass)}>
        <div
          className={clsx(
            'w-28 h-28 rounded-full shadow-lg',
            isGo ? 'bg-lab-success shadow-lab-success/30' : 'bg-lab-danger shadow-lab-danger/30'
          )}
        />
      </div>
    )
  }

  if (testId === 'sart') {
    if (phase === 'stimulus') {
      return (
        <div className={clsx('flex items-center justify-center h-full', feedbackClass)}>
          <span className="text-8xl font-mono font-light" data-testid="sart-digit" data-sart-active-stimulus="true">
            {stimulus}
          </span>
        </div>
      )
    }

    if (phase === 'response') {
      return (
        <div className={clsx('flex items-center justify-center h-full bg-lab-bg', feedbackClass)}>
          <svg
            className="w-32 h-32 text-lab-muted opacity-80"
            viewBox="0 0 100 100"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            data-testid="sart-mask"
            data-sart-active-stimulus="true"
          >
            <circle cx="50" cy="50" r="45" />
            <line x1="18.18" y1="18.18" x2="81.82" y2="81.82" />
            <line x1="81.82" y1="18.18" x2="18.18" y2="81.82" />
          </svg>
        </div>
      )
    }

    return (
      <div className={clsx('flex items-center justify-center h-full bg-lab-bg', feedbackClass)} />
    )
  }

  if (testId === 'nback') {
    const position = parseInt(stimulus, 10)
    const n = (metadata?.nBack as number) ?? (metadata?.n as number) ?? 1
    return (
      <div className={clsx('flex flex-col items-center justify-center h-full gap-4', feedbackClass)}>
        <span className="text-lab-muted text-sm">{n}-back — posição atual</span>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div
              key={i}
              className={clsx(
                'w-16 h-16 rounded-lg border-2 transition-all',
                i === position && phase === 'stimulus'
                  ? 'bg-lab-accent border-lab-accent scale-110'
                  : 'bg-lab-surface-2 border-lab-border'
              )}
            />
          ))}
        </div>
        <span className="text-lab-muted text-xs">Espaço = combina com N atrás</span>
      </div>
    )
  }

  if (testId === 'taskswitch') {
    const number = stimulus.includes('|') ? stimulus.split('|')[0] : stimulus
    const task = (metadata?.task as string) ?? stimulus.split('|')[1] ?? 'odd_even'
    const borderColor = task === 'odd_even' ? '#4a9eff' : '#22c55e'
    return (
      <div className={clsx('flex flex-col items-center justify-center h-full gap-6', feedbackClass)}>
        <div
          className="w-32 h-32 rounded-xl flex items-center justify-center text-6xl font-mono border-4"
          style={{ borderColor }}
        >
          {number}
        </div>
        <span className="text-lab-muted text-sm">
          {task === 'odd_even' ? 'Par ou Ímpar (azul)' : 'Maior ou menor que 5 (verde)'}
        </span>
        {showMapping && (
          <div className="text-sm text-lab-muted">
            <kbd className="kbd">F</kbd> esquerda · <kbd className="kbd">J</kbd> direita
          </div>
        )}
      </div>
    )
  }

  if (testId === 'corsi') {
    const highlight = (metadata?.highlight as number) ?? -1
    return <CorsiBoard highlight={highlight} interactive={phase === 'response'} onBlockClick={onCorsiBlockClick} />
  }

  return <div className="text-lab-muted">{stimulus}</div>
}
