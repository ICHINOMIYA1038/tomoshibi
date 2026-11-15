import type { Fixture, Performer, StagePoint, VenueLayout } from './store'
import type { SetPiece } from './types'
import { resolveStageParts, type StagePart } from './stageParts'
import { DEFAULT_VENUE_LAYOUT, pointInStage, stageFootprint } from './venueLayout'

// 物の親子（Unity のヒエラルキーと同じ考え方）。親を動かす・回すと、子も一緒に動く。
// 親になれるのは、舞台の床（STAGE_ID）・舞台の部品（バトンなど）・舞台セット。
// 子になれるのは、照明・役者・舞台セット。舞台の部品はいつも舞台の床の子、客席はどれの子にもならない。
// 位置は親からの相対ではなく、劇場の座標のまま持つ。親が動いたときに、子の座標も同じだけずらす。

export const STAGE_ID = 'stage'

export type ChildKind = 'fixture' | 'performer' | 'setpiece'
type Child = { parentId?: string | null; battenId?: string; position?: [number, number, number] }
export type HierarchyScene = { fixtures: Fixture[]; performers: Performer[]; setPieces: SetPiece[] }

export type HierarchyContext = {
  outline: StagePoint[]
  parts: StagePart[]
  setPieces: SetPiece[]
}

export function hierarchyContext(layout: VenueLayout | undefined, setPieces: SetPiece[]): HierarchyContext {
  const venue = layout ?? DEFAULT_VENUE_LAYOUT
  return { outline: stageFootprint(venue), parts: resolveStageParts(venue), setPieces }
}

/** 親として使える id か（いまの場面に、その部品・セットがあるか） */
function exists(id: string, ctx: HierarchyContext) {
  return id === STAGE_ID || ctx.parts.some(part => part.id === id) || ctx.setPieces.some(piece => piece.id === id)
}

/**
 * 親の id（無ければ null）。親を選んだことのない古いプランは、今までの動きに合わせる。
 * - 役者・舞台セット: 舞台の床の子（舞台を動かすと一緒に動いていた）
 * - 照明: 吊ったバトンがあればその子、舞台の上にあれば舞台の床の子、客席側なら親なし
 * 親が消えていたときも、この決め方に戻す。
 */
export function parentOf(kind: ChildKind, item: Child, ctx: HierarchyContext): string | null {
  if (item.parentId === null) return null
  if (typeof item.parentId === 'string' && exists(item.parentId, ctx)) return item.parentId
  if (kind !== 'fixture') return STAGE_ID
  if (item.battenId && ctx.parts.some(part => part.id === item.battenId && part.kind === 'batten')) return item.battenId
  const position = item.position
  return position && pointInStage(position[0], position[2], ctx.outline) ? STAGE_ID : null
}

/** 親の親。舞台セットはその親、舞台の部品は舞台の床、舞台の床は無し */
function parentOfParent(id: string, ctx: HierarchyContext): string | null {
  if (id === STAGE_ID) return null
  if (ctx.parts.some(part => part.id === id)) return STAGE_ID
  const piece = ctx.setPieces.find(item => item.id === id)
  return piece ? parentOf('setpiece', piece, ctx) : null
}

/** item が ancestorId の子孫か。循環していても止まる */
export function isDescendant(kind: ChildKind, item: Child, ancestorId: string, ctx: HierarchyContext): boolean {
  let current = parentOf(kind, item, ctx)
  for (let depth = 0; current && depth < 64; depth++) {
    if (current === ancestorId) return true
    current = parentOfParent(current, ctx)
  }
  return false
}

/** 親に選べるか。自分自身と自分の子孫は選べない */
export function canBeParent(kind: ChildKind, childId: string, parentId: string, ctx: HierarchyContext): boolean {
  if (parentId === childId) return false
  if (kind !== 'setpiece') return true
  const parent = ctx.setPieces.find(piece => piece.id === parentId)
  return !parent || !isDescendant('setpiece', parent, childId, ctx)
}

export type Motion = { dx: number; dy: number; dz: number; rotation: number; pivot: StagePoint }

/** 平面図での回転（three.js の Y 軸まわりと同じ向き）と移動を、点に当てる */
function movePoint<T extends [number, number, number]>(point: T, motion: Motion): T {
  const [cx, cz] = motion.pivot
  const cos = Math.cos(motion.rotation)
  const sin = Math.sin(motion.rotation)
  const x = point[0] - cx
  const z = point[2] - cz
  return [cx + x * cos + z * sin + motion.dx, point[1] + motion.dy, cz - x * sin + z * cos + motion.dz] as T
}

/**
 * ancestorId の子孫（照明・役者・舞台セット）を、親と同じだけ動かす。
 * 子孫は動かす前の位置で決める（照明の「舞台の上にあるか」が動かした後で変わらないように）。
 */
export function moveDescendants<S extends HierarchyScene>(scene: S, ancestorId: string, motion: Motion, ctx: HierarchyContext): S {
  if (!motion.dx && !motion.dy && !motion.dz && !motion.rotation) return scene
  const local = { ...ctx, setPieces: scene.setPieces }
  const fixtureIds = new Set(scene.fixtures.filter(item => isDescendant('fixture', item, ancestorId, local)).map(item => item.id))
  const performerIds = new Set(scene.performers.filter(item => isDescendant('performer', item, ancestorId, local)).map(item => item.id))
  const pieceIds = new Set(scene.setPieces.filter(item => isDescendant('setpiece', item, ancestorId, local)).map(item => item.id))
  if (!fixtureIds.size && !performerIds.size && !pieceIds.size) return scene
  // 古いプランで「位置から決まっていた親」は、動かす前に書き込んでおく（動かした後で親が変わらないように）
  return {
    ...scene,
    fixtures: scene.fixtures.map(item => fixtureIds.has(item.id) ? {
      ...item,
      parentId: parentOf('fixture', item, local),
      position: movePoint(item.position, motion),
      // 向きを保つ（狙う先も一緒に動かす）
      target: movePoint(item.target, motion),
    } : item),
    performers: scene.performers.map(item => performerIds.has(item.id) ? { ...item, position: movePoint(item.position, motion) } : item),
    setPieces: scene.setPieces.map(item => pieceIds.has(item.id) ? {
      ...item,
      position: movePoint(item.position, motion),
      rotation: [item.rotation[0], item.rotation[1] + motion.rotation, item.rotation[2]] as SetPiece['rotation'],
    } : item),
  }
}
