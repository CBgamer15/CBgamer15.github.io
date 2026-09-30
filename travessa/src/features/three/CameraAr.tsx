import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { DishModel } from '@/domain/types'

// "Ver na minha mesa" for browsers that can't reach AR Quick Look (Chrome, Brave
// and in-app browsers on iOS). The phone's camera is the background and the dish
// is drawn over it at real size. The gyroscope keeps the dish in place as the
// phone turns (rotation only: there is no surface tracking outside Safari).
// Loaded lazily, only when the guest taps the button.

/** Assumed height of the phone above the table, in metres. */
const TABLE_DROP = 0.32
/** Portrait phone camera vertical field of view, approximate. */
const CAMERA_FOV = 62

export interface OrientationSample {
  alpha: number
  beta: number
  gamma: number
}

// Device orientation (degrees) → camera quaternion. Same maths as three.js's
// former DeviceOrientationControls: Z-X'-Y'' Euler, then look out the back.
const zee = new THREE.Vector3(0, 0, 1)
const euler = new THREE.Euler()
const q0 = new THREE.Quaternion()
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5))
function orientationQuaternion(target: THREE.Quaternion, o: OrientationSample, screenAngle: number) {
  const d = THREE.MathUtils.degToRad
  euler.set(d(o.beta), d(o.alpha), -d(o.gamma), 'YXZ')
  target.setFromEuler(euler)
  target.multiply(q1)
  target.multiply(q0.setFromAxisAngle(zee, -d(screenAngle)))
  return target
}

// Fallback pose when there is no gyroscope: looking down at the table at 45°.
const STATIC_POSE = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 4, 0, 0))

const table = new THREE.Plane(new THREE.Vector3(0, 1, 0), TABLE_DROP)
const ray = new THREE.Raycaster()

/** Where a view ray meets the table; falls back to a point 45 cm ahead. */
function pointOnTable(origin: THREE.Vector3, dir: THREE.Vector3, out: THREE.Vector3) {
  ray.set(origin, dir)
  const hit = ray.ray.intersectPlane(table, out)
  if (hit && hit.distanceTo(origin) < 1.2) return out
  const flat = new THREE.Vector3(dir.x, 0, dir.z)
  if (flat.lengthSq() < 1e-6) flat.set(0, 0, -1)
  flat.normalize().multiplyScalar(0.45)
  return out.set(origin.x + flat.x, -TABLE_DROP, origin.z + flat.z)
}

