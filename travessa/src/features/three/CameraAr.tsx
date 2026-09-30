import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { DishModel } from '@/domain/types'
import { applyHomography, currentCameraPose, nearTable, PlaneTracker, poseFromHomography, tableInCamera, type Homography, type Intrinsics, type Point } from './planeTracker'
import { TiltEstimator, type Tilt } from './tiltEstimator'
import { PoseFilter } from './poseFilter'

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
/** Frames (~1.5 s) spent looking for the table where it was lost before starting over from the current view. */
const RECOVER_FRAMES = 45
/** Short side of the image the tracker works on, in pixels. */
const PROCESS_SIZE = 320

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

/** 'starting' until the dish is on screen and can be placed. */
export type TrackState = 'starting' | 'aiming' | 'tracking' | 'lost' | 'flat'

interface SceneProps {
  model: DishModel
  video: React.RefObject<HTMLVideoElement | null>
  orientation: React.RefObject<OrientationSample | null>
  gyro: boolean
  /** 0 while aiming; a new number each time the guest taps "Colocar aqui". */
  placeKey: number
  onTrack: (state: TrackState) => void
}

/**
 * Watches for new camera frames and hands out downscaled copies for the tracker.
 * Everything (tracking, the background image, the dish) moves on at the pace of the
 * camera, one frame at a time, so the dish can't drift out of step with the picture.
 */
class FrameSource {
  private canvas = document.createElement('canvas')
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true })
  width = 0
  height = 0
  /** Seconds between the last two frames. */
  dt = 1 / 30
  private pending = false
  private lastTime = -1
  private handle = 0
  private video: HTMLVideoElement
  /** requestVideoFrameCallback is missing in older browsers. */
  private callbacks: boolean

  constructor(video: HTMLVideoElement) {
    this.video = video
    this.callbacks = typeof video.requestVideoFrameCallback === 'function'
    if (this.callbacks) {
      const onFrame: VideoFrameRequestCallback = (_, meta) => {
        if (this.lastTime >= 0) this.dt = THREE.MathUtils.clamp(meta.mediaTime - this.lastTime, 1 / 120, 0.25)
        this.lastTime = meta.mediaTime
        this.pending = true
        this.handle = video.requestVideoFrameCallback(onFrame)
      }
      this.handle = video.requestVideoFrameCallback(onFrame)
    }
  }

  dispose() {
    if (this.callbacks) this.video.cancelVideoFrameCallback(this.handle)
  }

  /** True once per new camera frame. */
  next(): boolean {
    const v = this.video
    if (v.readyState < 2 || !v.videoWidth) return false
    if (this.callbacks) {
      if (!this.pending) return false
      this.pending = false
      return true
    }
    // No frame callbacks: fall back to the playback clock.
    if (v.currentTime === this.lastTime) return false
    if (this.lastTime >= 0) this.dt = THREE.MathUtils.clamp(v.currentTime - this.lastTime, 1 / 120, 0.25)
    this.lastTime = v.currentTime
    return true
  }

  /** The current frame, downscaled, as RGBA pixels. */
  pixels(): Uint8ClampedArray | null {
    const v = this.video
    if (!this.ctx) return null
    const s = PROCESS_SIZE / Math.min(v.videoWidth, v.videoHeight)
    const w = Math.round(v.videoWidth * s)
    const h = Math.round(v.videoHeight * s)
    if (w !== this.width || h !== this.height) {
      this.canvas.width = this.width = w
      this.canvas.height = this.height = h
    }
    this.ctx.drawImage(v, 0, 0, w, h)
    return this.ctx.getImageData(0, 0, w, h).data
  }
}

