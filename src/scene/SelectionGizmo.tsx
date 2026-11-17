import { STAGE_SIZE } from '../venueLayout'
import { useAimDrag, useFloorDrag } from './floorDrag'
import { isLocked } from '../locks'
import { clearChange } from '../changeLog'
import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { TransformControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useStore } from '../store'
import { useStageParts } from '../ui/StagePartsEditor'
import { isFlat, snapValue, type StagePart } from '../stageParts'
import { clampAudienceElevation, clampAudiencePosition } from '../audienceLayout'
import { toolFor } from '../tools'
import { RotateRing } from './RotateRing'

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
// いま出ている矢印（TransformControls）。矢印の上で押したときは、空の所を押した扱い（選ぶのをやめる）にしない
let activeControls: { current: any } | null = null
export function isGizmoEngaged(): boolean {
  const controls = activeControls?.current
  return !!controls && (controls.dragging || controls.axis != null)
}

const gizmoRaycaster = new THREE.Raycaster()
/**
 * その視線が矢印（TransformControls のつかむ所）に当たるか。指では、押す前に「矢印の上にいる」が分からないので、
 * 押した瞬間に視線で確かめる（2026-11-17 オーナー「人を上下に動かそうとしても矢印の方向にいかない」）
 */
export function isGizmoHit(ray: THREE.Ray): boolean {
  const controls = activeControls?.current
  if (!controls?.object) return false
  if (controls.dragging || controls.axis != null) return true
  const gizmo = controls._gizmo ?? controls.children?.find((child: any) => child.gizmo && child.picker)
  const picker = gizmo?.picker?.[controls.mode]
  if (!picker) return false
  gizmoRaycaster.ray.copy(ray)
  return gizmoRaycaster.intersectObject(picker, true).some(hit => {
    for (let item: THREE.Object3D | null = hit.object; item; item = item.parent) if (!item.visible) return false
    return true
  })
}

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
  // 矢印をつかみやすい大きさにする（オーナー指摘「うまく掴めないことがある」2026-11-17）
  const base = isTouchDevice() ? 1.05 : 0.95
  // 幅が狭い端末 (スマホ縦) では指で掴める最小限まで落とす。
  const narrow = Math.min(width, height) < 520 ? 0.8 : 1
  return THREE.MathUtils.clamp(base * fovScale * narrow, 0.45, 1.4)
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
  // 移動の矢印は、設定の欄から消せないようにした（旧「ビーム円錐ガイド」で切れていた。2026-11-17）
  const transformMode = useStore(s => s.settings.transformMode)
  const updateFixture = useStore(s => s.updateFixture)
  const updatePerformer = useStore(s => s.updatePerformer)
  const select = useStore(s => s.select)
  const gizmoSize = useGizmoSize()
  const locked = useStore(s => isLocked(s.productionPlan, selection.kind, selection.id))
  const aimDrag = useAimDrag(selection.kind === 'fixture' && selection.id ? selection.id : '')
  const bodyDrag = useFloorDrag('fixture', selection.kind === 'fixture' && selection.id ? selection.id : '')
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
  const setPieceStart = useRef<{ size?: [number, number, number]; scale: number } | null>(null)
  /** 選んだ物で使う道具（tools.ts）。選択の道具では矢印を出さない */
  const tool = toolFor(transformMode, selection.kind, selection.fixtureHandle) as 'translate' | 'rotate' | 'scale'
  const venueMode = (_allowed: unknown) => tool

  // 動的に position を反映するための Object3D
  const dragRef = useRef<THREE.Object3D>(new THREE.Object3D())
  // TransformControls 本体 ref (plane-drag を隠すため)
  const tcRef = useRef<any>(null)
  useEffect(() => { activeControls = tcRef })
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
      dragRef.current.position.set(audience.position[0], (audience.elevation ?? 0) + 0.9, audience.position[1])
      dragRef.current.rotation.set(0, audience.rotationDeg * Math.PI / 180, 0)
    } else if (part) {
      dragRef.current.position.set(part.x + stageParts.offset[0], partHandleY(part), part.z + stageParts.offset[1])
      dragRef.current.rotation.set(0, part.rotationDeg * Math.PI / 180, 0)
    }
    // 拡大はつかむたびに 1 から測る（大きさは部品の数字に入っている）
    if (!partStart.current && !stageStart.current && !setPieceStart.current) dragRef.current.scale.set(1, 1, 1)
  }, [
    selection.kind, selection.id, selection.fixtureHandle,
    fixture?.position.join(','), fixture?.target.join(','),
    performer?.position.join(','),
    setPiece?.position.join(','), setPiece?.rotation.join(','),
    part?.x, part?.z, part?.elevation, part?.height, part?.rotationDeg, stageParts.offset.join(','),
    audience?.position.join(','), audience?.rotationDeg, audience?.elevation,
  ])

  if (transformMode === 'select') return null
  // 固定した物には矢印を出さない（照明は、狙いの球だけ出す）
  if (locked && selection.kind !== 'fixture') return null

  // ---- フィクスチャ選択 ----
  if (selection.kind === 'fixture' && fixture) {
    const pos = new THREE.Vector3(...fixture.position)
    const tgt = new THREE.Vector3(...fixture.target)
    const handle = selection.fixtureHandle ?? 'position'
    // 'target' の場合は translate 固定 (狙い点に回転は無意味)
    const mode = tool

    return (
      <group>
        {/* 光源ハンドル (掴める球)。押さえて引っぱると位置が動く */}
        <mesh
          position={pos.toArray()}
          renderOrder={1001}
          userData={{ priorityHandle: true }}
          {...bodyDrag}
          onClick={(e) => { e.stopPropagation(); select('fixture', fixture.id, 'position') }}
        >
          <sphereGeometry args={[0.16, 16, 12]} />
          <meshBasicMaterial color={handle === 'position' ? '#6cf' : '#789'} depthTest={false} transparent opacity={0.85} />
        </mesh>
        {/* ターゲットハンドル。押さえて引っぱると狙いだけが動く（つかむ点を切り替えなくてよい） */}
        <mesh
          position={tgt.toArray()}
          renderOrder={1001}
          userData={{ priorityHandle: true }}
          {...aimDrag}
          onClick={(e) => { e.stopPropagation(); select('fixture', fixture.id, 'target') }}
        >
          <sphereGeometry args={[0.24, 16, 12]} />
          <meshBasicMaterial color={handle === 'target' ? '#fc6' : '#d9b25a'} depthTest={false} transparent opacity={0.9} />
        </mesh>

        <primitive object={dragRef.current} />
        {!locked && <TransformControls
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
              // 吊る位置は全シーン共通。向きを保つための狙いの動きは「このシーンだけの変更」として出さない
              clearChange()
            }
          }}
        />}
      </group>
    )
  }

  // ---- 舞台装置選択 ----
  if (selection.kind === 'setpiece' && setPiece) {
    const footprint = setPiece.size ? Math.hypot(setPiece.size[0], setPiece.size[2]) / 2 : 0.6 * setPiece.scale
    const floorY = Math.max(0, setPiece.position[1] - (setPiece.size?.[1] ?? 0) / 2) + 0.03
    return (
      <group>
        {/* 足元の回転の輪。なぞると向きが変わる（移動の道具のとき。回転の道具では輪の代わりに TransformControls の輪が出る） */}
        {tool === 'translate' && <RotateRing center={[setPiece.position[0], floorY, setPiece.position[2]]} radius={footprint + 0.3}
          angle={setPiece.rotation[1]}
          onRotate={angle => updateSetPiece(setPiece.id, { rotation: [setPiece.rotation[0], angle, setPiece.rotation[2]] })} />}
        <primitive object={dragRef.current} />
        <TransformControls
          ref={tcRef as any}
          object={dragRef.current}
          mode={tool}
          space={tool === 'scale' ? 'local' : 'world'}
          size={gizmoSize}
          onMouseDown={() => { setPieceStart.current = { size: setPiece.size, scale: setPiece.scale } }}
          onMouseUp={() => { setPieceStart.current = null; dragRef.current.scale.set(1, 1, 1) }}
          onObjectChange={() => {
            const o = dragRef.current
            if (tool === 'scale') {
              // 箱・平台などは幅・高さ・奥行を、3D モデルは全体の大きさを変える
              const from = setPieceStart.current ?? { size: setPiece.size, scale: setPiece.scale }
              const round = (value: number) => Math.max(.05, Math.round(value * 20) / 20)
              if (from.size) {
                const size: [number, number, number] = [round(from.size[0] * Math.abs(o.scale.x)), round(from.size[1] * Math.abs(o.scale.y)), round(from.size[2] * Math.abs(o.scale.z))]
                // 床に置いてある物は、高さを変えても床に置いたままにする
                const grounded = Math.abs(setPiece.position[1] - (setPiece.size?.[1] ?? 0) / 2) < .01
                updateSetPiece(setPiece.id, grounded ? { size, position: [setPiece.position[0], size[1] / 2, setPiece.position[2]] } : { size })
              }
              else updateSetPiece(setPiece.id, { scale: round(from.scale * Math.abs(o.scale.x)) })
              return
            }
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
    const ringY = part.kind === 'batten' ? part.elevation : part.kind === 'platform' ? part.height + 0.03 : part.elevation + 0.03
    return (
      <group>
        {tool === 'translate' && <RotateRing center={[part.x + stageParts.offset[0], ringY, part.z + stageParts.offset[1]]}
          radius={Math.min(8, Math.max(part.width, isFlat(part.kind) ? part.depth : 0) / 2 + 0.4)}
          angle={part.rotationDeg * Math.PI / 180}
          onStart={() => { partFixtures.current = part.kind === 'batten' ? stageParts.hungIds(part) : [] }}
          onRotate={angle => stageParts.change(part.id, { rotationDeg: Math.round(angle * 180 / Math.PI) }, partFixtures.current)} />}
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
              const width = Math.min(STAGE_SIZE.maxWidth, Math.max(STAGE_SIZE.min, snapValue(from.width * Math.abs(o.scale.x))))
              const depth = Math.min(STAGE_SIZE.maxDepth, Math.max(STAGE_SIZE.min, snapValue(from.depth * Math.abs(o.scale.z))))
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
        {tool === 'translate' && <RotateRing center={[audience.position[0], (audience.elevation ?? 0) + 0.03, audience.position[1]]}
          radius={audience.seatsPerRow * audience.seatSpacing / 2 + 0.4}
          angle={audience.rotationDeg * Math.PI / 180}
          onRotate={angle => {
            const rotationDeg = Math.round(angle * 180 / Math.PI)
            updateAudienceBlock(audience.id, { rotationDeg, position: clampAudiencePosition({ ...audience, rotationDeg }, ...audience.position) })
          }} />}
        <primitive object={dragRef.current} />
        <TransformControls ref={tcRef as any} object={dragRef.current} mode={venueMode(['translate', 'rotate'])}
          size={gizmoSize} showX={venueMode(['translate', 'rotate']) === 'translate'} showY
          showZ={venueMode(['translate', 'rotate']) === 'translate'} rotationSnap={Math.PI / 12}
          onObjectChange={() => {
            const o = dragRef.current
            if (venueMode(['translate', 'rotate']) === 'rotate') {
              const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(o.quaternion)
              const rotationDeg = Math.round(Math.atan2(-axis.z, axis.x) * 180 / Math.PI / 5) * 5
              updateAudienceBlock(audience.id, { rotationDeg, position: clampAudiencePosition({ ...audience, rotationDeg }, ...audience.position) })
              return
            }
            // 上下の矢印で客席の高さを変える（平台や段の上の客席。オーナー指摘、2026-11-16）
            updateAudienceBlock(audience.id, { position: clampAudiencePosition(audience, snapValue(o.position.x), snapValue(o.position.z)),
              elevation: clampAudienceElevation(snapValue(o.position.y - 0.9)) })
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
