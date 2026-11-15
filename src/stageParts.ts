import type { StagePoint, VenueLayout } from './store'
import { DEFAULT_VENUE_LAYOUT, stageLocalFootprint, THEATRE } from './venueLayout'

// 舞台の部品（床・壁・ホリゾント・バトン・袖幕・平台）。種類は決めておき、置き方と大きさは自由に変えられる。
// 座標は舞台の中心線を x=0 とする舞台の座標（stageOffset を足す前）。高さは床からの m。
export type StagePartKind = 'floor' | 'wall' | 'cyc' | 'batten' | 'wing' | 'platform'
export type StagePart = {
  id: string
  kind: StagePartKind
  /** ひな形から作った部品の印。触っていない間は、舞台の大きさに合わせて置き直す */
  auto?: string
  /** 利用者が動かした・大きさを変えた。auto の部品はこれが true のあいだ、置き直さない */
  edited?: boolean
  x: number
  z: number
  /** 長さ（壁・ホリゾント・袖幕・バトン）または幅（床・平台） */
  width: number
  /** 奥行（床・平台）。壁などは使わない */
  depth: number
  /** 高さ（壁・ホリゾント・袖幕・平台）。床・バトンは使わない */
  height: number
  /** 下端の高さ（壁・ホリゾント・袖幕）、吊る高さ（バトン） */
  elevation: number
  rotationDeg: number
}
export type StageTemplate = 'standard' | 'proscenium' | 'blackbox' | 'bare'
export type FloorFinish = 'black' | 'wood' | 'lino-black' | 'lino-gray' | 'lino-white'

export const PART_LABELS: Record<StagePartKind, string> = {
  floor: '床', wall: '壁', cyc: 'ホリゾント', batten: 'バトン', wing: '袖幕', platform: '平台',
}
export const TEMPLATE_LABELS: Array<{ id: StageTemplate; label: string; detail: string }> = [
  { id: 'proscenium', label: '額縁の中劇場', detail: '壁・ホリゾント・袖幕 3 対・バトン 5 本' },
  { id: 'blackbox', label: 'ブラックボックスの小劇場', detail: '黒い壁で囲み、低い格子状のバトン' },
  { id: 'bare', label: '素舞台', detail: '壁も幕も無く、バトンだけ' },
  { id: 'standard', label: '最初の配置', detail: '壁 3 面・ホリゾント・バトン 4 本' },
]
export const FLOOR_FINISHES: Array<{ id: FloorFinish; label: string; color: [number, number, number]; roughness: number }> = [
  // 色は three.js の作業色空間（線形）の値。黒塗りは以前の床と同じ値
  { id: 'black', label: '黒塗り', color: [0.045, 0.04, 0.038], roughness: 0.55 },
  { id: 'wood', label: '木地', color: [0.36, 0.22, 0.12], roughness: 0.62 },
  { id: 'lino-black', label: '黒のリノリウム', color: [0.02, 0.02, 0.022], roughness: 0.32 },
  { id: 'lino-gray', label: '灰色のリノリウム', color: [0.16, 0.16, 0.165], roughness: 0.38 },
  { id: 'lino-white', label: '白のリノリウム', color: [0.7, 0.69, 0.66], roughness: 0.4 },
]

/** 劇場の範囲（世界の座標）。客席の配置と同じ範囲 */
export { THEATRE } from './venueLayout'
export const SNAP = 0.5
export const FINE_SNAP = 0.1

const LIMITS: Record<StagePartKind, { minWidth: number; minDepth: number; height: [number, number]; elevation: [number, number] }> = {
  floor: { minWidth: 0.5, minDepth: 0.5, height: [0, 0], elevation: [0, 0] },
  platform: { minWidth: 0.5, minDepth: 0.5, height: [0.1, 4], elevation: [0, 0] },
  wall: { minWidth: 0.5, minDepth: 0, height: [1, 20], elevation: [0, 10] },
  cyc: { minWidth: 1, minDepth: 0, height: [1, 20], elevation: [0, 10] },
  wing: { minWidth: 0.5, minDepth: 0, height: [1, 15], elevation: [0, 10] },
  batten: { minWidth: 1, minDepth: 0, height: [0, 0], elevation: [1, 20] },
}

