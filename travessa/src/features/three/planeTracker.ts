import jsfeat from 'jsfeat'
import * as THREE from 'three'

// Keeps a dish fixed on the table in browsers without native AR (Chrome and Brave on
// iOS). Texture points on the table are followed from frame to frame (pyramidal
// Lucas-Kanade optical flow) and a homography from the frame where the dish was
// placed to the current frame is fitted with RANSAC. Because the points lie on the
// table plane, and the plane is known in the reference camera, the homography gives
// the camera's full motion (rotation and translation) relative to the table.

const MAX_POINTS = 160
/** Below this many tracked points, look for new ones. */
const REFILL_BELOW = 90
/** Below this many RANSAC inliers the table is considered lost. */
const MIN_INLIERS = 12
/** Minimum spacing between tracked points, in processing pixels. */
const CELL = 14

export interface Point {
  x: number
  y: number
}

/** Row-major 3×3 homography mapping reference-frame pixels to current-frame pixels. */
export type Homography = Float64Array

export class PlaneTracker {
  readonly width: number
  readonly height: number
  private prev: InstanceType<typeof jsfeat.pyramid_t>
  private curr: InstanceType<typeof jsfeat.pyramid_t>
  private corners: ReturnType<typeof makeCorners>
  private refXY = new Float32Array(MAX_POINTS * 2)
  private prevXY = new Float32Array(MAX_POINTS * 2)
  private currXY = new Float32Array(MAX_POINTS * 2)
  private status = new Uint8Array(MAX_POINTS)
  private count = 0
  private model = new jsfeat.matrix_t(3, 3, jsfeat.F32_t | jsfeat.C1_t)
  private mask = new jsfeat.matrix_t(MAX_POINTS, 1, jsfeat.U8C1_t)
  private kernel = new jsfeat.motion_model.homography2d()
  private ransac = new jsfeat.ransac_params_t(4, 2.5, 0.5, 0.995)
  private from: Point[] = Array.from({ length: MAX_POINTS }, () => ({ x: 0, y: 0 }))
  private to: Point[] = Array.from({ length: MAX_POINTS }, () => ({ x: 0, y: 0 }))
  private H: Homography = identity()
  private active = false
  // Drift correction: the reference frame, warped into the current view.
  private refImg: InstanceType<typeof jsfeat.matrix_t>
  private warped = new jsfeat.pyramid_t(3)
  private warpInv = new jsfeat.matrix_t(3, 3, jsfeat.F32_t | jsfeat.C1_t)
  private fixA = new Float32Array(MAX_POINTS * 2)
  private fixB = new Float32Array(MAX_POINTS * 2)
  private fixIdx = new Int32Array(MAX_POINTS)
  private fixStatus = new Uint8Array(MAX_POINTS)

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.prev = new jsfeat.pyramid_t(3)
    this.curr = new jsfeat.pyramid_t(3)
    this.prev.allocate(width, height, jsfeat.U8C1_t)
    this.curr.allocate(width, height, jsfeat.U8C1_t)
    this.corners = makeCorners(width * height)
    this.refImg = new jsfeat.matrix_t(width, height, jsfeat.U8C1_t)
    this.warped.allocate(width, height, jsfeat.U8C1_t)
  }

  get points(): number {
    return this.count
  }

  get tracking(): boolean {
    return this.active
  }

  /**
   * Makes `rgba` the reference frame. `accept` says which pixels may be table (for
   * example: below the horizon and not too far). Returns the number of points found;
   * too few means the surface has too little texture to follow.
   */
  start(rgba: Uint8ClampedArray | Uint8Array, accept: (x: number, y: number) => boolean = () => true): number {
    this.load(rgba, this.curr)
    this.refImg.data.set(this.curr.data[0].data.subarray(0, this.width * this.height))
    this.count = 0
    this.H = identity()
    this.addCorners(accept)
    for (let i = 0; i < this.count * 2; i++) this.currXY[i] = this.refXY[i]
    this.swap()
    this.active = this.count >= MIN_INLIERS
    return this.count
  }

  stop() {
    this.active = false
    this.count = 0
  }

  /** Follows the table into `rgba`. Returns the reference→current homography, or null when lost. */
  update(rgba: Uint8ClampedArray | Uint8Array, accept: (x: number, y: number) => boolean = () => true): Homography | null {
    if (!this.active) return null
    this.load(rgba, this.curr)
    for (let i = 0; i < this.count * 2; i++) this.prevXY[i] = this.currXY[i]
    jsfeat.optical_flow_lk.track(this.prev, this.curr, this.prevXY, this.currXY, this.count, 21, 30, this.status, 0.01, 0.0005)

    // Keep the points that were followed and are still in view.
    let n = 0
    for (let i = 0; i < this.count; i++) {
      const x = this.currXY[i * 2]
      const y = this.currXY[i * 2 + 1]
      if (this.status[i] !== 1 || x < 2 || y < 2 || x > this.width - 3 || y > this.height - 3) continue
      this.copyPoint(i, n++)
    }
    this.count = n

    if (n < MIN_INLIERS || !this.fit()) return this.lose()

    // Drop the points that don't move with the table (hands, plates, reflections).
    let kept = 0
    for (let i = 0; i < this.count; i++) if (this.mask.data[i]) this.copyPoint(i, kept++)
    if (kept < MIN_INLIERS) return this.lose()
    this.count = kept
    this.correctDrift()

    if (this.count < REFILL_BELOW) this.addCorners(accept)
    this.swap()
    return this.H
  }

  /**
   * Frame-to-frame flow drifts a little every frame. Warp the reference frame into
   * the current view with the homography and measure what is left between the two:
   * that residual is the drift, measured against a fixed image, so it can't pile up.
   */
  private correctDrift() {
    const inv = invert3(this.H)
    if (!inv) return
    for (let i = 0; i < 9; i++) this.warpInv.data[i] = inv[i]
    jsfeat.imgproc.warp_perspective(this.refImg, this.warped.data[0], this.warpInv, 0)
    this.warped.build(this.warped.data[0], true)

    const margin = 10
    let m = 0
    for (let i = 0; i < this.count; i++) {
      const rx = this.refXY[i * 2]
      const ry = this.refXY[i * 2 + 1]
      // Only points that exist in the reference image can be checked against it.
      if (rx < margin || ry < margin || rx > this.width - margin || ry > this.height - margin) continue
      const p = apply(this.H, rx, ry)
      if (!p) continue
      this.fixIdx[m] = i
      this.fixA[m * 2] = p.x
      this.fixA[m * 2 + 1] = p.y
      m++
    }
    if (m < MIN_INLIERS) return
    jsfeat.optical_flow_lk.track(this.warped, this.curr, this.fixA, this.fixB, m, 15, 20, this.fixStatus, 0.01, 0.0005)
    let fixed = 0
    for (let k = 0; k < m; k++) {
      const dx = this.fixB[k * 2] - this.fixA[k * 2]
      const dy = this.fixB[k * 2 + 1] - this.fixA[k * 2 + 1]
      if (this.fixStatus[k] !== 1 || dx * dx + dy * dy > 16) continue
      const i = this.fixIdx[k]
      this.currXY[i * 2] = this.fixB[k * 2]
      this.currXY[i * 2 + 1] = this.fixB[k * 2 + 1]
      fixed++
    }
    if (fixed >= MIN_INLIERS) {
      const before = this.H.slice()
      if (!this.fit()) this.H.set(before)
    }
  }

  private lose(): null {
    this.stop()
    this.swap()
    return null
  }

  private fit(): boolean {
    for (let i = 0; i < this.count; i++) {
      this.from[i].x = this.refXY[i * 2]
      this.from[i].y = this.refXY[i * 2 + 1]
      this.to[i].x = this.currXY[i * 2]
      this.to[i].y = this.currXY[i * 2 + 1]
    }
    if (!jsfeat.motion_estimator.ransac(this.ransac, this.kernel, this.from, this.to, this.count, this.model, this.mask, 400)) return false
    // Refine on every inlier: RANSAC's model comes from just four points.
    const inFrom: Point[] = []
    const inTo: Point[] = []
    for (let i = 0; i < this.count; i++) {
      if (!this.mask.data[i]) continue
      inFrom.push(this.from[i])
      inTo.push(this.to[i])
    }
    if (inFrom.length < MIN_INLIERS) return false
    this.kernel.run(inFrom, inTo, this.model, inFrom.length)
    const m = this.model.data
    const s = Math.abs(m[8]) > 1e-9 ? m[8] : 1
    for (let i = 0; i < 9; i++) this.H[i] = m[i] / s
    return true
  }

  private copyPoint(from: number, to: number) {
    this.refXY[to * 2] = this.refXY[from * 2]
    this.refXY[to * 2 + 1] = this.refXY[from * 2 + 1]
    this.currXY[to * 2] = this.currXY[from * 2]
    this.currXY[to * 2 + 1] = this.currXY[from * 2 + 1]
  }

  /** Adds strong corners of the current frame, spread out, mapped back to the reference frame. */
  private addCorners(accept: (x: number, y: number) => boolean) {
    const img = this.curr.data[0]
    jsfeat.fast_corners.set_threshold(14)
    const found = jsfeat.fast_corners.detect(img, this.corners, 8)
    const order = Array.from({ length: found }, (_, i) => i).sort((a, b) => this.corners[b].score - this.corners[a].score)
    const cols = Math.ceil(this.width / CELL)
    const taken = new Uint8Array(cols * Math.ceil(this.height / CELL))
    for (let i = 0; i < this.count; i++) {
      taken[cellOf(this.currXY[i * 2], this.currXY[i * 2 + 1], cols)] = 1
    }
    const inv = invert3(this.H)
    for (const k of order) {
      if (this.count >= MAX_POINTS) break
      const { x, y } = this.corners[k]
      const cell = cellOf(x, y, cols)
      if (taken[cell] || !accept(x, y)) continue
      const ref = apply(inv, x, y)
      if (!ref) continue
      taken[cell] = 1
      this.currXY[this.count * 2] = x
      this.currXY[this.count * 2 + 1] = y
      this.refXY[this.count * 2] = ref.x
      this.refXY[this.count * 2 + 1] = ref.y
      this.count++
    }
  }

  private load(rgba: Uint8ClampedArray | Uint8Array, into: InstanceType<typeof jsfeat.pyramid_t>) {
    jsfeat.imgproc.grayscale(rgba, this.width, this.height, into.data[0], jsfeat.COLOR_RGBA2GRAY)
    into.build(into.data[0], true)
  }

  private swap() {
    const t = this.prev
    this.prev = this.curr
    this.curr = t
  }
}

