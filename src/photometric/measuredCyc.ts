import * as THREE from 'three'
import type { Fixture } from '../store'
import { candelaAt, parseIES } from '../lighting-lab/photometry'
import cycIES from './data/etc-s4-led-cyc-daylight-hd.ies?raw'

export const MEASURED_CYC_KEY = 'etc-s4-led-cyc-daylight-hd'

const profile = parseIES(cycIES)
const halfAngle = THREE.MathUtils.degToRad(75)
const displayGain = 0.06

export function hasMeasuredCyc(fixture: Fixture): boolean {
  return fixture.presetKey === 'CycWashStudy' && fixture.photometricProfile === MEASURED_CYC_KEY
}

export function measuredCycCandela(fixture: Fixture, direction: THREE.Vector3): number {
  const axis = new THREE.Vector3(...fixture.target).sub(new THREE.Vector3(...fixture.position))
  if (axis.lengthSq() < 1e-8) return 0
  axis.normalize()
  const forward = direction.dot(axis)
  if (forward <= 0) return 0
  const reference = Math.abs(axis.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, -1, 0)
  const up = reference.addScaledVector(axis, -reference.dot(axis)).normalize()
  const right = new THREE.Vector3().crossVectors(up, axis).normalize()
  const vertical = THREE.MathUtils.radToDeg(Math.atan2(direction.dot(up), forward)) + profile.peakVerticalDeg
  const horizontal = THREE.MathUtils.radToDeg(Math.atan2(Math.abs(direction.dot(right)), forward))
  return candelaAt(profile, vertical, horizontal) * fixture.intensity
}

function makeCookie(): THREE.DataTexture {
  const size = 512
  const data = new Uint8Array(size * size * 4)
  const tangent = Math.tan(halfAngle)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = ((x + 0.5) / size) * 2 - 1
      const py = ((y + 0.5) / size) * 2 - 1
      const vertical = THREE.MathUtils.radToDeg(Math.atan(py * tangent)) + profile.peakVerticalDeg
      const horizontal = THREE.MathUtils.radToDeg(Math.atan(Math.abs(px) * tangent))
      const value = Math.round(255 * THREE.MathUtils.clamp(candelaAt(profile, vertical, horizontal) / profile.peakCandela, 0, 1))
      const offset = (y * size + x) * 4
      data[offset] = value
      data[offset + 1] = value
      data[offset + 2] = value
      data[offset + 3] = 255
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.colorSpace = THREE.NoColorSpace
  texture.needsUpdate = true
  return texture
}

let cookie: THREE.DataTexture | null = null

export function measuredCycSpotlight(fixture: Fixture) {
  cookie ??= makeCookie()
  return {
    map: cookie,
    halfAngle,
    fieldAngleRad: THREE.MathUtils.degToRad(90),
    intensityCandela: profile.peakCandela * fixture.intensity * displayGain,
  }
}