export const isFlat = (kind: StagePartKind) => kind === 'floor' || kind === 'platform'
const round = (value: number, step = 0.01) => Math.round(value / step) * step
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
export const snapValue = (value: number, fine = false) => round(value, fine ? FINE_SNAP : SNAP)

type Bounds = { left: number; right: number; rear: number; front: number; width: number; depth: number; centerZ: number }
function stageBounds(layout: VenueLayout): Bounds {
  const outline = stageLocalFootprint(layout)
  const left = Math.min(...outline.map(point => point[0]))
  const right = Math.max(...outline.map(point => point[0]))
  const rear = Math.min(...outline.map(point => point[1]))
  const front = Math.max(...outline.map(point => point[1]))
  return { left, right, rear, front, width: right - left, depth: front - rear, centerZ: (rear + front) / 2 }
}

function part(auto: string, kind: StagePartKind, fields: Partial<StagePart>): StagePart {
  return { id: auto, auto, kind, x: 0, z: 0, width: 1, depth: 0, height: 0, elevation: 0, rotationDeg: 0, ...fields }
}

/** ひな形から、舞台の大きさに合った部品の並びを作る */
export function templateParts(template: StageTemplate, layout: VenueLayout): StagePart[] {
  const b = stageBounds(layout)
  const cx = (b.left + b.right) / 2
  if (template === 'standard') {
    // 以前は Stage.tsx に固定で書いていた配置。額縁舞台のときだけ出していた
    const rear = -3 - layout.stageDepth / 2
    const front = -3 + layout.stageDepth / 2
    return [
      part('wall-back', 'wall', { x: 0, z: rear + 1, width: layout.stageWidth, height: 8 }),
      part('wall-left', 'wall', { x: -layout.stageWidth / 2, z: -3, width: layout.stageDepth - 2, height: 8, rotationDeg: 90 }),
      part('wall-right', 'wall', { x: layout.stageWidth / 2, z: -3, width: layout.stageDepth - 2, height: 8, rotationDeg: -90 }),
      part('cyc', 'cyc', { x: 0, z: rear + 1.4, width: Math.max(4, layout.stageWidth - 2), height: 6.5, elevation: 0.25 }),
      ...[front - 1.5, -3 + layout.stageDepth / 6, -3 - layout.stageDepth / 6, rear + 3].map((z, index) =>
        part(`batten-${index + 1}`, 'batten', { x: 0, z, width: Math.max(4, layout.stageWidth - 3), elevation: 7 })),
    ]
  }
  if (template === 'proscenium') {
    const wingX = b.width / 2 - 1
    const battens = Array.from({ length: 5 }, (_, index) => b.front - 1.2 - index * (b.depth - 3) / 4)
    return [
      part('wall-back', 'wall', { x: cx, z: b.rear + 0.5, width: b.width + 2, height: 9 }),
      part('wall-left', 'wall', { x: b.left - 1, z: b.centerZ - 0.25, width: b.depth - 1.5, height: 9, rotationDeg: 90 }),
      part('wall-right', 'wall', { x: b.right + 1, z: b.centerZ - 0.25, width: b.depth - 1.5, height: 9, rotationDeg: -90 }),
      part('cyc', 'cyc', { x: cx, z: b.rear + 1, width: Math.max(4, b.width - 2), height: 7, elevation: 0.25 }),
      ...[0, 1, 2].flatMap(index => {
        const z = b.front - 2 - index * (b.depth - 4) / 3
        return [
          part(`wing-left-${index + 1}`, 'wing', { x: cx - wingX, z, width: 2, height: 7.5 }),
          part(`wing-right-${index + 1}`, 'wing', { x: cx + wingX, z, width: 2, height: 7.5 }),
        ]
      }),
      ...battens.map((z, index) => part(`batten-${index + 1}`, 'batten', { x: cx, z, width: Math.max(4, b.width - 2), elevation: 8 })),
    ]
  }
  if (template === 'blackbox') {
    const margin = 1.5
    const width = b.width + margin * 2
    const depth = b.depth + margin * 2
    const rows = Math.max(3, Math.round(depth / 2))
    return [
      part('wall-back', 'wall', { x: cx, z: b.rear - margin, width, height: 6 }),
      part('wall-left', 'wall', { x: b.left - margin, z: b.centerZ, width: depth, height: 6, rotationDeg: 90 }),
      part('wall-right', 'wall', { x: b.right + margin, z: b.centerZ, width: depth, height: 6, rotationDeg: -90 }),
      ...Array.from({ length: rows }, (_, index) => part(`batten-${index + 1}`, 'batten', {
        x: cx, z: b.rear - margin + 1 + index * (depth - 2) / Math.max(1, rows - 1), width: width - 1, elevation: 5,
      })),
    ]
  }
  const rows = Math.max(3, Math.round(b.depth / 3))
  return Array.from({ length: rows }, (_, index) => part(`batten-${index + 1}`, 'batten', {
    x: cx, z: b.front - 1 - index * (b.depth - 2) / Math.max(1, rows - 1), width: Math.max(4, b.width - 1), elevation: 7,
  }))
}

