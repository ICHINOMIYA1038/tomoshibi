import * as THREE from 'three'
import type { Fixture } from '../store'
import { FIXTURE_PROFILES } from './fixtureTypes'

// ムービングライトの向き（パン・チルト）と、シーンの中で動き続ける「動き」。
// 向きの正は、ほかの照明と同じく target（狙いの点）。パン・チルトは target から求め、
// パン・チルトを変えたときは、いまの狙いまでの距離を保ったまま target を置き直す。

export type MovementPattern = 'circle' | 'eight' | 'sweep-x' | 'sweep-z'
export type FixtureMovement = {
  pattern: MovementPattern
  /** 狙いの点のまわりに動く大きさ（床の上の半径、m） */
  sizeM: number
  /** 1 周にかかる秒数 */
  periodS: number
}

export const MOVEMENT_LABELS: Array<[MovementPattern, string]> = [
  ['circle', '円'], ['eight', '8 の字'], ['sweep-x', '左右に振る'], ['sweep-z', '前後に振る'],
]
export const MOVEMENT_LIMITS = { size: [0.2, 8] as const, period: [1, 30] as const }

/** パン・チルトで向きを変えられる照明（ムービングライト）か */
export function isMover(fixture: Pick<Fixture, 'presetKey'>) {
  return FIXTURE_PROFILES[fixture.presetKey]?.kind === 'MovingHead'
}

