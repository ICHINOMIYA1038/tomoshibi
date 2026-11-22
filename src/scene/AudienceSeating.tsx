import { useLayoutEffect, useMemo, useRef } from 'react'
import { recordHit } from '../objectMenu'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { ThreeEvent } from '@react-three/fiber'
import { audienceSeatPositions } from '../audienceLayout'
import { useStore, type AudienceBlock } from '../store'
import { surfaceMap } from '../lighting/surfaceTextures'

// 劇場の座席らしい見た目（2026-11-18 オーナー「座席の見栄えが悪い」）。角の丸い座面と、少し後ろに倒した背もたれ、
// 座席のあいだの肘掛け。えんじの布地で、光が当たると陰影が出る。客電を消しても形がわかるよう、少しだけ自分で光らせる
const seatGeometry = new RoundedBoxGeometry(.5, .1, .46, 2, .035)
const backGeometry = new RoundedBoxGeometry(.5, .6, .09, 2, .04)
const armGeometry = new RoundedBoxGeometry(.06, .62, .52, 2, .02)
const seatMaterial = new THREE.MeshStandardMaterial({ color: '#8c3040', roughness: .8, emissive: '#4a1822', emissiveIntensity: .75 })
const backMaterial = new THREE.MeshStandardMaterial({ color: '#7a2836', roughness: .8, emissive: '#3e141e', emissiveIntensity: .75 })
const armMaterial = new THREE.MeshStandardMaterial({ color: '#3a3034', roughness: .55, emissive: '#1c1619', emissiveIntensity: .9 })
// 座面と背もたれに布目の凹凸（CC0、public/textures/LICENSES.md）。色は今のえんじのまま
for (const material of [seatMaterial, backMaterial]) {
  material.normalMap = surfaceMap('Fabric026', 'NormalGL', 2)
  material.normalScale.setScalar(0.7)
  material.roughnessMap = surfaceMap('Fabric026', 'Roughness', 2)
}