export function stageTemplateOf(layout: VenueLayout): StageTemplate | null {
  if (layout.stageTemplate) return layout.stageTemplate
  return layout.stageShape === 'proscenium' ? 'standard' : null
}

/** 表示と編集に使う部品の並び。保存していなければひな形から作る。触っていない部品は舞台の大きさに合わせる */
export function resolveStageParts(layout: VenueLayout = DEFAULT_VENUE_LAYOUT): StagePart[] {
  const template = stageTemplateOf(layout)
  const generated = template ? templateParts(template, layout) : []
  if (!layout.stageParts) return generated
  return layout.stageParts.flatMap(item => {
    if (!item.auto || item.edited) return [item]
    const fresh = generated.find(candidate => candidate.auto === item.auto)
    return fresh ? [{ ...fresh, id: item.id }] : []
  })
}

/** 部品の四隅（世界の座標ではなく舞台の座標）。壁など厚みの無いものは両端の 2 点 */
export function partCorners(item: Pick<StagePart, 'kind' | 'x' | 'z' | 'width' | 'depth' | 'rotationDeg'>): StagePoint[] {
  const angle = item.rotationDeg * Math.PI / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const hw = item.width / 2
  const hd = isFlat(item.kind) ? item.depth / 2 : 0
  const local: StagePoint[] = hd ? [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] : [[-hw, 0], [hw, 0]]
  // three.js で Y 軸まわりに rotationDeg 回したときの、平面図（x, z）での位置
  return local.map(([lx, lz]) => [item.x + lx * cos + lz * sin, item.z - lx * sin + lz * cos])
}

/** 大きさ・高さを決まった範囲に収め、劇場の外に出ないよう位置を押し戻す */
export function clampPart(item: StagePart, offset: StagePoint = [0, 0]): StagePart {
  const limit = LIMITS[item.kind]
  const next: StagePart = {
    ...item,
    width: clamp(item.width, limit.minWidth, THEATRE.maxX - THEATRE.minX),
    depth: isFlat(item.kind) ? clamp(item.depth, limit.minDepth, THEATRE.maxZ - THEATRE.minZ) : 0,
    height: clamp(item.height, limit.height[0], limit.height[1]),
    elevation: clamp(item.elevation, limit.elevation[0], limit.elevation[1]),
    rotationDeg: ((Math.round(item.rotationDeg) % 360) + 540) % 360 - 180,
  }
  if (next.kind !== 'batten' && next.kind !== 'floor' && next.kind !== 'platform')
    next.elevation = Math.min(next.elevation, THEATRE.maxHeight - next.height)
  for (let pass = 0; pass < 2; pass++) {
    const corners = partCorners(next).map(([x, z]) => [x + offset[0], z + offset[1]])
    const minX = Math.min(...corners.map(point => point[0]))
    const maxX = Math.max(...corners.map(point => point[0]))
    const minZ = Math.min(...corners.map(point => point[1]))
    const maxZ = Math.max(...corners.map(point => point[1]))
    if (maxX - minX > THEATRE.maxX - THEATRE.minX || maxZ - minZ > THEATRE.maxZ - THEATRE.minZ) {
      next.width = Math.min(next.width, (THEATRE.maxX - THEATRE.minX) * .95)
      if (isFlat(next.kind)) next.depth = Math.min(next.depth, (THEATRE.maxZ - THEATRE.minZ) * .95)
      continue
    }
    if (minX < THEATRE.minX) next.x += THEATRE.minX - minX
    if (maxX > THEATRE.maxX) next.x -= maxX - THEATRE.maxX
    if (minZ < THEATRE.minZ) next.z += THEATRE.minZ - minZ
    if (maxZ > THEATRE.maxZ) next.z -= maxZ - THEATRE.maxZ
  }
  next.x = round(next.x)
  next.z = round(next.z)
  next.width = round(next.width)
  next.depth = round(next.depth)
  next.height = round(next.height)
  next.elevation = round(next.elevation)
  return next
}

