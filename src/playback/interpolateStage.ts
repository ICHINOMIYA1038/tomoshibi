import { sceneStage, type Fixture, type Performer, type PlanScene, type VenueLayout } from '../store'
import { portalPoint } from '../stagePortals'
import type { SetPiece } from '../types'
import { interpolateMoverTarget, isMover } from '../lighting/movingHead'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerp3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t),
]
/** これより短い移動は、その場で向きや姿勢を変えるだけとして扱う（m） */
const WALK_MIN = 0.3
/** 歩き出す前と着いたあとに、元の姿勢・次の姿勢でいる時間（切り替えの長さに対する割合） */
const WALK_HOLD = 0.12

export function interpolateStage(from: PlanScene, to: PlanScene, progress: number, layout?: VenueLayout) {
  const t = Math.max(0, Math.min(1, progress))
  if (t === 0) return sceneStage(from)
  if (t === 1) return sceneStage(to)

  // セットが出入りする切り替えは「転換」として扱う。役者が明かりの中を滑って動いたり、まだ無い台の高さへ
  // 浮き上がったりしないように、立ち位置を変える役者はセットと同じ瞬間（t = 0.5）に入れ替える。
  // 明かりも劇場の暗転転換と同じに、前のシーンを消し切ってから次を点ける（2026-11-20）
  const pieceIds = (scene: PlanScene) => new Set(scene.setPieces.map(item => item.id))
  const fromPieces = pieceIds(from), toPieces = pieceIds(to)
  const changeover = fromPieces.size !== toPieces.size || [...fromPieces].some(id => !toPieces.has(id))

  const oldFixtures = new Map(from.fixtures.map(item => [item.id, item]))
  const newFixtures = new Map(to.fixtures.map(item => [item.id, item]))
  const fixtures: Fixture[] = [...new Set([...oldFixtures.keys(), ...newFixtures.keys()])].flatMap(id => {
    const old = oldFixtures.get(id)
    const next = newFixtures.get(id)
    if (changeover) {
      const show = t < .5 ? old : next
      const level = t < .5 ? 1 - t * 2 : t * 2 - 1
      return show ? [{ ...show, intensity: (show.enabled ? show.intensity : 0) * level }] : []
    }
    if (old && next) {
      const position = lerp3(old.position, next.position, t)
      return [{
      ...next,
      position,
      // ムービングライトは、狙いの点をまっすぐ動かさず、パン・チルトの角度を回して動かす
      target: isMover(next) && old.presetKey === next.presetKey ? interpolateMoverTarget(old, next, position, t) : lerp3(old.target, next.target, t),
      color: lerp3(old.color, next.color, t),
      intensity: lerp(old.enabled ? old.intensity : 0, next.enabled ? next.intensity : 0, t),
      beamAngleDeg: lerp(old.beamAngleDeg, next.beamAngleDeg, t),
      enabled: old.enabled || next.enabled,
    }]
    }
    if (old) return [{ ...old, intensity: (old.enabled ? old.intensity : 0) * (1 - t) }]
    return next ? [{ ...next, intensity: (next.enabled ? next.intensity : 0) * t }] : []
  })

  const oldPerformers = new Map(from.performers.map(item => [item.id, item]))
  const newPerformers = new Map(to.performers.map(item => [item.id, item]))
  const performers: Performer[] = [...new Set([...oldPerformers.keys(), ...newPerformers.keys()])].flatMap(id => {
    const old = oldPerformers.get(id)
    const next = newPerformers.get(id)
    if (!old && !next) return []
    const person = next ?? old!
    // 舞台にいない側は、出入り口の点（入りは次のシーンの役者、ハケは前のシーンの役者に書いた出入り口。stagePortals.ts）
    const offstage = (who: Performer, portal: Performer['entryVia']): [number, number, number] => {
      const [x, z] = portalPoint(layout, portal, who.position)
      return [x, who.position[1], z]
    }
    const oldOn = !!old && old.onStage !== false
    const nextOn = !!next && next.onStage !== false
    const start = oldOn ? old!.position : offstage(person, next?.entryVia)
    const end = nextOn ? next!.position : offstage(old ?? person, old?.exitVia)
    // 高さの違う所（台の上と床）へは歩いて行けないので、滑らせずに入れ替える
    const jump = changeover || Math.abs(start[1] - end[1]) > 0.05
    if (jump) {
      const show = t < .5 ? old : next
      return show ? [{ ...show, position: t < .5 ? start : end }] : []
    }
    const onStage = old?.onStage !== false || next?.onStage !== false
    const dx = end[0] - start[0], dz = end[2] - start[2]
    if (Math.hypot(dx, dz) < WALK_MIN) {
      return [{ ...person, position: lerp3(start, end, t), pose: t < .5 ? old?.pose ?? person.pose : next?.pose ?? person.pose, onStage }]
    }
    // 歩いて移る役者は、座る・ひざをつく・寝る姿勢のまま滑らせず、立ち上がってから進む方を向いて歩き、着いてから次の姿勢になる。
    // 舞台の外（袖）にいる側の姿勢は使わない（入ってくる人は立って歩いてくる）（2026-11-20）
    const u = Math.max(0, Math.min(1, (t - WALK_HOLD) / (1 - 2 * WALK_HOLD)))
    const walkFacing = Math.atan2(dx, dz) * 180 / Math.PI
    const atStart = t < WALK_HOLD && oldOn, atEnd = t > 1 - WALK_HOLD && nextOn
    return [{
      ...person,
      position: lerp3(start, end, u),
      pose: atStart ? old!.pose : atEnd ? next!.pose : 'standing',
      facingDeg: atStart ? old!.facingDeg : atEnd ? next!.facingDeg : walkFacing,
      onStage,
    }]
  })

  const oldPieces = new Map(from.setPieces.map(item => [item.id, item]))
  const newPieces = new Map(to.setPieces.map(item => [item.id, item]))
  const setPieces: SetPiece[] = [...new Set([...oldPieces.keys(), ...newPieces.keys()])].flatMap(id => {
    const old = oldPieces.get(id)
    const next = newPieces.get(id)
    if (old && next) return [{
      ...next,
      position: lerp3(old.position, next.position, t),
      rotation: lerp3(old.rotation, next.rotation, t),
      scale: lerp(old.scale, next.scale, t),
    }]
    if (old && t < .5) return [old]
    if (next && t >= .5) return [next]
    return []
  })

  return { fixtures, performers, setPieces }
}
