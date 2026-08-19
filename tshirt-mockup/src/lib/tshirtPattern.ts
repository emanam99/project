export const PATTERN = {
  width: 1024,
  height: 1024,
} as const

export type Island = { x: number; y: number; w: number; h: number }

/** Titik dada depan di ruang UV model (pixel 1024). */
export function frontChestPoint() {
  return { x: 757, y: 440 }
}

export function mapToIsland(u01: number, v01: number, island: Island) {
  const canvasX = island.x + u01 * island.w
  const canvasY = island.y + (1 - v01) * island.h
  return {
    u: canvasX / PATTERN.width,
    v: 1 - canvasY / PATTERN.height,
  }
}
