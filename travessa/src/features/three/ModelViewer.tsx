import { Component, Suspense, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { Bounds, ContactShadows, Environment, Lightformer, OrbitControls, useGLTF, useProgress } from '@react-three/drei'
import type { DishModel } from '@/domain/types'

// This module (and all of Three.js) is a separate chunk, fetched only when a
// guest taps "Ver em 3D". Nothing 3D loads with the menu.

function Dish({ model }: { model: DishModel }) {
  const { scene } = useGLTF(model.glbUrl)
  return <primitive object={scene} scale={model.scale} />
}

function Progress({ label }: { label: string }) {
  const { progress, active } = useProgress()
  if (!active) return null
  return (
    <div className="pointer-events-none absolute inset-x-8 bottom-6 text-center text-xs text-ink-2">
      <div className="mx-auto h-0.5 w-40 overflow-hidden rounded-full bg-ink/10">
        <div className="h-full bg-ink transition-[width] duration-300" style={{ width: `${Math.max(6, progress)}%` }} />
      </div>
      <p className="mt-2">{label}</p>
    </div>
  )
}

class ViewerBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

// Studio lighting built from light formers: no HDR download, soft food-friendly highlights.
function Studio() {
  return (
    <Environment resolution={256} frames={1}>
      <Lightformer form="rect" intensity={2.2} position={[0, 3, 1]} scale={[4, 2, 1]} />
      <Lightformer form="rect" intensity={1.1} position={[-3, 1, 2]} scale={[2, 2, 1]} color="#fff4e6" />
      <Lightformer form="rect" intensity={0.7} position={[3, 1, -2]} scale={[2, 2, 1]} color="#e8f0ff" />
      <Lightformer form="ring" intensity={0.8} position={[0, 1, -4]} scale={2} />
    </Environment>
  )
}

export default function ModelViewer({ model, loadingLabel, errorLabel }: { model: DishModel; loadingLabel: string; errorLabel: string }) {
  return (
    <div className="relative size-full touch-none select-none">
      <ViewerBoundary fallback={<p className="grid size-full place-items-center px-8 text-center text-sm text-ink-2">{errorLabel}</p>}>
        <Canvas
          dpr={[1, 2]}
          camera={{ position: [0.16, 0.13, 0.2], fov: 32, near: 0.005, far: 20 }}
          gl={{ antialias: true, preserveDrawingBuffer: false }}
        >
          <ambientLight intensity={0.25} />
          {/* Grounding comes from ContactShadows; no shadow maps (cheaper on phones, no acne at food scale). */}
          <directionalLight position={[0.3, 0.6, 0.25]} intensity={1.4} />
          <Suspense fallback={null}>
            <Bounds fit clip observe margin={1.15}>
              <Dish model={model} />
            </Bounds>
            <ContactShadows position={[0, -0.0005, 0]} opacity={0.5} scale={0.6} blur={2.4} far={0.15} resolution={512} />
            <Studio />
          </Suspense>
          <OrbitControls
            makeDefault
            autoRotate
            autoRotateSpeed={0.9}
            enablePan={false}
            enableDamping
            minPolarAngle={0.15}
            maxPolarAngle={Math.PI / 2.15}
          />
        </Canvas>
        <Progress label={loadingLabel} />
      </ViewerBoundary>
    </div>
  )
}