function makeCorners(n: number) {
  return Array.from({ length: n }, () => new jsfeat.keypoint_t(0, 0, 0, 0))
}

const cellOf = (x: number, y: number, cols: number) => Math.floor(y / CELL) * cols + Math.floor(x / CELL)

function identity(): Homography {
  return Float64Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1)
}

function apply(h: Homography | null, x: number, y: number): Point | null {
  if (!h) return null
  const w = h[6] * x + h[7] * y + h[8]
  if (Math.abs(w) < 1e-9) return null
  return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w }
}

function invert3(m: Homography): Homography | null {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-12) return null
  return Float64Array.of(
    A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
  )
}

// ---------------------------------------------------------------------------
// Camera pose from the homography.
//
// Computer-vision camera convention (x right, y down, z forward). For points X on
// the plane n·X = d in the reference camera, the current camera sees
// X' = R·X + t = (R + t·nᵀ/d)·X, so K⁻¹·H·K ∝ R + t·nᵀ/d. Any vector u with n·u = 0
// is mapped by the rotation alone, which fixes the scale and R; then t follows.

export interface Intrinsics {
  /** Focal length in processing pixels. */
  f: number
  cx: number
  cy: number
}

/** Rotation (column-major three.js Matrix3) and translation of the current camera relative to the reference one. */
export interface RelativePose {
  R: THREE.Matrix3
  t: THREE.Vector3
}

