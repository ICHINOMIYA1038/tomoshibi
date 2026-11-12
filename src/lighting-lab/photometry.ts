import * as THREE from 'three'

export type Vector3Tuple = [number, number, number]

export interface LabFixture {
  id: string
  name: string
  presetKey: string
  position: Vector3Tuple
  target: Vector3Tuple
  beamAngleDeg: number
  intensity: number
  color: Vector3Tuple
  enabled: boolean
}

export interface IESProfile {
  type: 1 | 2
  vertical: number[]
  horizontal: number[]
  candela: number[][]
  peakCandela: number
  peakVerticalDeg: number
}

export interface MeasuredFixture extends LabFixture {
  profile: IESProfile
  profileName: string
  axis: THREE.Vector3
  up: THREE.Vector3
  right: THREE.Vector3
  colorLinear: THREE.Color
}

export function parseIES(text: string): IESProfile {
  const tiltLine = text.match(/^TILT=([^\r\n]+)/m)
  if (!tiltLine || tiltLine[1].trim() !== 'NONE') throw new Error('TILT=NONE の IES のみ対応しています')
  const values = text.slice((tiltLine.index ?? 0) + tiltLine[0].length).trim().split(/\s+/).map(Number)
  const verticalCount = values[3]
  const horizontalCount = values[4]
  const type = values[5]
  if (![1, 2].includes(type) || !Number.isInteger(verticalCount) || !Number.isInteger(horizontalCount)) {
    throw new Error('IES の測光形式を読み取れません')
  }
  const expected = 13 + verticalCount + horizontalCount + verticalCount * horizontalCount
  if (values.length < expected) throw new Error('IES の測光値が不足しています')
  const vertical = values.slice(13, 13 + verticalCount)
  const horizontal = values.slice(13 + verticalCount, 13 + verticalCount + horizontalCount)
  const multiplier = values[2] * values[10]
  let index = 13 + verticalCount + horizontalCount
  let peakCandela = 0
  let peakVerticalDeg = 0
  const candela = Array.from({ length: horizontalCount }, () => {
    const column = Array.from({ length: verticalCount }, (_, verticalIndex) => {
      const value = values[index++] * multiplier
      if (value > peakCandela) {
        peakCandela = value
        peakVerticalDeg = vertical[verticalIndex]
      }
      return value
    })
    return column
  })
  return { type: type as 1 | 2, vertical, horizontal, candela, peakCandela, peakVerticalDeg }
}

function bracket(values: number[], angle: number): [number, number, number] {
  if (angle <= values[0]) return [0, 0, 0]
  const last = values.length - 1
  if (angle >= values[last]) return [last, last, 0]
  let low = 0
  let high = last
  while (high - low > 1) {
    const mid = (high + low) >> 1
    if (angle < values[mid]) high = mid
    else low = mid
  }
  return [low, high, (angle - values[low]) / (values[high] - values[low])]
}

export function candelaAt(profile: IESProfile, verticalDeg: number, horizontalDeg: number): number {
  const hMax = profile.horizontal[profile.horizontal.length - 1]
  let h = ((horizontalDeg % 360) + 360) % 360
  if (hMax < 360) {
    if (hMax <= 90) h = Math.abs(((h + 180) % 360) - 180)
    if (h > hMax) h = 2 * hMax - h
  }
  if (verticalDeg < profile.vertical[0] || verticalDeg > profile.vertical[profile.vertical.length - 1]) return 0
  if (h < profile.horizontal[0] || h > hMax) return 0
  const [v0, v1, vt] = bracket(profile.vertical, verticalDeg)
  const [h0, h1, ht] = bracket(profile.horizontal, h)
  const low = THREE.MathUtils.lerp(profile.candela[h0][v0], profile.candela[h0][v1], vt)
  const high = THREE.MathUtils.lerp(profile.candela[h1][v0], profile.candela[h1][v1], vt)
  return THREE.MathUtils.lerp(low, high, ht)
}

export function prepareFixture(fixture: LabFixture, profile: IESProfile, profileName: string): MeasuredFixture {
  const axis = new THREE.Vector3(...fixture.target).sub(new THREE.Vector3(...fixture.position)).normalize()
  const verticalReference = profile.type === 2 ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(0, 1, 0)
  const up = verticalReference.addScaledVector(axis, -verticalReference.dot(axis)).normalize()
  const right = new THREE.Vector3().crossVectors(up, axis).normalize()
  return {
    ...fixture,
    profile,
    profileName,
    axis,
    up,
    right,
    colorLinear: new THREE.Color().setRGB(...fixture.color),
  }
}

export function intensityAt(fixture: MeasuredFixture, direction: THREE.Vector3): number {
  const forward = direction.dot(fixture.axis)
  if (forward <= 0) return 0
  if (fixture.profile.type === 1) {
    const vertical = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(forward, -1, 1)))
    const horizontal = THREE.MathUtils.radToDeg(Math.atan2(direction.dot(fixture.right), direction.dot(fixture.up)))
    return candelaAt(fixture.profile, vertical, horizontal) * fixture.intensity
  }
  const vertical = THREE.MathUtils.radToDeg(Math.atan2(direction.dot(fixture.up), forward)) + fixture.profile.peakVerticalDeg
  const horizontal = THREE.MathUtils.radToDeg(Math.atan2(Math.abs(direction.dot(fixture.right)), forward))
  return candelaAt(fixture.profile, vertical, horizontal) * fixture.intensity
}

export function illuminanceAt(
  point: THREE.Vector3,
  normal: THREE.Vector3,
  fixtures: MeasuredFixture[],
): { lux: number; rgb: THREE.Color } {
  const rgb = new THREE.Color(0, 0, 0)
  let lux = 0
  for (const fixture of fixtures) {
    if (!fixture.enabled || fixture.intensity <= 0) continue
    const fromLamp = point.clone().sub(new THREE.Vector3(...fixture.position))
    const distanceSquared = fromLamp.lengthSq()
    if (distanceSquared < 0.01) continue
    const direction = fromLamp.normalize()
    const cosine = Math.max(0, -direction.dot(normal))
    if (cosine === 0) continue
    const contribution = intensityAt(fixture, direction) * cosine / distanceSquared
    if (contribution <= 0) continue
    lux += contribution
    rgb.add(fixture.colorLinear.clone().multiplyScalar(contribution))
  }
  return { lux, rgb }
}
