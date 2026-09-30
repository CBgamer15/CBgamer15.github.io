import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { nearTable, PlaneTracker, type Intrinsics } from './planeTracker'
import { TiltEstimator } from './tiltEstimator'

// Without a gyroscope the app assumes the phone looks down at 45°. Here the real tilt
// is different; moving the phone a few centimetres must reveal it.

const W = 180
const H = 320
const K: Intrinsics = { f: H / 2 / Math.tan(THREE.MathUtils.degToRad(32)), cx: W / 2, cy: H / 2 }
const TABLE_Y = -0.32

function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

function render(q: THREE.Quaternion, p: THREE.Vector3): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H * 4)
  const dir = new THREE.Vector3()
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      dir.set((u + 0.5 - K.cx) / K.f, -(v + 0.5 - K.cy) / K.f, -1).applyQuaternion(q)
      const s = (TABLE_Y - p.y) / dir.y
      const g = s > 0 && s < 5 ? 40 + 140 * hash(Math.floor((p.x + s * dir.x) / 0.015), Math.floor((p.z + s * dir.z) / 0.015)) : 128
      const i = (v * W + u) * 4
      out[i] = out[i + 1] = out[i + 2] = g
      out[i + 3] = 255
    }
  }
  return out
}

const tilted = (pitch: number, yaw: number, roll: number) =>
  new THREE.Quaternion().setFromEuler(new THREE.Euler(...([pitch, yaw, roll].map(THREE.MathUtils.degToRad) as [number, number, number]), 'YXZ'))

describe('tilt estimator', () => {
  beforeEach(() => {
    let seed = 11
    vi.spyOn(Math, 'random').mockImplementation(() => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646)
  })
  afterEach(() => vi.restoreAllMocks())

  it.each([
    { pitch: -30, roll: 0 },
    { pitch: -65, roll: 0 },
    { pitch: -60, roll: 8 },
  ])('finds a phone held at $pitch° (roll $roll°) after a few centimetres of movement', ({ pitch, roll }) => {
    const guess = tilted(-45, 0, 0)
    const origin = new THREE.Vector3()
    const tracker = new PlaneTracker(W, H)
    tracker.start(render(tilted(pitch, 0, roll), origin), nearTable(K, guess, origin, TABLE_Y))
    const estimator = new TiltEstimator()
    expect(estimator.estimate()).toBeNull() // no motion yet, no answer

    for (let i = 1; i <= 20; i++) {
      const k = i / 30
      // 5 cm sideways, 3 cm closer, turning a little as a hand does.
      const q = tilted(pitch + 6 * k, 12 * k, roll)
      const p = new THREE.Vector3(0.08 * k, 0.02 * k, -0.04 * k)
      const Hm = tracker.update(render(q, p), nearTable(K, guess, origin, TABLE_Y))
      expect(Hm).not.toBeNull()
      estimator.add(Hm!, K)
    }
    const found = estimator.estimate()
    expect(found).not.toBeNull()
    expect(Math.abs(found!.pitch - pitch)).toBeLessThanOrEqual(3)
    expect(Math.abs(found!.roll - roll)).toBeLessThanOrEqual(3)
  })
})
