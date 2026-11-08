import * as THREE from 'three'
import type { Fixture } from '../store'
import { candelaAt, parseIES } from '../lighting-lab/photometry'
import midIES from './data/etc-fos4-fresnel10-daylight-mid.ies?raw'

export const MEASURED_FRESNEL_KEY = 'etc-fos4-fresnel10-mid'
export const MEASURED_FRESNEL_REFERENCE_BEAM_DEG = 28
export const MEASURED_FRESNEL_DISPLAY_GAIN = 0.08

const midProfile = parseIES(midIES)
const cookieCache = new Map<string, THREE.DataTexture>()

type BarnDoorSide = 'top' | 'right' | 'bottom' | 'left'

function cutTransmission(angleDeg: number, limitDeg?: number): number {
  if (limitDeg === undefined) return 1
  const t = THREE.MathUtils.clamp((angleDeg - limitDeg + 1.5) / 3, 0, 1)
  return 1 - t * t * (3 - 2 * t)
}

function barnDoorLimits(fixture: Fixture): Partial<Record<BarnDoorSide, number>> {
  return fixture.barnDoorAngles ?? (fixture.upstageCutDeg === undefined ? {} : { top: fixture.upstageCutDeg })
}

function barnDoorTransmission(horizontalDeg: number, verticalDeg: number, limits: Partial<Record<BarnDoorSide, number>>): number {
  return cutTransmission(verticalDeg, limits.top)
    * cutTransmission(horizontalDeg, limits.right)
    * cutTransmission(-verticalDeg, limits.bottom)
    * cutTransmission(-horizontalDeg, limits.left)
}

function zoomRatio(fixture: Fixture): number {
  return MEASURED_FRESNEL_REFERENCE_BEAM_DEG / THREE.MathUtils.clamp(fixture.beamAngleDeg, 7, 55)
}

export function hasMeasuredFresnel(fixture: Fixture): boolean {
  return fixture.presetKey === 'Fresnel10' && fixture.photometricProfile === MEASURED_FRESNEL_KEY
}

export function measuredFresnelCandela(fixture: Fixture, direction: THREE.Vector3): number {
  const axis = new THREE.Vector3(...fixture.target).sub(new THREE.Vector3(...fixture.position))
  if (axis.lengthSq() < 1e-8) return 0
  axis.normalize()
  const forward = direction.dot(axis)
  if (forward <= 0) return 0
  const reference = Math.abs(axis.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)
  const up = reference.addScaledVector(axis, -reference.dot(axis)).normalize()
  const right = new THREE.Vector3().crossVectors(up, axis).normalize()
  const vertical = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(forward, -1, 1))) * zoomRatio(fixture)
  const horizontal = THREE.MathUtils.radToDeg(Math.atan2(direction.dot(right), direction.dot(up)))
  const ratio = zoomRatio(fixture)
  const verticalAngle = THREE.MathUtils.radToDeg(Math.atan2(direction.dot(up), forward))
  const horizontalAngle = THREE.MathUtils.radToDeg(Math.atan2(direction.dot(right), forward))
  return candelaAt(midProfile, vertical, horizontal) * fixture.intensity * ratio * ratio
    * barnDoorTransmission(horizontalAngle, verticalAngle, barnDoorLimits(fixture))
}

function makeCookie(beamAngleDeg: number, limits: Partial<Record<BarnDoorSide, number>>): THREE.DataTexture {
  const size = 256
  const data = new Uint8Array(size * size * 4)
  const ratio = MEASURED_FRESNEL_REFERENCE_BEAM_DEG / beamAngleDeg
  const halfAngle = THREE.MathUtils.degToRad(Math.min(88, 45 / ratio))
  const tangent = Math.tan(halfAngle)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = ((x + 0.5) / size) * 2 - 1
      const py = ((y + 0.5) / size) * 2 - 1
      const vertical = THREE.MathUtils.radToDeg(Math.atan(Math.hypot(px, py) * tangent)) * ratio
      const horizontal = THREE.MathUtils.radToDeg(Math.atan2(px, py))
      const verticalAngle = THREE.MathUtils.radToDeg(Math.atan(py * tangent))
      const horizontalAngle = THREE.MathUtils.radToDeg(Math.atan(px * tangent))
      const normalized = THREE.MathUtils.clamp(candelaAt(midProfile, vertical, horizontal) / midProfile.peakCandela, 0, 1)
        * barnDoorTransmission(horizontalAngle, verticalAngle, limits)
      const value = Math.round(normalized * 255)
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

export function measuredFresnelSpotlight(fixture: Fixture) {
  const beamAngleDeg = THREE.MathUtils.clamp(fixture.beamAngleDeg, 7, 55)
  const limits = barnDoorLimits(fixture)
  const key = `${beamAngleDeg.toFixed(1)}:${(['top', 'right', 'bottom', 'left'] as const).map(side => limits[side]?.toFixed(1) ?? 'none').join(':')}`
  let map = cookieCache.get(key)
  if (!map) {
    map = makeCookie(beamAngleDeg, limits)
    if (cookieCache.size >= 128) {
      const oldestKey = cookieCache.keys().next().value
      if (oldestKey !== undefined) {
        cookieCache.get(oldestKey)?.dispose()
        cookieCache.delete(oldestKey)
      }
    }
    cookieCache.set(key, map)
  }
  const ratio = zoomRatio(fixture)
  const halfAngle = THREE.MathUtils.degToRad(Math.min(88, 45 / ratio))
  return {
    map,
    halfAngle,
    fieldAngleRad: THREE.MathUtils.degToRad(44 / ratio),
    intensityCandela: midProfile.peakCandela * fixture.intensity * ratio * ratio * MEASURED_FRESNEL_DISPLAY_GAIN,
  }
}