function ArScene({ model, video, orientation, gyro, placeKey, onTrack }: SceneProps) {
  const { scene: dish } = useGLTF(model.glbUrl)
  const { camera, gl, size, scene } = useThree()
  const group = useRef<THREE.Group>(null)
  const scale = useRef(model.scale)
  const placedFor = useRef(0)
  const state = useRef<TrackState>('starting')
  /** The aiming pose has been set at least once (the dish can't be placed before). */
  const aimed = useRef(false)
  const tracker = useRef<PlaneTracker | null>(null)
  const source = useRef<FrameSource | null>(null)
  const filter = useRef(new PoseFilter())
  const K = useRef<Intrinsics>({ f: 1, cx: 0, cy: 0 })
  const ref = useRef({ q: new THREE.Quaternion(), p: new THREE.Vector3(), n: new THREE.Vector3(), d: 1 })
  const good = useRef({ q: new THREE.Quaternion(), gyro: new THREE.Quaternion(), hasGyro: false })
  const retryIn = useRef(0)
  const lostFrames = useRef(0)
  /** Where the dish's base is in the reference frame (processing pixels); null = recompute from its 3D position. */
  const basePx = useRef<Point | null>(null)
  // No gyroscope when the dish was placed: the phone's tilt is a guess, refined from the motion.
  const tilt = useRef<{ estimator: TiltEstimator; active: boolean; current: Tilt; frames: number } | null>(null)
  const scratch = useRef({ q: new THREE.Quaternion(), p: new THREE.Vector3(), g: new THREE.Quaternion() })

  // The camera picture is drawn by WebGL as the scene background, in the same render
  // as the dish posed from that frame, so the table and the dish always move together.
  const background = useRef<THREE.VideoTexture | null>(null)
  useEffect(
    () => () => {
      scene.background = null
      background.current?.dispose()
      background.current = null
      source.current?.dispose()
      source.current = null
    },
    [scene],
  )

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
      if (ray.ray.intersectPlane(table, target) && target.distanceTo(camera.position) < 1.5) {
        group.current?.position.set(target.x, TABLE_Y, target.z)
        basePx.current = null
      }
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

  /** Where a world point appears in the reference frame, in processing pixels. */
  const projectToRef = (world: THREE.Vector3): Point | null => {
    const r = ref.current
    const c = world.clone().sub(r.p).applyQuaternion(r.q.clone().invert())
    if (c.z > -1e-3) return null
    const k = K.current
    return { x: k.cx + (k.f * c.x) / -c.z, y: k.cy - (k.f * c.y) / -c.z }
  }

  /** Sets the reference camera's pose and the table plane as seen from it. */
  const setReference = (q: THREE.Quaternion, p: THREE.Vector3) => {
    const r = ref.current
    r.q.copy(q)
    r.p.copy(p)
    const plane = tableInCamera(r.q, r.p, TABLE_Y)
    r.n.copy(plane.n)
    r.d = plane.d
  }

  /** Starts following the table, with the current camera pose as the reference. */
  const startTracking = (frame: Uint8ClampedArray, withGyro: boolean) => {
    const t = tracker.current
    if (!t) return false
    setReference(camera.quaternion, camera.position)
    t.start(frame, nearTable(K.current, ref.current.q, ref.current.p, TABLE_Y))
    basePx.current = group.current ? projectToRef(group.current.position) : null
    const e = new THREE.Euler().setFromQuaternion(ref.current.q, 'YXZ')
    tilt.current ??= { estimator: new TiltEstimator(), active: false, current: { pitch: 0, roll: 0 }, frames: 0 }
    tilt.current.estimator.reset()
    tilt.current.active = !withGyro
    tilt.current.current = { pitch: THREE.MathUtils.radToDeg(e.x), roll: THREE.MathUtils.radToDeg(e.z) }
    tilt.current.frames = 0
    return t.tracking
  }

  /**
   * Without a gyroscope: once the motion reveals the phone's real tilt at placement,
   * re-tilt the reference camera. The dish keeps its spot on the table (same pixel of
   * the reference frame); only the table's 3D angle is corrected.
   */
  const refineTilt = (H: Homography) => {
    const tl = tilt.current
    if (!tl?.active) return false
    tl.frames++
    if (tl.frames % 2) return false
    tl.estimator.add(H, K.current)
    if (tl.frames % 6) return false
    const e = tl.estimator.estimate()
    if (!e || (Math.abs(e.pitch - tl.current.pitch) < 1.5 && Math.abs(e.roll - tl.current.roll) < 1.5)) return false
    const yaw = new THREE.Euler().setFromQuaternion(ref.current.q, 'YXZ').y
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(e.pitch), yaw, THREE.MathUtils.degToRad(e.roll), 'YXZ'))
    basePx.current ??= group.current ? projectToRef(group.current.position) : null
    setReference(q, ref.current.p)
    tl.current = e
    return true
  }

  /** Puts the dish's base exactly on its spot of the table in this frame. */
  const pinBase = (H: Homography) => {
    if (!group.current) return
    basePx.current ??= projectToRef(group.current.position)
    const px = basePx.current && applyHomography(H, basePx.current.x, basePx.current.y)
    if (!px) return
    const k = K.current
    const dir = new THREE.Vector3((px.x - k.cx) / k.f, -(px.y - k.cy) / k.f, -1).applyQuaternion(camera.quaternion).normalize()
    ray.set(camera.position, dir)
    const hit = ray.ray.intersectPlane(table, new THREE.Vector3())
    if (hit && hit.distanceTo(camera.position) < 2) group.current.position.set(hit.x, TABLE_Y, hit.z)
  }

  useFrame(({ clock }) => {
    const cam = camera as THREE.PerspectiveCamera
    const v = video.current
    const sc = scratch.current
    group.current?.scale.setScalar(scale.current)
    if (!v) return
    const src = (source.current ??= new FrameSource(v))
    // Nothing new from the camera: keep showing the last frame and pose as they are.
    if (!src.next()) return

    // Show this frame, cropped like object-fit: cover, and match the 3D camera to it.
    let bg = background.current
    if (!bg) {
      bg = background.current = new THREE.VideoTexture(v)
      bg.colorSpace = THREE.SRGBColorSpace
      scene.background = bg
    }
    const videoAspect = v.videoWidth / v.videoHeight
    const screenAspect = size.width / size.height
    if (videoAspect > screenAspect) {
      bg.repeat.set(screenAspect / videoAspect, 1)
      bg.offset.set((1 - bg.repeat.x) / 2, 0)
    } else {
      bg.repeat.set(1, videoAspect / screenAspect)
      bg.offset.set(0, (1 - bg.repeat.y) / 2)
    }
    const fVideo = Math.max(v.videoWidth, v.videoHeight) / 2 / Math.tan(VIDEO_LONG_FOV / 2)
    const cover = Math.max(size.width / v.videoWidth, size.height / v.videoHeight)
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(size.height / cover / 2 / fVideo))
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }

    // Gyroscope reading, if any. No data after a moment (denied, or no sensor): fixed pose.
    const o = orientation.current
    const gyroQ = gyro && o ? orientationQuaternion(sc.g, o, screenAngle()) : null
    const noGyro = !gyroQ && (!gyro || clock.elapsedTime > 1.2)

    if (!placeKey || !aimed.current) {
      // Aiming: the dish sits where the centre of the screen meets the table.
      placedFor.current = 0
      tracker.current?.stop()
      cam.position.set(0, 0, 0)
      if (gyroQ) cam.quaternion.copy(gyroQ)
      else if (noGyro) cam.quaternion.copy(STATIC_POSE)
      else return // waiting for the first gyroscope reading
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)
      group.current?.position.copy(pointOnTable(cam.position, dir, sc.p))
      aimed.current = true
      if (!placeKey) {
        setState('aiming')
        return
      }
    }

    const frame = src.pixels()
    if (!frame) return
    if (!tracker.current || tracker.current.width !== src.width || tracker.current.height !== src.height) {
      tracker.current = new PlaneTracker(src.width, src.height)
    }
    const scaleToProcess = Math.min(src.width, src.height) / Math.min(v.videoWidth, v.videoHeight)
    K.current = { f: fVideo * scaleToProcess, cx: src.width / 2, cy: src.height / 2 }

    const remember = () => {
      good.current.q.copy(cam.quaternion)
      good.current.hasGyro = Boolean(gyroQ)
      if (gyroQ) good.current.gyro.copy(gyroQ)
    }

    // Just placed: this frame becomes the reference.
    if (placedFor.current !== placeKey) {
      placedFor.current = placeKey
      filter.current.reset()
      lostFrames.current = 0
      const ok = startTracking(frame, Boolean(gyroQ))
      remember()
      setState(ok ? 'tracking' : 'flat')
      retryIn.current = 10
      return
    }

    const t = tracker.current
    let H = t.tracking ? t.update(frame, nearTable(K.current, cam.quaternion, cam.position, TABLE_Y)) : null
    // Lost a moment ago: look for the table where it was, against the same reference.
    if (!H && lostFrames.current < RECOVER_FRAMES) H = t.recover(frame, nearTable(K.current, ref.current.q, ref.current.p, TABLE_Y))
    if (H && refineTilt(H)) filter.current.reset()
    const rel = H && poseFromHomography(H, K.current, ref.current.n, ref.current.d)
    if (H && rel) {
      currentCameraPose(ref.current.q, ref.current.p, rel, sc.q, sc.p)
      const f = filter.current.update(sc.p, sc.q, src.dt)
      cam.position.copy(f.position)
      cam.quaternion.copy(f.quaternion)
      pinBase(H)
      remember()
      lostFrames.current = 0
      setState('tracking')
      return
    }

    // Table lost (or too plain to follow): turn with the gyroscope from the last good
    // pose. If it doesn't come back where it was, start over from the current view.
    if (gyroQ && good.current.hasGyro) {
      const delta = good.current.gyro.clone().invert().multiply(gyroQ)
      cam.quaternion.copy(good.current.q).multiply(delta)
    }
    filter.current.reset()
    lostFrames.current++
    if (state.current === 'tracking') setState('lost')
    if ((lostFrames.current >= RECOVER_FRAMES || state.current === 'flat') && --retryIn.current <= 0) {
      retryIn.current = 10
      if (startTracking(frame, Boolean(gyroQ))) {
        remember()
        lostFrames.current = 0
        setState('tracking')
      }
    }
  })

  return (
    <group ref={group} position={[0, TABLE_Y, -0.45]}>
      <primitive object={dish} />
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
  const [track, setTrack] = useState<TrackState>('starting')

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
    camState === 'starting' || track === 'starting'
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
          track !== 'starting' &&
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