/** 台座が上（バトンに吊る）か。床置きなら台座が下 */
export function isHanging(position: [number, number, number]) {
  return position[1] > 2
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback

/** 保存データから読んだ動きを確かめる。おかしければ動かさない */
export function movementOf(fixture: Pick<Fixture, 'movement' | 'presetKey'>): FixtureMovement | null {
  const raw = fixture.movement
  if (!raw || !isMover(fixture) || !MOVEMENT_LABELS.some(([pattern]) => pattern === raw.pattern)) return null
  return {
    pattern: raw.pattern,
    sizeM: clamp(finite(raw.sizeM, 1.5), ...MOVEMENT_LIMITS.size),
    periodS: clamp(finite(raw.periodS, 6), ...MOVEMENT_LIMITS.period),
  }
}

/**
 * 向き（度）。パンは真上から見て +Z（客席側）を 0 とし、+X（上手）へ回すと正。
 * チルトは、吊った照明なら真下、床置きなら真上を 0 とし、倒すほど大きい（0〜180）
 */
export function panTiltOf(position: [number, number, number], target: [number, number, number]) {
  const dir = new THREE.Vector3(target[0] - position[0], target[1] - position[1], target[2] - position[2])
  const distance = dir.length()
  if (distance < 1e-6) return { pan: 0, tilt: 0, distance: 0 }
  dir.divideScalar(distance)
  const pan = THREE.MathUtils.radToDeg(Math.atan2(dir.x, dir.z))
  const tilt = THREE.MathUtils.radToDeg(Math.acos(clamp(isHanging(position) ? -dir.y : dir.y, -1, 1)))
  return { pan, tilt, distance }
}

/** パン・チルト（度）と距離から、狙いの点を求める */
export function aimFrom(position: [number, number, number], pan: number, tilt: number, distance: number): [number, number, number] {
  const p = THREE.MathUtils.degToRad(pan)
  const t = THREE.MathUtils.degToRad(tilt)
  const up = isHanging(position) ? -1 : 1
  const length = Math.max(.5, distance)
  return [
    position[0] + Math.sin(t) * Math.sin(p) * length,
    position[1] + up * Math.cos(t) * length,
    position[2] + Math.sin(t) * Math.cos(p) * length,
  ]
}

/** 動きの、ある時刻での狙いのずれ（床の上の x, z） */
function movementOffset(movement: FixtureMovement, timeS: number): [number, number] {
  const angle = timeS / movement.periodS * Math.PI * 2
  const r = movement.sizeM
  switch (movement.pattern) {
    case 'circle': return [Math.cos(angle) * r, Math.sin(angle) * r]
    case 'eight': return [Math.sin(angle) * r, Math.sin(angle * 2) * r / 2]
    case 'sweep-x': return [Math.sin(angle) * r, 0]
    case 'sweep-z': return [0, Math.sin(angle) * r]
  }
}

/** 3D の画面で使う、いまの狙いの点。動きが無ければ target のまま */
export function liveTarget(fixture: Fixture, timeS: number): [number, number, number] {
  const movement = movementOf(fixture)
  if (!movement) return fixture.target
  const [dx, dz] = movementOffset(movement, timeS)
  return [fixture.target[0] + dx, fixture.target[1], fixture.target[2] + dz]
}

/** 角度を、a から b へ近い回り方で t だけ進める */
function lerpAngle(a: number, b: number, t: number) {
  const delta = ((b - a + 540) % 360) - 180
  return a + delta * t
}

/**
 * 「通しで見る」のシーンの切り替わりで、ムービングライトの狙いを動かす。
 * 狙いの点をまっすぐ動かすのではなく、本物と同じようにパン・チルトの角度を回して動かす
 */
export function interpolateMoverTarget(from: Fixture, to: Fixture, position: [number, number, number], t: number): [number, number, number] {
  const a = panTiltOf(from.position, from.target)
  const b = panTiltOf(to.position, to.target)
  return aimFrom(position, lerpAngle(a.pan, b.pan, t), a.tilt + (b.tilt - a.tilt) * t, a.distance + (b.distance - a.distance) * t)
}

// ---- ゴボ（光に模様を付ける金属の板）----

export type GoboPattern = 'stars' | 'leaves' | 'window' | 'dots' | 'ring' | 'lines'
export const GOBO_LABELS: Array<[GoboPattern, string]> = [
  ['leaves', '木漏れ日'], ['window', '窓枠'], ['stars', '星'], ['dots', '水玉'], ['ring', '輪'], ['lines', '縞'],
]

/** ゴボを付けられる照明（エリスポとムービング） */
export function canUseGobo(fixture: Pick<Fixture, 'presetKey'>) {
  const kind = FIXTURE_PROFILES[fixture.presetKey]?.kind
  return kind === 'Profile' || kind === 'LED_Profile' || kind === 'MovingHead'
}

export function goboOf(fixture: Pick<Fixture, 'gobo' | 'presetKey'>): GoboPattern | null {
  return fixture.gobo && canUseGobo(fixture) && GOBO_LABELS.some(([pattern]) => pattern === fixture.gobo) ? fixture.gobo : null
}

const goboTextures = new Map<GoboPattern, THREE.Texture>()

/** ゴボの模様を、照明の投影画像（SpotLight.map）にする。白が光の通る所 */
export function goboTexture(pattern: GoboPattern): THREE.Texture | null {
  const cached = goboTextures.get(pattern)
  if (cached) return cached
  if (typeof document === 'undefined') return null
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext('2d')
  if (!g) return null
  const c = size / 2
  g.fillStyle = '#000'
  g.fillRect(0, 0, size, size)
  g.fillStyle = '#fff'
  g.strokeStyle = '#fff'
  // 決まった乱数（毎回同じ模様にする）
  let seed = 7
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  g.save()
  g.beginPath()
  g.arc(c, c, c * .96, 0, Math.PI * 2)
  g.clip()
  if (pattern === 'leaves') {
    g.fillRect(0, 0, size, size)
    g.fillStyle = '#000'
    for (let i = 0; i < 70; i++) {
      g.beginPath()
      g.ellipse(random() * size, random() * size, 8 + random() * 22, 4 + random() * 12, random() * Math.PI, 0, Math.PI * 2)
      g.fill()
    }
  } else if (pattern === 'window') {
    g.fillRect(c * .25, c * .25, c * 1.5, c * 1.5)
    g.fillStyle = '#000'
    g.fillRect(c - 6, 0, 12, size)
    g.fillRect(0, c - 6, size, 12)
  } else if (pattern === 'stars') {
    for (let i = 0; i < 26; i++) {
      const x = random() * size
      const y = random() * size
      const r = 3 + random() * 9
      g.beginPath()
      for (let k = 0; k < 10; k++) {
        const a = k * Math.PI / 5 - Math.PI / 2
        const radius = k % 2 ? r * .45 : r
        g.lineTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius)
      }
      g.fill()
    }
  } else if (pattern === 'dots') {
    for (let y = 16; y < size; y += 32) for (let x = 16 + (y / 32 % 2) * 16; x < size; x += 32) {
      g.beginPath()
      g.arc(x, y, 9, 0, Math.PI * 2)
      g.fill()
    }
  } else if (pattern === 'ring') {
    g.lineWidth = 18
    g.beginPath()
    g.arc(c, c, c * .62, 0, Math.PI * 2)
    g.stroke()
  } else {
    for (let x = 0; x < size; x += 28) g.fillRect(x, 0, 14, size)
  }
  g.restore()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  goboTextures.set(pattern, texture)
  return texture
}
