import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { DishModel } from '@/domain/types'
import { currentCameraPose, nearTable, PlaneTracker, poseFromHomography, tableInCamera, type Intrinsics } from './planeTracker'

// "Ver na minha mesa" for browsers that can't reach AR Quick Look (Chrome, Brave
// and in-app browsers on iOS). The phone's camera is the background and the dish
// is drawn over it at real size. The guest aims and taps "Colocar aqui"; from then on
// the table itself is followed in the camera image (see planeTracker.ts), so the dish
// stays put while the phone moves. The gyroscope covers the moments the table is lost.
// Loaded lazily, only when the guest taps the button.

/** Assumed height of the phone above the table, in metres. */
const TABLE_DROP = 0.32
const TABLE_Y = -TABLE_DROP
/** Field of view of a phone's main camera along the long side of the video, approximate. */
const VIDEO_LONG_FOV = THREE.MathUtils.degToRad(64)
/** Short side of the image the tracker works on, in pixels. */
const PROCESS_SIZE = 240
/** How far each frame moves toward the tracked pose (smooths jitter). */
const SMOOTHING = 0.7

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

const screenAngle = () => (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number

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
  return out.set(origin.x + flat.x, TABLE_Y, origin.z + flat.z)
}

export type TrackState = 'aiming' | 'tracking' | 'lost' | 'flat'

interface SceneProps {
  model: DishModel
  video: React.RefObject<HTMLVideoElement | null>
  orientation: React.RefObject<OrientationSample | null>
  gyro: boolean
  /** 0 while aiming; a new number each time the guest taps "Colocar aqui". */
  placeKey: number
  onTrack: (state: TrackState) => void
}

/** Grabs downscaled video frames for the tracker. */
class FrameGrabber {
  private canvas = document.createElement('canvas')
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true })
  width = 0
  height = 0
  private lastTime = -1

  /** Returns the frame's pixels, or null if the video has no new frame. */
  grab(video: HTMLVideoElement): Uint8ClampedArray | null {
    if (!this.ctx || video.readyState < 2 || !video.videoWidth) return null
    if (video.currentTime === this.lastTime) return null
    this.lastTime = video.currentTime
    const s = PROCESS_SIZE / Math.min(video.videoWidth, video.videoHeight)
    const w = Math.round(video.videoWidth * s)
    const h = Math.round(video.videoHeight * s)
    if (w !== this.width || h !== this.height) {
      this.canvas.width = this.width = w
      this.canvas.height = this.height = h
    }
    this.ctx.drawImage(video, 0, 0, w, h)
    return this.ctx.getImageData(0, 0, w, h).data
  }
}

