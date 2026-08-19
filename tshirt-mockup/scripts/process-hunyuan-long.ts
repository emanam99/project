import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BufferGeometry, type Mesh } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { collarPathD, sleevePathD } from '../src/lib/sleeveStyle'
import {
  applyHunyuanGarmentUv,
  classifyHunyuanPart,
  HUNYUAN_ISLANDS,
} from '../src/lib/hunyuanGarmentUv'

function pad4(size: number) {
  return (4 - (size % 4)) % 4
}

function writeGlb(geometry: BufferGeometry, outPath: string) {
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const uv = geometry.getAttribute('uv')
  const index = geometry.getIndex()
  if (!index) throw new Error('geometry needs index')

  const idxArray =
    index.array instanceof Uint32Array ? index.array : new Uint32Array(index.array as ArrayLike<number>)

  const posBytes = new Uint8Array(position.array.buffer, position.array.byteOffset, position.array.byteLength)
  const nrmBytes = new Uint8Array(normal.array.buffer, normal.array.byteOffset, normal.array.byteLength)
  const uvBytes = new Uint8Array(uv.array.buffer, uv.array.byteOffset, uv.array.byteLength)
  const idxBytes = new Uint8Array(idxArray.buffer, idxArray.byteOffset, idxArray.byteLength)

  let offset = 0
  const views = [posBytes, nrmBytes, uvBytes, idxBytes].map((bytes) => {
    const start = offset
    offset += bytes.byteLength
    return { bytes, byteOffset: start, byteLength: bytes.byteLength }
  })
  const bin = new Uint8Array(offset)
  for (const view of views) bin.set(view.bytes, view.byteOffset)

  const bb = geometry.boundingBox!
  const json = {
    asset: { version: '2.0', generator: 'process-hunyuan-long' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'T_Shirt_male' }],
    meshes: [
      {
        name: 'T_Shirt_male',
        primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, mode: 4 }],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: position.count,
        type: 'VEC3',
        max: [bb.max.x, bb.max.y, bb.max.z],
        min: [bb.min.x, bb.min.y, bb.min.z],
      },
      { bufferView: 1, componentType: 5126, count: position.count, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: position.count, type: 'VEC2' },
      { bufferView: 3, componentType: 5125, count: idxArray.length, type: 'SCALAR' },
    ],
    bufferViews: views.map((v, i) => ({
      buffer: 0,
      byteOffset: v.byteOffset,
      byteLength: v.byteLength,
      target: i === 3 ? 34963 : 34962,
    })),
    buffers: [{ byteLength: bin.byteLength }],
  }

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const jsonPadding = pad4(jsonBytes.byteLength)
  const binPadding = pad4(bin.byteLength)
  const jsonChunkLen = jsonBytes.byteLength + jsonPadding
  const binChunkLen = bin.byteLength + binPadding
  const total = 12 + 8 + jsonChunkLen + 8 + binChunkLen
  const glb = new Uint8Array(total)
  const view = new DataView(glb.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonChunkLen, true)
  view.setUint32(16, 0x4e4f534a, true)
  glb.set(jsonBytes, 20)
  for (let i = 0; i < jsonPadding; i += 1) glb[20 + jsonBytes.byteLength + i] = 0x20
  const binHeader = 20 + jsonChunkLen
  view.setUint32(binHeader, binChunkLen, true)
  view.setUint32(binHeader + 4, 0x004e4942, true)
  glb.set(bin, binHeader + 8)
  writeFileSync(outPath, glb)
}

const SIZE = 1024
const toX = (u: number) => (1 - u) * SIZE
const toY = (v: number) => v * SIZE
const fmt = (n: number) => n.toFixed(1)

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcPath = join(root, 'tmp-hunyuan/simple.glb')
const buf = readFileSync(srcPath)
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const gltf = await new Promise<import('three/examples/jsm/loaders/GLTFLoader.js').GLTF>((resolve, reject) => {
  new GLTFLoader().parse(ab, '', resolve, reject)
})
let mesh: Mesh | undefined
gltf.scene.traverse((o) => {
  if (!mesh && (o as Mesh).isMesh) mesh = o as Mesh
})
if (!mesh) throw new Error('no mesh')

