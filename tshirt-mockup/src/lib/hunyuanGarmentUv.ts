import { BufferAttribute, type BufferGeometry } from 'three'
import type { Island } from './sleeveStyle'

/** Tata letak 2D mode panjang untuk mesh Hunyuan (pixel 1024). */
export const HUNYUAN_ISLANDS = {
  back: { x: 40, y: 48, w: 440, h: 650 } satisfies Island,
  front: { x: 544, y: 48, w: 440, h: 650 } satisfies Island,
  collar: { x: 248, y: 714, w: 528, h: 34 } satisfies Island,
  sleeveR: { x: 200, y: 762, w: 152, h: 236 } satisfies Island,
  sleeveL: { x: 672, y: 762, w: 152, h: 236 } satisfies Island,
}

export type HunyuanPart = 'collar' | 'sleeveL' | 'sleeveR' | 'front' | 'back'

function torsoHalf(y: number) {
  if (y >= 0.88) return 0.22
  if (y >= 0.74) return 0.36
  if (y >= 0.48) return 0.5
  if (y >= 0.18) return 0.52
  return 0.58
}

export function classifyHunyuanPart(x: number, y: number, _z: number): HunyuanPart {
  const ax = Math.abs(x)
  if (y >= 0.86 && ax <= 0.3) return 'collar'
  if (ax > torsoHalf(y) && y < 0.84) return x < 0 ? 'sleeveL' : 'sleeveR'
  return _z >= 0 ? 'front' : 'back'
}

function toUv(px: number, py: number) {
  return {
    u: 1 - px / 1024,
    v: Math.min(0.995, Math.max(0, py / 1024)),
  }
}

function map01(island: Island, nx: number, ny: number) {
  const x = island.x + Math.min(1, Math.max(0, nx)) * island.w
  const y = island.y + Math.min(1, Math.max(0, ny)) * island.h
  return toUv(x, y)
}

/** UV pulau Depan/Belakang/Lengan/Kerah, sebelum cermin X di viewer. */
export function applyHunyuanGarmentUv(geometry: BufferGeometry) {
  const pos = geometry.attributes.position
  geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  const bodyY0 = box.min.y
  const bodyY1 = 0.86
  const sleeveY1 = 0.62
  const sleeveY0 = box.min.y + 0.02
  const sleeveZ0 = box.min.z
  const sleeveZ1 = box.max.z
  const spanSleeveZ = Math.max(sleeveZ1 - sleeveZ0, 1e-6)
  const bodyX0 = -0.56
  const bodyX1 = 0.56
  const spanBodyX = bodyX1 - bodyX0
  const collarX0 = -0.28
  const collarX1 = 0.28
  const collarY0 = 0.86
  const collarY1 = box.max.y

  const uvs = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const part = classifyHunyuanPart(x, y, z)
    let mapped
    if (part === 'collar') {
      mapped = map01(
        HUNYUAN_ISLANDS.collar,
        (x - collarX0) / (collarX1 - collarX0),
        (collarY1 - y) / Math.max(collarY1 - collarY0, 1e-6),
      )
    } else if (part === 'sleeveL' || part === 'sleeveR') {
      mapped = map01(
        part === 'sleeveL' ? HUNYUAN_ISLANDS.sleeveL : HUNYUAN_ISLANDS.sleeveR,
        (z - sleeveZ0) / spanSleeveZ,
        (sleeveY1 - y) / Math.max(sleeveY1 - sleeveY0, 1e-6),
      )
    } else {
      mapped = map01(
        part === 'front' ? HUNYUAN_ISLANDS.front : HUNYUAN_ISLANDS.back,
        part === 'front' ? (x - bodyX0) / spanBodyX : (bodyX1 - x) / spanBodyX,
        (bodyY1 - y) / Math.max(bodyY1 - bodyY0, 1e-6),
      )
    }
    uvs[i * 2] = mapped.u
    uvs[i * 2 + 1] = mapped.v
  }
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
}
