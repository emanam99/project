import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTShirtGeometry } from '../src/lib/createTShirtGeometry.ts'

function pad4(size: number) {
  return (4 - (size % 4)) % 4
}

function concat(parts: Uint8Array[]) {
  const total = parts.reduce((n, p) => n + p.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

const geometry = createTShirtGeometry()
const position = geometry.getAttribute('position')
const normal = geometry.getAttribute('normal')
const uv = geometry.getAttribute('uv')
const index = geometry.getIndex()
const idxArray = index
  ? index.array instanceof Uint32Array
    ? index.array
    : new Uint32Array(index.array)
  : Uint32Array.from({ length: position.count }, (_, i) => i)

const posBytes = new Uint8Array(position.array.buffer, position.array.byteOffset, position.array.byteLength)
const nrmBytes = new Uint8Array(normal.array.buffer, normal.array.byteOffset, normal.array.byteLength)
const uvBytes = new Uint8Array(uv.array.buffer, uv.array.byteOffset, uv.array.byteLength)
const idxBytes = new Uint8Array(idxArray.buffer, idxArray.byteOffset, idxArray.byteLength)

let offset = 0
const views = [posBytes, nrmBytes, uvBytes, idxBytes].map((bytes) => {
  const start = offset
  offset += bytes.byteLength + pad4(bytes.byteLength)
  return { bytes, byteOffset: start, byteLength: bytes.byteLength }
})

const bin = new Uint8Array(offset)
for (const view of views) {
  bin.set(view.bytes, view.byteOffset)
}

geometry.computeBoundingBox()
const bb = geometry.boundingBox!
const json = {
  asset: { version: '2.0', generator: 'tshirt-mockup' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'TShirt' }],
  meshes: [
    {
      name: 'TShirt',
      primitives: [
        {
          attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
          indices: 3,
          material: 0,
        },
      ],
    },
  ],
  materials: [
    {
      name: 'TShirtFabric',
      pbrMetallicRoughness: {
        baseColorFactor: [0.957, 0.957, 0.961, 1],
        metallicFactor: 0.04,
        roughnessFactor: 0.84,
      },
    },
  ],
  buffers: [{ byteLength: bin.byteLength }],
  bufferViews: [
    { buffer: 0, byteOffset: views[0].byteOffset, byteLength: views[0].byteLength, target: 34962 },
    { buffer: 0, byteOffset: views[1].byteOffset, byteLength: views[1].byteLength, target: 34962 },
    { buffer: 0, byteOffset: views[2].byteOffset, byteLength: views[2].byteLength, target: 34962 },
    { buffer: 0, byteOffset: views[3].byteOffset, byteLength: views[3].byteLength, target: 34963 },
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: position.count,
      type: 'VEC3',
      min: [bb.min.x, bb.min.y, bb.min.z],
      max: [bb.max.x, bb.max.y, bb.max.z],
    },
    { bufferView: 1, componentType: 5126, count: normal.count, type: 'VEC3' },
    { bufferView: 2, componentType: 5126, count: uv.count, type: 'VEC2' },
    { bufferView: 3, componentType: 5125, count: idxArray.length, type: 'SCALAR' },
  ],
}

const jsonText = JSON.stringify(json)
const jsonBytes = new TextEncoder().encode(jsonText)
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

const out = join(dirname(fileURLToPath(import.meta.url)), '../public/models/tshirt.glb')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, glb)
console.log(`Wrote ${out} (${glb.byteLength} bytes)`)
