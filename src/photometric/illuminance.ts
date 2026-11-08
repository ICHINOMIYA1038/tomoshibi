// 器具から測定面への直接光。影・客電・材質の反射は含めない。

import * as THREE from 'three'
import type { Fixture } from '../store'
import { cycBeamAttenuation, fixtureSpotlightColor, fixtureSpotlightModel } from '../lighting/spotlightModel'
import { hasMeasuredFresnel, measuredFresnelCandela } from './measuredFresnel'

function smoothstep(a: number, b: number, x: number) {
  if (a === b) return x >= b ? 1 : 0
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export interface FixtureContribution {
  fixtureId: string
  fixtureName: string
  illuminanceLux: number       // この光源単体の照度寄与
  intensityCandela: number     // 測定方向の光度
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
  const accumColor = new THREE.Color(0, 0, 0)
  const normal = surfaceNormal.clone().normalize()

  for (const f of fixtures) {
    if (!f.enabled) continue
    const measured = hasMeasuredFresnel(f)
    const spotlight = measured ? null : fixtureSpotlightModel(f)
    const pos = new THREE.Vector3(...f.position)
    const tgt = new THREE.Vector3(...f.target)
    const axis = new THREE.Vector3().subVectors(tgt, pos).normalize()

    const toSurf = new THREE.Vector3().subVectors(worldPos, pos)
    const dist = toSurf.length()
    if (dist < 0.05) continue
    const lightToSurface = toSurf.clone().divideScalar(dist)
    const angleCos = lightToSurface.dot(axis)
    const coneCos = spotlight ? Math.cos(spotlight.halfAngle) : -1
    const penumbraCos = spotlight ? Math.cos(spotlight.halfAngle * (1 - spotlight.penumbra)) : 1
    let spotAttenuation = measured ? 1 : smoothstep(coneCos, penumbraCos, angleCos)
    if (spotlight?.beamShape === 'cyc' && spotAttenuation > 0) {
      const up = new THREE.Vector3(0, 1, 0)
      const right = new THREE.Vector3().crossVectors(axis, up).normalize()
      const vertical = new THREE.Vector3().crossVectors(right, axis).normalize()
      const axialDistance = toSurf.dot(axis)
      const scale = axialDistance * Math.tan(spotlight.halfAngle)
      if (scale > 0) {
        const horizontalCoord = toSurf.dot(right) / scale
        const verticalCoord = toSurf.dot(vertical) / scale
        spotAttenuation *= cycBeamAttenuation(horizontalCoord, verticalCoord)
      }
    }
    if (spotAttenuation <= 0) continue

    const cosI = Math.max(0, -lightToSurface.dot(normal))
    if (cosI <= 0) continue

    const intensityCd = measured
      ? measuredFresnelCandela(f, lightToSurface)
      : spotlight!.intensityCandela * spotAttenuation
    if (intensityCd <= 0) continue
    const distanceAttenuation = 1 / Math.max(Math.pow(dist, spotlight?.decay ?? 2), 0.01)
    const incident = intensityCd * distanceAttenuation * cosI
    const color = measured ? fixtureSpotlightColor(f) : spotlight!.color
    const colorLuminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b
    const lux = incident * colorLuminance
    const colorSrgb = color.clone().convertLinearToSRGB()

    contributions.push({
      fixtureId: f.id,
      fixtureName: f.name,
      illuminanceLux: lux,
      intensityCandela: intensityCd * colorLuminance,
      distanceM: dist,
      withinBeam: angleCos >= Math.cos(THREE.MathUtils.degToRad(f.beamAngleDeg) / 2),
      color: [colorSrgb.r, colorSrgb.g, colorSrgb.b],
    })
    totalLux += lux
    accumColor.r += color.r * incident
    accumColor.g += color.g * incident
    accumColor.b += color.b * incident
  }

  const maxColor = Math.max(accumColor.r, accumColor.g, accumColor.b)
  if (maxColor > 0) accumColor.multiplyScalar(1 / maxColor).convertLinearToSRGB()

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
    blendedColor: [accumColor.r, accumColor.g, accumColor.b],
  }
}

export function measureIlluminanceAtHit(
  point: THREE.Vector3,
  faceNormal: THREE.Vector3 | undefined,
  object: THREE.Object3D,
  fixtures: Fixture[],
): IlluminanceMeasurement {
  const normal = faceNormal
    ? faceNormal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(object.matrixWorld)).normalize()
    : new THREE.Vector3(0, 1, 0)
  return measureIlluminance(point, normal, fixtures)
}

// lux → fc (foot-candle) 変換
export const luxToFc = (lux: number) => lux / 10.764
// lux → EV100 (写真用)
export const luxToEV100 = (lux: number) => Math.log2(lux / 2.5)
