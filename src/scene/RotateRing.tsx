import { useRef } from 'react'
import * as THREE from 'three'
import { useThree, type ThreeEvent } from '@react-three/fiber'

// 選んだ物の足元に出す回転の輪。輪（か、輪の上の丸いつまみ）をなぞると、物が床の上で向きを変える。
// 道具を「回転」に切り替えなくても回せるようにした（2026-11-18 オーナー「スマホで回し方がわからなかった」）。
// 角度は、上から見て反時計回りが正（three の Y 軸まわりと同じ）。5° ずつに丸める

const SNAP = Math.PI / 36
const angleOf = (point: THREE.Vector3, center: [number, number, number]) => Math.atan2(-(point.z - center[2]), point.x - center[0])

export function RotateRing({ center, radius, angle, onRotate, onStart }: {
  /** 輪の中心（床の高さ） */
  center: [number, number, number]
  radius: number
  /** いまの向き（ラジアン） */
  angle: number
  /** 新しい向き（ラジアン、5° 刻み）を受け取る */
  onRotate: (angle: number) => void
  /** なぞり始めたとき（バトンに吊った照明を、このとき決める） */
  onStart?: () => void
}) {
  const controls = useThree(state => state.controls) as { enabled: boolean } | null
  const drag = useRef<{ plane: THREE.Plane; startPointer: number; startAngle: number; pointerId: number } | null>(null)

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -center[1])
    const hit = new THREE.Vector3()
    if (!event.ray.intersectPlane(plane, hit)) return
    event.stopPropagation()
    onStart?.()
    drag.current = { plane, startPointer: angleOf(hit, center), startAngle: angle, pointerId: event.pointerId }
    ;(event.target as unknown as Element).setPointerCapture?.(event.pointerId)
    if (controls) controls.enabled = false
  }
  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    event.stopPropagation()
    const hit = new THREE.Vector3()
    if (!event.ray.intersectPlane(current.plane, hit)) return
    const next = Math.round((current.startAngle + angleOf(hit, center) - current.startPointer) / SNAP) * SNAP
    onRotate(Math.atan2(Math.sin(next), Math.cos(next)))
  }
  const end = (event: ThreeEvent<PointerEvent>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    event.stopPropagation()
    ;(event.target as unknown as Element).releasePointerCapture?.(event.pointerId)
    drag.current = null
    if (controls) controls.enabled = true
  }
  const handlers = { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end, onClick: (event: ThreeEvent<MouseEvent>) => event.stopPropagation() }
  // つまみは、物の正面（ローカルの +Z）の側に置く。向きを変えると一緒に回る
  const knob: [number, number, number] = [center[0] + Math.sin(angle) * radius, center[1], center[2] + Math.cos(angle) * radius]
  const tube = Math.max(0.04, radius * 0.04)
  return (
    <group>
      {/* 見える輪（細い） */}
      <mesh position={center} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1000} raycast={() => null}>
        <torusGeometry args={[radius, tube, 8, 96]} />
        <meshBasicMaterial color="#e0b45c" depthTest={false} transparent opacity={0.85} />
      </mesh>
      {/* 指でつかみやすいよう、太い見えない輪で受ける */}
      <mesh position={center} rotation={[-Math.PI / 2, 0, 0]} userData={{ priorityHandle: true }} {...handlers}>
        <torusGeometry args={[radius, Math.max(0.25, radius * 0.18), 6, 48]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      {/* つまみ */}
      <mesh position={knob} renderOrder={1001} userData={{ priorityHandle: true }} {...handlers}>
        <sphereGeometry args={[Math.max(0.18, radius * 0.14), 16, 12]} />
        <meshBasicMaterial color="#e0b45c" depthTest={false} transparent opacity={0.95} />
      </mesh>
    </group>
  )
}