export function poseFromHomography(H: Homography, K: Intrinsics, n: THREE.Vector3, d: number): RelativePose | null {
  // M = K⁻¹ H K
  const k = new THREE.Matrix3().set(K.f, 0, K.cx, 0, K.f, K.cy, 0, 0, 1)
  const kInv = k.clone().invert()
  const h = new THREE.Matrix3().set(H[0], H[1], H[2], H[3], H[4], H[5], H[6], H[7], H[8])
  const M = kInv.multiply(h).multiply(k)

  const u1 = new THREE.Vector3(1, 0, 0)
  if (Math.abs(n.dot(u1)) > 0.9) u1.set(0, 1, 0)
  u1.sub(n.clone().multiplyScalar(n.dot(u1))).normalize()
  const u2 = new THREE.Vector3().crossVectors(n, u1).normalize() // u1 × u2 = n

  const m1 = u1.clone().applyMatrix3(M)
  const m2 = u2.clone().applyMatrix3(M)
  const norm = (m1.length() + m2.length()) / 2
  if (norm < 1e-9) return null
  let s = 1 / norm
  // Homographies are defined up to sign: the table must stay in front of the camera.
  const onAxis = new THREE.Vector3(0, 0, 1).multiplyScalar(d / Math.max(n.z, 1e-3))
  if (onAxis.clone().applyMatrix3(M).z * s < 0) s = -s

  const r1 = m1.multiplyScalar(s).normalize()
  const r2 = m2.multiplyScalar(s)
  r2.sub(r1.clone().multiplyScalar(r1.dot(r2))).normalize()
  const r3 = new THREE.Vector3().crossVectors(r1, r2)

  // R = [r1 r2 r3]·[u1 u2 n]ᵀ
  const rCols = new THREE.Matrix3().set(r1.x, r2.x, r3.x, r1.y, r2.y, r3.y, r1.z, r2.z, r3.z)
  const uRows = new THREE.Matrix3().set(u1.x, u1.y, u1.z, u2.x, u2.y, u2.z, n.x, n.y, n.z)
  const R = rCols.multiply(uRows)

  const Mn = n.clone().applyMatrix3(M).multiplyScalar(s)
  const t = Mn.sub(n.clone().applyMatrix3(R)).multiplyScalar(d)
  if (!Number.isFinite(t.x + t.y + t.z)) return null
  return { R, t }
}

