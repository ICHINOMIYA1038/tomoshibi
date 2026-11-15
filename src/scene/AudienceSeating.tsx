import { useLayoutEffect, useMemo, useRef } from 'react'
import { recordHit } from '../objectMenu'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
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
  const selected = useStore(state => state.selection.kind === 'audience' && state.selection.id === block.id)
  const select = useStore(state => state.select)
  const halfWidth = ((block.seatsPerRow - 1) * block.seatSpacing + .54) / 2
  const halfDepth = ((block.rows - 1) * block.rowSpacing + .5) / 2
  // 3D の画面でクリックすると客席を選ぶ（照度計測中は計測を優先する）
  const pick = (event: ThreeEvent<MouseEvent>) => {
    // 矢印をドラッグして離したときも、下にある床や壁に click が届く。動かした後の click では選び直さない
    if (useStore.getState().settings.probeMode || event.delta > 4) return
    event.stopPropagation()
    select('audience', block.id)
  }
  return <group onClick={pick} onContextMenu={event => { event.stopPropagation(); recordHit({ kind: 'audience', id: block.id }) }}>
    {selected && <mesh position={[block.position[0], .45, block.position[1]]} rotation={[0, block.rotationDeg * Math.PI / 180, 0]} raycast={() => null}>
      <boxGeometry args={[halfWidth * 2 + .2, .9, halfDepth * 2 + .2]} />
      <meshBasicMaterial color="#6cf" wireframe transparent opacity={0.6} depthTest={false} />
    </mesh>}
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
    {/* 客席の床。端が見えると、床の板を置いたように見えるので、果てまで続いて見える大きさにする
        （カメラの描く距離は 100m、視点は劇場の中なので、1km 四方なら端は描かれない。オーナー指示、2026-11-15） */}
    <mesh position={[0, -.06, 7]} rotation={[-Math.PI / 2, 0, 0]}
      onContextMenu={event => { event.stopPropagation(); recordHit(null, [event.point.x, 0, event.point.z]) }}>
      <planeGeometry args={[1000, 1000]} />
      <meshBasicMaterial color="#211d24" toneMapped={false} />
    </mesh>
    {blocks.map(block => <SeatingBlock key={block.id} block={block} />)}
  </group>
}
