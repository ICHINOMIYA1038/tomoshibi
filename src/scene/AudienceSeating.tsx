import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { audienceSeatPositions } from '../audienceLayout'
import { useStore, type AudienceBlock } from '../store'

function SeatingBlock({ block }: { block: AudienceBlock }) {
  const seats = useMemo(() => audienceSeatPositions(block), [block])
  const cushionRef = useRef<THREE.InstancedMesh>(null)
  const backRef = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const object = new THREE.Object3D()
    const angle = block.rotationDeg * Math.PI / 180
    object.rotation.y = angle
    for (let index = 0; index < seats.length; index++) {
      const [x, z] = seats[index]
      object.position.set(x, .43, z)
      object.updateMatrix()
      cushionRef.current?.setMatrixAt(index, object.matrix)
      object.position.set(x + Math.sin(angle) * .23, .7, z + Math.cos(angle) * .23)
      object.updateMatrix()
      backRef.current?.setMatrixAt(index, object.matrix)
    }
    if (cushionRef.current) cushionRef.current.instanceMatrix.needsUpdate = true
    if (backRef.current) backRef.current.instanceMatrix.needsUpdate = true
  }, [seats, block.rotationDeg])
  return <group>
    <instancedMesh ref={cushionRef} args={[undefined, undefined, seats.length]} receiveShadow>
      <boxGeometry args={[.54, .11, .5]} />
      <meshBasicMaterial color="#503b43" toneMapped={false} />
    </instancedMesh>
    <instancedMesh ref={backRef} args={[undefined, undefined, seats.length]} receiveShadow>
      <boxGeometry args={[.54, .58, .08]} />
      <meshBasicMaterial color="#604b53" toneMapped={false} />
    </instancedMesh>
  </group>
}

export function AudienceSeating() {
  const blocks = useStore(state => state.productionPlan.audienceBlocks ?? [])
  if (!blocks.length) return null
  return <group>
    <mesh position={[0, -.06, 13.5]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[20, 23]} />
      <meshBasicMaterial color="#211d24" toneMapped={false} />
    </mesh>
    {blocks.map(block => <SeatingBlock key={block.id} block={block} />)}
  </group>
}
