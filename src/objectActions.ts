import { useStore, type StagePoint } from './store'
import { DEFAULT_VENUE_LAYOUT } from './venueLayout'
import * as THREE from 'three'
import { clampPart, newPart, partCorners, resolveStageParts, type StagePart, type StagePartKind } from './stageParts'
import { clampAudiencePosition } from './audienceLayout'
import { THEATRE } from './venueLayout'
import { FIXTURE_PROFILES } from './lighting/fixtureTypes'

// 選んでいる物の複製・削除。種類によらず同じ操作にする（Unity の ⌘D・Delete）

export function duplicateSelection() {
  const s = useStore.getState()
  const { kind, id } = s.selection
  if (!id) return
  if (kind === 'fixture') s.duplicateFixture(id)
  else if (kind === 'performer') s.duplicatePerformer(id)
  else if (kind === 'setpiece') s.duplicateSetPiece(id)
  else if (kind === 'stagepart') {
    const copy = s.duplicateStagePart(id)
    if (copy) s.select('stagepart', copy)
  } else if (kind === 'audience') {
    const source = (s.productionPlan.audienceBlocks ?? []).find(block => block.id === id)
    const copy = source && s.addAudienceBlock()
    if (source && copy) {
      const { id: _id, name, position, ...rest } = source
      s.updateAudienceBlock(copy, { ...rest, name: `${name} (複製)`, position: [position[0] + 1, position[1] + 1] })
      s.select('audience', copy)
    }
  }
}

export function canDelete(kind: string | null) {
  return kind === 'fixture' || kind === 'performer' || kind === 'setpiece' || kind === 'stagepart' || kind === 'audience'
}

/** 子は消さず、親に付け替える。元に戻すは ⌘Z */
export function deleteSelection() {
  const s = useStore.getState()
  const { kind, id } = s.selection
  if (!id) return
  if (kind === 'fixture') s.removeFixture(id)
  else if (kind === 'performer') s.removePerformer(id)
  else if (kind === 'setpiece') s.removeSetPiece(id)
  else if (kind === 'stagepart') {
    const parts = resolveStageParts(s.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT)
    s.updateStageParts(parts.filter(part => part.id !== id))
    s.select(null, null)
  } else if (kind === 'audience') {
    s.removeAudienceBlock(id)
    s.select(null, null)
  }
}

// ---- 足す（ヒエラルキーの「＋ 追加」）----

export const SET_PIECE_TYPES = [
  { id: 'box', label: '箱馬' }, { id: 'platform', label: '平台' }, { id: 'riser', label: '高台' },
  { id: 'bench', label: 'ベンチ' }, { id: 'door', label: '扉' }, { id: 'suitcase', label: '鞄' },
  { id: 'table', label: '机' }, { id: 'bookshelf', label: '書架' }, { id: 'window', label: '窓' },
] as const
export type SetPieceType = typeof SET_PIECE_TYPES[number]['id']

const APPEARANCES: Record<string, { name: string; size: [number, number, number]; color: string }> = {
  bench: { name: 'ベンチ', size: [2.8, 0.9, 0.85], color: '#765c48' },
  door: { name: '扉', size: [1.45, 2.2, 0.22], color: '#555767' },
  suitcase: { name: '鞄', size: [0.72, 0.48, 0.4], color: '#a86d48' },
  table: { name: '机', size: [2.2, 0.8, 1.1], color: '#75523c' },
  bookshelf: { name: '書架', size: [2.3, 2.7, 0.5], color: '#4c3a35' },
  window: { name: '窓', size: [2.5, 2.8, 0.16], color: '#5c6774' },
}

/** at は床の上の位置（世界の x, z）。無ければ舞台の中央付近に、重ならないようずらして置く */
export function addSetPiece(type: SetPieceType, at?: StagePoint) {
  const s = useStore.getState()
  const id = s.addPrimitiveSetPiece(type === 'platform' || type === 'riser' ? type : 'box')
  const preset = type === 'box' || type === 'platform' || type === 'riser' ? null : { ...APPEARANCES[type], appearance: type }
  const piece = useStore.getState().setPieces.find(item => item.id === id)
  if (!id || !piece) return id
  const height = preset ? preset.size[1] : piece.position[1] * 2
  const [x, z] = at ?? [piece.position[0], piece.position[2]]
  if (preset || at) useStore.getState().updateSetPiece(id, { ...preset, position: [x, height / 2, z] })
  return id
}