function Dish({ model, orientation, gyro }: { model: DishModel; orientation: React.RefObject<OrientationSample | null>; gyro: boolean }) {
  const { scene } = useGLTF(model.glbUrl)
  const { camera, gl } = useThree()
  const group = useRef<THREE.Group>(null)
  const placed = useRef(false)
  const scale = useRef(model.scale)

  // Drag to move the dish across the table; pinch to resize.
  useEffect(() => {
    const el = gl.domElement
    const pointers = new Map<number, { x: number; y: number }>()
    let pinchStart = 0
    let scaleStart = scale.current
    const ndc = new THREE.Vector2()
    const target = new THREE.Vector3()
    const moveTo = (x: number, y: number) => {
      const r = el.getBoundingClientRect()
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      if (ray.ray.intersectPlane(table, target) && target.length() < 1.5) group.current?.position.set(target.x, -TABLE_DROP, target.z)
    }
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinchStart = Math.hypot(a.x - b.x, a.y - b.y)
        scaleStart = scale.current
      }
    }
    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 1) moveTo(e.clientX, e.clientY)
      else if (pointers.size === 2 && pinchStart > 0) {
        const [a, b] = [...pointers.values()]
        const ratio = Math.hypot(a.x - b.x, a.y - b.y) / pinchStart
        scale.current = THREE.MathUtils.clamp(scaleStart * ratio, model.scale * 0.5, model.scale * 2.5)
      }
    }
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinchStart = 0
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
  }, [camera, gl, model.scale])

  useFrame(({ clock }) => {
    const o = orientation.current
    // No gyroscope data after a moment (denied, or no sensor): use a fixed pose.
    const live = gyro && o
    const fixed = !gyro || (!o && clock.elapsedTime > 1.2)
    if (live) {
      const screenAngle = (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number
      orientationQuaternion(camera.quaternion, o, screenAngle)
    } else if (fixed) {
      camera.quaternion.copy(STATIC_POSE)
    }
    if (!placed.current && (live || fixed)) {
      // First frame with a pose: put the dish where the camera is looking.
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
      const p = pointOnTable(camera.position, dir, new THREE.Vector3())
      group.current?.position.copy(p)
      placed.current = true
    }
    group.current?.scale.setScalar(scale.current)
  })

  return (
    <group ref={group} position={[0, -TABLE_DROP, -0.45]}>
      <primitive object={scene} />
      <ContactShadows position={[0, 0.0005, 0]} opacity={0.55} scale={0.35} blur={2} far={0.12} resolution={256} />
    </group>
  )
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export interface CameraArLabels {
  hint: string
  noCamera: string
  loading: string
  close: string
  fullAr: string
}

/**
 * Full-screen camera view with the dish on the table. `gyro` must come from a
 * permission request made inside the tap that opened this view (iOS requires it).
 */
export default function CameraAr({
  model,
  gyro,
  labels,
  onClose,
  footer,
}: {
  model: DishModel
  gyro: boolean
  labels: CameraArLabels
  onClose: () => void
  footer?: ReactNode
}) {
  const video = useRef<HTMLVideoElement>(null)
  const orientation = useRef<OrientationSample | null>(null)
  const [camState, setCamState] = useState<'starting' | 'on' | 'failed'>('starting')

  useEffect(() => {
    let stream: MediaStream | undefined
    let cancelled = false
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamState('failed')
      return
    }
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(async (s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop())
        stream = s
        if (video.current) {
          video.current.srcObject = s
          await video.current.play().catch(() => undefined)
        }
        setCamState('on')
      })
      .catch(() => setCamState('failed'))
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  useEffect(() => {
    if (!gyro) return
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return
      orientation.current = { alpha: e.alpha, beta: e.beta, gamma: e.gamma }
    }
    window.addEventListener('deviceorientation', onOrient)
    return () => window.removeEventListener('deviceorientation', onOrient)
  }, [gyro])

  return (
    <div className="fixed inset-0 z-[80] bg-black" role="dialog" aria-modal="true" aria-label={labels.hint}>
      <video ref={video} playsInline muted autoPlay className="absolute inset-0 size-full object-cover" />
      {camState === 'failed' ? (
        <p className="absolute inset-x-8 top-1/3 text-center text-sm text-white">{labels.noCamera}</p>
      ) : (
        <Boundary fallback={<p className="absolute inset-x-8 top-1/3 text-center text-sm text-white">{labels.noCamera}</p>}>
          <Canvas
            className="!absolute inset-0 touch-none"
            gl={{ alpha: true, antialias: true }}
            dpr={[1, 2]}
            camera={{ position: [0, 0, 0], fov: CAMERA_FOV, near: 0.01, far: 10 }}
            onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
          >
            <ambientLight intensity={0.9} />
            <hemisphereLight args={['#fffaf0', '#6b5a48', 1.1]} />
            <directionalLight position={[0.4, 1, 0.3]} intensity={1.6} />
            <Suspense fallback={null}>
              <Dish model={model} orientation={orientation} gyro={gyro} />
            </Suspense>
          </Canvas>
        </Boundary>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <span className="rounded-full bg-black/55 px-3 py-1.5 text-xs text-white backdrop-blur">
          {camState === 'starting' ? labels.loading : labels.hint}
        </span>
        <button onClick={onClose} className="pointer-events-auto grid size-10 place-items-center rounded-full bg-white/90 text-black" aria-label={labels.close}>
          ✕
        </button>
      </div>
      {footer && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center [&>*]:pointer-events-auto">
          {footer}
        </div>
      )}
    </div>
  )
}
