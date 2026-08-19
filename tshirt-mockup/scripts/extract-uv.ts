import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collarPathD,
  isCollarVertex,
  isSleeveVertex,
  LONG_LAYOUT,
  remapLongLayoutUv,
  sleevePathD,
} from '../src/lib/sleeveStyle'

const SIZE = 1024
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const buf = readFileSync(join(root, 'public/models/shirt_baked.glb'))
const jsonLen = buf.readUInt32LE(12)
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
const binStart = 20 + jsonLen + 8

const uvView = json.bufferViews[2]
const posView = json.bufferViews[0]
const idxView = json.bufferViews[3]
const uv = new Float32Array(buf.buffer, buf.byteOffset + binStart + uvView.byteOffset, uvView.byteLength / 4)
const pos = new Float32Array(buf.buffer, buf.byteOffset + binStart + posView.byteOffset, posView.byteLength / 4)
const idx = new Uint16Array(buf.buffer, buf.byteOffset + binStart + idxView.byteOffset, idxView.byteLength / 2)

const toX = (u: number) => (1 - u) * SIZE
const toY = (v: number) => v * SIZE
const fmt = (n: number) => n.toFixed(1)

function vertUV(i: number, longSleeve: boolean) {
  const u = uv[i * 2]
  const v = uv[i * 2 + 1]
  if (!longSleeve) return { u, v }
  return remapLongLayoutUv(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], u, v)
}

function isMoved(i: number) {
  return (
    isCollarVertex(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], uv[i * 2 + 1]) ||
    isSleeveVertex(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], uv[i * 2 + 1])
  )
}

function buildSvg(longSleeve: boolean) {
  const undirected = new Map<string, true>()
  const addEdge = (ia: number, ib: number) => {
    if (longSleeve && (isMoved(ia) || isMoved(ib))) return
    if (longSleeve && (toY(uv[ia * 2 + 1]) > 720 || toY(uv[ib * 2 + 1]) > 720)) return
    const key = ia < ib ? `${ia}|${ib}` : `${ib}|${ia}`
    if (undirected.has(key)) undirected.delete(key)
    else undirected.set(key, true)
  }

  let frontU = 0
  let frontV = 0
  let frontN = 0
  let backU = 0
  let backV = 0
  let backN = 0
  const tris: string[] = []
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t]
    const b = idx[t + 1]
    const c = idx[t + 2]
    addEdge(a, b)
    addEdge(b, c)
    addEdge(c, a)
    if (longSleeve && (isMoved(a) || isMoved(b) || isMoved(c))) continue
    if (
      longSleeve &&
      Math.max(toY(uv[a * 2 + 1]), toY(uv[b * 2 + 1]), toY(uv[c * 2 + 1])) > 720
    ) {
      continue
    }
    const ua = vertUV(a, longSleeve)
    const ub = vertUV(b, longSleeve)
    const uc = vertUV(c, longSleeve)
    tris.push(
      `M${fmt(toX(ua.u))} ${fmt(toY(ua.v))}L${fmt(toX(ub.u))} ${fmt(toY(ub.v))}L${fmt(toX(uc.u))} ${fmt(toY(uc.v))}Z`,
    )
    const x = (pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3
    const y = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3
    const z = (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3
    const cu = (ua.u + ub.u + uc.u) / 3
    const cv = (ua.v + ub.v + uc.v) / 3
    if (z > 0.045 && Math.abs(x) < 0.17 && !isMoved(a)) {
      frontU += cu
      frontV += cv
      frontN += 1
    } else if (z < -0.045 && Math.abs(x) < 0.17 && !isMoved(a)) {
      backU += cu
      backV += cv
      backN += 1
    }
  }

  let outline = ''
  for (const key of undirected.keys()) {
    const [as, bs] = key.split('|')
    const a = Number(as)
    const b = Number(bs)
    outline += `M${fmt(toX(vertUV(a, longSleeve).u))} ${fmt(toY(vertUV(a, longSleeve).v))}L${fmt(toX(vertUV(b, longSleeve).u))} ${fmt(toY(vertUV(b, longSleeve).v))}`
  }

  const plates = longSleeve
    ? `<path d="${sleevePathD(LONG_LAYOUT.sleeveL)}" fill="#ffffff" stroke="#b7b7c0" stroke-width="1.1"/>
  <path d="${sleevePathD(LONG_LAYOUT.sleeveR)}" fill="#ffffff" stroke="#b7b7c0" stroke-width="1.1"/>
  <path d="${collarPathD(LONG_LAYOUT.collar)}" fill="#ffffff" stroke="#b7b7c0" stroke-width="1.1"/>`
    : ''

  const longLabels = longSleeve
    ? `<text x="${LONG_LAYOUT.sleeveL.x + LONG_LAYOUT.sleeveL.w / 2}" y="${LONG_LAYOUT.sleeveL.y + LONG_LAYOUT.sleeveL.h * 0.55}" text-anchor="middle" fill="#9a9aa3" font-family="Inter,system-ui,sans-serif" font-size="20">Lengan</text>
  <text x="${LONG_LAYOUT.sleeveR.x + LONG_LAYOUT.sleeveR.w / 2}" y="${LONG_LAYOUT.sleeveR.y + LONG_LAYOUT.sleeveR.h * 0.55}" text-anchor="middle" fill="#9a9aa3" font-family="Inter,system-ui,sans-serif" font-size="20">Lengan</text>
  <text x="${LONG_LAYOUT.collar.x + LONG_LAYOUT.collar.w / 2}" y="${LONG_LAYOUT.collar.y + 24}" text-anchor="middle" fill="#9a9aa3" font-family="Inter,system-ui,sans-serif" font-size="16">Kerah</text>`
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <rect width="100%" height="100%" fill="#f3f3f5"/>
  <path d="${tris.join('')}" fill="#ffffff" stroke="none"/>
  <path d="${outline}" fill="none" stroke="#b7b7c0" stroke-width="1.1" stroke-linecap="round"/>
  ${plates}
  ${
    frontN
      ? `<text x="${fmt(toX(frontU / frontN))}" y="${fmt(toY(frontV / frontN))}" text-anchor="middle" fill="#9a9aa3" font-family="Inter,system-ui,sans-serif" font-size="22">Depan</text>`
      : ''
  }
  ${
    backN
      ? `<text x="${fmt(toX(backU / backN))}" y="${fmt(toY(backV / backN))}" text-anchor="middle" fill="#9a9aa3" font-family="Inter,system-ui,sans-serif" font-size="22">Belakang</text>`
      : ''
  }
  ${longLabels}
</svg>
`
}

writeFileSync(join(root, 'public/uv-layout.svg'), buildSvg(false))
writeFileSync(join(root, 'public/uv-layout-long.svg'), buildSvg(true))
console.log('wrote uv-layout.svg and uv-layout-long.svg')
