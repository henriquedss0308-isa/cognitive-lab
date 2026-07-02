export interface CorsiBlockLayout {
  id: number
  x: number
  y: number
  size: number
}

export const CORSI_BLOCK_SIZE_PX = 56

export const CORSI_BLOCK_LAYOUT = Object.freeze([
  { id: 0, x: 15, y: 20, size: CORSI_BLOCK_SIZE_PX },
  { id: 1, x: 50, y: 10, size: CORSI_BLOCK_SIZE_PX },
  { id: 2, x: 80, y: 25, size: CORSI_BLOCK_SIZE_PX },
  { id: 3, x: 25, y: 50, size: CORSI_BLOCK_SIZE_PX },
  { id: 4, x: 55, y: 45, size: CORSI_BLOCK_SIZE_PX },
  { id: 5, x: 75, y: 55, size: CORSI_BLOCK_SIZE_PX },
  { id: 6, x: 10, y: 75, size: CORSI_BLOCK_SIZE_PX },
  { id: 7, x: 45, y: 80, size: CORSI_BLOCK_SIZE_PX },
  { id: 8, x: 85, y: 70, size: CORSI_BLOCK_SIZE_PX },
] satisfies CorsiBlockLayout[])
