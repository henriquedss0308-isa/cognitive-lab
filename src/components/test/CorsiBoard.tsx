import clsx from 'clsx'
import { CORSI_BLOCK_LAYOUT } from './corsiLayout'

interface Props {
  highlight?: number
  interactive?: boolean
  onBlockClick?: (blockId: number) => void
}

export function CorsiBoard({ highlight = -1, interactive = false, onBlockClick }: Props) {
  return (
    <div
      className="relative w-full max-w-lg h-80 mx-auto"
      data-testid="corsi-board"
      data-layout-id="corsi-fixed-layout-v1"
      data-block-count={CORSI_BLOCK_LAYOUT.length}
    >
      {CORSI_BLOCK_LAYOUT.map((block) => {
        const isHighlighted = block.id === highlight

        return (
          <button
            key={block.id}
            type="button"
            aria-label={`Corsi block ${block.id + 1}`}
            aria-disabled={!interactive}
            tabIndex={interactive ? 0 : -1}
            data-testid="corsi-block"
            data-block-id={block.id}
            data-x={block.x}
            data-y={block.y}
            data-size={block.size}
            className={clsx(
              'absolute block w-14 h-14 rounded-lg border-2 p-0 appearance-none -translate-x-1/2 -translate-y-1/2 transition-colors duration-150',
              isHighlighted
                ? 'bg-lab-accent border-lab-accent opacity-100'
                : 'bg-lab-surface-2 border-lab-border opacity-75',
              interactive
                ? 'cursor-pointer hover:bg-lab-accent/30 focus:outline-none focus:ring-2 focus:ring-lab-accent'
                : 'pointer-events-none cursor-default'
            )}
            style={{ left: `${block.x}%`, top: `${block.y}%` }}
            onClick={() => {
              if (interactive) onBlockClick?.(block.id)
            }}
          />
        )
      })}
    </div>
  )
}
