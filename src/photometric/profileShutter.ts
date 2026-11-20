import * as THREE from 'three'
import type { Fixture } from '../store'
import { FIXTURE_PROFILES } from '../lighting/fixtureTypes'
import { barnDoorTransmission } from './measuredFresnel'

// エリスポ（輪郭のはっきりしたスポット）のシャッター。本物の劇場では、横明かりが袖幕や床に当たらないよう
// シャッターで光の形を切る。フレネルのバンドアと同じ角度の決め方（光軸から上下左右に何度まで通すか）で、
// spotLight の投影画像にして切る（2026-11-20）
export const SHUTTER_KINDS = new Set<string>(['Profile', 'LED_Profile'])
const cache = new Map<string, THREE.DataTexture>()

/** シャッターが効く器具か（模様のゴボを入れた器具は、ゴボの画像を優先する） */
export function hasProfileShutter(fixture: Fixture): boolean {
  if (fixture.gobo) return false
  if (!SHUTTER_KINDS.has(FIXTURE_PROFILES[fixture.presetKey]?.kind ?? '')) return false
  const cuts = fixture.barnDoorAngles
  return !!cuts && Object.values(cuts).some(value => value !== undefined)
}

/** 光の外側（フィールド角の半分、度）。シャッターの量の目安に使う */
export function profileHalfFieldDeg(fixture: Fixture): number {
  const profile = FIXTURE_PROFILES[fixture.presetKey]
  if (!profile) return fixture.beamAngleDeg / 2
  return Math.max(fixture.beamAngleDeg, profile.fieldAngleDeg * fixture.beamAngleDeg / profile.beamAngleDeg) / 2
}

export function profileShutterMap(fixture: Fixture, halfAngleRad: number): THREE.DataTexture {
  const limits = fixture.barnDoorAngles ?? {}
  const key = `${halfAngleRad.toFixed(4)}:${(['top', 'right', 'bottom', 'left'] as const).map(side => limits[side]?.toFixed(1) ?? 'none').join(':')}`
  const hit = cache.get(key)
  if (hit) return hit
  const size = 256
  const data = new Uint8Array(size * size * 4)
  const tangent = Math.tan(halfAngleRad)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = ((x + 0.5) / size) * 2 - 1
      const py = ((y + 0.5) / size) * 2 - 1
      const vertical = THREE.MathUtils.radToDeg(Math.atan(py * tangent))
      const horizontal = THREE.MathUtils.radToDeg(Math.atan(px * tangent))
      const value = Math.round(barnDoorTransmission(horizontal, vertical, limits) * 255)
      const offset = (y * size + x) * 4
      data[offset] = data[offset + 1] = data[offset + 2] = value
      data[offset + 3] = 255
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.colorSpace = THREE.NoColorSpace
  texture.needsUpdate = true
  if (cache.size >= 64) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) { cache.get(oldest)?.dispose(); cache.delete(oldest) }
  }
  cache.set(key, texture)
  return texture
}