function SeatingBlock({ block }: { block: AudienceBlock }) {
  const seats = useMemo(() => audienceSeatPositions(block), [block])
  const seatRef = useRef<THREE.InstancedMesh>(null)
  const backRef = useRef<THREE.InstancedMesh>(null)
  const armRef = useRef<THREE.InstancedMesh>(null)
  const armCount = block.rows * (block.seatsPerRow + 1)
  useLayoutEffect(() => {
    const object = new THREE.Object3D()
    object.rotation.order = 'YXZ'
    const angle = block.rotationDeg * Math.PI / 180
    const cos = Math.cos(angle), sin = Math.sin(angle)
    const base = block.elevation ?? 0
    // 客席のまとまりの中の位置（lx: 横、lz: 前後。+lz が後ろ）を、場内の位置へ
    const place = (lx: number, y: number, lz: number, tilt = 0) => {
      object.position.set(block.position[0] + cos * lx + sin * lz, base + y, block.position[1] - sin * lx + cos * lz)
      object.rotation.set(tilt, angle, 0)
      object.updateMatrix()
      return object.matrix
    }
    let index = 0
    for (let row = 0; row < block.rows; row++) {
      const lz = (row - (block.rows - 1) / 2) * block.rowSpacing
      for (let column = 0; column < block.seatsPerRow; column++) {
        const lx = (column - (block.seatsPerRow - 1) / 2) * block.seatSpacing
        seatRef.current?.setMatrixAt(index, place(lx, .44, lz - .02, -.06))
        backRef.current?.setMatrixAt(index, place(lx, .8, lz + .25, .18))
        index++
      }
    }
    let arm = 0
    for (let row = 0; row < block.rows; row++) {
      const lz = (row - (block.rows - 1) / 2) * block.rowSpacing
      for (let column = 0; column <= block.seatsPerRow; column++) {
        const lx = (column - .5 - (block.seatsPerRow - 1) / 2) * block.seatSpacing
        armRef.current?.setMatrixAt(arm++, place(lx, .31, lz + .03))
      }
    }
    for (const ref of [seatRef, backRef, armRef]) if (ref.current) ref.current.instanceMatrix.needsUpdate = true
  }, [seats, block])
  const selected = useStore(state => state.selection.kind === 'audience' && state.selection.id === block.id)
  const select = useStore(state => state.select)
  const halfWidth = ((block.seatsPerRow - 1) * block.seatSpacing + .54) / 2
  const halfDepth = ((block.rows - 1) * block.rowSpacing + .5) / 2
  const elevation = block.elevation ?? 0
  // 3D の画面でクリックすると客席を選ぶ（照度計測中は計測を優先する）
  const pick = (event: ThreeEvent<MouseEvent>) => {
    // 矢印をドラッグして離したときも、下にある床や壁に click が届く。動かした後の click では選び直さない
    if (useStore.getState().settings.probeMode || event.delta > 4) return
    event.stopPropagation()
    select('audience', block.id)
  }
  return <group onClick={pick} onContextMenu={event => { event.stopPropagation(); recordHit({ kind: 'audience', id: block.id }) }}>
    {/* 上げた客席の下の台。これが無いと客席が宙に浮いて見える */}
    {elevation > 0 && <mesh position={[block.position[0], elevation / 2, block.position[1]]} rotation={[0, block.rotationDeg * Math.PI / 180, 0]} receiveShadow>
      <boxGeometry args={[halfWidth * 2 + .3, elevation, halfDepth * 2 + .3]} />
      <meshStandardMaterial color="#3a3034" roughness={.9} />
    </mesh>}
    {selected && <mesh position={[block.position[0], elevation + .45, block.position[1]]} rotation={[0, block.rotationDeg * Math.PI / 180, 0]} raycast={() => null}>
      <boxGeometry args={[halfWidth * 2 + .2, .9, halfDepth * 2 + .2]} />
      <meshBasicMaterial color="#6cf" wireframe transparent opacity={0.6} depthTest={false} />
    </mesh>}
    <instancedMesh ref={seatRef} args={[seatGeometry, seatMaterial, seats.length]} receiveShadow />
    <instancedMesh ref={backRef} args={[backGeometry, backMaterial, seats.length]} receiveShadow />
    <instancedMesh ref={armRef} args={[armGeometry, armMaterial, armCount]} receiveShadow />
  </group>
}

export function AudienceSeating() {
  const blocks = useStore(state => state.productionPlan.audienceBlocks ?? [])
  const houseLights = useStore(state => !!state.settings.showHouseLights)
  if (!blocks.length) return null
  return <group>
    {/* 客電。客席のまとまりごとに、真上から暖かい明かりを当てる。客席がどこにあっても（正面・三方・四方・変形）その場所が明るくなる。
        以前は舞台の正面の決まった位置から当てていて、客席はほとんど明るくならなかった（2026-11-18 オーナー「客電が役割を果たしているか」） */}
    {houseLights && blocks.map(block => {
      const width = block.seatsPerRow * block.seatSpacing
      const depth = block.rows * block.rowSpacing
      const height = (block.elevation ?? 0) + 7
      return <pointLight key={'house-' + block.id} position={[block.position[0], height, block.position[1]]}
        color="#ffe2b8" intensity={60 + width * depth * 2.2} distance={0} decay={2} />
    })}
    {/* 客席の床。端が見えると、床の板を置いたように見えるので、果てまで続いて見える大きさにする
        （カメラの描く距離は 600m、視点は ±150m の劇場の中なので、2km 四方なら端は描かれない。オーナー指示、2026-11-15） */}
    <mesh position={[0, -.06, 7]} rotation={[-Math.PI / 2, 0, 0]}
      onContextMenu={event => { event.stopPropagation(); recordHit(null, [event.point.x, 0, event.point.z]) }}>
      <planeGeometry args={[2000, 2000]} />
      {/* 客電で照らされるよう、光を受ける床にする。客電を切っても真っ黒にならない程度に、少しだけ自分で光らせる */}
      <meshStandardMaterial color="#3a3238" roughness={.95} emissive="#141016" emissiveIntensity={1} />
    </mesh>
    {blocks.map(block => <SeatingBlock key={block.id} block={block} />)}
  </group>
}
