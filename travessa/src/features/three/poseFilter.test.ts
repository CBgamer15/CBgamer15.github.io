import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { PoseFilter } from './poseFilter'

const dt = 1 / 30

function noisy(seed: number, mm: number) {
  // Small deterministic jitter, ±mm millimetres.
  const r = (k: number) => (Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1
  return new THREE.Vector3(r(1), r(2), r(3)).multiplyScalar(mm / 1000)
}

describe('pose filter', () => {
  it('steadies a phone held still', () => {
    const f = new PoseFilter()
    const q = new THREE.Quaternion()
    let raw = 0
    let out = 0
    for (let i = 0; i < 120; i++) {
      const p = noisy(i, 3)
      f.update(p, q, dt)
      if (i < 30) continue
      raw += p.lengthSq()
      out += f.position.lengthSq()
    }
    // Jitter (RMS) is cut roughly in half.
    expect(Math.sqrt(out / raw)).toBeLessThan(0.55)
  })

  it('keeps up with a phone that moves', () => {
    const f = new PoseFilter()
    const q = new THREE.Quaternion()
    const target = new THREE.Vector3()
    for (let i = 0; i < 30; i++) {
      target.set(0.3 * (i / 30), 0, 0) // 30 cm/s sideways
      f.update(target, q, dt)
    }
    // Trails by less than 1.5 cm while moving at 30 cm/s.
    expect(target.x - f.position.x).toBeLessThan(0.015)
  })

  it('keeps up with a turn', () => {
    const f = new PoseFilter()
    const p = new THREE.Vector3()
    const q = new THREE.Quaternion()
    for (let i = 0; i < 30; i++) {
      q.setFromEuler(new THREE.Euler(0, (i / 30) * 0.8, 0)) // ~45°/s
      f.update(p, q, dt)
    }
    expect(THREE.MathUtils.radToDeg(f.quaternion.angleTo(q))).toBeLessThan(2)
  })
})
