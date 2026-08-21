import { useGLTF } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import {
  CanvasTexture,
  ClampToEdgeWrapping,
  DoubleSide,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Mesh,
} from 'three'
import { useMockupStore } from '../store/useMockupStore'

const MODEL_SHORT = '/models/shirt_baked.glb'
const MODEL_LONG = '/models/shirt_long.glb'

useGLTF.preload(MODEL_SHORT)
useGLTF.preload(MODEL_LONG)

export default function TShirtModel() {
  const shirtColor = useMockupStore((s) => s.shirtColor)
  const sleeveLength = useMockupStore((s) => s.sleeveLength)
  const canvasEl = useMockupStore((s) => s.canvasEl)
  const textureRevision = useMockupStore((s) => s.textureRevision)
  const shortGltf = useGLTF(MODEL_SHORT)
  const longGltf = useGLTF(MODEL_LONG)
  const useLongFile = sleeveLength === 'long'
  const source = (
    (useLongFile ? longGltf.nodes.T_Shirt_male : shortGltf.nodes.T_Shirt_male) as Mesh
  ).geometry

  const geometry = useMemo(() => {
    const cloned = source.clone()
    const uv = cloned.attributes.uv
    if (uv) {
      for (let i = 0; i < uv.count; i += 1) {
        uv.setX(i, 1 - uv.getX(i))
      }
      uv.needsUpdate = true
    }
    return cloned
  }, [source])

  const texture = useMemo(() => {
    if (!canvasEl) return null
    const next = new CanvasTexture(canvasEl)
    next.colorSpace = SRGBColorSpace
    next.anisotropy = 8
    next.flipY = false
    next.wrapS = ClampToEdgeWrapping
    next.wrapT = ClampToEdgeWrapping
    next.needsUpdate = true
    return next
  }, [canvasEl])

  useEffect(() => {
    if (!texture) return
    texture.needsUpdate = true
  }, [texture, textureRevision])

  const material = useMemo(() => {
    const mat = new MeshStandardMaterial({
      color: '#f4f4f5',
      roughness: 0.85,
      metalness: 0.02,
      map: texture ?? undefined,
      side: DoubleSide,
    })
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
        #ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D( map, vMapUv );
          diffuseColor.rgb = mix(diffuseColor.rgb, sampledDiffuseColor.rgb, sampledDiffuseColor.a);
        #endif
        `,
      )
    }
    mat.needsUpdate = true
    return mat
  }, [texture])

  useEffect(() => {
    material.color.set(shirtColor)
  }, [material, shirtColor])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
      texture?.dispose()
    },
    [geometry, material, texture],
  )

  const scale = useLongFile ? ([-0.48, 0.48, 0.48] as const) : ([-1.55, 1.55, 1.55] as const)

  return (
    <group>
      <mesh geometry={geometry} material={material} castShadow receiveShadow scale={scale} />
    </group>
  )
}
