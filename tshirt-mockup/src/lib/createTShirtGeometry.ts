import {
  CylinderGeometry,
  Matrix4,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mapToIsland, type Island } from './tshirtPattern'

function applyIslandUv(geometry: BufferGeometry, island: Island, fromExisting = true) {
  const uv = geometry.attributes.uv
  const pos = geometry.attributes.position
  if (!uv || !pos) return
  for (let i = 0; i < pos.count; i += 1) {
    const u01 = fromExisting ? uv.getX(i) : 0.5
    const v01 = fromExisting ? uv.getY(i) : 0.5
    const mapped = mapToIsland(u01, v01, island)
    uv.setXY(i, mapped.u, mapped.v)
  }
  uv.needsUpdate = true
}

export function applyBodyUv(geometry: BufferGeometry) {
  geometry.computeBoundingBox()
  const bb = geometry.boundingBox
  if (!bb) return
  const pos = geometry.attributes.position
  const uv = geometry.attributes.uv
  if (!uv) return
  const ySpan = bb.max.y - bb.min.y || 1
  const xSpan = bb.max.x - bb.min.x || 1
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const u01 = (x - bb.min.x) / xSpan
    const v01 = (y - bb.min.y) / ySpan
    const island = z >= 0 ? { x: 0, y: 0, w: 512, h: 1024 } : { x: 512, y: 0, w: 512, h: 1024 }
    const mapped = mapToIsland(z >= 0 ? u01 : 1 - u01, v01, island)
    uv.setXY(i, mapped.u, mapped.v)
  }
  uv.needsUpdate = true
}

function drapeBody(geometry: BufferGeometry) {
  const pos = geometry.attributes.position
  const v = new Vector3()
  geometry.computeBoundingBox()
  const bb = geometry.boundingBox
  if (!bb) return
  const ySpan = bb.max.y - bb.min.y || 1
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i)
    const t = (v.y - bb.min.y) / ySpan
    const chest = Math.sin(t * Math.PI) * 0.07
    v.z += Math.sign(v.z || 1) * chest
    v.x *= 1 + 0.04 * t
    v.z += Math.sin(v.y * 6.5) * 0.012 * (1 - t)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  pos.needsUpdate = true
}

/** Kaos oblong (crew neck) dengan badan, lengan, dan kerah. */
export function createTShirtGeometry() {
  const body = new CylinderGeometry(0.46, 0.52, 1.62, 64, 28, true)
  body.scale(1, 1, 0.62)
  drapeBody(body)
  applyBodyUv(body)
  body.computeVertexNormals()

  const makeSleeve = (side: 1 | -1) => {
    const sleeve = new CylinderGeometry(0.165, 0.2, 0.52, 28, 10, true)
    applyIslandUv(sleeve, side < 0 ? { x: 40, y: 800, w: 200, h: 180 } : { x: 280, y: 800, w: 200, h: 180 })
    const m = new Matrix4()
    m.makeRotationZ(side * 1.12)
    sleeve.applyMatrix4(m)
    sleeve.translate(side * 0.58, 0.52, 0)
    sleeve.computeVertexNormals()
    return sleeve
  }

  const collar = new TorusGeometry(0.2, 0.042, 14, 40, Math.PI * 1.85)
  applyIslandUv(collar, { x: 520, y: 800, w: 280, h: 48 })
  collar.rotateX(Math.PI / 2)
  collar.rotateZ(-0.12)
  collar.translate(0, 0.78, 0.02)
  collar.scale(1, 1, 0.72)
  collar.computeVertexNormals()

  const merged = mergeGeometries([body, makeSleeve(-1), makeSleeve(1), collar], false)
  if (!merged) throw new Error('Gagal menggabungkan geometri kaos oblong')
  merged.center()
  merged.computeVertexNormals()
  return merged
}
