/** Pola kaos bersama untuk overlay 2D dan geometri 3D (ruang 0–CANVAS_SIZE). */
export const CANVAS_SIZE = 1024

export function getTShirtPathD(): string {
  const n = (x: number, y: number) => `${x} ${y}`
  return [
    `M ${n(324, 148)}`,
    `C ${n(380, 148)} ${n(430, 148)} ${n(430, 148)}`,
    `C ${n(448, 168)} ${n(476, 178)} ${n(512, 178)}`,
    `C ${n(548, 178)} ${n(576, 168)} ${n(594, 148)}`,
    `C ${n(644, 148)} ${n(700, 148)} ${n(700, 148)}`,
    `L ${n(918, 208)}`,
    `L ${n(872, 348)}`,
    `L ${n(688, 304)}`,
    `L ${n(708, 900)}`,
    `L ${n(316, 900)}`,
    `L ${n(336, 304)}`,
    `L ${n(152, 348)}`,
    `L ${n(106, 208)}`,
    'Z',
  ].join(' ')
}

export function applyTShirtShape(shape: {
  moveTo: (x: number, y: number) => unknown
  bezierCurveTo: (cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) => unknown
  lineTo: (x: number, y: number) => unknown
  closePath: () => unknown
}, flipY = true) {
  const fy = (y: number) => (flipY ? CANVAS_SIZE - y : y)
  shape.moveTo(324, fy(148))
  shape.bezierCurveTo(380, fy(148), 430, fy(148), 430, fy(148))
  shape.bezierCurveTo(448, fy(168), 476, fy(178), 512, fy(178))
  shape.bezierCurveTo(548, fy(178), 576, fy(168), 594, fy(148))
  shape.bezierCurveTo(644, fy(148), 700, fy(148), 700, fy(148))
  shape.lineTo(918, fy(208))
  shape.lineTo(872, fy(348))
  shape.lineTo(688, fy(304))
  shape.lineTo(708, fy(900))
  shape.lineTo(316, fy(900))
  shape.lineTo(336, fy(304))
  shape.lineTo(152, fy(348))
  shape.lineTo(106, fy(208))
  shape.closePath()
}
