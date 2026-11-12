import { useMemo } from 'react'
import * as THREE from 'three'
import { activeSceneDirections, useStore, type StagePoint } from '../store'

const colors = { move: '#d4af6f', entrance: '#82b69c', exit: '#d98b78' }

function Segment({ from, to, color, opacity = 1, radius = 0.035 }: {
  from: StagePoint; to: StagePoint; color: string; opacity?: number; radius?: number
}) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(from[0], 0.055, from[1])
    const b = new THREE.Vector3(to[0], 0.055, to[1])
    const delta = b.clone().sub(a)
    return {
      position: a.add(b).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize()),
      length: delta.length(),
    }
  }, [from[0], from[1], to[0], to[1]])
  if (length < 0.01) return null
  return <mesh position={position} quaternion={quaternion} renderOrder={1900}>
    <cylinderGeometry args={[radius, radius, length, 7]} />
    <meshBasicMaterial color={color} transparent opacity={opacity} depthTest={false} depthWrite={false} toneMapped={false} />
  </mesh>
}

export function DirectionPaths({ visible }: { visible: boolean }) {
  const selected = useStore(s => s.selection)
  const directions = useStore(s => activeSceneDirections(s.productionPlan, s.performers))
  if (!visible) return null

  return <group>
    {directions.map(d => {
      const dx = d.to[0] - d.from[0]
      const dz = d.to[1] - d.from[1]
      const distance = Math.hypot(dx, dz)
      if (distance < 0.08) return null
      const ux = dx / distance
      const uz = dz / distance
      const arrowSize = Math.min(0.42, distance * 0.32)
      const color = colors[d.kind]
      const active = selected.kind === 'performer' && d.performerId === selected.id
      const dashCount = Math.max(1, Math.ceil(distance / 0.75))
      return <group key={d.id}>
        {Array.from({ length: dashCount }, (_, index) => {
          const start = index / dashCount
          const end = Math.min((index + 0.62) / dashCount, 0.94)
          const a: StagePoint = [d.from[0] + dx * start, d.from[1] + dz * start]
          const b: StagePoint = [d.from[0] + dx * end, d.from[1] + dz * end]
          return <Segment key={index} from={a} to={b} color={color} opacity={active ? 1 : 0.58} radius={active ? 0.048 : 0.025} />
        })}
        <Segment from={d.to} to={[d.to[0] - ux * arrowSize + uz * arrowSize * 0.5, d.to[1] - uz * arrowSize - ux * arrowSize * 0.5]}
          color={color} opacity={active ? 1 : 0.58} radius={active ? 0.055 : 0.03} />
        <Segment from={d.to} to={[d.to[0] - ux * arrowSize - uz * arrowSize * 0.5, d.to[1] - uz * arrowSize + ux * arrowSize * 0.5]}
          color={color} opacity={active ? 1 : 0.58} radius={active ? 0.055 : 0.03} />
      </group>
    })}
    {directions.filter(d => selected.kind === 'performer' && d.performerId === selected.id).map(d => <group key={d.id} position={[d.to[0], 0.06, d.to[1]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={1901}>
        <ringGeometry args={[0.32, 0.41, 40]} />
        <meshBasicMaterial color={colors[d.kind]} transparent opacity={0.95} depthTest={false} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      {d.kind !== 'exit' && <group>
        <mesh position={[0, 0.73, 0]} renderOrder={1901}>
          <cylinderGeometry args={[0.13, 0.14, 1.15, 12]} />
          <meshBasicMaterial color={colors[d.kind]} transparent opacity={0.3} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh position={[0, 1.5, 0]} renderOrder={1901}>
          <sphereGeometry args={[0.15, 12, 10]} />
          <meshBasicMaterial color={colors[d.kind]} transparent opacity={0.3} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>}
    </group>)}
  </group>
}
