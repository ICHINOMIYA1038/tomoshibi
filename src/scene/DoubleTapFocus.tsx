import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// ダブルタップ（PC はダブルクリック）した所を、画面の真ん中に持ってくる（2026-11-18 オーナー指示）。
// 押した所に物があればその点、無ければ床の高さの点に、視点の中心（OrbitControls の target）を動かす。
// カメラも同じだけ平行に動かすので、向きと距離は変わらない。0.35 秒かけて滑らかに動かす

const TAP_MS = 320
const TAP_PX = 28
const MOVE_MS = 350

export function DoubleTapFocus() {
  const { gl, camera, scene, controls } = useThree()
  const anim = useRef<{ from: THREE.Vector3; to: THREE.Vector3; camFrom: THREE.Vector3; start: number } | null>(null)

  useEffect(() => {
    const el = gl.domElement
    let last: { t: number; x: number; y: number } | null = null
    let down: { x: number; y: number; t: number; id: number } | null = null
    let touches = 0
    const raycaster = new THREE.Raycaster()
    const focus = (clientX: number, clientY: number) => {
      const orbit = controls as unknown as { target: THREE.Vector3 } | null
      if (!orbit) return
      const rect = el.getBoundingClientRect()
      const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const hit = raycaster.intersectObjects(scene.children, true)
        .find(item => (item.object as THREE.Mesh).isMesh && item.object.visible !== false && !(item.object as THREE.Mesh & { material: THREE.Material }).material?.transparent)
      let point = hit?.point
      if (!point) {
        const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
        const p = new THREE.Vector3()
        point = raycaster.ray.intersectPlane(floor, p) ?? undefined
      }
      if (!point) return
      anim.current = { from: orbit.target.clone(), to: point.clone(), camFrom: camera.position.clone(), start: performance.now() }
    }
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') touches++
      down = { x: event.clientX, y: event.clientY, t: performance.now(), id: event.pointerId }
    }
    const onUp = (event: PointerEvent) => {
      if (event.pointerType === 'touch') touches = Math.max(0, touches - 1)
      if (event.pointerType === 'mouse') return // マウスは dblclick で受ける
      const start = down
      down = null
      // 2 本指の操作や、なぞった後は、タップに数えない
      if (!start || start.id !== event.pointerId || touches > 0 || performance.now() - start.t > 250 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) { last = null; return }
      const now = performance.now()
      if (last && now - last.t < TAP_MS && Math.hypot(event.clientX - last.x, event.clientY - last.y) < TAP_PX) {
        last = null
        focus(event.clientX, event.clientY)
        return
      }
      last = { t: now, x: event.clientX, y: event.clientY }
    }
    const onDouble = (event: MouseEvent) => focus(event.clientX, event.clientY)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('dblclick', onDouble)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('dblclick', onDouble)
    }
  }, [gl, camera, scene, controls])

  useFrame(({ invalidate }) => {
    const a = anim.current
    const orbit = controls as unknown as { target: THREE.Vector3; update: () => void } | null
    if (!a || !orbit) return
    const t = Math.min(1, (performance.now() - a.start) / MOVE_MS)
    const k = 1 - Math.pow(1 - t, 3)
    const target = a.from.clone().lerp(a.to, k)
    const shift = target.clone().sub(a.from)
    orbit.target.copy(target)
    camera.position.copy(a.camFrom).add(shift)
    orbit.update()
    invalidate()
    if (t >= 1) anim.current = null
  })
  return null
}
