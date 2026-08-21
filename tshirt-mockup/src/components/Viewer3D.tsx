import { Bounds, ContactShadows, OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useRef, type ComponentRef, type RefObject } from 'react'
import { useMockupStore } from '../store/useMockupStore'
import TShirtModel from './TShirtModel'

const ZOOM_STEP = 0.4
const MIN_DIST = 1.4
const MAX_DIST = 8

function ZoomButtons({
  controlsRef,
}: {
  controlsRef: RefObject<ComponentRef<typeof OrbitControls> | null>
}) {
  const zoomBy = (delta: number) => {
    const controls = controlsRef.current
    if (!controls) return
    const cam = controls.object
    const dir = cam.position.clone().sub(controls.target)
    const dist = dir.length()
    const next = Math.min(MAX_DIST, Math.max(MIN_DIST, dist + delta))
    dir.setLength(next)
    cam.position.copy(controls.target).add(dir)
    controls.update()
  }

  return (
    <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1.5">
      <button
        type="button"
        title="Perbesar"
        onClick={() => zoomBy(-ZOOM_STEP)}
        className="grid h-8 w-8 place-items-center rounded-md bg-white/95 text-[#2b2b32] shadow-sm ring-1 ring-black/5 hover:bg-white"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        title="Perkecil"
        onClick={() => zoomBy(ZOOM_STEP)}
        className="grid h-8 w-8 place-items-center rounded-md bg-white/95 text-[#2b2b32] shadow-sm ring-1 ring-black/5 hover:bg-white"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M2.5 7h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

/** Pastikan kamera selalu menjauh cukup agar baju penuh di viewport. */
function FitCamera({ sleeveLength }: { sleeveLength: string }) {
  const { camera, size } = useThree()
  useEffect(() => {
    camera.near = 0.05
    camera.far = 50
    camera.updateProjectionMatrix()
  }, [camera, size, sleeveLength])
  return null
}

export default function Viewer3D() {
  const setGl = useMockupStore((s) => s.setGl)
  const sleeveLength = useMockupStore((s) => s.sleeveLength)
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null)

  return (
    <div className="relative h-full min-h-0 w-full bg-[#f7f7f8]">
      <Canvas
        shadows
        camera={{ position: [0, 0.1, 4.2], fov: 28, near: 0.05, far: 50 }}
        gl={{ antialias: true, preserveDrawingBuffer: true, alpha: true }}
        onCreated={({ gl }) => {
          gl.setClearColor('#f7f7f8', 1)
          setGl(gl)
        }}
      >
        <FitCamera sleeveLength={sleeveLength} />
        <hemisphereLight args={['#ffffff', '#e8e8ee', 1.05]} />
        <ambientLight intensity={0.72} />
        <directionalLight
          position={[2.2, 3, 2.6]}
          intensity={1.45}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <directionalLight position={[-2, 1.2, -1.4]} intensity={0.3} />
        <Bounds key={sleeveLength} fit clip observe margin={1.35}>
          <TShirtModel />
        </Bounds>
        <ContactShadows position={[0, -1.55, 0]} opacity={0.22} scale={9} blur={2.8} far={3.2} />
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enablePan={false}
          minDistance={MIN_DIST}
          maxDistance={MAX_DIST}
          minPolarAngle={0.2}
          maxPolarAngle={Math.PI / 1.45}
        />
      </Canvas>
      <ZoomButtons controlsRef={controlsRef} />
    </div>
  )
}
