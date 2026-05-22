import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { TransformControls } from '@react-three/drei'
import { useStore } from '../store'

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
  const setPiece = useStore(s => s.setPieces.find(sp => sp.id === selection.id))
  const updateSetPiece = useStore(s => s.updateSetPiece)
  const showGizmos = useStore(s => s.settings.showGizmos)
  const transformMode = useStore(s => s.settings.transformMode)
  const updateFixture = useStore(s => s.updateFixture)
  const updatePerformer = useStore(s => s.updatePerformer)
  const select = useStore(s => s.select)

  // 動的に position を反映するための Object3D
  const dragRef = useRef<THREE.Object3D>(new THREE.Object3D())
  // TransformControls 本体 ref (plane-drag を隠すため)
  const tcRef = useRef<any>(null)
  // gizmo の updateMatrixWorld を差し替えて plane (XY/YZ/XZ) を強制非表示
  useEffect(() => {
    let raf = 0
    const tryPatch = () => {
      const tc = tcRef.current
      const gizmo = tc?._gizmo || tc?.children?.find((c: any) => c.gizmo && c.picker)
      if (!gizmo) { raf = requestAnimationFrame(tryPatch); return }
      if (gizmo.__planesPatched) return
      const orig = gizmo.updateMatrixWorld.bind(gizmo)
      gizmo.updateMatrixWorld = function (force: boolean) {
        orig(force)
        const hide = (g: any) => g?.traverse((o: any) => {
          if (o.name === 'XY' || o.name === 'YZ' || o.name === 'XZ') o.visible = false
        })
        hide(this.gizmo?.[this.mode])
        hide(this.picker?.[this.mode])
      }
      gizmo.__planesPatched = true
    }
    raf = requestAnimationFrame(tryPatch)
    return () => cancelAnimationFrame(raf)
  })
  // 選択切替時に dragRef のローカル位置をリセット
  useEffect(() => {
    if (selection.kind === 'fixture' && fixture) {
      const handle = selection.fixtureHandle ?? 'position'
      const src = handle === 'target' ? fixture.target : fixture.position
      dragRef.current.position.set(...src)
    } else if (selection.kind === 'performer' && performer) {
      dragRef.current.position.set(...performer.position)
    } else if (selection.kind === 'setpiece' && setPiece) {
      dragRef.current.position.set(...setPiece.position)
      dragRef.current.rotation.set(...setPiece.rotation)
    }
  }, [
    selection.kind, selection.id, selection.fixtureHandle,
    fixture?.position.join(','), fixture?.target.join(','),
    performer?.position.join(','),
    setPiece?.position.join(','), setPiece?.rotation.join(','),
  ])

  if (!showGizmos) return null

  // ---- フィクスチャ選択 ----
  if (selection.kind === 'fixture' && fixture) {
    const pos = new THREE.Vector3(...fixture.position)
    const tgt = new THREE.Vector3(...fixture.target)
    const handle = selection.fixtureHandle ?? 'position'
    // 'target' の場合は translate 固定 (狙い点に回転は無意味)
    const mode = handle === 'target' ? 'translate' : transformMode

    return (
      <group>
        {/* 光源ハンドル (掴める球) */}
        <mesh
          position={pos.toArray()}
          renderOrder={1001}
          onClick={(e) => { e.stopPropagation(); select('fixture', fixture.id, 'position') }}
        >
          <sphereGeometry args={[0.16, 16, 12]} />
          <meshBasicMaterial color={handle === 'position' ? '#6cf' : '#789'} depthTest={false} transparent opacity={0.85} />
        </mesh>
        {/* ターゲットハンドル */}
        <mesh
          position={tgt.toArray()}
          renderOrder={1001}
          onClick={(e) => { e.stopPropagation(); select('fixture', fixture.id, 'target') }}
        >
          <sphereGeometry args={[0.16, 16, 12]} />
          <meshBasicMaterial color={handle === 'target' ? '#fc6' : '#987'} depthTest={false} transparent opacity={0.85} />
        </mesh>

        <primitive object={dragRef.current} />
        <TransformControls
          ref={tcRef as any}
          object={dragRef.current}
          mode={mode}
          size={isTouchDevice() ? 1.1 : 0.7}
          onObjectChange={() => {
            const o = dragRef.current
            if (mode === 'rotate' && handle === 'position') {
              // 回転を target ベクトルに反映: ローカル -Y を world に変換
              const dir = new THREE.Vector3(0, -1, 0).applyQuaternion(o.quaternion)
              const distNow = new THREE.Vector3(...fixture.target).distanceTo(new THREE.Vector3(...fixture.position))
              const newTgt = new THREE.Vector3(...fixture.position).addScaledVector(dir, distNow)
              updateFixture(fixture.id, { target: [newTgt.x, newTgt.y, newTgt.z] })
            } else {
              const patch = handle === 'target'
                ? { target: [o.position.x, o.position.y, o.position.z] as [number, number, number] }
                : { position: [o.position.x, o.position.y, o.position.z] as [number, number, number] }
              updateFixture(fixture.id, patch)
            }
          }}
        />
      </group>
    )
  }

  // ---- 舞台装置選択 ----
  if (selection.kind === 'setpiece' && setPiece) {
    return (
      <group>
        <primitive object={dragRef.current} />
        <TransformControls
          ref={tcRef as any}
          object={dragRef.current}
          mode={transformMode}
          size={isTouchDevice() ? 1.1 : 0.7}
          onObjectChange={() => {
            const o = dragRef.current
            updateSetPiece(setPiece.id, {
              position: [o.position.x, o.position.y, o.position.z],
              rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
            })
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
