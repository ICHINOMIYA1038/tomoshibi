import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { onFocusRequest } from './focusBus'

// ダブルタップ（PC はダブルクリック）した所を、画面の真ん中に持ってくる（2026-11-18 オーナー指示）。
// 押した所に物があればその点、無ければ床の高さの点に、視点の中心（OrbitControls の target）を動かす。
// 見る向きはそのままで、物の大きさに合わせてちょうどよい距離まで寄る（物が無ければ距離はそのまま。2026-11-18）。
// 一覧で選んだときも、focusBus から同じ動きを呼ぶ。0.45 秒かけて滑らかに動かす

const TAP_MS = 320
const TAP_PX = 28
const MOVE_MS = 450
/** 物の半径に掛けて、寄ったときのカメラまでの距離にする */
const FIT = 3.2

export function DoubleTapFocus() {
  const { gl, camera, scene, controls } = useThree()
  const anim = useRef<{ from: THREE.Vector3; to: THREE.Vector3; camFrom: THREE.Vector3; camTo: THREE.Vector3; start: number } | null>(null)
  /** center を真ん中に、radius の物が画面に収まる距離へ。radius が無ければ距離は変えない */
  const startFocus = (center: THREE.Vector3, radius: number | null) => {
    const orbit = controls as unknown as { target: THREE.Vector3 } | null
    if (!orbit) return
    const offset = camera.position.clone().sub(orbit.target)
    // 物の大きさがわからない（床・座席・壁を押した）ときは、遠ければ 9m まで寄る
    const distance = radius === null ? Math.min(offset.length(), 9) : THREE.MathUtils.clamp(radius * FIT, 2.2, 22)
    const camTo = center.clone().add(offset.normalize().multiplyScalar(distance))
    anim.current = { from: orbit.target.clone(), to: center.clone(), camFrom: camera.position.clone(), camTo, start: performance.now() }
  }
  useEffect(() => onFocusRequest(request => startFocus(new THREE.Vector3(...request.center), request.radius)))

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
      if (hit) {
        // 押した部品から親へたどり、5m より小さいいちばん大きなまとまり（器具・役者・セット 1 つ分）に寄る。
        // 床や壁のような大きな物なら、押した点を真ん中にするだけで距離は変えない
        let root: THREE.Object3D | null = null
        let rootBox: THREE.Box3 | null = null
        for (let node: THREE.Object3D | null = hit.object; node && node.parent; node = node.parent) {
          if ((node as THREE.InstancedMesh).isInstancedMesh) break
          const box = new THREE.Box3().setFromObject(node)
          if (box.isEmpty() || box.getSize(new THREE.Vector3()).length() > 5) break
          root = node; rootBox = box
        }
        if (root && rootBox) {
          const sphere = rootBox.getBoundingSphere(new THREE.Sphere())
          startFocus(sphere.center, Math.max(.4, sphere.radius))
        } else startFocus(hit.point.clone(), null)
        return
      }
      const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      const point = raycaster.ray.intersectPlane(floor, new THREE.Vector3())
      if (point) startFocus(point, null)
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
    orbit.target.copy(a.from).lerp(a.to, k)
    camera.position.copy(a.camFrom).lerp(a.camTo, k)
    orbit.update()
    invalidate()
    if (t >= 1) anim.current = null
  })
  return null
}
