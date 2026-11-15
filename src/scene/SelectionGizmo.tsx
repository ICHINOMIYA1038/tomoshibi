import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { TransformControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useStore } from '../store'
import { useStageParts } from '../ui/StagePartsEditor'
import { isFlat, snapValue, type StagePart } from '../stageParts'
import { clampAudiencePosition } from '../audienceLayout'

function isTouchDevice() {
  if (typeof window === 'undefined') return false
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)
}

/**
 * TransformControls の size を画面に合わせて決める。
 *
 * three の TransformControls はギズモの見かけの大きさを「垂直画角に対する割合」で保つ
 * (factor ∝ tan(fov/2))。App.tsx の ResponsiveFov が縦長画面で fov を 45°→最大70°に
 * 広げるため、そのままだとスマホ縦持ちで矢印・回転リングが約1.7倍になり、
 * さらにタッチ用に 1.1 倍していたので画面の大半を覆っていた。
 * fov 45° のときと同じ見かけになるよう tan 比で打ち消し、小さい画面ではもう一段縮める。
 */
const BASE_FOV_DEG = 45
const MAX_FOV_DEG = 70
function useGizmoSize(): number {
  const width = useThree(s => s.size.width)
  const height = useThree(s => s.size.height)
  // camera.fov は ResponsiveFov の effect が描画後に書き換えるため、描画時点では
  // 古い値のことがある。同じ式でアスペクト比から直接求める。
  const aspect = width / Math.max(height, 1)
  const fov =
    aspect >= 1
      ? BASE_FOV_DEG
      : Math.min(
          THREE.MathUtils.radToDeg(
            2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(BASE_FOV_DEG) / 2) / aspect),
          ),
          MAX_FOV_DEG,
        )
  const fovScale =
    Math.tan(THREE.MathUtils.degToRad(BASE_FOV_DEG) / 2) /
    Math.tan(THREE.MathUtils.degToRad(fov) / 2)
  const base = isTouchDevice() ? 0.8 : 0.7
  // 幅が狭い端末 (スマホ縦) では指で掴める最小限まで落とす。
  const narrow = Math.min(width, height) < 520 ? 0.8 : 1
  return THREE.MathUtils.clamp(base * fovScale * narrow, 0.35, 1.1)
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
  const gizmoSize = useGizmoSize()
  const stageParts = useStageParts()
  const part = selection.kind === 'stagepart' ? stageParts.parts.find(item => item.id === selection.id) : undefined
  // バトンに吊った照明は、つかんだときの分を使い続ける（動かす途中で近くの照明を拾わない）
  const partFixtures = useRef<string[] | undefined>(undefined)
  const moveStageTo = useStore(s => s.moveStageTo)
  const audience = useStore(s => selection.kind === 'audience' ? (s.productionPlan.audienceBlocks ?? []).find(block => block.id === selection.id) : undefined)
  const updateAudienceBlock = useStore(s => s.updateAudienceBlock)
  const layout = stageParts.layout
  const updateVenueLayout = useStore(s => s.updateVenueLayout)
  // 回転・拡大はつかんだときの値からの変化で決める
  const partStart = useRef<StagePart | null>(null)
  const stageStart = useRef<{ width: number; depth: number } | null>(null)
  /** 舞台・客席・舞台の部品で使える操作。使えない操作が選ばれていたら移動にする */
  const venueMode = (allowed: Array<'translate' | 'rotate' | 'scale'>) => allowed.includes(transformMode) ? transformMode : 'translate'

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
    } else if (selection.kind === 'stage') {
      // 矢印は舞台の中心（舞台の座標で z = -3）に置く
      dragRef.current.position.set(stageParts.offset[0], 0.05, stageParts.offset[1] - 3)
      dragRef.current.rotation.set(0, 0, 0)
    } else if (audience) {
      dragRef.current.position.set(audience.position[0], 0.9, audience.position[1])
      dragRef.current.rotation.set(0, audience.rotationDeg * Math.PI / 180, 0)
    } else if (part) {
      dragRef.current.position.set(part.x + stageParts.offset[0], partHandleY(part), part.z + stageParts.offset[1])
      dragRef.current.rotation.set(0, part.rotationDeg * Math.PI / 180, 0)
    }
    // 拡大はつかむたびに 1 から測る（大きさは部品の数字に入っている）
    if (!partStart.current && !stageStart.current) dragRef.current.scale.set(1, 1, 1)
  }, [
    selection.kind, selection.id, selection.fixtureHandle,
    fixture?.position.join(','), fixture?.target.join(','),
    performer?.position.join(','),
    setPiece?.position.join(','), setPiece?.rotation.join(','),
    part?.x, part?.z, part?.elevation, part?.height, part?.rotationDeg, stageParts.offset.join(','),
    audience?.position.join(','), audience?.rotationDeg,
  ])

  if (!showGizmos) return null

  // ---- フィクスチャ選択 ----
  if (selection.kind === 'fixture' && fixture) {
    const pos = new THREE.Vector3(...fixture.position)
    const tgt = new THREE.Vector3(...fixture.target)
    const handle = selection.fixtureHandle ?? 'position'
    // 'target' の場合は translate 固定 (狙い点に回転は無意味)
    const mode = handle === 'target' || transformMode === 'scale' ? 'translate' : transformMode

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
          size={gizmoSize}
          onObjectChange={() => {
            const o = dragRef.current
            if (mode === 'rotate' && handle === 'position') {
              // 回転を target ベクトルに反映: ローカル -Y を world に変換
              const dir = new THREE.Vector3(0, -1, 0).applyQuaternion(o.quaternion)
              const distNow = new THREE.Vector3(...fixture.target).distanceTo(new THREE.Vector3(...fixture.position))
              const newTgt = new THREE.Vector3(...fixture.position).addScaledVector(dir, distNow)
              updateFixture(fixture.id, { target: [newTgt.x, newTgt.y, newTgt.z] })
            } else if (handle === 'target') {
              // 狙いのつまみ: 位置はそのまま、向きだけ変える
              updateFixture(fixture.id, { target: [o.position.x, o.position.y, o.position.z] })
            } else {
              // 本体: 位置だけ動かす。狙いも同じだけ平行に動かして向きを保つ
              const current = useStore.getState().fixtures.find(item => item.id === fixture.id) ?? fixture
              const [dx, dy, dz] = [o.position.x - current.position[0], o.position.y - current.position[1], o.position.z - current.position[2]]
              updateFixture(fixture.id, {
                position: [o.position.x, o.position.y, o.position.z],
                target: [current.target[0] + dx, current.target[1] + dy, current.target[2] + dz],
              })
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
          mode={transformMode === 'scale' ? 'translate' : transformMode}
          size={gizmoSize}
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

  // ---- 舞台の部品（床・壁・バトンなど）: 照明や役者と同じく、3D で移動・回転・拡大する ----
  if (selection.kind === 'stagepart' && part) {
    const mode = venueMode(['translate', 'rotate', 'scale'])
    const hanging = part.kind === 'batten' || part.kind === 'wall' || part.kind === 'cyc' || part.kind === 'wing'
    const hasHeight = part.kind === 'wall' || part.kind === 'cyc' || part.kind === 'wing' || part.kind === 'platform'
    return (
      <group>
        <primitive object={dragRef.current} />
        <TransformControls
          ref={tcRef as any}
          object={dragRef.current}
          mode={mode}
          space={mode === 'translate' ? 'world' : 'local'}
          size={gizmoSize}
          showX={mode !== 'rotate'}
          showY={mode === 'rotate' || (mode === 'translate' ? hanging : hasHeight)}
          showZ={mode === 'translate' || (mode === 'scale' && isFlat(part.kind))}
          rotationSnap={Math.PI / 12}
          onMouseDown={() => {
            partFixtures.current = part.kind === 'batten' ? stageParts.hungIds(part) : []
            partStart.current = part
          }}
          onMouseUp={() => {
            partFixtures.current = undefined
            partStart.current = null
            dragRef.current.scale.set(1, 1, 1)
          }}
          onObjectChange={() => {
            const o = dragRef.current
            const from = partStart.current ?? part
            if (mode === 'rotate') {
              // Y 軸まわりの角度（rotationDeg と同じ向き）。Euler の y は 90° を超えると折り返すので、向きから求める
              const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(o.quaternion)
              stageParts.change(part.id, { rotationDeg: Math.round(Math.atan2(-axis.z, axis.x) * 180 / Math.PI / 5) * 5 }, partFixtures.current)
              return
            }
            if (mode === 'scale') {
              const patch: Partial<StagePart> = { width: Math.max(.5, snapValue(from.width * Math.abs(o.scale.x))) }
              if (isFlat(part.kind)) patch.depth = Math.max(.5, snapValue(from.depth * Math.abs(o.scale.z)))
              if (hasHeight) patch.height = Math.max(.1, snapValue(from.height * Math.abs(o.scale.y)))
              stageParts.change(part.id, patch, partFixtures.current)
              return
            }
            const patch: Partial<StagePart> = {
              x: snapValue(o.position.x - stageParts.offset[0]),
              z: snapValue(o.position.z - stageParts.offset[1]),
            }
            // 矢印は部品の高さの途中に出しているので、つかんだときとの差だけ吊る高さ・下端を動かす
            if (hanging) patch.elevation = Math.max(0, snapValue(from.elevation + o.position.y - partHandleY(from)))
            stageParts.change(part.id, patch, partFixtures.current)
          }}
        />
      </group>
    )
  }

  // ---- 舞台の床: 舞台全体を動かす（役者・セット・舞台の上の照明も一緒に動く。store の moveStageTo）、拡大で広さを変える ----
  // 視点は舞台に付いて動かない（App.tsx）。付いて動くと、引っぱるたびに視点もずれて舞台が劇場の端まで飛ぶ
  if (selection.kind === 'stage') {
    const mode = venueMode(['translate', 'scale'])
    const round = layout.stageShape === 'round'
    return (
      <group>
        <primitive object={dragRef.current} />
        <TransformControls ref={tcRef as any} object={dragRef.current} mode={mode} size={gizmoSize} showY={false}
          showZ={mode === 'translate' || !round}
          onMouseDown={() => { stageStart.current = { width: layout.stageWidth, depth: layout.stageDepth } }}
          onMouseUp={() => { stageStart.current = null; dragRef.current.scale.set(1, 1, 1) }}
          onObjectChange={() => {
            const o = dragRef.current
            if (mode === 'scale') {
              const from = stageStart.current ?? { width: layout.stageWidth, depth: layout.stageDepth }
              const width = Math.min(24, Math.max(6, snapValue(from.width * Math.abs(o.scale.x))))
              const depth = Math.min(20, Math.max(6, snapValue(from.depth * Math.abs(o.scale.z))))
              updateVenueLayout(round ? { stageWidth: width, stageDepth: width } : { stageWidth: width, stageDepth: depth })
              return
            }
            moveStageTo([snapValue(o.position.x), snapValue(o.position.z + 3)])
          }} />
      </group>
    )
  }

  // ---- 客席ブロック ----
  if (selection.kind === 'audience' && audience) {
    return (
      <group>
        <primitive object={dragRef.current} />
        <TransformControls ref={tcRef as any} object={dragRef.current} mode={venueMode(['translate', 'rotate'])}
          size={gizmoSize} showX={venueMode(['translate', 'rotate']) === 'translate'} showY={venueMode(['translate', 'rotate']) === 'rotate'}
          showZ={venueMode(['translate', 'rotate']) === 'translate'} rotationSnap={Math.PI / 12}
          onObjectChange={() => {
            const o = dragRef.current
            if (venueMode(['translate', 'rotate']) === 'rotate') {
              const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(o.quaternion)
              const rotationDeg = Math.round(Math.atan2(-axis.z, axis.x) * 180 / Math.PI / 5) * 5
              updateAudienceBlock(audience.id, { rotationDeg, position: clampAudiencePosition({ ...audience, rotationDeg }, ...audience.position) })
              return
            }
            updateAudienceBlock(audience.id, { position: clampAudiencePosition(audience, snapValue(o.position.x), snapValue(o.position.z)) })
          }} />
      </group>
    )
  }

  // ---- 役者選択 ----
  if (selection.kind === 'performer' && performer && performer.onStage !== false) {
    return (
      <group>
        <primitive object={dragRef.current} />
        <TransformControls
          object={dragRef.current}
          mode="translate"
          size={gizmoSize}
          onObjectChange={() => {
            const o = dragRef.current
            updatePerformer(performer.id, {
              position: [o.position.x, Math.max(0, o.position.y), o.position.z],
            })
          }}
        />
      </group>
    )
  }

  return null
}

/** 部品をつかむ矢印を置く高さ。バトンは吊る高さ、壁などは目の高さあたり */
function partHandleY(part: { kind: string; elevation: number; height: number }) {
  if (part.kind === 'batten') return part.elevation
  if (part.kind === 'floor') return 0.05
  if (part.kind === 'platform') return part.height
  return part.elevation + Math.min(part.height / 2, 1.5)
}