export function addStagePart(kind: StagePartKind, at?: StagePoint) {
  const s = useStore.getState()
  const layout = s.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT
  const parts = resolveStageParts(layout)
  if (parts.length >= 80) return null
  const id = `part-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const offset = layout.stageOffset ?? [0, 0]
  const fresh = newPart(kind, layout, id)
  const placed = at ? { ...fresh, x: at[0] - offset[0], z: at[1] - offset[1] } : fresh
  s.updateStageParts([...parts, clampPart(placed, offset)])
  s.select('stagepart', id)
  return id
}

// ---- 追加の一覧から足す（押すと既定の位置、3D の画面へドラッグすると落とした所）----

export type AddItem =
  | { kind: 'fixture'; preset: string }
  | { kind: 'performer' }
  | { kind: 'setpiece'; type: SetPieceType }
  | { kind: 'stagepart'; part: StagePartKind }
  | { kind: 'audience' }

/** ドラッグで運ぶデータの種類。ヒエラルキーの行の並べ替え（application/x-tomoshibi-object）とは別にする */
export const ADD_DRAG_TYPE = 'application/x-tomoshibi-add'

export function parseAddItem(raw: string): AddItem | null {
  try {
    const item = JSON.parse(raw) as AddItem
    return item && typeof item === 'object' && typeof item.kind === 'string' ? item : null
  } catch { return null }
}

/** 照明を落としたとき、視線がバトンからこの距離（m）より近ければ、そのバトンに吊る */
const HANG_DISTANCE = 0.8

/** 視線にいちばん近いバトンと、バトンの上の位置（世界の座標） */
function battenOnRay(ray: THREE.Ray, parts: StagePart[], offset: StagePoint) {
  const onRay = new THREE.Vector3()
  const onBatten = new THREE.Vector3()
  let best: { batten: StagePart; at: THREE.Vector3; distance: number } | null = null
  for (const batten of parts) {
    if (batten.kind !== 'batten') continue
    const [[ax, az], [bx, bz]] = partCorners(batten)
    const a = new THREE.Vector3(ax + offset[0], batten.elevation, az + offset[1])
    const b = new THREE.Vector3(bx + offset[0], batten.elevation, bz + offset[1])
    const distance = Math.sqrt(ray.distanceSqToSegment(a, b, onRay, onBatten))
    if (distance <= HANG_DISTANCE && (!best || distance < best.distance)) best = { batten, at: onBatten.clone(), distance }
  }
  return best
}

/** at は床の上の位置（世界の x, z）。ray は 3D の画面で落とした所を通る視線（照明をバトンに吊るのに使う） */
export function addItem(item: AddItem, at?: StagePoint, ray?: THREE.Ray) {
  const s = useStore.getState()
  const point: StagePoint | undefined = at && [
    Math.min(THEATRE.maxX, Math.max(THEATRE.minX, at[0])),
    Math.min(THEATRE.maxZ, Math.max(THEATRE.minZ, at[1])),
  ]
  if (item.kind === 'fixture') {
    const layout = s.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT
    const hung = ray ? battenOnRay(ray, resolveStageParts(layout), layout.stageOffset ?? [0, 0]) : null
    // ピンスポットは、押したときは客席のいちばん後ろの上に置き、舞台の中央を狙う
    if (!hung && !point && FIXTURE_PROFILES[item.preset]?.kind === 'FollowSpot') {
      const seats = s.productionPlan.audienceBlocks ?? []
      const rear = seats.length ? Math.max(...seats.map(block => block.position[1] + block.rows * block.rowSpacing)) : 14
      const z = Math.min(THEATRE.maxZ, rear + 2)
      const id = s.addFixture(item.preset, [0, 6, z])
      if (id) useStore.getState().updateFixture(id, { target: [0, 1.1, -3] })
      return id
    }
    if (!hung && !point) return s.addFixture(item.preset)
    // バトンに重ねて落としたらバトンに吊り、そうでなければ落とした床の真上 6.5m に置く。どちらも少し客席側の床を向ける
    const [x, z] = hung ? [hung.at.x, hung.at.z] : point!
    const id = s.addFixture(item.preset, [x, hung ? Math.max(1, hung.batten.elevation - .35) : 6.5, z])
    if (!id) return id
    useStore.getState().updateFixture(id, { target: [x, 1.5, z + 2] })
    if (hung) useStore.getState().setParent('fixture', id, hung.batten.id)
    return id
  }
  if (item.kind === 'performer') return s.addPerformer(point && [point[0], 0, point[1]])
  if (item.kind === 'setpiece') return addSetPiece(item.type, point)
  if (item.kind === 'stagepart') return addStagePart(item.part, point)
  const id = s.addAudienceBlock()
  if (!id) return id
  const block = (useStore.getState().productionPlan.audienceBlocks ?? []).find(entry => entry.id === id)
  if (block && point) useStore.getState().updateAudienceBlock(id, { position: clampAudiencePosition(block, point[0], point[1]) })
  useStore.getState().select('audience', id)
  return id
}