// three.js cameras look down −z with y up; computer vision looks down +z with y down.
const FLIP = new THREE.Matrix4().makeScale(1, -1, -1)

/**
 * World pose of the current camera, given the reference camera's world pose and the
 * relative pose from `poseFromHomography`.
 */
export function currentCameraPose(
  refQuaternion: THREE.Quaternion,
  refPosition: THREE.Vector3,
  rel: RelativePose,
  outQuaternion: THREE.Quaternion,
  outPosition: THREE.Vector3,
) {
  // Current camera centre in reference CV coordinates: C = −Rᵀ·t.
  const Rt = rel.R.clone().transpose()
  const centre = rel.t.clone().applyMatrix3(Rt).negate()
  // Orientation of the current camera in the reference three.js camera: S·Rᵀ·S.
  const rot = new THREE.Matrix4().setFromMatrix3(Rt)
  const local = new THREE.Matrix4().multiplyMatrices(FLIP, rot).multiply(FLIP)
  outQuaternion.setFromRotationMatrix(local).premultiply(refQuaternion).normalize()
  outPosition.set(centre.x, -centre.y, -centre.z).applyQuaternion(refQuaternion).add(refPosition)
}

/**
 * The table (world plane y = `tableY`) seen from a camera at `position`/`quaternion`,
 * as `n·X = d` in that camera's CV coordinates, with d > 0.
 */
export function tableInCamera(quaternion: THREE.Quaternion, position: THREE.Vector3, tableY: number) {
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion.clone().invert())
  // Three.js camera coords: up·X = tableY − position.y (negative: the table is below).
  const c = tableY - position.y
  // CV coords flip y and z; negate so that d is positive.
  const n = new THREE.Vector3(-up.x, up.y, up.z)
  return { n, d: -c }
}

/**
 * Which processing pixels can be table: their view ray meets the table within
 * `maxDistance` metres. Far-away table is blurry and aliased, and above the horizon
 * there is no table at all.
 */
export function nearTable(K: Intrinsics, quaternion: THREE.Quaternion, position: THREE.Vector3, tableY: number, maxDistance = 0.9) {
  const toWorld = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(quaternion)).elements
  const drop = tableY - position.y
  return (x: number, y: number) => {
    // View ray in three.js camera coordinates, then only its world y and length matter.
    const cx = (x - K.cx) / K.f
    const cy = -(y - K.cy) / K.f
    const wy = toWorld[1] * cx + toWorld[4] * cy - toWorld[7]
    if (wy >= -1e-3) return false
    const s = drop / wy
    return s * Math.hypot(cx, cy, 1) < maxDistance
  }
}
