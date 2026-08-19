import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BufferAttribute,
  BufferGeometry,
  Vector3,
} from 'three'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'

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
    asset: { version: '2.0', generator: 'convert-hunyuan-ply' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'T_Shirt_male' }],
    meshes: [
      {
        name: 'T_Shirt_male',
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
            indices: 3,
            mode: 4,
          },
        ],
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

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const plyPath = join(root, 'tmp-hunyuan/mesh_simplified.ply')
const plyBuf = readFileSync(plyPath)
const plyAb = plyBuf.buffer.slice(plyBuf.byteOffset, plyBuf.byteOffset + plyBuf.byteLength)
const loaded = new PLYLoader().parse(plyAb) as BufferGeometry
loaded.computeBoundingBox()
const box = loaded.boundingBox!
console.log('raw bbox', box.min.toArray(), box.max.toArray())
console.log('verts', loaded.getAttribute('position').count, 'indexed', Boolean(loaded.getIndex()))

const up = new Vector3(0.12290691987794619, -0.16754076675994647, 0.9781737987288381).normalize()
const forward = new Vector3(-0.28273296512088575, 0.9388896032811395, 0.1963374220176491).normalize()
const right = new Vector3().crossVectors(up, forward).normalize()
forward.crossVectors(right, up).normalize()

const pos = loaded.getAttribute('position')
const aligned = new Float32Array(pos.count * 3)
const tmp = new Vector3()
for (let i = 0; i < pos.count; i += 1) {
  tmp.fromBufferAttribute(pos, i)
  aligned[i * 3] = tmp.dot(right)
  aligned[i * 3 + 1] = tmp.dot(up)
  aligned[i * 3 + 2] = tmp.dot(forward)
}
loaded.setAttribute('position', new BufferAttribute(aligned, 3))
loaded.computeBoundingBox()
const a = loaded.boundingBox!
const size = new Vector3().subVectors(a.max, a.min)
console.log('aligned bbox', a.min.toArray(), a.max.toArray(), 'size', size.toArray())

const center = new Vector3().addVectors(a.min, a.max).multiplyScalar(0.5)
const height = Math.max(size.y, 1e-6)
const scale = 1.15 / height
for (let i = 0; i < pos.count; i += 1) {
  aligned[i * 3] = (aligned[i * 3] - center.x) * scale
  aligned[i * 3 + 1] = (aligned[i * 3 + 1] - a.min.y) * scale
  aligned[i * 3 + 2] = (aligned[i * 3 + 2] - center.z) * scale
}
loaded.setAttribute('position', new BufferAttribute(aligned, 3))
loaded.computeBoundingBox()

const b = loaded.boundingBox!
const spanX = b.max.x - b.min.x
const spanY = b.max.y - b.min.y
const spanZ = b.max.z - b.min.z
const uvs = new Float32Array(pos.count * 2)
for (let i = 0; i < pos.count; i += 1) {
  const x = aligned[i * 3]
  const y = aligned[i * 3 + 1]
  const z = aligned[i * 3 + 2]
  const v = (y - b.min.y) / spanY
  if (z >= 0) {
    uvs[i * 2] = 0.02 + ((x - b.min.x) / spanX) * 0.46
  } else {
    uvs[i * 2] = 0.52 + ((b.max.x - x) / spanX) * 0.46
  }
  uvs[i * 2 + 1] = v
}
loaded.setAttribute('uv', new BufferAttribute(uvs, 2))

if (!loaded.getIndex()) {
  const count = pos.count
  const idx = new Uint32Array(count)
  for (let i = 0; i < count; i += 1) idx[i] = i
  loaded.setIndex(new BufferAttribute(idx, 1))
}

const index = loaded.getIndex()!
const SIZE = 1024
const toX = (u: number) => (1 - u) * SIZE
const toY = (v: number) => v * SIZE
const fmt = (n: number) => n.toFixed(1)
const undirected = new Map<string, true>()
const addEdge = (ia: number, ib: number) => {
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
    `M${fmt(toX(uvs[a * 2]))} ${fmt(toY(uvs[a * 2 + 1]))}L${fmt(toX(uvs[b * 2]))} ${fmt(toY(uvs[b * 2 + 1]))}`,
  )
}
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="#f4f4f5"/>
  <path d="${edges.join('')}" fill="none" stroke="#c4c4c8" stroke-width="1.2"/>
  <text x="768" y="36" text-anchor="middle" fill="#71717a" font-size="22" font-family="sans-serif">Depan</text>
  <text x="256" y="36" text-anchor="middle" fill="#71717a" font-size="22" font-family="sans-serif">Belakang</text>
</svg>
`
writeFileSync(join(root, 'public/uv-layout-hunyuan-long.svg'), svg)

const out = join(root, 'public/models/shirt_long.glb')
writeGlb(loaded, out)
console.log('wrote', out, 'final bbox', loaded.boundingBox!.min.toArray(), loaded.boundingBox!.max.toArray())
console.log('overlay edges', edges.length)
