import * as THREE from 'three'
import type { Fixture } from '../store'
import { FIXTURE_PROFILES, kelvinToRGB } from './fixtureTypes'
import { hasMeasuredFresnel, measuredFresnelSpotlight } from '../photometric/measuredFresnel'
import { hasMeasuredCyc, measuredCycSpotlight } from '../photometric/measuredCyc'

export const SPOT_PENUMBRA = 0.6
export const SPOT_DECAY = 2

function smoothEdge(value: number, start: number) {
  const t = Math.max(0, Math.min(1, (1 - Math.abs(value)) / (1 - start)))
  return t * t * (3 - 2 * t)
}

export function cycBeamAttenuation(horizontal: number, vertical: number) {
  return smoothEdge(horizontal, 0.46) * smoothEdge(vertical, 0.7)
}

export function fixtureSpotlightColor(fixture: Fixture): THREE.Color {
  if (hasMeasuredFresnel(fixture)) {
    const color = new THREE.Color(...fixture.color)
    if (fixture.whiteMix > 0) color.lerp(new THREE.Color(1, 1, 1), fixture.whiteMix * 0.5)
    return color
  }
  const profile = FIXTURE_PROFILES[fixture.presetKey]
  if (!profile) return new THREE.Color(...fixture.color)
  if (profile.source === 'tungsten') {
    const color = new THREE.Color(...kelvinToRGB(profile.colorTemperatureK))
    if (fixture.gelEnabled) color.multiply(new THREE.Color(...fixture.color))
    return color
  }
  if (profile.source === 'led-tunable') return new THREE.Color(...kelvinToRGB(fixture.colorTempK))
  const color = new THREE.Color(...fixture.color)
  if (fixture.whiteMix > 0) color.lerp(new THREE.Color(1, 1, 1), fixture.whiteMix * 0.5)
  return color
}

export function fixtureSpotlightModel(fixture: Fixture) {
  if (hasMeasuredCyc(fixture)) {
    return {
      color: fixtureSpotlightColor(fixture),
      ...measuredCycSpotlight(fixture),
      penumbra: 0.01,
      decay: SPOT_DECAY,
      beamShape: undefined as 'cyc' | undefined,
    }
  }
  if (hasMeasuredFresnel(fixture)) {
    const measured = measuredFresnelSpotlight(fixture)
    return {
      color: fixtureSpotlightColor(fixture),
      ...measured,
      penumbra: 0.01,
      decay: SPOT_DECAY,
      beamShape: undefined as 'cyc' | undefined,
    }
  }
  const profile = FIXTURE_PROFILES[fixture.presetKey]
  const fieldAngleDeg = Math.max(0.1, Math.min(90, profile
    ? Math.max(fixture.beamAngleDeg, profile.fieldAngleDeg * fixture.beamAngleDeg / profile.beamAngleDeg)
    : fixture.beamAngleDeg))
  const fieldAngleRad = THREE.MathUtils.degToRad(fieldAngleDeg)
  const halfAngle = fieldAngleRad / 2
  const fluxLumens = profile?.fluxLumens ?? 1000
  const solidAngle = 2 * Math.PI * (1 - Math.cos(halfAngle))
  return {
    color: fixtureSpotlightColor(fixture),
    fieldAngleRad,
    halfAngle,
    penumbra: SPOT_PENUMBRA,
    decay: SPOT_DECAY,
    beamShape: profile?.beamShape,
    map: null as THREE.Texture | null,
    intensityCandela: fluxLumens / solidAngle * fixture.intensity,
  }
}
