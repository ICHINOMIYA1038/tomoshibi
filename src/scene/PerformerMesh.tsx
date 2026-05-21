import { useMemo } from 'react'
import * as THREE from 'three'
import { useStore, type Performer } from '../store'
import { createStageMaterial } from '../lighting/StageMaterial'
import { measureIlluminance } from '../photometric/illuminance'
import * as THREEX from 'three'

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

  // よりスリムで人らしい比率 (8頭身寄り)
  // 全体高: 約 1.72m (s=1.0時)
  return (
    <group
      position={performer.position}
      onPointerOver={(e) => { e.stopPropagation(); setHover('performer', performer.id) }}
      onPointerOut={(e) => { e.stopPropagation(); setHover(null, null) }}
      onClick={(e) => {
        e.stopPropagation()
        const st = useStore.getState()
        if (st.settings.probeMode) {
          st.setProbeMeasurement(measureIlluminance(
            e.point, e.face?.normal ?? new THREEX.Vector3(0, 1, 0), st.fixtures,
          ))
        } else {
          select('performer', performer.id)
        }
      }}
    >
      {/* 頭 */}
      <mesh position={[0, 1.62 * s, 0]} material={material}>
        <sphereGeometry args={[0.11 * s, 28, 22]} />
      </mesh>
      {/* 首 */}
      <mesh position={[0, 1.46 * s, 0]} material={material}>
        <cylinderGeometry args={[0.045 * s, 0.06 * s, 0.10 * s, 16]} />
      </mesh>
      {/* 胴体 (上半身) - 緩やかなテーパー */}
      <mesh position={[0, 1.20 * s, 0]} material={material}>
        <cylinderGeometry args={[0.16 * s, 0.135 * s, 0.42 * s, 24]} />
      </mesh>
      {/* 腰 */}
      <mesh position={[0, 0.92 * s, 0]} material={material}>
        <cylinderGeometry args={[0.13 * s, 0.135 * s, 0.18 * s, 20]} />
      </mesh>
      {/* 肩 */}
      <mesh position={[-0.18 * s, 1.36 * s, 0]} material={material}>
        <sphereGeometry args={[0.07 * s, 16, 12]} />
      </mesh>
      <mesh position={[0.18 * s, 1.36 * s, 0]} material={material}>
        <sphereGeometry args={[0.07 * s, 16, 12]} />
      </mesh>
      {/* 腕 上腕 */}
      <mesh position={[-0.22 * s, 1.16 * s, 0]} rotation={[0, 0, 0.05]} material={material}>
        <cylinderGeometry args={[0.045 * s, 0.05 * s, 0.34 * s, 14]} />
      </mesh>
      <mesh position={[0.22 * s, 1.16 * s, 0]} rotation={[0, 0, -0.05]} material={material}>
        <cylinderGeometry args={[0.045 * s, 0.05 * s, 0.34 * s, 14]} />
      </mesh>
      {/* 肘 */}
      <mesh position={[-0.225 * s, 0.99 * s, 0]} material={material}>
        <sphereGeometry args={[0.045 * s, 14, 10]} />
      </mesh>
      <mesh position={[0.225 * s, 0.99 * s, 0]} material={material}>
        <sphereGeometry args={[0.045 * s, 14, 10]} />
      </mesh>
      {/* 前腕 */}
      <mesh position={[-0.23 * s, 0.81 * s, 0.01]} rotation={[0.05, 0, 0.02]} material={material}>
        <cylinderGeometry args={[0.038 * s, 0.040 * s, 0.32 * s, 12]} />
      </mesh>
      <mesh position={[0.23 * s, 0.81 * s, 0.01]} rotation={[0.05, 0, -0.02]} material={material}>
        <cylinderGeometry args={[0.038 * s, 0.040 * s, 0.32 * s, 12]} />
      </mesh>
      {/* 太もも */}
      <mesh position={[-0.08 * s, 0.62 * s, 0]} material={material}>
        <cylinderGeometry args={[0.07 * s, 0.065 * s, 0.42 * s, 16]} />
      </mesh>
      <mesh position={[0.08 * s, 0.62 * s, 0]} material={material}>
        <cylinderGeometry args={[0.07 * s, 0.065 * s, 0.42 * s, 16]} />
      </mesh>
      {/* 膝 */}
      <mesh position={[-0.08 * s, 0.40 * s, 0]} material={material}>
        <sphereGeometry args={[0.06 * s, 14, 10]} />
      </mesh>
      <mesh position={[0.08 * s, 0.40 * s, 0]} material={material}>
        <sphereGeometry args={[0.06 * s, 14, 10]} />
      </mesh>
      {/* すね */}
      <mesh position={[-0.08 * s, 0.20 * s, 0]} material={material}>
        <cylinderGeometry args={[0.05 * s, 0.045 * s, 0.38 * s, 14]} />
      </mesh>
      <mesh position={[0.08 * s, 0.20 * s, 0]} material={material}>
        <cylinderGeometry args={[0.05 * s, 0.045 * s, 0.38 * s, 14]} />
      </mesh>
      {/* 足 */}
      <mesh position={[-0.08 * s, 0.025 * s, 0.04 * s]} material={material}>
        <boxGeometry args={[0.08 * s, 0.05 * s, 0.18 * s]} />
      </mesh>
      <mesh position={[0.08 * s, 0.025 * s, 0.04 * s]} material={material}>
        <boxGeometry args={[0.08 * s, 0.05 * s, 0.18 * s]} />
      </mesh>

      {/* クリック判定拡大 (見えない円柱) */}
      <mesh visible={false} position={[0, 0.86 * s, 0]}>
        <cylinderGeometry args={[0.35 * s, 0.35 * s, 1.8 * s, 8]} />
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