const geometry = mesh.geometry.clone()
applyHunyuanGarmentUv(geometry)
writeGlb(geometry, join(root, 'public/models/shirt_long.glb'))

const pos = geometry.attributes.position
const uv = geometry.attributes.uv
const index = geometry.getIndex()!
const partOf = (i: number) => classifyHunyuanPart(pos.getX(i), pos.getY(i), pos.getZ(i))
const undirected = new Map<string, true>()
const addEdge = (ia: number, ib: number) => {
  if (partOf(ia) !== partOf(ib)) return
  const key = ia < ib ? `${ia}|${ib}` : `${ib}|${ia}`
  if (undirected.has(key)) undirected.delete(key)
  else undirected.set(key, true)
}
for (let t = 0; t < index.count; t += 3) {
  addEdge(index.getX(t), index.getX(t + 1))
  addEdge(index.getX(t + 1), index.getX(t + 2))
  addEdge(index.getX(t + 2), index.getX(t))
}
const edges: string[] = []
for (const key of undirected.keys()) {
  const [a, b] = key.split('|').map(Number)
  edges.push(
    `M${fmt(toX(uv.getX(a)))} ${fmt(toY(uv.getY(a)))}L${fmt(toX(uv.getX(b)))} ${fmt(toY(uv.getY(b)))}`,
  )
}

const { front, back, collar, sleeveL, sleeveR } = HUNYUAN_ISLANDS
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <rect width="100%" height="100%" fill="#f3f3f5"/>
  <rect x="${back.x}" y="${back.y}" width="${back.w}" height="${back.h}" rx="28" fill="#ffffff" stroke="#b7b7c0" stroke-width="1.1"/>
  <rect x="${front.x}" y="${front.y}" width="${front.w}" height="${front.h}" rx="28" fill="#ffffff" stroke="#b7b7c0" stroke-width="1.1"/>
  <path d="${sleevePathD(sleeveL)}" fill="#ffffff" stroke="#b7b7c0" stroke-width="1.1"/>
  <path d="${sleevePathD(sleeveR)}" fill="#ffffff" stroke="#b7b7c0" stroke-width="1.1"/>
  <path d="${collarPathD(collar)}" fill="#ffffff" stroke="#b7b7c0" stroke-width="1.1"/>
  <path d="${edges.join('')}" fill="none" stroke="#c8c8ce" stroke-width="0.7" opacity="0.7"/>
  <text x="${front.x + front.w / 2}" y="${front.y + front.h * 0.42}" text-anchor="middle" fill="#9a9aa3" font-family="Inter,system-ui,sans-serif" font-size="22">Depan</text>
  <text x="${back.x + back.w / 2}" y="${back.y + back.h * 0.42}" text-anchor="middle" fill="#9a9aa3" font-family="Inter,system-ui,sans-serif" font-size="22">Belakang</text>
  <text x="${sleeveL.x + sleeveL.w / 2}" y="${sleeveL.y + sleeveL.h * 0.55}" text-anchor="middle" fill="#9a9aa3" font-family="Inter,system-ui,sans-serif" font-size="18">Lengan</text>
  <text x="${sleeveR.x + sleeveR.w / 2}" y="${sleeveR.y + sleeveR.h * 0.55}" text-anchor="middle" fill="#9a9aa3" font-family="Inter,system-ui,sans-serif" font-size="18">Lengan</text>
  <text x="${collar.x + collar.w / 2}" y="${collar.y + 24}" text-anchor="middle" fill="#9a9aa3" font-family="Inter,system-ui,sans-serif" font-size="16">Kerah</text>
</svg>
`
writeFileSync(join(root, 'public/uv-layout-hunyuan-long.svg'), svg)
console.log('wrote shirt_long.glb verts', pos.count, 'overlay edges', edges.length)
