import { useRef } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { clearChange } from '../changeLog'
import { useStore } from '../store'
import { isGizmoEngaged } from './SelectionGizmo'

// 物そのものを押さえて引っぱると、床と平行に動かす（2026-11-17 オーナー「平行移動の矢印がうまく掴めない」）。
// 「移動」の道具のときだけ。押して少ししか動かさなければ、これまでどおり選ぶだけ（onClick）。
// 矢印（TransformControls）の上を押したときは、矢印に任せる。照明は吊った高さのまま動かし、狙いも同じだけ動かす（向きを保つ）

type Kind = 'performer' | 'setpiece' | 'fixture'
const STEP = 0.05
const snap = (value: number) => Math.round(value / STEP) * STEP
/** 押してから、この距離（画面の px）を超えたら動かし始める */
const THRESHOLD = 5

export function useFloorDrag(kind: Kind, id: string) {
  const controls = useThree(state => state.controls) as { enabled: boolean } | null
  const drag = useRef<{
    plane: THREE.Plane; offset: THREE.Vector3; from: [number, number, number]; target?: [number, number, number]
    pointerId: number; x: number; y: number; moved: boolean
  } | null>(null)

  const itemOf = () => {
    const s = useStore.getState()
    if (kind === 'performer') return s.performers.find(item => item.id === id)
    if (kind === 'setpiece') return s.setPieces.find(item => item.id === id)
    return s.fixtures.find(item => item.id === id)
  }

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    const s = useStore.getState()
    if (event.button !== 0 || s.settings.probeMode || s.settings.transformMode !== 'translate' || isGizmoEngaged()) return
    const item = itemOf()
    if (!item) return
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -item.position[1])
    const hit = new THREE.Vector3()
    if (!event.ray.intersectPlane(plane, hit)) return
    event.stopPropagation()
    drag.current = {
      plane, offset: hit.sub(new THREE.Vector3(...item.position)), from: [...item.position] as [number, number, number],
      target: 'target' in item ? [...item.target] as [number, number, number] : undefined,
      pointerId: event.pointerId, x: event.nativeEvent.clientX, y: event.nativeEvent.clientY, moved: false,
    }
    ;(event.target as unknown as Element).setPointerCapture?.(event.pointerId)
    if (controls) controls.enabled = false
  }

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    event.stopPropagation()
    if (!current.moved) {
      if (Math.hypot(event.nativeEvent.clientX - current.x, event.nativeEvent.clientY - current.y) < THRESHOLD) return
      current.moved = true
      const s = useStore.getState()
      if (s.selection.kind !== kind || s.selection.id !== id) s.select(kind, id, kind === 'fixture' ? 'position' : undefined)
    }
    const hit = new THREE.Vector3()
    if (!event.ray.intersectPlane(current.plane, hit)) return
    const x = snap(hit.x - current.offset.x)
    const z = snap(hit.z - current.offset.z)
    const s = useStore.getState()
    if (kind === 'performer') s.updatePerformer(id, { position: [x, current.from[1], z] })
    else if (kind === 'setpiece') s.updateSetPiece(id, { position: [x, current.from[1], z] })
    else if (current.target) {
      const dx = x - current.from[0], dz = z - current.from[2]
      s.updateFixture(id, { position: [x, current.from[1], z], target: [current.target[0] + dx, current.target[1], current.target[2] + dz] })
      // 吊る位置は全シーン共通。向きを保つための狙いの動きは「このシーンだけの変更」として出さない
      clearChange()
    }
  }

  const end = (event: ThreeEvent<PointerEvent>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    if (current.moved) event.stopPropagation()
    ;(event.target as unknown as Element).releasePointerCapture?.(event.pointerId)
    drag.current = null
    if (controls) controls.enabled = true
  }

  return { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end }
}