function ArScene({ model, video, orientation, gyro, placeKey, onTrack }: SceneProps) {
  const { scene } = useGLTF(model.glbUrl)
  const { camera, gl, size } = useThree()
  const group = useRef<THREE.Group>(null)
  const scale = useRef(model.scale)
  const placedFor = useRef(0)
  const state = useRef<TrackState>('aiming')
  const tracker = useRef<PlaneTracker | null>(null)
  const grabber = useRef<FrameGrabber | null>(null)
  const K = useRef<Intrinsics>({ f: 1, cx: 0, cy: 0 })
  const ref = useRef({ q: new THREE.Quaternion(), p: new THREE.Vector3(), n: new THREE.Vector3(), d: 1 })
  const good = useRef({ q: new THREE.Quaternion(), gyro: new THREE.Quaternion(), hasGyro: false })
  const retryIn = useRef(0)
  const scratch = useRef({ q: new THREE.Quaternion(), p: new THREE.Vector3(), g: new THREE.Quaternion() })

  const setState = (s: TrackState) => {
    if (state.current === s) return
    state.current = s
    onTrack(s)
  }

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
      if (ray.ray.intersectPlane(table, target) && target.distanceTo(camera.position) < 1.5) group.current?.position.set(target.x, TABLE_Y, target.z)
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
      if (pointers.size === 1 && placedFor.current) moveTo(e.clientX, e.clientY)
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

  /** Starts following the table, with the current camera pose as the reference. */
  const startTracking = (frame: Uint8ClampedArray) => {
    const t = tracker.current
    if (!t) return false
    const r = ref.current
    r.q.copy(camera.quaternion)
    r.p.copy(camera.position)
    const plane = tableInCamera(r.q, r.p, TABLE_Y)
    r.n.copy(plane.n)
    r.d = plane.d
    t.start(frame, nearTable(K.current, r.q, r.p, TABLE_Y))
    return t.tracking
  }

  useFrame(({ clock }) => {
    const cam = camera as THREE.PerspectiveCamera
    const v = video.current
    const s = scratch.current

    // Match the 3D camera to the phone camera as the video is shown (cropped to fill the screen).
    if (v?.videoWidth) {
      const fVideo = Math.max(v.videoWidth, v.videoHeight) / 2 / Math.tan(VIDEO_LONG_FOV / 2)
      const cover = Math.max(size.width / v.videoWidth, size.height / v.videoHeight)
      const fov = THREE.MathUtils.radToDeg(2 * Math.atan(size.height / cover / 2 / fVideo))
      if (Math.abs(cam.fov - fov) > 0.01) {
        cam.fov = fov
        cam.updateProjectionMatrix()
      }
    }

    // Gyroscope reading, if any. No data after a moment (denied, or no sensor): fixed pose.
    const o = orientation.current
    const gyroQ = gyro && o ? orientationQuaternion(s.g, o, screenAngle()) : null
    const noGyro = !gyroQ && (!gyro || clock.elapsedTime > 1.2)

    if (!placeKey) {
      // Aiming: the dish sits where the centre of the screen meets the table.
      placedFor.current = 0
      tracker.current?.stop()
      setState('aiming')
      cam.position.set(0, 0, 0)
      if (gyroQ) cam.quaternion.copy(gyroQ)
      else if (noGyro) cam.quaternion.copy(STATIC_POSE)
      else return
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)
      group.current?.position.copy(pointOnTable(cam.position, dir, s.p))
      group.current?.scale.setScalar(scale.current)
      return
    }

    group.current?.scale.setScalar(scale.current)
    if (!v) return
    const grab = (grabber.current ??= new FrameGrabber())
    const frame = grab.grab(v)
    if (!frame) return
    if (!tracker.current || tracker.current.width !== grab.width || tracker.current.height !== grab.height) {
      tracker.current = new PlaneTracker(grab.width, grab.height)
    }
    const scaleToProcess = Math.min(grab.width, grab.height) / Math.min(v.videoWidth, v.videoHeight)
    K.current = {
      f: (Math.max(v.videoWidth, v.videoHeight) / 2 / Math.tan(VIDEO_LONG_FOV / 2)) * scaleToProcess,
      cx: grab.width / 2,
      cy: grab.height / 2,
    }

    // Just placed: this frame becomes the reference.
    if (placedFor.current !== placeKey) {
      placedFor.current = placeKey
      const ok = startTracking(frame)
      good.current.q.copy(cam.quaternion)
      good.current.hasGyro = Boolean(gyroQ)
      if (gyroQ) good.current.gyro.copy(gyroQ)
      setState(ok ? 'tracking' : 'flat')
      retryIn.current = 10
      return
    }

    const t = tracker.current
    const H = t.tracking ? t.update(frame, nearTable(K.current, cam.quaternion, cam.position, TABLE_Y)) : null
    const rel = H && poseFromHomography(H, K.current, ref.current.n, ref.current.d)
    if (rel) {
      currentCameraPose(ref.current.q, ref.current.p, rel, s.q, s.p)
      cam.position.lerp(s.p, SMOOTHING)
      cam.quaternion.slerp(s.q, SMOOTHING)
      good.current.q.copy(cam.quaternion)
      good.current.hasGyro = Boolean(gyroQ)
      if (gyroQ) good.current.gyro.copy(gyroQ)
      setState('tracking')
      return
    }

    // Table lost (or too plain to follow): turn with the gyroscope from the last good
    // pose, and try to pick the table up again every few frames.
    if (gyroQ && good.current.hasGyro) {
      const delta = good.current.gyro.clone().invert().multiply(gyroQ)
      cam.quaternion.copy(good.current.q).multiply(delta)
    }
    if (state.current === 'tracking') setState('lost')
    if (--retryIn.current <= 0) {
      retryIn.current = 10
      if (startTracking(frame)) {
        good.current.q.copy(cam.quaternion)
        good.current.hasGyro = Boolean(gyroQ)
        if (gyroQ) good.current.gyro.copy(gyroQ)
        setState('tracking')
      }
    }
  })

  return (
    <group ref={group} position={[0, TABLE_Y, -0.45]}>
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
  aim: string
  place: string
  placed: string
  lost: string
  flat: string
  move: string
  noCamera: string
  loading: string
  close: string
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
  const [placeKey, setPlaceKey] = useState(0)
  const [track, setTrack] = useState<TrackState>('aiming')

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

  const hint =
    camState === 'starting'
      ? labels.loading
      : !placeKey
        ? labels.aim
        : track === 'lost'
          ? labels.lost
          : track === 'flat'
            ? labels.flat
            : labels.placed

  return (
    <div className="fixed inset-0 z-[80] bg-black" role="dialog" aria-modal="true" aria-label={labels.aim}>
      <video ref={video} playsInline muted autoPlay className="absolute inset-0 size-full object-cover" />
      {camState === 'failed' ? (
        <p className="absolute inset-x-8 top-1/3 text-center text-sm text-white">{labels.noCamera}</p>
      ) : (
        <Boundary fallback={<p className="absolute inset-x-8 top-1/3 text-center text-sm text-white">{labels.noCamera}</p>}>
          <Canvas
            className="!absolute inset-0 touch-none"
            gl={{ alpha: true, antialias: true }}
            dpr={[1, 2]}
            camera={{ position: [0, 0, 0], fov: 62, near: 0.01, far: 10 }}
            onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
          >
            <ambientLight intensity={0.9} />
            <hemisphereLight args={['#fffaf0', '#6b5a48', 1.1]} />
            <directionalLight position={[0.4, 1, 0.3]} intensity={1.6} />
            <Suspense fallback={null}>
              <ArScene model={model} video={video} orientation={orientation} gyro={gyro} placeKey={placeKey} onTrack={setTrack} />
            </Suspense>
          </Canvas>
        </Boundary>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <span className="rounded-2xl bg-black/55 px-3 py-1.5 text-xs leading-snug text-white backdrop-blur" aria-live="polite">
          {hint}
        </span>
        <button onClick={onClose} className="pointer-events-auto grid size-10 shrink-0 place-items-center rounded-full bg-white/90 text-black" aria-label={labels.close}>
          ✕
        </button>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center [&>*]:pointer-events-auto">
        {camState === 'on' &&
          (placeKey ? (
            <button type="button" onClick={() => setPlaceKey(0)} className="rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-black">
              {labels.move}
            </button>
          ) : (
            <button type="button" onClick={() => setPlaceKey((k) => k + 1)} className="rounded-full bg-white px-6 py-3 text-base font-semibold text-black shadow-lg">
              {labels.place}
            </button>
          ))}
        {footer}
      </div>
    </div>
  )
}
