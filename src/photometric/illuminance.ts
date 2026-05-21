// 照度 (lux) 計算: 各フィクスチャの直接光の積分
// I (cd) = peak luminous intensity * beamProfile(angle)
// E (lux) = I / d² * cos(θ_incidence)
// (面に対する入射角の余弦補正を含む)

import * as THREE from 'three'
import type { Fixture } from '../store'
import { FIXTURE_PROFILES } from '../lighting/fixtureTypes'

// super-Gaussian (シェーダと同じ式)
function beamIntensity(
  angleRad: number,
  beamHalfRad: number,
  fieldHalfRad: number,
  flatness: number,
  peak: number,
): number {
  if (angleRad >= fieldHalfRad * 1.06) return 0
  const sigma = beamHalfRad / Math.pow(Math.LN2, 1 / (2 * flatness))
  const core = Math.exp(-Math.pow(angleRad / sigma, 2 * flatness))
  const centerW = Math.exp(-Math.pow(angleRad / (beamHalfRad * 0.3 + 1e-6), 2))
  const cutoff = 1 - smoothstep(fieldHalfRad, fieldHalfRad * 1.06, angleRad)
  return (core + peak * centerW) * cutoff
}
function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export interface FixtureContribution {
  fixtureId: string
  fixtureName: string
  illuminanceLux: number       // この光源単体の照度寄与
  intensityCandela: number     // ピーク光度 × ビームプロファイル
  distanceM: number
  withinBeam: boolean
  color: [number, number, number]
}

export interface IlluminanceMeasurement {
  worldPos: [number, number, number]
  surfaceNormal: [number, number, number]
  totalLux: number
  totalCdM2Approx: number      // 単純な近似輝度 (cd/m²) 表示用
  contributions: FixtureContribution[]
  // 合成色 (各光源色 × 寄与の和)
  blendedColor: [number, number, number]
}

export function measureIlluminance(
  worldPos: THREE.Vector3,
  surfaceNormal: THREE.Vector3,
  fixtures: Fixture[],
): IlluminanceMeasurement {
  const contributions: FixtureContribution[] = []
  let totalLux = 0
  const accumColor: [number, number, number] = [0, 0, 0]

  for (const f of fixtures) {
    if (!f.enabled) continue
    const profile = FIXTURE_PROFILES[f.presetKey]
    const pos = new THREE.Vector3(...f.position)
    const tgt = new THREE.Vector3(...f.target)
    const axis = new THREE.Vector3().subVectors(tgt, pos).normalize()

    const toSurf = new THREE.Vector3().subVectors(worldPos, pos)
    const dist = toSurf.length()
    if (dist < 0.05) continue
    const L = toSurf.clone().normalize()  // light→surface
    // ビーム軸との角度
    const cosA = L.dot(axis)
    if (cosA <= 0) continue
    const angle = Math.acos(Math.max(-1, Math.min(1, cosA)))

    const beamHalfRad = (f.beamAngleDeg * Math.PI) / 360
    const fieldHalfRad = ((f.beamAngleDeg / profile.beamAngleDeg) * profile.fieldAngleDeg * Math.PI) / 360
    const bp = beamIntensity(angle, beamHalfRad, fieldHalfRad, profile.flatness, profile.peak)
    if (bp <= 0) continue

    // ピーク光度 (cd) = 全光束 / ビーム立体角
    const beamRad = beamHalfRad
    const solidAngle = 2 * Math.PI * (1 - Math.cos(beamRad)) + 1e-3
    const peakCandela = profile.fluxLumens / solidAngle
    const intensityCd = peakCandela * bp * f.intensity

    // 面の法線との入射角余弦
    const cosI = Math.max(0, -L.dot(surfaceNormal))
    if (cosI <= 0) continue

    // E = I / d² × cos(θ)
    const lux = (intensityCd / (dist * dist)) * cosI

    contributions.push({
      fixtureId: f.id,
      fixtureName: f.name,
      illuminanceLux: lux,
      intensityCandela: intensityCd,
      distanceM: dist,
      withinBeam: angle < beamHalfRad,
      color: f.color,
    })
    totalLux += lux
    accumColor[0] += f.color[0] * lux
    accumColor[1] += f.color[1] * lux
    accumColor[2] += f.color[2] * lux
  }

  // 合成色の正規化
  if (totalLux > 1e-6) {
    accumColor[0] /= totalLux
    accumColor[1] /= totalLux
    accumColor[2] /= totalLux
  }

  // 単純近似輝度: 床は拡散反射 ~18% (gray card) と仮定
  const reflectance = 0.18
  const totalCdM2Approx = (totalLux * reflectance) / Math.PI

  contributions.sort((a, b) => b.illuminanceLux - a.illuminanceLux)

  return {
    worldPos: [worldPos.x, worldPos.y, worldPos.z],
    surfaceNormal: [surfaceNormal.x, surfaceNormal.y, surfaceNormal.z],
    totalLux,
    totalCdM2Approx,
    contributions,
    blendedColor: accumColor,
  }
}

// lux → fc (foot-candle) 変換
export const luxToFc = (lux: number) => lux / 10.764
// lux → EV100 (写真用)
export const luxToEV100 = (lux: number) => Math.log2(lux / 2.5)
