export type SleeveLength = 'short' | 'long'

export type Island = { x: number; y: number; w: number; h: number }

/** Tata letak kanvas 1024 saat mode lengan panjang. */
export const LONG_LAYOUT = {
  collar: { x: 248, y: 732, w: 528, h: 30 } satisfies Island,
  sleeveR: { x: 214, y: 776, w: 138, h: 236 } satisfies Island,
  sleeveL: { x: 672, y: 776, w: 138, h: 236 } satisfies Island,
}

const SLEEVE_R_SRC: Island = { x: 220, y: 738, w: 370, h: 220 }
const SLEEVE_L_SRC: Island = { x: 600, y: 738, w: 410, h: 220 }
const COLLAR_SRC: Island = { x: 470, y: 948, w: 540, h: 72 }

export function isCollarVertex(x: number, y: number, _z: number, v: number) {
  if (v < 0.91) return false
  if (Math.abs(x) > 0.2 && y < 0.16) return false
  return true
}

export function isSleeveVertex(x: number, y: number, z: number, v: number) {
  if (isCollarVertex(x, y, z, v)) return false
  if (v < 0.68) return false
  if (y < -0.04) return false
  return Math.abs(x) > 0.145
}

function toUv(px: number, py: number) {
  return {
    u: 1 - px / 1024,
    v: Math.min(0.995, Math.max(0, py / 1024)),
  }
}

function mapIsland(px: number, py: number, src: Island, dst: Island, y0 = 0, y1 = 1) {
  const nx = (px - src.x) / src.w
  const ny = (py - src.y) / src.h
  const px2 = dst.x + nx * dst.w
  const py2 = dst.y + dst.h * (y0 + ny * (y1 - y0))
  return toUv(px2, py2)
}

/** UV asli model (sebelum cermin X). */
export function remapLongLayoutUv(x: number, y: number, z: number, u: number, v: number) {
  const px = (1 - u) * 1024
  const py = v * 1024
  if (isCollarVertex(x, y, z, v)) {
    return mapIsland(px, py, COLLAR_SRC, LONG_LAYOUT.collar)
  }
  if (isSleeveVertex(x, y, z, v)) {
    const src = x < 0 ? SLEEVE_L_SRC : SLEEVE_R_SRC
    const dst = x < 0 ? LONG_LAYOUT.sleeveL : LONG_LAYOUT.sleeveR
    const nx = Math.min(1, Math.max(0, (px - src.x) / src.w))
    const t = Math.min(1, Math.max(0, (0.152 - y) / 0.135))
    return toUv(dst.x + nx * dst.w, dst.y + t * dst.h)
  }
  return { u, v }
}

export function sleevePathD(island: Island) {
  const { x, y, w, h } = island
  const top = 18
  const capL = x + w * 0.06
  const capR = x + w * 0.94
  const cuffL = x + w * 0.22
  const cuffR = x + w * 0.78
  return [
    `M${capL.toFixed(1)} ${(y + top).toFixed(1)}`,
    `C${capL.toFixed(1)} ${y.toFixed(1)} ${capR.toFixed(1)} ${y.toFixed(1)} ${capR.toFixed(1)} ${(y + top).toFixed(1)}`,
    `L${cuffR.toFixed(1)} ${(y + h).toFixed(1)}`,
    `L${cuffL.toFixed(1)} ${(y + h).toFixed(1)}`,
    'Z',
  ].join(' ')
}

export function collarPathD(island: Island) {
  const { x, y, w, h } = island
  const r = h / 2
  return `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} T${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + r} T${x + r} ${y} Z`
}
