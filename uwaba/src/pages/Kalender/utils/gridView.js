const clampThickness = (v) => {
  const n = Number(v)
  if (Number.isNaN(n)) return 1
  return Math.min(3, Math.max(0.5, n))
}

export const LINE_THICKNESS_MIN = 0.5
export const LINE_THICKNESS_MAX = 3
export const LINE_THICKNESS_STEP = 0.5

/**
 * Class name untuk grid kalender berdasarkan gridViewSettings
 */
export function getGridClassName(gridViewSettings, base = 'kalender-grid') {
  const g = gridViewSettings || {}
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

/** CSS variables ketebalan garis (px) untuk grid */
export function getGridLineStyle(gridViewSettings) {
  const g = gridViewSettings || {}
  const h = clampThickness(g.lineThicknessHorizontal ?? 1)
  const v = clampThickness(g.lineThicknessVertical ?? 1)
  return {
    '--kalender-line-thickness-horizontal': `${h}px`,
    '--kalender-line-thickness-vertical': `${v}px`
  }
}
