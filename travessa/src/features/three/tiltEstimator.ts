import * as THREE from 'three'
import { poseFromHomography, tableInCamera, type Homography, type Intrinsics } from './planeTracker'

// Without a gyroscope (iOS Chrome/Brave may not grant motion access) we don't know
// how the phone was tilted when the dish was placed; a guess of 45° makes the dish
// slide as the phone moves. The tilt can be read from the motion itself: for the
// right tilt, every tracked homography is exactly "rotation + translation of the
// table plane". Each candidate tilt (pitch, roll) is scored by how badly it explains
// the homographies seen so far; the best one wins once the phone has moved enough.

const PITCH_MIN = -85
const PITCH_MAX = -10
const ROLL_MAX = 25
const STEP = 2.5
/** Older homographies count less, so the estimate can follow a changing view. */
const DECAY = 0.97

export interface Tilt {
  /** Degrees; negative looks down. */
  pitch: number
  /** Degrees. */
  roll: number
}

export function tiltQuaternion(t: Tilt, out = new THREE.Quaternion()) {
  return out.setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(t.pitch), 0, THREE.MathUtils.degToRad(t.roll), 'YXZ'))
}

interface Candidate extends Tilt {
  n: THREE.Vector3
}

export class TiltEstimator {
  private candidates: Candidate[] = []
  private cost: Float64Array
  private evidence = 0

  constructor() {
    const origin = new THREE.Vector3()
    const q = new THREE.Quaternion()
    for (let pitch = PITCH_MIN; pitch <= PITCH_MAX + 1e-6; pitch += STEP) {
      for (let roll = -ROLL_MAX; roll <= ROLL_MAX + 1e-6; roll += STEP) {
        const { n } = tableInCamera(tiltQuaternion({ pitch, roll }, q), origin, -1)
        this.candidates.push({ pitch, roll, n })
      }
    }
    this.cost = new Float64Array(this.candidates.length)
  }

  reset() {
    this.cost.fill(0)
    this.evidence = 0
  }

  /** Scores every tilt against one reference→current homography. */
  add(H: Homography, K: Intrinsics) {
    let best = Infinity
    let worst = 0
    const scores = new Float64Array(this.candidates.length)
    for (let i = 0; i < this.candidates.length; i++) {
      const rel = poseFromHomography(H, K, this.candidates[i].n, 1)
      const r = rel ? rel.residual : 1
      scores[i] = r
      if (r < best) best = r
      if (r > worst) worst = r
    }
    for (let i = 0; i < scores.length; i++) this.cost[i] = this.cost[i] * DECAY + scores[i]
    // Spread between tilts = how much this view tells us (none when only turning).
    this.evidence = this.evidence * DECAY + (worst - best)
  }

  /** The best tilt so far, or null while the motion hasn't told the tilts apart. */
  estimate(minEvidence = 0.02): Tilt | null {
    if (this.evidence < minEvidence) return null
    let best = 0
    for (let i = 1; i < this.cost.length; i++) if (this.cost[i] < this.cost[best]) best = i
    return { pitch: this.candidates[best].pitch, roll: this.candidates[best].roll }
  }
}
