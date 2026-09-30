import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { currentCameraPose, nearTable, PlaneTracker, poseFromHomography, tableInCamera, type Intrinsics } from './planeTracker'

// A synthetic table: the camera moves over a textured plane and we check that the
// tracked pose keeps a point on the table where it really is in the image.

const W = 180
const H = 320
const K: Intrinsics = { f: H / 2 / Math.tan(THREE.MathUtils.degToRad(32)), cx: W / 2, cy: H / 2 }
const TABLE_Y = -0.32

function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

function smooth(x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const a = hash(xi, yi)
  const b = hash(xi + 1, yi)
  const c = hash(xi, yi + 1)
  const d = hash(xi + 1, yi + 1)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

/** Tablecloth-like texture: 1.5 cm speckles over a softer pattern. Coordinates in metres. */
function texture(x: number, z: number) {
  return 40 + 140 * hash(Math.floor(x / 0.015), Math.floor(z / 0.015)) * 0.6 + 140 * smooth(x / 0.04, z / 0.04) * 0.4
}

function render(q: THREE.Quaternion, p: THREE.Vector3): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H * 4)
  const dir = new THREE.Vector3()
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      dir.set((u + 0.5 - K.cx) / K.f, -(v + 0.5 - K.cy) / K.f, -1).applyQuaternion(q)
      const s = (TABLE_Y - p.y) / dir.y
      const g = s > 0 && s < 5 ? texture(p.x + s * dir.x, p.z + s * dir.z) : 128
      const i = (v * W + u) * 4
      out[i] = out[i + 1] = out[i + 2] = g
      out[i + 3] = 255
    }
  }
  return out
}

function project(q: THREE.Quaternion, p: THREE.Vector3, world: THREE.Vector3) {
  const c = world.clone().sub(p).applyQuaternion(q.clone().invert())
  return { x: K.cx + (K.f * c.x) / -c.z, y: K.cy - (K.f * c.y) / -c.z }
}

describe('plane tracker', () => {
  // RANSAC samples with Math.random: seed it so the test is repeatable.
  beforeEach(() => {
    let seed = 7
    vi.spyOn(Math, 'random').mockImplementation(() => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646)
  })
  afterEach(() => vi.restoreAllMocks())

  it.each([
    // Small adjustments: 8 cm right, 5 cm closer, 3 cm up, turn 10°, tilt 8°.
    { name: 'small moves', steps: 30, move: [0.08, 0.03, -0.05], turn: 10, tilt: 8 },
    // Leaning over the table: 20 cm right, 10 cm closer, 6 cm up, turn 25°, tilt 15°.
    { name: 'leaning over', steps: 60, move: [0.2, 0.06, -0.1], turn: 25, tilt: 15 },
  ])('keeps a point on the table fixed while the phone moves and turns ($name)', ({ steps, move, turn, tilt }) => {
    const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(-50), 0, 0, 'YXZ'))
    const p0 = new THREE.Vector3(0, 0, 0)
    // The dish sits where the centre of the first frame meets the table.
    const centreRay = new THREE.Vector3(0, 0, -1).applyQuaternion(q0)
    const dish = p0.clone().add(centreRay.multiplyScalar((TABLE_Y - p0.y) / centreRay.y))

    const tracker = new PlaneTracker(W, H)
    expect(tracker.start(render(q0, p0), nearTable(K, q0, p0, TABLE_Y))).toBeGreaterThan(60)
    const { n, d } = tableInCamera(q0, p0, TABLE_Y)

    const estQ = q0.clone()
    const estP = p0.clone()
    let worst = 0
    for (let i = 1; i <= steps; i++) {
      const k = i / steps
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(THREE.MathUtils.degToRad(-50 + tilt * k), THREE.MathUtils.degToRad(turn * k), 0, 'YXZ'),
      )
      const p = new THREE.Vector3(move[0] * k, move[1] * k, move[2] * k)
      const Hm = tracker.update(render(q, p), nearTable(K, estQ, estP, TABLE_Y))
      expect(Hm, `lost at step ${i}`).not.toBeNull()
      const rel = poseFromHomography(Hm!, K, n, d)
      expect(rel).not.toBeNull()
      currentCameraPose(q0, p0, rel!, estQ, estP)

      const truth = project(q, p, dish)
      const seen = project(estQ, estP, dish)
      worst = Math.max(worst, Math.hypot(truth.x - seen.x, truth.y - seen.y))
      if (i === steps) {
        expect(estP.distanceTo(p)).toBeLessThan(0.015)
        expect(THREE.MathUtils.radToDeg(estQ.angleTo(q))).toBeLessThan(2.5)
      }
    }
    // Where we draw the dish vs where that spot of the table really is, in pixels of a
    // 180 px wide frame.
    expect(worst).toBeLessThan(4)
  })

  it('finds the table again after losing it, against the same reference', () => {
    const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(-50), 0, 0, 'YXZ'))
    const p0 = new THREE.Vector3()
    const tracker = new PlaneTracker(W, H)
    tracker.start(render(q0, p0), nearTable(K, q0, p0, TABLE_Y))
    const { n, d } = tableInCamera(q0, p0, TABLE_Y)
    const at = (k: number) => ({
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(-50 + 4 * k), THREE.MathUtils.degToRad(6 * k), 0, 'YXZ')),
      p: new THREE.Vector3(0.04 * k, 0.01 * k, -0.02 * k),
    })
    for (let i = 1; i <= 10; i++) expect(tracker.update(render(at(i / 10).q, at(i / 10).p))).not.toBeNull()

    // A hand covers the camera: the table is lost…
    expect(tracker.update(new Uint8ClampedArray(W * H * 4).fill(30))).toBeNull()
    expect(tracker.tracking).toBe(false)
    // …while the phone keeps moving a little; then the table is back in view.
    const back = at(1.3)
    const Hm = tracker.recover(render(back.q, back.p), nearTable(K, q0, p0, TABLE_Y))
    expect(Hm).not.toBeNull()
    expect(tracker.tracking).toBe(true)
    const estQ = new THREE.Quaternion()
    const estP = new THREE.Vector3()
    currentCameraPose(q0, p0, poseFromHomography(Hm!, K, n, d)!, estQ, estP)
    expect(estP.distanceTo(back.p)).toBeLessThan(0.01)
    expect(THREE.MathUtils.radToDeg(estQ.angleTo(back.q))).toBeLessThan(1.5)
  })

  it('does not snap onto something else when the table is not back', () => {
    const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(-50), 0, 0, 'YXZ'))
    const tracker = new PlaneTracker(W, H)
    tracker.start(render(q0, new THREE.Vector3()))
    expect(tracker.update(new Uint8ClampedArray(W * H * 4).fill(30))).toBeNull()
    // Pointing at a different, unrelated patch of pattern.
    const elsewhere = new THREE.Vector3(1.5, 0, -1.2)
    expect(tracker.recover(render(q0, elsewhere))).toBeNull()
    expect(tracker.tracking).toBe(false)
  })

  it('does not start on a surface without texture', () => {
    const flat = new Uint8ClampedArray(W * H * 4).fill(180)
    const tracker = new PlaneTracker(W, H)
    expect(tracker.start(flat)).toBe(0)
    expect(tracker.tracking).toBe(false)
  })
})