/** 「＋」で足す部品の初期値。舞台の中央付近に、それらしい大きさで置く */
export function newPart(kind: StagePartKind, layout: VenueLayout, id: string): StagePart {
  const b = stageBounds(layout)
  const cx = (b.left + b.right) / 2
  const base = { id, kind, x: cx, z: b.centerZ, width: 4, depth: 0, height: 0, elevation: 0, rotationDeg: 0 }
  if (kind === 'floor') return { ...base, width: Math.min(4, b.width), depth: 3 }
  if (kind === 'platform') return { ...base, width: 3, depth: 2, height: 0.6 }
  if (kind === 'wall') return { ...base, z: b.rear + 0.5, width: Math.min(8, b.width), height: 6 }
  if (kind === 'cyc') return { ...base, z: b.rear + 1, width: Math.max(4, b.width - 2), height: 6.5, elevation: 0.25 }
  if (kind === 'wing') return { ...base, x: cx - b.width / 2 + 1, z: b.centerZ, width: 2, height: 7 }
  return { ...base, width: Math.max(4, b.width - 2), elevation: 7 }
}

export const DEFAULT_WALL_COLOR: [number, number, number] = [0.035, 0.033, 0.035]
export const DEFAULT_CYC_COLOR: [number, number, number] = [0.9, 0.9, 0.92]
export const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** 保存データから読んだ部品を確かめる。おかしな値は捨てるか範囲に収める */
export function sanitizeStageParts(raw: unknown): StagePart[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const kinds: StagePartKind[] = ['floor', 'wall', 'cyc', 'batten', 'wing', 'platform']
  const num = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback
  const seen = new Set<string>()
  return raw.slice(0, 80).flatMap(value => {
    if (!value || typeof value !== 'object') return []
    const item = value as Record<string, unknown>
    if (typeof item.id !== 'string' || !item.id || seen.has(item.id) || !kinds.includes(item.kind as StagePartKind)) return []
    seen.add(item.id)
    return [clampPart({
      id: item.id.slice(0, 80), kind: item.kind as StagePartKind,
      auto: typeof item.auto === 'string' ? item.auto.slice(0, 40) : undefined,
      edited: item.edited === true ? true : undefined,
      x: clamp(num(item.x, 0), -60, 60), z: clamp(num(item.z, 0), -60, 60),
      width: num(item.width, 2), depth: num(item.depth, 1), height: num(item.height, 1),
      elevation: num(item.elevation, 0), rotationDeg: num(item.rotationDeg, 0),
    })]
  })
}

/**
 * 照明がこのバトンに吊ってあるか。照明の battenId がこのバトンの id のときだけ吊ってあるとみなす。
 * 位置からの推測はしない（ドラッグ中に通りがかった照明や、たまたま近い照明まで動いてしまうため）。
 * 吊る照明は、会場の配置でバトンを選んだときの「吊っている照明」で決める。
 */
export function isHungOn(fixture: { battenId?: string }, batten: StagePart) {
  return batten.kind === 'batten' && !!fixture.battenId && fixture.battenId === batten.id
}

/** バトンの線から照明までの、平面図での距離（m）。「吊っている照明」の並び順に使う */
export function distanceToBatten(position: [number, number, number], batten: StagePart, offset: StagePoint = [0, 0]) {
  const angle = batten.rotationDeg * Math.PI / 180
  const dx = position[0] - (batten.x + offset[0])
  const dz = position[2] - (batten.z + offset[1])
  const along = dx * Math.cos(angle) - dz * Math.sin(angle)
  const across = dx * Math.sin(angle) + dz * Math.cos(angle)
  return Math.hypot(Math.max(0, Math.abs(along) - batten.width / 2), across)
}
