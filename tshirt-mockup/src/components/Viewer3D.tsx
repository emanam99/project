import { ContactShadows, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useMockupStore } from '../store/useMockupStore'
import TShirtModel from './TShirtModel'

export default function Viewer3D() {
  const setGl = useMockupStore((s) => s.setGl)

  return (
    <div className="relative h-full min-h-0 w-full bg-[#f7f7f8]">
      <Canvas
        shadows
        camera={{ position: [0, 0.2, 3.15], fov: 32 }}
        gl={{ antialias: true, preserveDrawingBuffer: true, alpha: true }}
        onCreated={({ gl }) => {
          gl.setClearColor('#f7f7f8', 1)
          setGl(gl)
        }}
      >
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
        <TShirtModel />
        <ContactShadows position={[0, -1.05, 0]} opacity={0.28} scale={7} blur={2.6} far={2.4} />
        <OrbitControls
          enablePan={false}
          minDistance={1.8}
          maxDistance={5.2}
          minPolarAngle={0.35}
          maxPolarAngle={Math.PI / 1.7}
          target={[0, 0.08, 0]}
        />
      </Canvas>
    </div>
  )
}
