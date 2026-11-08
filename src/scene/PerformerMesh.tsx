import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useStore, type Performer } from '../store'
import { createStageMaterial } from '../lighting/StageMaterial'
import { measureIlluminanceAtHit } from '../photometric/illuminance'
import { getPoseFrame, type Joint, type PoseFrame } from '../performerPoses'

// 役者 (人物) メッシュ: 胴体カプセル + 頭球 + 手足
// 選択中は浮きリングで強調

export function PerformerMeshes({ onMaterialsReady }: { onMaterialsReady: (mats: THREE.ShaderMaterial[]) => void }) {
  const performers = useStore(s => s.performers)
  // 個別マテリアル (色違いをそのまま反映するため)
  const mats = useMemo(() => {
    const result: Record<string, THREE.ShaderMaterial> = {}
    performers.forEach(p => {
      result[p.id] = createStageMaterial({
        baseColor: new THREE.Color(p.color),
        roughness: 0.62,
      })
    })
    // 親に通知
    onMaterialsReady(Object.values(result))
    return result
  }, [performers.map(p => `${p.id}:${p.color}:${p.scale}`).join('|')])

  return (
    <group>
      {performers.map(p => (
        <PerformerMeshSingle key={p.id} performer={p} material={mats[p.id]} />
      ))}
    </group>
  )
}

function PerformerMeshSingle({ performer, material }: { performer: Performer; material: THREE.ShaderMaterial }) {
  const selection = useStore(s => s.selection)
  const hovered = useStore(s => s.hovered)
  const select = useStore(s => s.select)
  const setHover = useStore(s => s.setHover)

  const selected = selection.kind === 'performer' && selection.id === performer.id
  const isHover = hovered.kind === 'performer' && hovered.id === performer.id
  const s = performer.scale
  const frame = getPoseFrame(performer.pose)
  const groupRef = useRef<THREE.Group>(null)
  // 全パーツに castShadow/receiveShadow を伝播
  useEffect(() => {
    groupRef.current?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        ;(o as THREE.Mesh).castShadow = true
        ;(o as THREE.Mesh).receiveShadow = true
      }
    })
  })

  // よりスリムで人らしい比率 (8頭身寄り)
  // 全体高: 約 1.72m (s=1.0時)
  return (
    <group
      ref={groupRef}
      position={performer.position}
      visible={performer.onStage !== false}
      onPointerOver={(e) => { e.stopPropagation(); setHover('performer', performer.id) }}
      onPointerOut={(e) => { e.stopPropagation(); setHover(null, null) }}
      onClick={(e) => {
        e.stopPropagation()
        const st = useStore.getState()
        if (st.settings.probeMode) {
          st.setProbeMeasurement(measureIlluminanceAtHit(
            e.point, e.face?.normal, e.object, st.fixtures,
          ))
        } else {
          select('performer', performer.id)
        }
      }}
    >
      <group scale={s}>
        <PoseBody frame={frame} material={material} />
      </group>

      {/* クリック判定拡大 (見えない円柱) */}
      <mesh visible={false} position={performer.pose === 'lying' ? [0, 0.2 * s, 0] : [0, (performer.pose === 'sitting' ? 0.6 : performer.pose === 'kneeling' ? 0.7 : 0.86) * s, 0]}>
        {performer.pose === 'lying'
          ? <boxGeometry args={[1.8 * s, 0.5 * s, 0.8 * s]} />
          : <cylinderGeometry args={[0.35 * s, 0.35 * s, (performer.pose === 'sitting' ? 1.25 : performer.pose === 'kneeling' ? 1.5 : 1.8) * s, 8]} />}
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* 選択/ホバー: 足元のリング (薄く) */}
      {(selected || isHover) && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.32 * s, 0.4 * s, 48]} />
          <meshBasicMaterial color={selected ? '#7cc8ff' : '#ffc88a'} transparent opacity={0.55} />
        </mesh>
      )}
    </group>
  )
}

function Segment({ from, to, radius, material }: { from: Joint; to: Joint; radius: number; material: THREE.Material }) {
  const start = new THREE.Vector3(...from)
  const end = new THREE.Vector3(...to)
  const direction = end.clone().sub(start)
  const center = start.add(end).multiplyScalar(0.5)
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize())
  return <mesh position={center} quaternion={rotation} material={material}>
    <cylinderGeometry args={[radius, radius, direction.length(), 14]} />
  </mesh>
}

function PoseBody({ frame, material }: { frame: PoseFrame; material: THREE.ShaderMaterial }) {
  const joints: { point: Joint; radius: number }[] = [
    { point: frame.head, radius: 0.11 },
    { point: frame.leftShoulder, radius: 0.07 }, { point: frame.rightShoulder, radius: 0.07 },
    { point: frame.leftElbow, radius: 0.045 }, { point: frame.rightElbow, radius: 0.045 },
    { point: frame.leftKnee, radius: 0.06 }, { point: frame.rightKnee, radius: 0.06 },
  ]
  const segments: { from: Joint; to: Joint; radius: number }[] = [
    { from: frame.neck, to: frame.shoulder, radius: 0.05 },
    { from: frame.shoulder, to: frame.hip, radius: 0.14 },
    { from: frame.leftShoulder, to: frame.leftElbow, radius: 0.05 },
    { from: frame.rightShoulder, to: frame.rightElbow, radius: 0.05 },
    { from: frame.leftElbow, to: frame.leftHand, radius: 0.04 },
    { from: frame.rightElbow, to: frame.rightHand, radius: 0.04 },
    { from: frame.leftHip, to: frame.leftKnee, radius: 0.067 },
    { from: frame.rightHip, to: frame.rightKnee, radius: 0.067 },
    { from: frame.leftKnee, to: frame.leftFoot, radius: 0.049 },
    { from: frame.rightKnee, to: frame.rightFoot, radius: 0.049 },
  ]
  return <>
    {segments.map((segment, index) => <Segment key={index} {...segment} material={material} />)}
    {joints.map((joint, index) => <mesh key={index} position={joint.point} material={material}>
      <sphereGeometry args={[joint.radius, 16, 12]} />
    </mesh>)}
    <mesh position={frame.leftFoot} material={material}><boxGeometry args={[0.09, 0.06, 0.19]} /></mesh>
    <mesh position={frame.rightFoot} material={material}><boxGeometry args={[0.09, 0.06, 0.19]} /></mesh>
  </>
}
