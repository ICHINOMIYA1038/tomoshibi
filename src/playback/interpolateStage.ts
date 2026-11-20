import { sceneStage, type Fixture, type Performer, type PlanScene } from '../store'
import type { SetPiece } from '../types'
import { interpolateMoverTarget, isMover } from '../lighting/movingHead'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerp3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t),
]
const wingX = (x: number) => (x < 0 ? -1 : 1) * 8.7

export function interpolateStage(from: PlanScene, to: PlanScene, progress: number) {
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
    const oldPosition = old?.position ?? [wingX(person.position[0]), person.position[1], person.position[2]] as [number, number, number]
    const newPosition = next?.position ?? [wingX(person.position[0]), person.position[1], person.position[2]] as [number, number, number]
    const start = old?.onStage === false ? [wingX(oldPosition[0]), oldPosition[1], oldPosition[2]] as [number, number, number] : oldPosition
    const end = next?.onStage === false ? [wingX(newPosition[0]), newPosition[1], newPosition[2]] as [number, number, number] : newPosition
    // 高さの違う所（台の上と床）へは歩いて行けないので、滑らせずに入れ替える
    const jump = changeover || Math.abs(start[1] - end[1]) > 0.05
    if (jump) {
      const show = t < .5 ? old : next
      return show ? [{ ...show, position: t < .5 ? start : end }] : []
    }
    return [{ ...person, position: lerp3(start, end, t), pose: t < .5 ? old?.pose ?? person.pose : next?.pose ?? person.pose,
      onStage: old?.onStage !== false || next?.onStage !== false }]
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
