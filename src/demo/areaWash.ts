import type { Fixture } from '../store'
import { MEASURED_FRESNEL_KEY } from '../photometric/measuredFresnel'

export function areaWashFixture(fixture: Fixture, options: {
  name?: string
  target: Fixture['target']
  intensity: number
  beamAngleDeg?: number
  color?: Fixture['color']
}): Fixture {
  return {
    ...fixture,
    name: options.name ?? fixture.name,
    presetKey: 'Fresnel10',
    photometricProfile: MEASURED_FRESNEL_KEY,
    target: options.target,
    beamAngleDeg: options.beamAngleDeg ?? 44,
    intensity: options.intensity,
    color: options.color ?? fixture.color,
    enabled: options.intensity > 0,
  }
}
