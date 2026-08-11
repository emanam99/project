import type { CSSProperties } from 'react'

export type GridViewSettings = {
  showDateBox: boolean
  showHorizontalLines: boolean
  showVerticalLines: boolean
  lineThicknessHorizontal: number
  lineThicknessVertical: number
}

const clampThickness = (v: number) => {
  const n = Number(v)
  if (Number.isNaN(n)) return 1
  return Math.min(3, Math.max(0.5, n))
}

export const LINE_THICKNESS_MIN = 0.5
export const LINE_THICKNESS_MAX = 3
export const LINE_THICKNESS_STEP = 0.5

export function getGridClassName(gridViewSettings: GridViewSettings | null | undefined, base = 'kalender-grid'): string {
  const g = gridViewSettings || ({} as GridViewSettings)
  const noBox = g.showDateBox === false
  const noH = g.showHorizontalLines === false
  const noV = g.showVerticalLines === false
  let c = base
  if (noBox) c += ' kalender-grid--no-day-box'
  if (noH) c += ' kalender-grid--no-horizontal-lines'
  if (noV) c += ' kalender-grid--no-vertical-lines'
  if (noBox && g.showHorizontalLines !== false) c += ' kalender-grid--show-horizontal-lines'
  if (noBox && g.showVerticalLines !== false) c += ' kalender-grid--show-vertical-lines'
  return c
}

export function getGridLineStyle(gridViewSettings: GridViewSettings): CSSProperties {
  const g = gridViewSettings || ({} as GridViewSettings)
  const h = clampThickness(g.lineThicknessHorizontal ?? 1)
  const v = clampThickness(g.lineThicknessVertical ?? 1)
  return {
    '--kalender-line-thickness-horizontal': `${h}px`,
    '--kalender-line-thickness-vertical': `${v}px`,
  } as CSSProperties
}
