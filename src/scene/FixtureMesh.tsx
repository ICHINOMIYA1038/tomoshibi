import { useMemo } from 'react'
import * as THREE from 'three'
import { useStore } from '../store'
import { FIXTURE_PROFILES, type FixtureKind } from '../lighting/fixtureTypes'

// フィクスチャ本体の3Dモデル
// 種別ごとに見た目を変える + 見えない大きなクリック判定球
// 選択中はハイライト、ホバー中はオレンジ

const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1d, roughness: 0.5, metalness: 0.6 })
const lensMat = new THREE.MeshStandardMaterial({
  color: 0xddeeff, roughness: 0.05, metalness: 0.0,
  transparent: true, opacity: 0.35,
})
const yokeMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.4, metalness: 0.8 })

function FixtureBody({ kind, length, diameter, color }: {
  kind: FixtureKind; length: number; diameter: number; color: THREE.Color
}) {
  const r = diameter / 2

  if (kind === 'PAR' || kind === 'LED_PAR' || kind === 'LED_Bar') {
    const isBar = kind === 'LED_Bar'
    if (isBar) {
      return (
        <group>
          <mesh material={bodyMat} position={[0, length / 2, 0]} rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[diameter, length, diameter]} />
          </mesh>
          {/* LED 列 */}
          {Array.from({ length: 8 }).map((_, i) => (
            <mesh key={i} position={[(i - 3.5) * length / 8 * 0.9, length * 0.5, r + 0.005]}>
              <sphereGeometry args={[r * 0.3, 6, 6]} />
              <meshBasicMaterial color={color} />
            </mesh>
          ))}
        </group>
      )
    }
    return (
      <group>
        <mesh material={bodyMat}>
          <cylinderGeometry args={[r, r, length, 24]} />
        </mesh>
        <mesh position={[0, length / 2 + 0.005, 0]} material={lensMat}>
          <cylinderGeometry args={[r * 0.95, r * 0.95, 0.02, 24]} />
        </mesh>
        <mesh position={[0, length / 2 - 0.05, 0]}>
          <sphereGeometry args={[r * 0.4, 12, 8]} />
          <meshBasicMaterial color={color} />
        </mesh>
      </group>
    )
  }
  if (kind === 'Fresnel' || kind === 'LED_Wash') {
    return (
      <group>
        <mesh material={bodyMat}>
          <boxGeometry args={[diameter, length, diameter]} />
        </mesh>
        <mesh position={[0, length / 2 + 0.01, 0]} material={lensMat}>
          <cylinderGeometry args={[r * 0.9, r * 0.9, 0.03, 32]} />
        </mesh>
        {[0.7, 0.55, 0.4, 0.25].map((rr, i) => (
          <mesh key={i} position={[0, length / 2 + 0.025, 0]} material={lensMat}>
            <torusGeometry args={[r * rr, 0.004, 8, 32]} />
          </mesh>
        ))}
        <mesh position={[0, length / 2 - 0.05, 0]}>
          <sphereGeometry args={[r * 0.35, 12, 8]} />
          <meshBasicMaterial color={color} />
        </mesh>
      </group>
    )
  }
  if (kind === 'PC') {
    return (
      <group>
        <mesh material={bodyMat}>
          <boxGeometry args={[diameter, length, diameter]} />
        </mesh>
        <mesh position={[0, length / 2 + 0.04, 0]} rotation={[Math.PI, 0, 0]} material={lensMat}>
          <sphereGeometry args={[r * 0.9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh position={[0, length / 2 - 0.05, 0]}>
          <sphereGeometry args={[r * 0.35, 12, 8]} />
          <meshBasicMaterial color={color} />
        </mesh>
      </group>
    )
  }
  if (kind === 'MovingHead') {
    return (
      <group>
        {/* 頭部 */}
        <mesh material={bodyMat}>
          <cylinderGeometry args={[r * 1.1, r * 1.1, length * 0.7, 16]} />
        </mesh>
        <mesh position={[0, length / 2 - 0.02, 0]} material={lensMat}>
          <cylinderGeometry args={[r * 0.9, r * 0.9, 0.04, 24]} />
        </mesh>
        <mesh position={[0, length / 2 - 0.05, 0]}>
          <sphereGeometry args={[r * 0.4, 12, 8]} />
          <meshBasicMaterial color={color} />
        </mesh>
      </group>
    )
  }
  // Profile / LED_Profile
  return (
    <group>
      <mesh position={[0, length * 0.15, 0]} material={bodyMat}>
        <cylinderGeometry args={[r * 0.7, r * 0.7, length * 0.7, 20]} />
      </mesh>
      <mesh position={[0, -length * 0.3, 0]} material={bodyMat}>
        <cylinderGeometry args={[r * 1.0, r * 0.8, length * 0.4, 20]} />
      </mesh>
      <mesh position={[0, length * 0.1, 0]} material={yokeMat}>
        <boxGeometry args={[diameter * 1.1, 0.04, diameter * 1.1]} />
      </mesh>
      <mesh position={[0, length / 2 + 0.01, 0]} material={lensMat}>
        <cylinderGeometry args={[r * 0.65, r * 0.65, 0.04, 24]} />
      </mesh>
      <mesh position={[0, -length * 0.35, 0]}>
        <sphereGeometry args={[r * 0.3, 12, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  )
}

export function FixtureMeshes() {
  const fixtures = useStore(s => s.fixtures)
  return (
    <group>
      {fixtures.map(f => <FixtureMeshSingle key={f.id} id={f.id} />)}
    </group>
  )
}

function FixtureMeshSingle({ id }: { id: string }) {
  const f = useStore(s => s.fixtures.find(x => x.id === id))
  const selection = useStore(s => s.selection)
  const hovered = useStore(s => s.hovered)
  const select = useStore(s => s.select)
  const setHover = useStore(s => s.setHover)
  if (!f) return null

  const profile = FIXTURE_PROFILES[f.presetKey]
  const colorRGB = useMemo(() => new THREE.Color(...f.color), [f.color[0], f.color[1], f.color[2]])

  const pos = new THREE.Vector3(...f.position)
  const tgt = new THREE.Vector3(...f.target)
  const axis = new THREE.Vector3().subVectors(tgt, pos)

  const q = useMemo(() => {
    const q = new THREE.Quaternion()
    const dir = axis.lengthSq() > 1e-6 ? axis.clone().normalize() : new THREE.Vector3(0, -1, 0)
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    return q
  }, [f.position.join(','), f.target.join(',')])

  void selection; void hovered;

  return (
    <group
      position={pos.toArray()}
      onPointerOver={(e) => { e.stopPropagation(); setHover('fixture', f.id) }}
      onPointerOut={(e) => { e.stopPropagation(); setHover(null, null) }}
      onClick={(e) => {
        e.stopPropagation()
        const s = useStore.getState()
        if (s.settings.probeMode) {
          import('../photometric/illuminance').then(({ measureIlluminance }) => {
            s.setProbeMeasurement(measureIlluminance(
              e.point, e.face?.normal ?? new THREE.Vector3(0, 1, 0), s.fixtures,
            ))
          })
        } else {
          select('fixture', f.id, 'position')
        }
      }}
    >
      {/* ヨーク */}
      <mesh material={yokeMat}>
        <torusGeometry args={[profile.bodyDiameterM * 0.7, 0.012, 8, 16, Math.PI]} />
      </mesh>
      <group quaternion={q.toArray() as [number, number, number, number]}>
        <group position={[0, -profile.bodyLengthM / 2, 0]}>
          <FixtureBody
            kind={profile.kind}
            length={profile.bodyLengthM}
            diameter={profile.bodyDiameterM}
            color={colorRGB}
          />
        </group>
      </group>

      {/* 大きな見えないクリック判定球 */}
      <mesh visible={false}>
        <sphereGeometry args={[0.5, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* 選択/ホバー インジケータ: 不要 (ハンドル球で表現する) */}
    </group>
  )
}
