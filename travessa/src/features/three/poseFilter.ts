import * as THREE from 'three'

// Smooths the tracked camera pose without making it lag: a "1€ filter" (Casiez et al.,
// 2012). When the phone is almost still it filters hard, which hides tracking jitter;
// the faster it moves, the less it filters, so the dish doesn't trail the table.

function alpha(cutoffHz: number, dt: number) {
  const tau = 1 / (2 * Math.PI * cutoffHz)
  return 1 / (1 + tau / dt)
}

interface Tuning {
  /** Cutoff when still, in Hz: lower = steadier. */
  minCutoff: number
  /** How fast the cutoff rises with speed. */
  beta: number
  /** Apparent speed that tracking jitter alone produces; below it the phone counts as still. */
  noise: number
}

const POSITION: Tuning = { minCutoff: 1.5, beta: 60, noise: 0.1 } // m/s
const ROTATION: Tuning = { minCutoff: 1.5, beta: 18, noise: 0.1 } // rad/s

const cutoff = (t: Tuning, speed: number) => t.minCutoff + t.beta * Math.max(0, speed - t.noise)
const SPEED_CUTOFF = 1

export class PoseFilter {
  readonly position = new THREE.Vector3()
  readonly quaternion = new THREE.Quaternion()
  private speed = 0
  private angularSpeed = 0
  private primed = false

  reset() {
    this.primed = false
  }

  /** Feeds a raw pose measured `dt` seconds after the previous one; returns the filtered pose in this.position/this.quaternion. */
  update(position: THREE.Vector3, quaternion: THREE.Quaternion, dt: number) {
    if (!this.primed || !(dt > 0)) {
      this.position.copy(position)
      this.quaternion.copy(quaternion)
      this.speed = 0
      this.angularSpeed = 0
      this.primed = true
      return this
    }
    const aSpeed = alpha(SPEED_CUTOFF, dt)
    this.speed += aSpeed * (position.distanceTo(this.position) / dt - this.speed)
    this.angularSpeed += aSpeed * (quaternion.angleTo(this.quaternion) / dt - this.angularSpeed)

    this.position.lerp(position, alpha(cutoff(POSITION, this.speed), dt))
    this.quaternion.slerp(quaternion, alpha(cutoff(ROTATION, this.angularSpeed), dt))
    return this
  }
}
