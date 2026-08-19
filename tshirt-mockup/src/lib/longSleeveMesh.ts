import type { BufferAttribute, InterleavedBufferAttribute } from 'three'

/** 0 di bahu, 1 di manset (sebelum ditarik). */
export function sleeveAlongParam(x: number, y: number, _z: number) {
  const absx = Math.abs(x)
  if (y > 0.152 || y < -0.015) return 0
  if (absx < 0.16) return 0
  const along = Math.min(1, Math.max(0, (0.152 - y) / 0.135))
  const out = Math.min(1, Math.max(0, (absx - 0.16) / 0.072))
  return along * out
}

function sleeveStretchWeight(x: number, y: number, z: number) {
  const a = sleeveAlongParam(x, y, z)
  return a * a
}

/** Memanjangkan lengan mesh asli; jahitan bahu tidak digeser. */
export function stretchSleevesLong(position: BufferAttribute | InterleavedBufferAttribute) {
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    const w = sleeveStretchWeight(x, y, z)
    if (w <= 0) continue
    const side = x < 0 ? -1 : 1
    position.setXYZ(i, x + side * -0.04 * w, y - 0.33 * w, z + 0.012 * w)
  }
  position.needsUpdate = true
}
