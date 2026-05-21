import { useMemo, useRef, useEffect } from 'react'
import * as THREE from 'three'
import { TransformControls } from '@react-three/drei'
import { useStore } from '../store'
import { FIXTURE_PROFILES } from '../lighting/fixtureTypes'

function isTouchDevice() {
  if (typeof window === 'undefined') return false
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)
}

// 選択中フィクスチャ → ビーム円錐ガイド + TransformControls (位置/狙い)
// 選択中役者 → TransformControls (床上ドラッグのみ)
//
// TransformControls は drei 経由で OrbitControls を自動無効化する
// (OrbitControls 側に makeDefault を付ければ良い)

export function SelectionGizmo() {
  const selection = useStore(s => s.selection)
  const fixture = useStore(s => s.fixtures.find(f => f.id === selection.id))
  const performer = useStore(s => s.performers.find(p => p.id === selection.id))
  const showGizmos = useStore(s => s.settings.showGizmos)
  const transformMode = useStore(s => s.settings.transformMode)
  const updateFixture = useStore(s => s.updateFixture)
  const updatePerformer = useStore(s => s.updatePerformer)
  const select = useStore(s => s.select)

  // 動的に position を反映するための Object3D
  const dragRef = useRef<THREE.Object3D>(new THREE.Object3D())
  // 選択切替時に dragRef のローカル位置をリセット
  useEffect(() => {
    if (selection.kind === 'fixture' && fixture) {
      const handle = selection.fixtureHandle ?? 'position'
      const src = handle === 'target' ? fixture.target : fixture.position
      dragRef.current.position.set(...src)
    } else if (selection.kind === 'performer' && performer) {
      dragRef.current.position.set(...performer.position)
    }
  }, [
    selection.kind, selection.id, selection.fixtureHandle,
    fixture?.position.join(','), fixture?.target.join(','),
    performer?.position.join(','),
  ])

  if (!showGizmos) return null

  // ---- フィクスチャ選択 ----
  if (selection.kind === 'fixture' && fixture) {
    const profile = FIXTURE_PROFILES[fixture.presetKey]
    const pos = new THREE.Vector3(...fixture.position)
    const tgt = new THREE.Vector3(...fixture.target)
    const dist = pos.distanceTo(tgt)
    const beamRadAtTarget = dist * Math.tan((fixture.beamAngleDeg * Math.PI) / 360)
    const fieldRadAtTarget = dist * Math.tan(((fixture.beamAngleDeg / profile.beamAngleDeg) * profile.fieldAngleDeg * Math.PI) / 360)

    const dir = new THREE.Vector3().subVectors(tgt, pos)
    const dirNorm = dir.lengthSq() > 1e-6 ? dir.clone().normalize() : new THREE.Vector3(0, -1, 0)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirNorm)
    const handle = selection.fixtureHandle ?? 'position'

    return (
      <group>
        {/* 軸線 */}
        <group position={pos.clone().add(tgt).multiplyScalar(0.5).toArray()} quaternion={q.toArray() as any}>
          <mesh renderOrder={1000}>
            <cylinderGeometry args={[0.008, 0.008, dist, 6]} />
            <meshBasicMaterial color="#ffcc44" depthTest={false} transparent opacity={0.7} />
          </mesh>
        </group>
        {/* ビーム円錐 */}
        <group position={pos.toArray()} quaternion={q.toArray() as any}>
          <mesh position={[0, dist / 2, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[beamRadAtTarget, dist, 16, 1, true]} />
            <meshBasicMaterial color="#88ddff" wireframe transparent opacity={0.1} depthWrite={false} />
          </mesh>
          <mesh position={[0, dist / 2, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[fieldRadAtTarget, dist, 16, 1, true]} />
            <meshBasicMaterial color="#3a7090" wireframe transparent opacity={0.05} depthWrite={false} />
          </mesh>
        </group>

        {/* 光源ハンドル / ターゲットハンドル (クリックで切替) */}
        <mesh
          position={pos.toArray()}
          renderOrder={1001}
          onClick={(e) => { e.stopPropagation(); select('fixture', fixture.id, 'position') }}
        >
          <sphereGeometry args={[0.18, 16, 12]} />
          <meshBasicMaterial color={handle === 'position' ? '#6cf' : '#789'} depthTest={false} transparent opacity={0.75} />
        </mesh>
        <mesh
          position={tgt.toArray()}
          renderOrder={1001}
          onClick={(e) => { e.stopPropagation(); select('fixture', fixture.id, 'target') }}
        >
          <sphereGeometry args={[0.18, 16, 12]} />
          <meshBasicMaterial color={handle === 'target' ? '#fc6' : '#987'} depthTest={false} transparent opacity={0.75} />
        </mesh>

        <primitive object={dragRef.current} />
        <TransformControls
          object={dragRef.current}
          mode={handle === 'position' ? transformMode : 'translate'}
          size={isTouchDevice() ? 1.1 : 0.7}
          onObjectChange={() => {
            const o = dragRef.current
            const patch = handle === 'target'
              ? { target: [o.position.x, o.position.y, o.position.z] as [number, number, number] }
              : { position: [o.position.x, o.position.y, o.position.z] as [number, number, number] }
            updateFixture(fixture.id, patch)
          }}
        />
      </group>
    )
  }

  // ---- 役者選択 ----
  if (selection.kind === 'performer' && performer) {
    return (
      <group>
        <primitive object={dragRef.current} />
        <TransformControls
          object={dragRef.current}
          mode="translate"
          showY={false}
          size={isTouchDevice() ? 1.1 : 0.7}
          onObjectChange={() => {
            const o = dragRef.current
            updatePerformer(performer.id, {
              position: [o.position.x, 0, o.position.z],
            })
          }}
        />
      </group>
    )
  }

  return null
}
